import { BrowserPlugin, type BrowserPluginOptions } from '@trace-glow-internal/browser';
import { ContextManager } from '@trace-glow-internal/context';
import { TelemetryClient, type TelemetryClientConfig } from '@trace-glow-internal/core';
import { Logger, type LoggerOptions } from '@trace-glow-internal/logger';
import { HttpTransport } from '@trace-glow-internal/transport';
import { VuePlugin } from '@trace-glow-internal/vue';
import type { App } from 'vue';
import packageMetadata from '../package.json';

/** 嵌入 Collector 事件信封的公开 Vue 包标识。 */
const PACKAGE_IDENTITY = { name: '@trace-glow/vue', version: packageMetadata.version } as const;

/** Vue 端 TraceGlow 构造函数接受的统一浏览器配置。 */
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

/** 同时实现 Vue Plugin 协议的统一 Trace Glow Vue 入口。 */
export class TraceGlow {
  /** 用于手动采集和生命周期操作的底层客户端。 */
  readonly client: TelemetryClient;
  /** 可变的应用级用户与关联上下文。 */
  readonly context: ContextManager;
  /** 连接到遥测客户端的结构化 Logger。 */
  readonly logger: Logger;
  /** 管理 Vue App 错误处理器安装和恢复的集成插件。 */
  readonly vue: VuePlugin;
  /** 供严格启动流程应用等待的初始化 Promise。 */
  readonly ready: Promise<TelemetryClient>;

  /**
   * 创建并自动启动完整组装的 Vue 浏览器遥测客户端。
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
    this.vue = new VuePlugin(this.client);

    /*
     * Vue 集成与浏览器自动埋点共享一个客户端和上下文；Collector URL 仍必须排除，
     * 防止 SDK 自身 Fetch 请求递归生成网络事件。
     */
    this.client.use(this.context).use(this.vue).use(new BrowserPlugin({
      ...instrumentation,
      ignoreUrls: [endpoint, ...(instrumentation?.ignoreUrls ?? [])],
    }));
    this.logger = new Logger(this.client, loggerOptions);
    this.ready = this.client.start();
  }

  /**
   * 实现 Vue Plugin install 协议，安装组件错误采集。
   * @param app - 由 `createApp()` 返回的 Vue 3 应用。
   * @returns 无返回值；重复安装同一应用时保持幂等。
   */
  install(app: App): void {
    this.vue.install(app);
  }
}

/** 供自定义客户端组装使用的浏览器自动埋点插件。 */
export { BrowserPlugin } from '@trace-glow-internal/browser';
/** 供自定义客户端组装使用的共享上下文管理器。 */
export { ContextManager } from '@trace-glow-internal/context';
/** 供高级 Vue 组装使用的运行时无关客户端。 */
export { TelemetryClient } from '@trace-glow-internal/core';
/** 打包进 Vue 包的结构化 Logger 实现。 */
export { Logger } from '@trace-glow-internal/logger';
/** 受支持的浏览器投递 Transport。 */
export { BeaconTransport, HttpTransport } from '@trace-glow-internal/transport';
/** 供高级组装使用的 Vue 错误处理器插件。 */
export { VuePlugin } from '@trace-glow-internal/vue';
/** 浏览器埋点选项协议。 */
export type { BrowserPluginOptions } from '@trace-glow-internal/browser';
/** 运行时无关的事件与客户端协议。 */
export type { DebugOptions, EventInput, TelemetryClientConfig, TelemetryEvent } from '@trace-glow-internal/core';
/** 结构化 Logger 选项协议。 */
export type { LoggerOptions } from '@trace-glow-internal/logger';
/** Vue 应用类型。 */
export type { VueApp } from '@trace-glow-internal/vue';
