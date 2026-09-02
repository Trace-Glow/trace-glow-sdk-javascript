/** 具备响应确认的 HTTP Collector 投递配置。 */
export interface HttpTransportOptions {
  /** Collector 绝对地址。 */
  endpoint: string;
  /** 通过专用请求 Header 发送的项目写入密钥。 */
  apiKey: string;
  /** 在 SDK Header 之后应用、用于受控覆盖的附加 Header。 */
  headers?: Record<string, string>;
  /** 供测试或非标准运行时使用的可注入 Fetch 实现。 */
  fetch?: typeof globalThis.fetch;
  /** 压缩策略；auto 仅压缩足够大的 payload。 */
  compression?: 'auto' | 'gzip' | 'none';
  /** 开始自动压缩的 UTF-8 字节阈值。 */
  minimumCompressionBytes?: number;
}

/** 浏览器 Beacon 投递所需的 Collector 配置。 */
export interface BeaconTransportOptions {
  /** Collector 绝对地址。 */
  endpoint: string;
  /** 通过专用请求 Header 发送的项目写入密钥。 */
  apiKey: string;
  /** 供测试和嵌入式浏览器运行时使用的可注入 Navigator 子集。 */
  navigator?: Pick<Navigator, 'sendBeacon'>;
  /** Beacon 拒绝 payload 时使用的有确认 Transport。 */
  fallback?: Transport;
}
import type { Transport } from '@trace-glow-internal/core';
