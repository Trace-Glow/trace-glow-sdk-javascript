import { ContextManager } from '@trace-glow-internal/context';
import { TelemetryClient, type TelemetryClientConfig } from '@trace-glow-internal/core';
import { Logger, type LoggerOptions } from '@trace-glow-internal/logger';
import { NodePlugin, NodeRequestContext, type NodePluginOptions } from '@trace-glow-internal/node';
import { HttpTransport } from '@trace-glow-internal/transport';
import packageMetadata from '../package.json';

/** 嵌入 Collector 事件信封的公开 Node.js 包标识。 */
const PACKAGE_IDENTITY = { name: '@trace-glow/node', version: packageMetadata.version } as const;

/** Node.js 端 TraceGlow 构造函数接受的统一配置。 */
export interface TraceGlowConfig extends Omit<TelemetryClientConfig, 'transport' | 'sdk'> {
  /** 接收 Trace Glow 事件信封的 Collector 地址。 */
  endpoint: string;
  /** 从受保护环境变量加载的服务端项目写入密钥。 */
  apiKey: string;
  /** Node.js 运行时专属的进程与指标埋点选项。 */
  instrumentation?: NodePluginOptions;
  /** 结构化 Logger 的可选默认值。 */
  logger?: LoggerOptions;
}

/** 统一的 Trace Glow Node.js 入口，负责组装并启动全部公开能力。 */
export class TraceGlow {
  /** 用于手动采集和关闭的底层客户端。 */
  readonly client: TelemetryClient;
  /** 用于稳定应用元数据的可变进程级上下文。 */
  readonly context: ContextManager;
  /** 基于 AsyncLocalStorage 的请求级关联标识上下文。 */
  readonly requestContext: NodeRequestContext;
  /** 连接到遥测客户端的结构化 Logger。 */
  readonly logger: Logger;
  /** 供严格启动流程应用等待的初始化 Promise。 */
  readonly ready: Promise<TelemetryClient>;

  /**
   * 创建并启动完整组装的 Node.js 遥测客户端。
   *
   * @param config - Collector 凭据、统一内核行为和 Node.js 埋点选项。
   * @throws 必填内核或 Transport 配置无效时抛出。
   */
  constructor(config: TraceGlowConfig) {
    /** 将统一公开选项与运行时无关内核选项分离。 */
    const { endpoint, apiKey, instrumentation, logger: loggerOptions, ...clientConfig } = config;
    /** 使用 Node.js Fetch 实现进行有确认的 Collector 投递。 */
    const transport = new HttpTransport({ endpoint, apiKey });
    this.context = new ContextManager();
    this.requestContext = new NodeRequestContext();
    this.client = new TelemetryClient({ ...clientConfig, transport, sdk: PACKAGE_IDENTITY });
    this.client.use(this.context).use(this.requestContext).use(new NodePlugin(instrumentation));
    this.logger = new Logger(this.client, loggerOptions);
    this.ready = this.client.start();
  }
}

/** 供自定义 Node.js 组装使用的共享上下文管理器。 */
export { ContextManager } from '@trace-glow-internal/context';
/** 供高级 Node.js 组装使用的运行时无关客户端。 */
export { TelemetryClient } from '@trace-glow-internal/core';
/** 打包进 Node.js 包的结构化 Logger 实现。 */
export { Logger } from '@trace-glow-internal/logger';
/** 受支持的 Node.js 插件和框架无关中间件适配器。 */
export {
  NodePlugin,
  NodeRequestContext,
  createExpressMiddleware,
  createHttpMiddleware,
  createKoaMiddleware,
  createNestMiddleware,
} from '@trace-glow-internal/node';
/** 具备响应确认的 HTTP Collector Transport。 */
export { HttpTransport } from '@trace-glow-internal/transport';
/** 运行时无关的事件与客户端协议。 */
export type { DebugOptions, EventInput, Span, SpanKind, SpanOptions, SpanStatus, TelemetryClientConfig, TelemetryEvent, TraceContext } from '@trace-glow-internal/core';
/** 结构化 Logger 选项协议。 */
export type { LoggerOptions } from '@trace-glow-internal/logger';
/** Node.js 埋点与中间件选项协议。 */
export type { HttpMiddlewareOptions, NodePluginOptions } from '@trace-glow-internal/node';
