import { toJsonRecord } from './json';
import { BoundedQueue } from './queue';
import { withRetry } from './retry';
import type {
  EventInput,
  EventProcessor,
  RetryConfig,
  Span,
  SpanOptions,
  TelemetryClientApi,
  TelemetryClientConfig,
  TelemetryEvent,
  TelemetryPlugin,
} from './types';

/** 嵌入每个事件、用于 Collector 兼容性诊断的 SDK 标识。 */
const SDK = { name: '@trace-glow-internal/core', version: '0.1.0' } as const;
/** 保守的重试默认值用于平衡瞬时故障恢复与关闭延迟。 */
const DEFAULT_RETRY: Required<RetryConfig> = { attempts: 3, baseDelayMs: 250, maxDelayMs: 5_000 };

/** 生成指定字节长度的十六进制追踪标识。 */
function traceId(bytes: number): string {
  /** 使用 Web Crypto 时获得高质量随机字节；旧运行时再使用时间与 Math.random 混合值。 */
  const values = new Uint8Array(bytes);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(values);
  else {
    const entropy = `${Date.now()}-${Math.random()}-${Math.random()}`;
    for (let index = 0; index < values.length; index += 1) {
      values[index] = entropy.charCodeAt(index % entropy.length) ^ ((Date.now() >>> (index % 24)) & 0xff);
    }
  }
  if (values.every((value) => value === 0)) values[0] = 1;
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * 在可用时使用加密 UUID 能力生成事件标识。
 * 回退方案不向运行时无关内核增加依赖，并在旧运行时中尽力保持唯一性。
 */
function randomId(): string {
  /** 现代浏览器与受支持的 Node.js 版本共享 Web Crypto。 */
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 具备有界内存和故障隔离能力的运行时无关遥测协调器。
 * 插件负责运行时专属采集，本类负责顺序、采样、队列、重试和生命周期保证。
 */
export class TelemetryClient implements TelemetryClientApi {
  /** 供 capture 和 flush 热路径读取的完整归一化配置。 */
  private readonly config: Required<Pick<TelemetryClientConfig,
    'sampleRate' | 'batchSize' | 'maxQueueSize' | 'maxEventSizeBytes' | 'flushIntervalMs' | 'requestTimeoutMs'
  >> & TelemetryClientConfig;
  /** 有界 FIFO 防止 Collector 故障耗尽宿主内存。 */
  private readonly queue: BoundedQueue<TelemetryEvent>;
  /** 插件按注册顺序保留，并按相反顺序卸载。 */
  private readonly plugins: TelemetryPlugin[] = [];
  /** 有序处理器在事件入队前进行丰富或脱敏。 */
  private readonly processors = new Set<EventProcessor>();
  /** 在 shutdown 期间清除的定时刷新计时器。 */
  private timer: ReturnType<typeof setInterval> | undefined;
  /** 共享的进行中 flush Promise 用于合并并发刷新调用。 */
  private activeFlush: Promise<void> | undefined;
  /** 串行处理链在异步处理器之间保留采集顺序。 */
  private processing: Promise<void> = Promise.resolve();
  /** 启动标志防止重复安装监听器和计时器。 */
  private started = false;
  /** 关闭标志使 capture 成为空操作，并防止不安全的客户端重启。 */
  private closed = false;

  /**
   * 校验资源边界并构造空客户端。
   * @param config - 运行时无关行为与具体 Transport。
   * @throws 必填标识、采样、队列、超时或重试参数无效时抛出。
   */
  constructor(config: TelemetryClientConfig) {
    if (!config.projectId) throw new Error('projectId is required');
    /** 在接收任何事件前校验归一化采样概率。 */
    const sampleRate = config.sampleRate ?? 1;
    if (sampleRate < 0 || sampleRate > 1) throw new Error('sampleRate must be between 0 and 1');
    /*
     * 所有数值资源边界都必须为正数，避免零大小排空循环、持续触发的计时器，
     * 以及永远无法保留数据的队列。
     */
    for (const [name, value] of Object.entries({
      batchSize: config.batchSize ?? 50,
      maxQueueSize: config.maxQueueSize ?? 1_000,
      maxEventSizeBytes: config.maxEventSizeBytes ?? 64 * 1_024,
      flushIntervalMs: config.flushIntervalMs ?? 5_000,
      requestTimeoutMs: config.requestTimeoutMs ?? 10_000,
    })) {
      if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
    }
    /** 同时用于校验和后续投递的完整重试设置。 */
    const retry = { ...DEFAULT_RETRY, ...config.retry };
    if (!Number.isInteger(retry.attempts) || retry.attempts < 1) {
      throw new Error('retry.attempts must be a positive integer');
    }
    if (retry.baseDelayMs < 0 || retry.maxDelayMs < retry.baseDelayMs) {
      throw new Error('retry delays must be non-negative and maxDelayMs must be at least baseDelayMs');
    }
    /** 归一化配置使热路径无需重复执行默认值分支。 */
    this.config = {
      ...config,
      sampleRate,
      batchSize: config.batchSize ?? 50,
      maxQueueSize: config.maxQueueSize ?? 1_000,
      maxEventSizeBytes: config.maxEventSizeBytes ?? 64 * 1_024,
      flushIntervalMs: config.flushIntervalMs ?? 5_000,
      requestTimeoutMs: config.requestTimeoutMs ?? 10_000,
    };
    this.queue = new BoundedQueue(this.config.maxQueueSize);
  }

  /**
   * 在启动前注册一个插件，并拒绝重复标识。
   * @returns 当前客户端，以支持显式链式组装。
   */
  use(plugin: TelemetryPlugin): this {
    if (this.started) throw new Error('Plugins must be registered before start()');
    if (this.plugins.some((item) => item.name === plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }
    this.plugins.push(plugin);
    return this;
  }

  /**
   * 按注册顺序初始化插件并启动定时刷新。
   * 插件失败会被隔离，确保可选埋点不会破坏应用启动。
   */
  async start(): Promise<this> {
    if (this.closed) throw new Error('A shut down client cannot be restarted');
    if (this.started) return this;
    this.started = true;
    for (const plugin of this.plugins) {
      try {
        await plugin.setup(this);
      } catch (error) {
        this.reportInternal(error);
      }
    }
    this.timer = setInterval(() => void this.flush(), this.config.flushIntervalMs);
    /* 已 unref 的 Node 计时器不能阻止进程退出；浏览器只会忽略 unref。 */
    (this.timer as unknown as { unref?: () => void }).unref?.();
    return this;
  }

  /**
   * 对事件进行校验、采样、归一化和调度，且不向外抛出异常。
   * 即使处理器是异步的，也通过链式处理保留采集顺序。
   */
  capture(input: EventInput): void {
    if (this.closed) return;
    if (!input.name || !input.type) {
      this.config.onDrop?.(1, 'invalid');
      return;
    }
    if (input.type !== 'trace' && Math.random() >= this.config.sampleRate) {
      this.config.onDrop?.(1, 'sampled');
      return;
    }

    /** 传入处理器链的完整归一化不可变事件信封。 */
    const event: TelemetryEvent = {
      schemaVersion: 1,
      id: randomId(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      type: input.type,
      name: input.name,
      level: input.level ?? 'info',
      projectId: this.config.projectId,
      ...(this.config.environment ? { environment: this.config.environment } : {}),
      ...(this.config.release ? { release: this.config.release } : {}),
      sdk: this.config.sdk ?? SDK,
      ...(input.context || input.traceId
        ? { context: { ...input.context, ...(input.traceId ? { traceId: input.traceId } : {}) } }
        : {}),
      ...(input.spanId ? { spanId: input.spanId } : {}),
      ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
      ...(input.spanKind ? { spanKind: input.spanKind } : {}),
      ...(input.spanStatus ? { spanStatus: input.spanStatus } : {}),
      ...(input.startTimestamp ? { startTimestamp: input.startTimestamp } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.attributes ? { attributes: toJsonRecord(input.attributes) } : {}),
      payload: toJsonRecord(input.payload),
    };
    /*
     * 使用 Promise 链而不是独立异步调用，防止慢处理器改变其前后紧邻事件的采集顺序。
     */
    this.processing = this.processing
      .then(() => this.processAndQueue(event))
      .catch((error: unknown) => this.reportInternal(error));
  }

  /**
   * 添加有序事件处理器并返回幂等移除闭包。
   * 此处有意将 Set 插入顺序作为处理器协议顺序。
   */
  addEventProcessor(processor: EventProcessor): () => void {
    this.processors.add(processor);
    return () => this.processors.delete(processor);
  }

  /** 创建显式 Span，结束时通过统一 capture 管道上报并隔离异常。 */
  startSpan(name: string, options: SpanOptions = {}): Span {
    /** 远程父级采样决策必须原样继承；根 Span 使用客户端统一采样率。 */
    const sampled = options.parent?.sampled ?? Math.random() < this.config.sampleRate;
    const started = new Date();
    const currentTraceId = options.parent?.traceId ?? traceId(16);
    const currentSpanId = traceId(8);
    const attributes: Record<string, unknown> = { ...options.attributes };
    let status: 'unset' | 'ok' | 'error' = 'unset';
    let ended = false;
    const span: Span = {
      traceId: currentTraceId,
      spanId: currentSpanId,
      ...(options.parent ? { parentSpanId: options.parent.spanId } : {}),
      sampled,
      setAttribute: (key, value) => {
        if (key) attributes[key] = value;
        return span;
      },
      setStatus: (nextStatus) => {
        status = nextStatus;
        return span;
      },
      end: () => {
        if (ended) return;
        ended = true;
        if (!sampled) {
          this.config.onDrop?.(1, 'sampled');
          return;
        }
        const durationMs = Math.max(0, Date.now() - started.getTime());
        this.capture({
          type: 'trace',
          name,
          traceId: currentTraceId,
          spanId: currentSpanId,
          ...(options.parent ? { parentSpanId: options.parent.spanId } : {}),
          spanKind: options.kind ?? 'internal',
          spanStatus: status,
          startTimestamp: started.toISOString(),
          durationMs,
          attributes,
        });
      },
    };
    return span;
  }

  /**
   * 等待事件处理，并通过一个共享 Promise 排空队列。
   * 合并调用可避免计时器、批次阈值与手动 flush 相互重叠。
   */
  async flush(): Promise<void> {
    await this.waitForProcessing();
    if (this.activeFlush) return this.activeFlush;
    if (this.queue.size === 0) return;
    this.activeFlush = this.drainQueue().finally(() => {
      this.activeFlush = undefined;
    });
    return this.activeFlush;
  }

  /**
   * 停止采集、等待未完成处理、卸载插件并刷新队列。
   * 处理必须先于卸载完成，因为处理器由插件持有；若顺序相反，
   * 最近采集的事件会静默丢失上下文。
   */
  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.waitForProcessing();
    for (const plugin of [...this.plugins].reverse()) {
      try {
        await plugin.teardown?.();
      } catch (error) {
        this.reportInternal(error);
      }
    }
    await this.flush();
  }

  /**
   * 等待直到没有 capture 调用继续延长处理链。
   * 同一性循环会处理等待上一个 Promise 期间新调度的事件。
   */
  private async waitForProcessing(): Promise<void> {
    for (;;) {
      /** 本轮稳定检查开始时观察到的处理链。 */
      const pending = this.processing;
      await pending;
      if (pending === this.processing) return;
    }
  }

  /** 应用处理器、执行 payload 边界检查并将一个事件入队。 */
  private async processAndQueue(initialEvent: TelemetryEvent): Promise<void> {
    /** 可空当前值允许任意处理器显式丢弃事件。 */
    let event: TelemetryEvent | null = initialEvent;
    for (const processor of this.processors) {
      if (!event) break;
      event = await processor(event);
    }
    if (!event) return;
    /* 字节大小校验在处理器之后执行，因为数据丰富可能增大 payload。 */
    if (new TextEncoder().encode(JSON.stringify(event)).byteLength > this.config.maxEventSizeBytes) {
      this.config.onDrop?.(1, 'oversized');
      return;
    }
    if (this.queue.push(event)) this.config.onDrop?.(1, 'queue_full');
    /*
     * 只打印已经通过全部处理器和资源边界的事件，使本地看到的内容与待上传内容一致。
     * 调试输出位于 Transport 之外，因此既不会改变批处理与重试语义，也不会因发送失败而重复打印。
     */
    if (this.config.debug?.printEvents) this.printDebugEvent(event);
    if (this.queue.size >= this.config.batchSize) void this.flush();
  }

  /**
   * 将一个最终事件信封输出到本地控制台。
   * @param event - 已完成处理并成功进入有界队列的事件。
   * @returns 无返回值；控制台异常会作为隔离的 SDK 内部错误上报。
   */
  private printDebugEvent(event: TelemetryEvent): void {
    try {
      console.debug('[TraceGlow] event', event);
    } catch (error) {
      this.reportInternal(error);
    }
  }

  /**
   * 持续投递队列批次，直到队列为空或某个批次耗尽重试。
   * 失败批次会恢复到队首以保留顺序，随后停止循环，
   * 防止不可用的 Collector 导致无限重试。
   */
  private async drainQueue(): Promise<void> {
    while (this.queue.size > 0) {
      /** 为本次投递尝试从队列中移除的最旧有界批次。 */
      const batch = this.queue.drain(this.config.batchSize);
      /** AbortController 限制该批次完整重试流程的时长。 */
      const controller = new AbortController();
      /** 超时无需依赖 Transport 专属计时器即可中止传输工作。 */
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        await withRetry(
          () => this.config.transport.send(batch, { signal: controller.signal }),
          { ...DEFAULT_RETRY, ...this.config.retry },
        );
      } catch (error) {
        /** 恢复较早失败批次时被挤出队列的事件数量。 */
        const dropped = this.queue.prepend(batch);
        if (dropped > 0) this.config.onDrop?.(dropped, 'queue_full');
        this.reportInternal(error);
        return;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  /**
   * 对 SDK 失败进行归一化，并通过隔离的可选回调报告。
   * 诊断回调本身也不可信，绝不能影响宿主代码。
   */
  private reportInternal(error: unknown): void {
    /** 即使 JavaScript 抛出任意值，也始终向回调提供 Error 实例。 */
    const normalized = error instanceof Error ? error : new Error(String(error));
    try {
      this.config.onInternalError?.(normalized);
    } catch {
      // 诊断逻辑不得影响宿主应用。
    }
  }
}
