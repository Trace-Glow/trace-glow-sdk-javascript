import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { normalizeError } from '@trace-glow-internal/core';
import type {
  CorrelationContext,
  TelemetryClientApi,
  TelemetryEvent,
  TelemetryPlugin,
} from '@trace-glow-internal/core';

/** 用于监听器、计时器或运行时监控器的幂等卸载操作。 */
type Cleanup = () => void;

/** Node.js 埋点的功能开关和采集间隔。 */
export interface NodePluginOptions {
  /** 定期采集 CPU、内存、事件循环延迟和运行时间。 */
  runtimeMetrics?: boolean;
  /** 运行时指标间隔，单位为毫秒。 */
  metricsIntervalMs?: number;
  /** 在不改变未捕获异常语义的情况下观察致命进程失败。 */
  processErrors?: boolean;
  /** 选择启用 rejection 观察；该选项会改变 Node.js 默认监听行为。 */
  unhandledRejections?: boolean;
}

/** 将 Error 实例或任意抛出值转换为结构化字段。 */

/** 安装进程失败监听器和有界运行时指标采集。 */
export class NodePlugin implements TelemetryPlugin {
  /** 用于拒绝重复安装的私有工作区插件标识。 */
  readonly name = '@trace-glow-internal/node';
  /** 按安装相反顺序执行的卸载栈。 */
  private readonly cleanups: Cleanup[] = [];
  /** 完整归一化选项可避免在热路径中重复解析默认值。 */
  private readonly options: Required<NodePluginOptions>;

  /** 使用保守默认值归一化进程监控选项。 */
  constructor(options: NodePluginOptions = {}) {
    this.options = {
      runtimeMetrics: options.runtimeMetrics ?? true,
      metricsIntervalMs: options.metricsIntervalMs ?? 30_000,
      processErrors: options.processErrors ?? true,
      unhandledRejections: options.unhandledRejections ?? false,
    };
  }

  /** 安装已启用的进程监听器和运行时指标采集。 */
  setup(client: TelemetryClientApi): void {
    if (this.options.processErrors) this.observeProcessErrors(client);
    if (this.options.runtimeMetrics) this.observeRuntime(client);
  }

  /** 移除监听器、停止计时器并禁用事件循环监控。 */
  teardown(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }

  /**
   * 观察致命错误，同时保留 Node.js 崩溃语义。
   * 此处有意使用 `uncaughtExceptionMonitor`，因为普通 `uncaughtException`
   * 监听器会阻止 Node 按默认行为退出进程。
   */
  private observeProcessErrors(client: TelemetryClientApi): void {
    /** 致命错误观察器采集诊断信息，但不声称能够恢复。 */
    const onUncaught = (error: Error, origin: NodeJS.UncaughtExceptionOrigin): void => {
      client.capture({
        type: 'monitor',
        name: 'node.uncaught_exception',
        level: 'fatal',
        payload: { ...normalizeError(error), origin },
      });
    };
    process.on('uncaughtExceptionMonitor', onUncaught);
    this.cleanups.push(() => process.off('uncaughtExceptionMonitor', onUncaught));

    if (this.options.unhandledRejections) {
      /** 仅在调用方明确同意后安装可选 rejection 观察器。 */
      const onRejection = (reason: unknown): void => {
        client.capture({
          type: 'monitor',
          name: 'node.unhandled_rejection',
          level: 'error',
          payload: normalizeError(reason),
        });
      };
      process.on('unhandledRejection', onRejection);
      this.cleanups.push(() => process.off('unhandledRejection', onRejection));
    }
  }

  /** 使用差值和单调时钟定期采集进程指标。 */
  private observeRuntime(client: TelemetryClientApi): void {
    /** 原生直方图无需 JavaScript 轮询循环即可跟踪事件循环延迟。 */
    const eventLoop = monitorEventLoopDelay({ resolution: 20 });
    eventLoop.enable();
    /** 用于计算区间使用率的上一次累计 CPU 样本。 */
    let previousCpu = process.cpuUsage();
    /** 用作 CPU 使用率分母的上一个单调时间戳。 */
    let previousTime = process.hrtime.bigint();
    /** 采集回调生成指标快照，并仅重置区间专属状态。 */
    const collect = (): void => {
      /** 当前单调时间戳不受系统时钟校正影响。 */
      const now = process.hrtime.bigint();
      /** 将经过时间从纳秒转换为微秒，以匹配 cpuUsage()。 */
      const elapsedMicros = Number(now - previousTime) / 1_000;
      /** 自上次采样以来的 CPU 差值，分为用户时间和系统时间。 */
      const cpu = process.cpuUsage(previousCpu);
      previousCpu = process.cpuUsage();
      previousTime = now;
      /** 内存快照呈现采集时的进程和 V8 堆压力。 */
      const memory = process.memoryUsage();
      client.capture({
        type: 'monitor',
        name: 'node.runtime',
        payload: {
          cpuUtilization: elapsedMicros > 0 ? (cpu.user + cpu.system) / elapsedMicros : 0,
          memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
          },
          eventLoopDelayMs: {
            mean: Number(eventLoop.mean) / 1e6,
            p99: Number(eventLoop.percentile(99)) / 1e6,
            max: Number(eventLoop.max) / 1e6,
          },
          uptimeSeconds: process.uptime(),
        },
      });
      eventLoop.reset();
    };
    /** 已 unref 的计时器不得阻止原本空闲的 Node.js 进程退出。 */
    const timer = setInterval(collect, this.options.metricsIntervalMs);
    timer.unref();
    this.cleanups.push(() => clearInterval(timer));
    this.cleanups.push(() => eventLoop.disable());
  }
}

/** 使用请求级标识丰富事件的 AsyncLocalStorage 插件。 */
export class NodeRequestContext implements TelemetryPlugin {
  /** 独立标识使其可与通用 Node.js 埋点插件同时使用。 */
  readonly name = '@trace-glow-internal/node-request-context';
  /** 异步本地存储在并发请求链之间隔离关联数据。 */
  private readonly storage = new AsyncLocalStorage<CorrelationContext>();
  /** 为确定性卸载而保留的事件处理器移除函数。 */
  private removeProcessor: (() => void) | undefined;

  /** 将关联丰富逻辑注册为有序内核事件处理器。 */
  setup(client: TelemetryClientApi): void {
    this.removeProcessor = client.addEventProcessor((event) => this.apply(event));
  }

  /** 移除丰富逻辑并禁用存储，以释放活跃资源引用。 */
  teardown(): void {
    this.removeProcessor?.();
    this.removeProcessor = undefined;
    this.storage.disable();
  }

  /**
   * 在异步任务可继承的关联作用域内运行回调。
   * @param context - 当前执行链的请求或追踪标识。
   * @param callback - 创建待关联异步资源的任务。
   */
  run<T>(context: CorrelationContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  /** 返回当前关联作用域；在受管任务之外返回 undefined。 */
  get(): CorrelationContext | undefined {
    return this.storage.getStore();
  }

  /** 事件级上下文优先于继承值，以支持显式覆盖。 */
  private apply(event: TelemetryEvent): TelemetryEvent {
    /** 从事件当前异步执行环境中获取的关联状态。 */
    const correlation = this.storage.getStore();
    if (!correlation) return event;
    return { ...event, context: { ...correlation, ...event.context } };
  }
}

/** Node HTTP、Express、Koa 和 Nest 中间件适配器共享的选项。 */
export interface HttpMiddlewareOptions {
  /** 用于将请求 ID 传播到嵌套日志的可选异步本地插件。 */
  requestContext?: NodeRequestContext;
  /** 用于请求关联的传入和传出 Header 名称。 */
  requestIdHeader?: string;
  /** 仅在明确完成隐私决策后保留查询数据。 */
  includeUrlQuery?: boolean;
}

/** 框架无关的 Connect 风格中间件签名。 */
export type NodeMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/** 复用可信传入请求 ID，或创建抗冲突的新 ID。 */
function requestId(request: IncomingMessage, headerName: string): string {
  /** 由于 Node 以小写保存传入 Header 名称，因此查找时需要归一化。 */
  const value = request.headers[headerName.toLowerCase()];
  if (typeof value === 'string' && value) return value;
  return randomUUID();
}

/** 除非明确要求保留，否则从请求目标中移除查询数据。 */
function cleanRequestUrl(url: string | undefined, includeQuery: boolean): string {
  if (!url) return '/';
  return includeQuery ? url : (url.split('?', 1)[0] ?? '/');
}

/**
 * 为 Node、Express 和 Nest 创建兼容 Connect 的 HTTP 中间件。
 * 在响应上观察完成状态，而不是在 next() 之后观察，
 * 因为许多框架会在流式响应真正结束前返回。
 */
export function createHttpMiddleware(
  client: TelemetryClientApi,
  options: HttpMiddlewareOptions = {},
): NodeMiddleware {
  /** 同时用于请求查找和响应输出的归一化关联 Header。 */
  const header = options.requestIdHeader ?? 'x-request-id';
  return (request, response, next) => {
    /** 用于测量完整响应耗时的单调起始时间戳。 */
    const started = process.hrtime.bigint();
    /** 传播到响应、上下文和事件的稳定请求标识。 */
    const id = requestId(request, header);
    response.setHeader(header, id);
    response.once('finish', () => {
      client.capture({
        type: 'monitor',
        name: 'node.http_request',
        level: response.statusCode >= 500 ? 'error' : 'info',
        context: { requestId: id },
        payload: {
          method: request.method ?? 'GET',
          url: cleanRequestUrl(request.url, options.includeUrlQuery ?? false),
          status: response.statusCode,
          durationMs: Number(process.hrtime.bigint() - started) / 1e6,
        },
      });
    });
    /** 在异步本地作用域内创建调用包装器，以便传播上下文。 */
    const invoke = (): void => next();
    if (options.requestContext) options.requestContext.run({ requestId: id }, invoke);
    else invoke();
  };
}

/** Express 使用相同的 Connect 中间件协议，无需运行时依赖。 */
export const createExpressMiddleware = createHttpMiddleware;
/** Nest 中间件使用相同的 Connect 协议，无需导入 Nest 包。 */
export const createNestMiddleware = createHttpMiddleware;

/** 最小结构化 Koa 上下文可避免将 Koa 设为运行时依赖。 */
interface KoaContext {
  /** 有效请求方法。 */
  method: string;
  /** Koa 提供的请求目标。 */
  url: string;
  /** 下游中间件完成后可用的最终响应状态。 */
  status: number;
  /** 用于查找现有关联 ID 的传入请求 Header。 */
  request: { headers: Record<string, string | string[] | undefined> };
  /** Koa 暴露的响应 Header 设置器。 */
  set(name: string, value: string): void;
}

/**
 * 创建在 finally 块中记录完成状态的异步 Koa 中间件。
 * finally 块确保下游中间件失败时仍生成耗时遥测，
 * 同时允许原始异常不加修改地继续传播。
 */
export function createKoaMiddleware(
  client: TelemetryClientApi,
  options: Omit<HttpMiddlewareOptions, 'requestContext'> & { requestContext?: NodeRequestContext } = {},
): (context: KoaContext, next: () => Promise<unknown>) => Promise<void> {
  /** 归一化的请求标识 Header。 */
  const header = options.requestIdHeader ?? 'x-request-id';
  return async (context, next) => {
    /** 原始传入标识可能是字符串或多值 Header。 */
    const rawId = context.request.headers[header];
    /** 复用有效字符串标识；其他形式会获得新 UUID。 */
    const id = typeof rawId === 'string' && rawId ? rawId : randomUUID();
    context.set(header, id);
    /** 单调起始时间戳覆盖整个下游 Koa 调用链。 */
    const started = process.hrtime.bigint();
    /** 异步调用包装器在 AsyncLocalStorage 作用域内创建后续资源。 */
    const invoke = async (): Promise<unknown> => next();
    try {
      if (options.requestContext) await options.requestContext.run({ requestId: id }, invoke);
      else await invoke();
    } finally {
      client.capture({
        type: 'monitor',
        name: 'node.http_request',
        level: context.status >= 500 ? 'error' : 'info',
        context: { requestId: id },
        payload: {
          method: context.method,
          url: cleanRequestUrl(context.url, options.includeUrlQuery ?? false),
          status: context.status,
          durationMs: Number(process.hrtime.bigint() - started) / 1e6,
        },
      });
    }
  };
}
