import type { TelemetryClientApi, TelemetryPlugin } from '@trace-glow/core';

/** 浏览器自动埋点的功能开关与隐私控制。 */
export interface BrowserPluginOptions {
  /** 采集同步 ErrorEvent 失败。 */
  errors?: boolean;
  /** 采集图片、脚本和样式表资源加载失败。 */
  resources?: boolean;
  /** 观察受支持的浏览器性能条目类型。 */
  performance?: boolean;
  /** 包装全局 Fetch 调用以采集耗时和状态。 */
  fetch?: boolean;
  /** 修改 XMLHttpRequest 的 open/send 方法以采集耗时和状态。 */
  xhr?: boolean;
  /** 仅在应用明确接受时保留 URL 查询参数。 */
  includeUrlQuery?: boolean;
  /** 从网络遥测中排除的 URL 前缀或表达式。 */
  ignoreUrls?: readonly (string | RegExp)[];
}

/** 用于单个监听器、观察器或运行时修改的幂等卸载操作。 */
type Cleanup = () => void;

/**
 * 归一化 URL，并默认移除查询参数和 fragment 数据。
 * @param value - 绝对 URL 或相对于文档的 URL。
 * @param includeQuery - 是否保留可能敏感的查询数据。
 */
function safeUrl(value: string, includeQuery: boolean): string {
  try {
    /** 解析后的 URL 支持一致地移除 search 和 fragment 部分。 */
    const url = new URL(value, globalThis.location?.href);
    if (!includeQuery) {
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

/**
 * 将浏览器抛出的值转换为结构可预测的诊断记录。
 * @param error - Error 实例、rejection 原因或任意抛出值。
 */
function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : 'Unknown browser error', reason: error };
}

/** 安装并在之后恢复埋点的浏览器生命周期插件。 */
export class BrowserPlugin implements TelemetryPlugin {
  /** 用于拒绝重复安装的私有工作区插件标识。 */
  readonly name = '@trace-glow/browser';
  /** 按安装相反顺序执行的卸载栈。 */
  private readonly cleanups: Cleanup[] = [];
  /** 卸载时清除的当前客户端引用，以便进行垃圾回收。 */
  private client: TelemetryClientApi | undefined;
  /** 无需重复处理默认值即可读取的完整归一化功能选项。 */
  private readonly options: Required<BrowserPluginOptions>;

  /** 归一化浏览器功能开关与隐私安全默认值。 */
  constructor(options: BrowserPluginOptions = {}) {
    this.options = {
      errors: options.errors ?? true,
      resources: options.resources ?? true,
      performance: options.performance ?? true,
      fetch: options.fetch ?? true,
      xhr: options.xhr ?? true,
      includeUrlQuery: options.includeUrlQuery ?? false,
      ignoreUrls: options.ignoreUrls ?? [],
    };
  }

  /**
   * 仅在浏览器 Window 存在时安装已启用的埋点。
   * 此保护使 SSR 期间意外发生的服务端 import 保持无害。
   */
  setup(client: TelemetryClientApi): void {
    this.client = client;
    if (typeof window === 'undefined') return;
    if (this.options.errors || this.options.resources) this.observeErrors();
    if (this.options.performance) this.observePerformance();
    if (this.options.fetch) this.instrumentFetch();
    if (this.options.xhr) this.instrumentXhr();
  }

  /** 恢复被修改的全局对象，并移除所有已安装监听器或观察器。 */
  teardown(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.client = undefined;
  }

  /** 安装全局错误、资源失败和 rejection 监听器。 */
  private observeErrors(): void {
    /** 共享捕获阶段处理器用于区分运行时错误和资源失败。 */
    const onError = (event: ErrorEvent | Event): void => {
      if (event instanceof ErrorEvent && this.options.errors) {
        this.client?.capture({
          type: 'monitor',
          name: 'browser.exception',
          level: 'error',
          payload: {
            ...errorPayload(event.error ?? event.message),
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
          },
        });
        return;
      }
      if (this.options.resources) {
        /** 失败的 DOM 元素用于确定资源类别和可选来源 URL。 */
        const target = event.target;
        if (target instanceof HTMLElement) {
          /** 从图片、脚本和 link 元素 API 中选择资源来源。 */
          const source = (target as HTMLImageElement).currentSrc
            || (target as HTMLScriptElement).src
            || (target as HTMLLinkElement).href;
          this.client?.capture({
            type: 'monitor',
            name: 'browser.resource_error',
            level: 'error',
            payload: {
              tag: target.tagName.toLowerCase(),
              ...(source ? { url: safeUrl(source, this.options.includeUrlQuery) } : {}),
            },
          });
        }
      }
    };
    /** Promise rejection 处理器安全保留任意 rejection 原因。 */
    const onRejection = (event: PromiseRejectionEvent): void => {
      this.client?.capture({
        type: 'monitor',
        name: 'browser.unhandled_rejection',
        level: 'error',
        payload: errorPayload(event.reason),
      });
    };
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    this.cleanups.push(() => window.removeEventListener('error', onError, true));
    this.cleanups.push(() => window.removeEventListener('unhandledrejection', onRejection));
  }

  /** 观察当前浏览器支持的性能条目类型。 */
  private observePerformance(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    /** 使用运行时支持的条目类型，防止 observe() 在旧浏览器中抛出异常。 */
    const supported = PerformanceObserver.supportedEntryTypes;
    /** 对请求的条目类型进行过滤，而不假设其全局可用。 */
    const entryTypes = ['largest-contentful-paint', 'layout-shift', 'longtask']
      .filter((type) => supported.includes(type));
    if (entryTypes.length === 0) return;

    /** Observer 将浏览器专属条目转换为 JSON 安全的监控事件。 */
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        /** 条目详情保留浏览器专属字段，无需硬编码每种子类型。 */
        const details = entry.toJSON() as Record<string, unknown>;
        this.client?.capture({
          type: 'monitor',
          name: `browser.performance.${entry.entryType}`,
          payload: { duration: entry.duration, startTime: entry.startTime, details },
        });
      }
    });
    observer.observe({ entryTypes });
    this.cleanups.push(() => observer.disconnect());
  }

  /** 包装全局 Fetch，同时保留原始响应和 rejection 语义。 */
  private instrumentFetch(): void {
    if (typeof globalThis.fetch !== 'function') return;
    /** 保留原始函数，既用于执行，也用于卸载时准确恢复。 */
    const original = globalThis.fetch;
    /** 绑定后的采集方法无需依赖 Fetch 包装器内的动态 this。 */
    const captureRequest = this.captureRequest.bind(this);
    /** 包装器记录元数据，但始终返回或抛出原始操作结果。 */
    const wrapped: typeof fetch = async function traceGlowFetch(input, init) {
      /** 单调起始时间可避免系统时钟调整导致的误差。 */
      const started = performance.now();
      /** 有效方法优先使用显式 init，其次使用 Request 对象的方法。 */
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      /** 有效 URL 同时支持 Request 和 string/URL 类型的 Fetch 输入。 */
      const url = input instanceof Request ? input.url : String(input);
      try {
        /** 必须将原始响应不加修改地返回宿主应用。 */
        const response = await original(input, init);
        captureRequest('fetch', method, url, started, response.status);
        return response;
      } catch (error) {
        /* 埋点记录 rejection 后重新抛出，确保业务行为不变。 */
        captureRequest('fetch', method, url, started, undefined, error);
        throw error;
      }
    };
    globalThis.fetch = wrapped;
    /* 仅在当前仍安装本包装器时恢复，以保留 Trace Glow 之后添加的修改。 */
    this.cleanups.push(() => { if (globalThis.fetch === wrapped) globalThis.fetch = original; });
  }

  /** 修改 XMLHttpRequest 方法，并在 WeakMap 中保存实例级状态。 */
  private instrumentXhr(): void {
    if (typeof XMLHttpRequest === 'undefined') return;
    /** 共享原型只修改一次，并在卸载期间恢复。 */
    const prototype = XMLHttpRequest.prototype;
    /** 保留原始 open 方法，用于透明委托和恢复。 */
    const originalOpen = prototype.open;
    /** 保留原始 send 方法，用于透明委托和恢复。 */
    const originalSend = prototype.send;
    /** 弱引用 Key 防止埋点继续持有已完成的 XHR 实例。 */
    const requests = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();
    /** 绑定后的采集方法不依赖 XHR 包装器的动态 this 值。 */
    const captureRequest = this.captureRequest.bind(this);

    /** 记录方法和 URL 后，将每个 open() 重载委托给浏览器。 */
    function open(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
      requests.set(this, { method, url: String(url), started: 0 });
      Reflect.apply(originalOpen, this, [method, url, ...rest]);
    }
    /** 开始计时、安装一次性完成处理器并委托 send()。 */
    function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
      /** open() 为当前 XHR 实例记录的元数据。 */
      const request = requests.get(this);
      if (request) request.started = performance.now();
      /** 完成处理器采集状态并自行移除，以及时释放闭包。 */
      const onLoadEnd = (): void => {
        if (request) captureRequest('xhr', request.method, request.url, request.started, this.status);
        this.removeEventListener('loadend', onLoadEnd);
      };
      this.addEventListener('loadend', onLoadEnd);
      originalSend.call(this, body);
    }
    prototype.open = open as typeof prototype.open;
    prototype.send = send;
    /* 仅在方法仍指向本包装器时恢复，以尊重之后安装的埋点。 */
    this.cleanups.push(() => {
      if (prototype.open === open) prototype.open = originalOpen;
      if (prototype.send === send) prototype.send = originalSend;
    });
  }

  /**
   * 过滤并记录一次浏览器网络操作。
   *
   * @param source - 观察到该请求的埋点 API。
   * @param method - 有效 HTTP 方法。
   * @param url - 原始请求 URL，采集前会进行清理。
   * @param started - 单调起始时间戳。
   * @param status - 可选 HTTP 响应状态。
   * @param error - 可选原始网络失败。
   */
  private captureRequest(
    source: 'fetch' | 'xhr',
    method: string,
    url: string,
    started: number,
    status?: number,
    error?: unknown,
  ): void {
    /** 匹配结果防止 Collector 请求和配置地址被自身埋点。 */
    const ignored = this.options.ignoreUrls.some((pattern) => {
      if (typeof pattern === 'string') return url.startsWith(pattern);
      /* 重置有状态的 global/sticky 表达式，使重复请求的匹配结果保持确定性。 */
      pattern.lastIndex = 0;
      return pattern.test(url);
    });
    if (ignored) return;
    this.client?.capture({
      type: 'monitor',
      name: 'browser.http_request',
      level: error || (status && status >= 500) ? 'error' : 'info',
      payload: {
        source,
        method: method.toUpperCase(),
        url: safeUrl(url, this.options.includeUrlQuery),
        durationMs: Math.max(0, performance.now() - started),
        ...(status !== undefined ? { status } : {}),
        ...(error ? { error: errorPayload(error) } : {}),
      },
    });
  }
}
