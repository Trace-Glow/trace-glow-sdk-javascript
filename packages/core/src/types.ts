import type {
  EventLevel,
  SpanKind,
  SpanStatus,
  EventType,
  TelemetryContext,
  TelemetryEvent,
} from './generated/contracts';

/** 由 trace-glow-contracts 权威 Schema 生成的稳定传输协议类型。 */
export type {
  BeaconRequest,
  CorrelationContext,
  Envelope,
  EventLevel,
  SpanKind,
  SpanStatus,
  EventType,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  SdkIdentity,
  TelemetryContext,
  TelemetryEvent,
  UserContext,
} from './generated/contracts';

/** 由内核归一化后才成为事件的不可信采集输入。 */
export interface EventInput {
  /** 高层事件类别。 */
  type: EventType;
  /** 稳定事件名称；空名称会被拒绝。 */
  name: string;
  /** 可选严重级别，默认为 info。 */
  level?: EventLevel;
  /** 可选数据源时间戳，默认为采集时间。 */
  timestamp?: string;
  /** 覆盖共享上下文的事件级上下文。 */
  context?: TelemetryContext;
  /** 将被转换为有界 JSON 安全数据的任意值。 */
  payload?: Record<string, unknown>;
  /** 可选的分布式 trace 标识。 */
  traceId?: string;
  /** 当前 span 标识。 */
  spanId?: string;
  /** 父 span 标识。 */
  parentSpanId?: string;
  /** Span 角色。 */
  spanKind?: SpanKind;
  /** Span 完成状态。 */
  spanStatus?: SpanStatus;
  /** Span 开始时间。 */
  startTimestamp?: string;
  /** Span 持续时间，单位为毫秒。 */
  durationMs?: number;
  /** Span 属性。 */
  attributes?: Record<string, unknown>;
}

/** 创建 Span 时可选的初始元数据。 */
export interface SpanOptions {
  /** 可选本地 Span 或远程传播上下文；未提供时创建新的 trace。 */
  parent?: Span | TraceContext;
  /** Span 在调用链中的角色。 */
  kind?: SpanKind;
  /** 初始结构化属性。 */
  attributes?: Record<string, unknown>;
}

/** 由 W3C `traceparent` 或本地 Span 提供的最小传播上下文。 */
export interface TraceContext {
  /** 32 位小写十六进制 trace ID。 */
  readonly traceId: string;
  /** 16 位小写十六进制 parent span ID。 */
  readonly spanId: string;
  /** 是否保留该 trace 的采样决策。 */
  readonly sampled: boolean;
}

/** 可结束并上报一次 Trace Glow span 的句柄。 */
export interface Span {
  /** 当前 trace 标识。 */
  readonly traceId: string;
  /** 当前 span 标识。 */
  readonly spanId: string;
  /** 父 span 标识。 */
  readonly parentSpanId?: string;
  /** 当前 trace 的稳定采样决策。 */
  readonly sampled: boolean;
  /** 为 span 设置或覆盖属性。 */
  setAttribute(key: string, value: unknown): this;
  /** 将 span 标记为成功或失败。 */
  setStatus(status: SpanStatus): this;
  /** 结束 span 并入队一次 trace 事件；重复调用幂等。 */
  end(): void;
}

/** 内核传递给 Transport 的单次请求控制项。 */
export interface SendOptions {
  /** 限制 Collector 请求时长的中止信号。 */
  signal?: AbortSignal;
}

/** 由 HTTP、Beacon 或自定义 Transport 实现的投递边界。 */
export interface Transport {
  /** 发送一个不可变批次，失败时 reject 以便内核执行重试策略。 */
  send(events: readonly TelemetryEvent[], options?: SendOptions): Promise<void>;
}

/** 在遥测客户端启动前安装的生命周期扩展。 */
export interface TelemetryPlugin {
  /** 用于防止重复注册的稳定名称。 */
  readonly name: string;
  /** 安装监听器或处理器，并可执行异步初始化。 */
  setup(client: TelemetryClientApi): void | Promise<void>;
  /** 移除全部监听器并恢复被修改的运行时 API。 */
  teardown?(): void | Promise<void>;
}

/** 可脱敏、丰富或丢弃事件的有序转换器。 */
export type EventProcessor = (
  /** 内核生成的完整归一化事件。 */
  event: TelemetryEvent,
) => TelemetryEvent | null | Promise<TelemetryEvent | null>;

/** 暴露给运行时插件和 Logger 的最小客户端接口。 */
export interface TelemetryClientApi {
  /** 接收事件且不会把失败抛入宿主应用代码。 */
  capture(input: EventInput): void;
  /** 注册有序处理器并返回幂等的移除函数。 */
  addEventProcessor(processor: EventProcessor): () => void;
  /** 等待未完成处理并尝试清空当前队列。 */
  flush(): Promise<void>;
  /** 创建一个显式 Span，并在结束时通过 trace 事件上报。 */
  startSpan(name: string, options?: SpanOptions): Span;
}

/** 应用于传输失败的指数退避重试设置。 */
export interface RetryConfig {
  /** 总尝试次数，包含首次请求。 */
  attempts?: number;
  /** 初始退避延迟，单位为毫秒。 */
  baseDelayMs?: number;
  /** 最大延迟上限，单位为毫秒。 */
  maxDelayMs?: number;
}

/** 用于本地观察最终事件且不改变投递语义的调试配置。 */
export interface DebugOptions {
  /** 是否通过 `console.debug` 打印成功进入队列的完整事件信封。 */
  printEvents?: boolean;
}

/** 带有界资源默认值的运行时无关客户端配置。 */
export interface TelemetryClientConfig {
  /** 附加到每个事件的必填项目标识。 */
  projectId: string;
  /** 可选部署环境。 */
  environment?: string;
  /** 可选应用版本。 */
  release?: string;
  /** 由公开运行时包组装的具体投递策略。 */
  transport: Transport;
  /** 由公开浏览器或 Node.js 入口嵌入的包标识。 */
  sdk?: { name: string; version: string };
  /** 事件被保留的概率，范围为零到一。 */
  sampleRate?: number;
  /** 单次 Transport 调用发送的最大事件数。 */
  batchSize?: number;
  /** 内存中的最大事件数；溢出时丢弃最旧事件。 */
  maxQueueSize?: number;
  /** 入队前允许的最大 UTF-8 事件大小。 */
  maxEventSizeBytes?: number;
  /** 队列定时刷新间隔，单位为毫秒。 */
  flushIntervalMs?: number;
  /** 单个批次完整投递流程的总超时时间。 */
  requestTimeoutMs?: number;
  /** 可选的指数退避重试覆盖项。 */
  retry?: RetryConfig;
  /** 默认关闭的本地调试输出；启用后事件仍会正常发送到 Collector。 */
  debug?: DebugOptions;
  /** 用于 SDK 失败的隔离诊断回调。 */
  onInternalError?: (error: Error) => void;
  /** 用于统计采样和有界资源丢弃的可选回调。 */
  onDrop?: (count: number, reason: 'queue_full' | 'sampled' | 'invalid' | 'oversized') => void;
}
