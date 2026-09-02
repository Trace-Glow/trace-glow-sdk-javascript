import type {
  BeaconRequest,
  Envelope,
  SendOptions,
  TelemetryEvent,
  Transport,
} from '@trace-glow-internal/core';
import type { BeaconTransportOptions, HttpTransportOptions } from './types';
export type { BeaconTransportOptions, HttpTransportOptions } from './types';

/** 创建符合共享协议的 Collector 信封，仅复制批次数组而不克隆事件对象。 */
function envelope(events: readonly TelemetryEvent[]): Envelope {
  return { sentAt: new Date().toISOString(), events: [...events] };
}

/**
 * 编码 HTTP Body，并按需使用 gzip 压缩。
 *
 * 不支持显式 gzip 时会失败，而 auto 模式会降级为纯 JSON。
 * 这种区分既能防止要求压缩的调用方静默违反网络策略，又能兼容旧浏览器。
 */
async function encodeBody(
  body: string,
  mode: NonNullable<HttpTransportOptions['compression']>,
  minimumBytes: number,
): Promise<{ body: BodyInit; byteLength: number; compressed: boolean }> {
  /** UTF-8 字节可准确确定非 ASCII payload 文本的阈值。 */
  const bytes = new TextEncoder().encode(body);
  /** 压缩决策结合显式策略与配置的大小下限。 */
  const shouldCompress = mode === 'gzip' || (mode === 'auto' && bytes.byteLength >= minimumBytes);
  if (!shouldCompress) return { body, byteLength: bytes.byteLength, compressed: false };
  if (typeof CompressionStream === 'undefined') {
    if (mode === 'gzip') throw new Error('This runtime does not support gzip CompressionStream');
    return { body, byteLength: bytes.byteLength, compressed: false };
  }
  /** 浏览器流式基础能力可避免把 Node 专属 zlib 导入浏览器产物。 */
  const stream = new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'));
  /** 实体化的压缩字节可作为 BodyInit 直接传给 Fetch。 */
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return { body: compressed, byteLength: compressed.byteLength, compressed: true };
}

/** 基于 Fetch、支持响应确认和可选 gzip 的 Transport。 */
export class HttpTransport implements Transport {
  /** 固定保存实现，避免后续全局 Fetch 埋点产生递归。 */
  private readonly fetchImplementation: typeof globalThis.fetch;

  /** 校验必填凭据并立即解析 Fetch 实现。 */
  constructor(private readonly options: HttpTransportOptions) {
    if (!options.endpoint) throw new Error('endpoint is required');
    if (!options.apiKey) throw new Error('apiKey is required');
    /** 在 Transport 整个生命周期内固定的运行时专属 Fetch 实现。 */
    const implementation = options.fetch ?? globalThis.fetch;
    if (!implementation) throw new Error('This runtime does not provide fetch');
    this.fetchImplementation = implementation;
  }

  /**
   * 发送一个事件批次，并对非成功响应 reject，交由内核处理重试。
   * @param events - 内核排出的不可变批次。
   * @param options - 限制 Collector 延迟的中止信号。
   */
  async send(events: readonly TelemetryEvent[], options: SendOptions = {}): Promise<void> {
    /** 编码后的 Body 和字节长度用于确定 Header 与浏览器 keepalive 安全性。 */
    const encoded = await encodeBody(
      JSON.stringify(envelope(events)),
      this.options.compression ?? 'auto',
      this.options.minimumCompressionBytes ?? 1_024,
    );
    /** 必须等待 Collector 响应，因为 Fetch 成功 resolve 仍可能返回 HTTP 5xx。 */
    const response = await this.fetchImplementation(this.options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trace-glow-key': this.options.apiKey,
        ...(encoded.compressed ? { 'content-encoding': 'gzip' } : {}),
        ...this.options.headers,
      },
      body: encoded.body,
      ...(options.signal ? { signal: options.signal } : {}),
      /* 浏览器通常将 keepalive payload 限制在约 64 KiB，因此需保持在该上限以下。 */
      keepalive: encoded.byteLength <= 60_000,
    });
    if (!response.ok) {
      throw new Error(`Trace Glow collector returned ${response.status}`);
    }
  }
}

/** 页面关闭时尽力投递、支持可选可靠回退的 Transport。 */
export class BeaconTransport implements Transport {
  /** 存储不可变 Transport 配置，供后续 send 调用使用。 */
  constructor(private readonly options: BeaconTransportOptions) {}

  /**
   * 尝试通过 Beacon 投递，随后委托给回退 Transport 或 reject。
   * Beacon 成功仅表示浏览器队列已接受，不代表 Collector 已确认。
   */
  async send(events: readonly TelemetryEvent[], sendOptions?: SendOptions): Promise<void> {
    /** 从注入值或当前浏览器全局对象中选择的 Navigator 实现。 */
    const navigatorApi = this.options.navigator ?? globalThis.navigator;
    /** 由于无法使用自定义请求 Header，Beacon 请求使用共享 Body 鉴权协议。 */
    const request: BeaconRequest = { apiKey: this.options.apiKey, ...envelope(events) };
    /** JSON Body 保持与 Header 鉴权信封相同的事件顺序和发送时间语义。 */
    const body = JSON.stringify(request);
    if (navigatorApi?.sendBeacon?.(this.options.endpoint, new Blob([body], { type: 'application/json' }))) {
      return;
    }
    if (this.options.fallback) return this.options.fallback.send(events, sendOptions);
    throw new Error('Beacon delivery was rejected and no fallback transport is configured');
  }
}
