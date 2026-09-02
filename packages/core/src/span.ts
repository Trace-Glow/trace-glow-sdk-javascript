import type { Span, SpanOptions, TelemetryClientApi } from './types';

/** 创建显式 Span，并将结束事件交给核心客户端统一采样和排队。 */
export function createSpan(
  client: TelemetryClientApi,
  name: string,
  options: SpanOptions,
  sampleRate: number,
): Span {
  /** 远程父级采样决策必须原样继承；根 Span 使用客户端统一采样率。 */
  const sampled = options.parent?.sampled ?? Math.random() < sampleRate;
  /** Span 开始时间用于生成稳定的 ISO 时间戳和耗时。 */
  const started = new Date();
  /** 子 Span 继承父级 trace，否则创建新的 trace 标识。 */
  const traceId = options.parent?.traceId ?? randomHex(16);
  /** 每个 Span 使用独立的 64 位标识。 */
  const spanId = randomHex(8);
  /** 属性写时复制，避免调用方对象被后续修改。 */
  const attributes: Record<string, unknown> = { ...options.attributes };
  /** Span 状态默认为 unset，结束前可被调用方覆盖。 */
  let status: 'unset' | 'ok' | 'error' = 'unset';
  /** 结束标记保证重复 end 不产生重复事件。 */
  let ended = false;
  const span: Span = {
    traceId,
    spanId,
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
      if (!sampled) return;
      client.capture({
        type: 'trace',
        name,
        traceId,
        spanId,
        ...(options.parent ? { parentSpanId: options.parent.spanId } : {}),
        spanKind: options.kind ?? 'internal',
        spanStatus: status,
        startTimestamp: started.toISOString(),
        durationMs: Math.max(0, Date.now() - started.getTime()),
        attributes,
      });
    },
  };
  return span;
}

/** 生成指定字节长度的十六进制标识，避免 Span 模块依赖运行时专属 API。 */
function randomHex(bytes: number): string {
  /** 优先使用 Web Crypto；旧运行时使用时间和随机数混合熵。 */
  const values = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else for (let index = 0; index < values.length; index += 1) values[index] = (Date.now() + Math.random() * 256 + index) & 0xff;
  if (values.every((value) => value === 0)) values[0] = 1;
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}
