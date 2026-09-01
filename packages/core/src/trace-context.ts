import type { Span, TraceContext } from './types';

/** W3C Trace Context v1 使用的固定版本。 */
const TRACEPARENT_VERSION = '00';
/** 合法 trace ID 的小写十六进制格式。 */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
/** 合法 span ID 的小写十六进制格式。 */
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;

/**
 * 解析受信任程度未知的 W3C `traceparent` Header。
 * @param value - 传入 Header；数组和缺失值应由调用方先归一化。
 * @returns 合法远程父上下文；格式、版本或全零标识无效时返回 undefined。
 */
export function parseTraceparent(value: string | undefined): TraceContext | undefined {
  if (!value) return undefined;
  /** 严格拆分四段，避免接受未来版本额外字段而产生错误传播。 */
  const parts = value.trim().toLowerCase().split('-');
  if (parts.length !== 4 || parts[0] !== TRACEPARENT_VERSION) return undefined;
  /** 分离后的固定位置对应 W3C trace-id、parent-id 和 flags。 */
  const traceId = parts[1];
  /** 远程 parent-id 在本地新 Span 中成为 parentSpanId。 */
  const spanId = parts[2];
  /** 两位 flags 只读取 sampled 最低位，其他位保持向前兼容忽略。 */
  const flags = parts[3];
  if (!traceId || !spanId || !flags || !TRACE_ID_PATTERN.test(traceId) || !SPAN_ID_PATTERN.test(spanId)) return undefined;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId) || !/^[0-9a-f]{2}$/.test(flags)) return undefined;
  return { traceId, spanId, sampled: (Number.parseInt(flags, 16) & 1) === 1 };
}

/**
 * 将本地 Span 格式化为 W3C `traceparent` Header。
 * @param span - 提供 trace ID、span ID 和采样决策的当前 Span。
 * @returns 可注入出站请求的固定版本 Header。
 */
export function formatTraceparent(span: Pick<Span, 'traceId' | 'spanId' | 'sampled'>): string {
  /** flags 只设置 W3C sampled 位，禁止传播 SDK 私有状态。 */
  const flags = span.sampled ? '01' : '00';
  return `${TRACEPARENT_VERSION}-${span.traceId}-${span.spanId}-${flags}`;
}
