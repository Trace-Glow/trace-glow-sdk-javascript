/** Node.js 埋点的功能开关和采集间隔。 */
export interface NodePluginOptions {
  /** 定期采集 CPU、内存、事件循环延迟和运行时间。 */
  runtimeMetrics?: boolean;
  /** 运行时指标间隔，单位为毫秒。 */
  metricsIntervalMs?: number;
  /** 在不改变未捕获异常语义的情况下观察致命进程失败。 */
  processErrors?: boolean;
  /** 选择启用 rejection 观察；该选项会改变 Node.js 默认监听行为。 */
  unhandledRejections?: boolean;
}

/** Node HTTP、Express、Koa 和 Nest 中间件适配器共享的选项。 */
import type { NodeRequestContext } from './index';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface HttpMiddlewareOptions {
  /** 用于将请求 ID 传播到嵌套日志的可选异步本地插件。 */
  requestContext?: NodeRequestContext;
  /** 用于请求关联的传入和传出 Header 名称。 */
  requestIdHeader?: string;
  /** 仅在明确完成隐私决策后保留查询数据。 */
  includeUrlQuery?: boolean;
}

/** 框架无关的 Connect 风格中间件签名。 */
export type NodeMiddleware = (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void;
