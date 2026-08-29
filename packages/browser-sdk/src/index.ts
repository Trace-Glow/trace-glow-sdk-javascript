import { BrowserPlugin, type BrowserPluginOptions } from '@trace-glow-internal/browser';
import { ContextManager } from '@trace-glow-internal/context';
import { TelemetryClient, type TelemetryClientConfig } from '@trace-glow-internal/core';
import { Logger, type LoggerOptions } from '@trace-glow-internal/logger';
import { HttpTransport } from '@trace-glow-internal/transport';
import packageMetadata from '../package.json';

/** 嵌入 Collector 事件信封的公开浏览器包标识。 */
const PACKAGE_IDENTITY = { name: '@trace-glow/browser', version: packageMetadata.version } as const;

/** 浏览器端 TraceGlow 构造函数接受的统一配置。 */
export interface TraceGlowConfig extends Omit<TelemetryClientConfig, 'transport' | 'sdk'> {
  /** 接收 Trace Glow 事件信封的 Collector 地址。 */
  endpoint: string;
  /** 项目级浏览器写入密钥；绝不能使用管理密钥。 */
  apiKey: string;
  /** 浏览器运行时专属的自动埋点选项。 */
  instrumentation?: BrowserPluginOptions;
  /** 结构化 Logger 的可选默认值。 */
  logger?: LoggerOptions;
}

/** 统一的 Trace Glow 浏览器入口，负责组装并启动全部公开能力。 */
export class TraceGlow {
  /** 用于手动采集和生命周期操作的底层客户端。 */
  readonly client: TelemetryClient;
  /** 可变的应用级用户与关联上下文。 */
  readonly context: ContextManager;
  /** 连接到遥测客户端的结构化 Logger。 */
  readonly logger: Logger;
  /** 供严格启动流程应用等待的初始化 Promise。 */
  readonly ready: Promise<TelemetryClient>;

  /**
   * 创建并启动完整组装的浏览器遥测客户端。
   *
   * @param config - Collector 凭据、统一内核行为和浏览器埋点选项。
   * @throws 必填内核或 Transport 配置无效时抛出。
   */
  constructor(config: TraceGlowConfig) {
    /** 将统一公开选项与运行时无关内核选项分离。 */
    const { endpoint, apiKey, instrumentation, logger: loggerOptions, ...clientConfig } = config;
    /** 使用 Fetch 进行有确认投递和自动 gzip 协商。 */
    const transport = new HttpTransport({ endpoint, apiKey });
    this.context = new ContextManager();
    this.client = new TelemetryClient({ ...clientConfig, transport, sdk: PACKAGE_IDENTITY });

    /*
     * 始终忽略 Collector URL，防止遥测投递请求递归生成新的网络遥测事件。
     */
    this.client.use(this.context).use(new BrowserPlugin({
      ...instrumentation,
      ignoreUrls: [endpoint, ...(instrumentation?.ignoreUrls ?? [])],
    }));

    this.logger = new Logger(this.client, loggerOptions);
    this.ready = this.client.start();
  }
}

/** 供自定义客户端组装使用的受支持浏览器埋点插件。 */
export { BrowserPlugin } from '@trace-glow-internal/browser';
/** 供自定义客户端组装使用的共享上下文管理器。 */
export { ContextManager } from '@trace-glow-internal/context';
/** 供高级浏览器组装使用的运行时无关客户端。 */
export { TelemetryClient } from '@trace-glow-internal/core';
/** 打包进浏览器包的结构化 Logger 实现。 */
export { Logger } from '@trace-glow-internal/logger';
/** 受支持的浏览器投递 Transport。 */
export { BeaconTransport, HttpTransport } from '@trace-glow-internal/transport';
/** 浏览器埋点选项协议。 */
export type { BrowserPluginOptions } from '@trace-glow-internal/browser';
/** 运行时无关的事件与客户端协议。 */
export type { DebugOptions, EventInput, TelemetryClientConfig, TelemetryEvent } from '@trace-glow-internal/core';
/** 结构化 Logger 选项协议。 */
export type { LoggerOptions } from '@trace-glow-internal/logger';
