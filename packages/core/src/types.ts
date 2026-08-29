/** 分配给遥测事件的严重级别，用于过滤和告警评估。 */
export type EventLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
/** 用于在 Collector 中路由记录的高层事件类别。 */
export type EventType = 'monitor' | 'log' | 'internal';
/** 无需自定义 JSON 编码即可表示的标量值。 */
export type JsonPrimitive = string | number | boolean | null;
/** 稳定传输协议允许的递归 JSON 值。 */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** 经用户明确同意后附加到事件的可选应用身份信息。 */
export interface UserContext {
  /** 优先于个人信息使用的稳定内部用户标识。 */
  id?: string;
  /** 可选邮箱地址；调用方负责取得同意并进行脱敏。 */
  email?: string;
  /** 仅在明确提供时使用的可选显示名称。 */
  username?: string;
  /** 其他 JSON 安全的身份属性。 */
  [key: string]: JsonValue | undefined;
}

/** 在异步或分布式任务之间关联事件的标识。 */
export interface CorrelationContext {
  /** 为后续兼容 OTLP 预留的分布式追踪标识。 */
  traceId?: string;
  /** 应用或中间件的请求标识。 */
  requestId?: string;
  /** 浏览器或应用会话标识。 */
  sessionId?: string;
}

/** 在事件入队和传输前合并的上下文。 */
export interface TelemetryContext extends CorrelationContext {
  /** 明确提供的应用用户身份。 */
  user?: UserContext;
  /** 低基数、可搜索的标签。 */
  tags?: Record<string, string>;
  /** 不提升为索引字段的 JSON 安全诊断值。 */
  extras?: Record<string, JsonValue>;
}

/** 发送到 Collector 的带版本事件信封。 */
export interface TelemetryEvent {
  /** SDK 与 Collector 滚动升级期间使用的传输模式版本。 */
  schemaVersion: 1;
  /** 客户端生成的标识，用于至少一次投递语义下的去重。 */
  id: string;
  /** 数据源生成的 ISO 8601 事件时间。 */
  timestamp: string;
  /** Collector 路由类别。 */
  type: EventType;
  /** 用于分组和查询的稳定事件名称。 */
  name: string;
  /** 用于过滤和告警的事件严重级别。 */
  level: EventLevel;
  /** 接收事件的租户内项目。 */
  projectId: string;
  /** 部署环境，例如 production 或 staging。 */
  environment?: string;
  /** 与事件关联的应用版本。 */
  release?: string;
  /** 用于兼容性诊断的 SDK 实现标识。 */
  sdk: { name: string; version: string };
  /** 可选的用户与关联元数据。 */
  context?: TelemetryContext;
  /** JSON 安全的事件专属数据。 */
  payload: Record<string, JsonValue>;
}

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
