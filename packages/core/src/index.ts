/** 公开的运行时无关客户端实现。 */
export { TelemetryClient } from './client';
/** 供自定义处理器和集成使用的公开 JSON 归一化工具。 */
export { normalizeError, toJsonRecord, toJsonValue } from './json';
export type { NormalizedException, NormalizedStackFrame } from './json';
/** W3C Trace Context 的解析和格式化工具。 */
export { formatTraceparent, parseTraceparent } from './trace-context';
/** 供高级内部组装使用的公开有界队列基础组件。 */
export { BoundedQueue } from './queue';
/** 自定义 Transport 共享的公开重试基础组件。 */
export { withRetry } from './retry';
/** 显式 Span 生命周期工厂，供内核和运行时集成复用。 */
export { createSpan } from './span';
/** 所有私有模块和公开 Bundle 共享的稳定类型协议。 */
export type {
  BeaconRequest,
  CorrelationContext,
  DebugOptions,
  EventInput,
  EventLevel,
  EventProcessor,
  EventType,
  Envelope,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RetryConfig,
  Span,
  SpanKind,
  SpanOptions,
  SpanStatus,
  SendOptions,
  SdkIdentity,
  TelemetryClientApi,
  TelemetryClientConfig,
  TelemetryContext,
  TelemetryEvent,
  TelemetryPlugin,
  Transport,
  TraceContext,
  UserContext,
} from './types';
