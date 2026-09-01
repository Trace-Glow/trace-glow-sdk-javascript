import { ContextManager } from '@trace-glow-internal/context';
import { TelemetryClient, type TelemetryClientConfig } from '@trace-glow-internal/core';
import { Logger, type LoggerOptions } from '@trace-glow-internal/logger';
import { NodePlugin, NodeRequestContext, createHttpMiddleware, type HttpMiddlewareOptions, type NodePluginOptions, type NodeMiddleware } from '@trace-glow-internal/node';
import { HttpTransport } from '@trace-glow-internal/transport';
import packageMetadata from '../package.json';

/** 服务端 Collector 信封标识。 */
const PACKAGE_IDENTITY = { name: '@trace-glow/next', version: packageMetadata.version } as const;
/** Next Node runtime 服务端配置。 */
export interface NextServerTraceGlowConfig extends Omit<TelemetryClientConfig, 'transport' | 'sdk'> { /** Collector 地址。 */ endpoint: string; /** 服务端写入密钥。 */ apiKey: string; /** Node 埋点选项。 */ instrumentation?: NodePluginOptions; /** Logger 选项。 */ logger?: LoggerOptions; }

/** Next 服务端入口，适用于 instrumentation.ts 和 Node route handlers。 */
export class NextServerTraceGlow {
  /** 底层客户端。 */ readonly client: TelemetryClient;
  /** 进程级上下文。 */ readonly context: ContextManager;
  /** 请求级 AsyncLocalStorage。 */ readonly requestContext: NodeRequestContext;
  /** 结构化 Logger。 */ readonly logger: Logger;
  /** 启动 Promise。 */ readonly ready: Promise<TelemetryClient>;
  /** 创建并启动服务端监控。 */
  constructor(config: NextServerTraceGlowConfig) { /** 分离专属选项。 */ const { endpoint, apiKey, instrumentation, logger: loggerOptions, ...clientConfig } = config; /** 创建 HTTP Transport。 */ const transport = new HttpTransport({ endpoint, apiKey }); this.context = new ContextManager(); this.requestContext = new NodeRequestContext(); this.client = new TelemetryClient({ ...clientConfig, transport, sdk: PACKAGE_IDENTITY }); this.client.use(this.context).use(this.requestContext).use(new NodePlugin(instrumentation)); this.logger = new Logger(this.client, loggerOptions); this.ready = this.client.start(); }
  /** 创建可用于 Next Node middleware 的请求观测器。 */
  middleware(options: Omit<HttpMiddlewareOptions, 'requestContext'> = {}): NodeMiddleware { /** 将请求上下文绑定到中间件。 */ return createHttpMiddleware(this.client, { ...options, requestContext: this.requestContext }); }
}

/** Next 服务端公开的 Node 适配能力。 */
export { ContextManager, TelemetryClient, Logger, HttpTransport, NodePlugin, NodeRequestContext, createHttpMiddleware };
export type { DebugOptions, EventInput, Span, SpanKind, SpanOptions, SpanStatus, TelemetryClientConfig, TelemetryEvent, TraceContext } from '@trace-glow-internal/core';
export type { LoggerOptions } from '@trace-glow-internal/logger';
export type { HttpMiddlewareOptions, NodePluginOptions, NodeMiddleware } from '@trace-glow-internal/node';
