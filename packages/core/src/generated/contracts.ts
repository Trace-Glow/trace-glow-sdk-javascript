/**
 * 此文件由 json-schema-to-typescript 从 contracts/v1/contracts.schema.json 生成。
 * 请勿手工编辑；使用 pnpm contracts:sync 更新协议快照。
 */

/**
 * Collector 用于路由记录的高层事件类别。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "EventType".
 */
export type EventType = "monitor" | "log" | "trace" | "internal";
/**
 * 用于过滤、聚合和告警的事件严重级别。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "EventLevel".
 */
export type EventLevel = "debug" | "info" | "warn" | "error" | "fatal";
/**
 * 协议允许递归表示的任意 JSON 值。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
/**
 * 无需自定义编码即可传输的 JSON 标量值。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "JsonPrimitive".
 */
export type JsonPrimitive = string | number | boolean | null;
/**
 * 由 JSON 值组成的递归数组。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * 用于描述 span 在调用链中的角色。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "SpanKind".
 */
export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
/**
 * Span 完成时的标准状态。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "SpanStatus".
 */
export type SpanStatus = "unset" | "ok" | "error";

/**
 * Trace Glow v1 传输协议的聚合代码生成入口。
 */
export interface TraceGlowContracts {
  telemetryEvent: TelemetryEvent;
  envelope: Envelope;
  beaconRequest: BeaconRequest;
}
/**
 * 发送到 Collector 的版本化遥测事件。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "TelemetryEvent".
 */
export interface TelemetryEvent {
  /**
   * SDK 和 Collector 滚动升级期间使用的协议主版本。
   */
  schemaVersion: 1;
  /**
   * 客户端生成、供至少一次投递去重使用的事件标识。
   */
  id: string;
  /**
   * 数据源生成的 ISO 8601 事件时间。
   */
  timestamp: string;
  type: EventType;
  /**
   * 用于分组和查询的稳定事件名称。
   */
  name: string;
  level: EventLevel;
  /**
   * 接收事件的租户内项目标识。
   */
  projectId: string;
  /**
   * 可选部署环境，例如 production 或 staging。
   */
  environment?: string;
  /**
   * 与事件关联的可选应用版本。
   */
  release?: string;
  sdk: SdkIdentity;
  context?: TelemetryContext;
  /**
   * 当前 span 的 16 字节十六进制标识。
   */
  spanId?: string;
  /**
   * 父 span 的 16 字节十六进制标识。
   */
  parentSpanId?: string;
  spanKind?: SpanKind;
  spanStatus?: SpanStatus;
  /**
   * Span 开始时间。
   */
  startTimestamp?: string;
  /**
   * Span 持续时间，单位为毫秒。
   */
  durationMs?: number;
  /**
   * Span 的 JSON 安全属性，禁止请求体和敏感 Header。
   */
  attributes?: {
    [k: string]: JsonValue;
  };
  /**
   * 事件专属的 JSON 安全数据。
   */
  payload: {
    [k: string]: JsonValue;
  };
}
/**
 * 用于 Collector 兼容性诊断的 SDK 实现标识。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "SdkIdentity".
 */
export interface SdkIdentity {
  /**
   * 生成事件的 SDK 包名。
   */
  name: string;
  /**
   * 生成事件的 SDK 包版本。
   */
  version: string;
}
/**
 * 在事件进入队列和传输前合并的上下文。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "TelemetryContext".
 */
export interface TelemetryContext {
  /**
   * 为分布式追踪兼容保留的追踪标识。
   */
  traceId?: string;
  /**
   * 应用或中间件生成的请求标识。
   */
  requestId?: string;
  /**
   * 浏览器或应用会话标识。
   */
  sessionId?: string;
  user?: UserContext;
  /**
   * 适合索引和过滤的低基数字符串标签。
   */
  tags?: {
    [k: string]: string;
  };
  /**
   * 无需提升为索引字段的 JSON 诊断值。
   */
  extras?: {
    [k: string]: JsonValue;
  };
}
/**
 * 经应用明确提供、附加到事件的可选用户上下文。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "UserContext".
 */
export interface UserContext {
  /**
   * 优先于个人信息使用的稳定内部用户标识。
   */
  id?: string;
  /**
   * 仅在应用取得同意并完成必要脱敏后提供的邮箱。
   */
  email?: string;
  /**
   * 仅在应用明确提供时传输的显示名称。
   */
  username?: string;
  [k: string]: JsonValue;
}
/**
 * 键为字符串、值为 JSON 值的递归对象。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * 使用 Header 鉴权的标准批量事件请求。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "Envelope".
 */
export interface Envelope {
  /**
   * 批次完成序列化时的 ISO 8601 时间。
   */
  sentAt: string;
  /**
   * 本次投递尝试包含的有序事件。
   */
  events: TelemetryEvent[];
}
/**
 * 无法设置自定义 Header 时使用的浏览器 Beacon 批量请求。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "BeaconRequest".
 */
export interface BeaconRequest {
  /**
   * 仅用于 Beacon Body 鉴权的项目写入密钥。
   */
  apiKey: string;
  /**
   * 批次完成序列化时的 ISO 8601 时间。
   */
  sentAt: string;
  /**
   * 本次投递尝试包含的有序事件。
   */
  events: TelemetryEvent[];
}
/**
 * 用于关联异步、请求或分布式工作的标识。
 *
 * This interface was referenced by `TraceGlowContracts`'s JSON-Schema
 * via the `definition` "CorrelationContext".
 */
export interface CorrelationContext {
  /**
   * 为分布式追踪兼容保留的追踪标识。
   */
  traceId?: string;
  /**
   * 应用或中间件生成的请求标识。
   */
  requestId?: string;
  /**
   * 浏览器或应用会话标识。
   */
  sessionId?: string;
}
