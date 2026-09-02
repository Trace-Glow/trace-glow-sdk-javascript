import type { EventLevel, TelemetryContext } from '@trace-glow-internal/core';

/** Logger 应用且由子 Logger 继承的默认值。 */
export interface LoggerOptions {
  /** 发送到遥测客户端的最低严重级别。 */
  minimumLevel?: EventLevel;
  /** 附加到该 Logger 每条记录的固定上下文。 */
  context?: TelemetryContext;
  /** 在单次调用字段之前合并的固定结构化字段。 */
  fields?: Record<string, unknown>;
}
