import { BrowserPlugin, type BrowserPluginOptions } from '@trace-glow-internal/browser';
import { ContextManager } from '@trace-glow-internal/context';
import { normalizeError, TelemetryClient, type TelemetryClientConfig } from '@trace-glow-internal/core';
import { Logger, type LoggerOptions } from '@trace-glow-internal/logger';
import { HttpTransport } from '@trace-glow-internal/transport';
import { Component, createContext, createElement, useContext, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import packageMetadata from '../package.json';

/** 嵌入 Collector 事件信封的公开 Next 客户端包标识。 */
const PACKAGE_IDENTITY = { name: '@trace-glow/next', version: packageMetadata.version } as const;

/** Next 客户端入口接受的统一浏览器配置。 */
export interface TraceGlowConfig extends Omit<TelemetryClientConfig, 'transport' | 'sdk'> {
  /** Collector 地址。 */ endpoint: string;
  /** 项目级浏览器写入密钥。 */ apiKey: string;
  /** 浏览器自动埋点选项。 */ instrumentation?: BrowserPluginOptions;
  /** Logger 默认选项。 */ logger?: LoggerOptions;
}

/** 在客户端组件中使用的 Next TraceGlow 实例。 */
export class TraceGlow {
  /** 底层遥测客户端。 */ readonly client: TelemetryClient;
  /** 应用级上下文管理器。 */ readonly context: ContextManager;
  /** 结构化 Logger。 */ readonly logger: Logger;
  /** 启动完成 Promise。 */ readonly ready: Promise<TelemetryClient>;

  /** 创建并启动浏览器遥测；Collector URL 自动排除以避免递归采集。 */
  constructor(config: TraceGlowConfig) {
    /** 分离 Transport 和运行时专属配置。 */
    const { endpoint, apiKey, instrumentation, logger: loggerOptions, ...clientConfig } = config;
    /** 使用 Fetch Transport 投递客户端事件。 */
    const transport = new HttpTransport({ endpoint, apiKey });
    this.context = new ContextManager();
    this.client = new TelemetryClient({ ...clientConfig, transport, sdk: PACKAGE_IDENTITY });
    this.client.use(this.context).use(new BrowserPlugin({ ...instrumentation, ignoreUrls: [endpoint, ...(instrumentation?.ignoreUrls ?? [])] }));
    this.logger = new Logger(this.client, loggerOptions);
    this.ready = this.client.start();
  }
}

/** React 子树共享的实例上下文。 */
const TraceGlowContext = createContext<TraceGlow | null>(null);

/** Next Provider 的属性。 */
export interface TraceGlowProviderProps { /** 客户端单例。 */ telemetry: TraceGlow; /** React 子树。 */ children?: ReactNode; }

/** 将客户端实例提供给 Next Client Component 子树。 */
export function TraceGlowProvider({ telemetry, children }: TraceGlowProviderProps): ReactElement {
  return createElement(TraceGlowContext.Provider, { value: telemetry }, children);
}

/** 获取最近 Provider 中的客户端实例。 */
export function useTraceGlow(): TraceGlow {
  /** 当前 Context 值。 */
  const telemetry = useContext(TraceGlowContext);
  if (!telemetry) throw new Error('useTraceGlow must be used within TraceGlowProvider');
  return telemetry;
}

/** 错误边界回退渲染参数。 */
export interface TraceGlowFallbackRenderProps { /** 捕获的错误。 */ error: Error; /** 重置边界。 */ resetErrorBoundary: () => void; }
/** Next 错误边界属性。 */
export interface TraceGlowErrorBoundaryProps { /** 受保护子树。 */ children?: ReactNode; /** 显式实例。 */ telemetry?: TraceGlow; /** 静态回退。 */ fallback?: ReactNode; /** 动态回退。 */ fallbackRender?: (props: TraceGlowFallbackRenderProps) => ReactNode; /** 宿主错误回调。 */ onError?: (error: Error, info: ErrorInfo) => void; /** 宿主重置回调。 */ onReset?: () => void; }

/** 将 React 错误转换为受约束的 Trace Glow 事件。 */
export function captureReactError(telemetry: TraceGlow, error: unknown, info: ErrorInfo): void {
  try {
    /** 归一化 React 抛出值。 */
    const normalizedError = normalizeError(error);
    telemetry.client.capture({ type: 'monitor', name: 'next.component_error', level: 'error', payload: { ...normalizedError, ...(info.componentStack ? { componentStack: info.componentStack } : {}) } });
  } catch { /* SDK 失败不得破坏 Next 错误恢复流程。 */ }
}

/** 实际承载 React ErrorBoundary 生命周期的内部组件。 */
class ErrorBoundaryInner extends Component<TraceGlowErrorBoundaryProps & { telemetry: TraceGlow }, { error: Error | null }> {
  /** 当前错误状态。 */ state = { error: null as Error | null };
  /** React 错误转换为边界状态。 */ static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }
  /** 捕获错误并调用隔离的宿主回调。 */ componentDidCatch(error: Error, info: ErrorInfo): void { captureReactError(this.props.telemetry, error, info); try { this.props.onError?.(error, info); } catch { /* 宿主回调异常被隔离。 */ } }
  /** 清除错误状态并执行恢复回调。 */ private readonly reset = (): void => { this.setState({ error: null }); try { this.props.onReset?.(); } catch { /* 恢复回调异常被隔离。 */ } };
  /** 渲染正常子树或回退内容。 */ render(): ReactNode { if (!this.state.error) return this.props.children; if (this.props.fallbackRender) return this.props.fallbackRender({ error: this.state.error, resetErrorBoundary: this.reset }); return this.props.fallback ?? null; }
}

/** 捕获客户端组件错误并渲染回退 UI。 */
export function TraceGlowErrorBoundary(props: TraceGlowErrorBoundaryProps): ReactElement {
  /** Provider 中的默认实例。 */
  const contextTelemetry = useContext(TraceGlowContext);
  /** 显式实例优先。 */
  const telemetry = props.telemetry ?? contextTelemetry;
  if (!telemetry) throw new Error('TraceGlowErrorBoundary requires telemetry or TraceGlowProvider');
  return createElement(ErrorBoundaryInner, { ...props, telemetry });
}

/** 公开底层 API 类型和实现。 */
export { BrowserPlugin, ContextManager, TelemetryClient, Logger, HttpTransport };
export { BeaconTransport } from '@trace-glow-internal/transport';
export type { BrowserPluginOptions } from '@trace-glow-internal/browser';
export type { DebugOptions, EventInput, TelemetryClientConfig, TelemetryEvent } from '@trace-glow-internal/core';
export type { LoggerOptions } from '@trace-glow-internal/logger';
