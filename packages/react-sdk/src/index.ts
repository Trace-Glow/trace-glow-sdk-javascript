import { BrowserPlugin, type BrowserPluginOptions } from '@trace-glow/browser';
import { ContextManager } from '@trace-glow/context';
import { TelemetryClient, type TelemetryClientConfig } from '@trace-glow/core';
import { Logger, type LoggerOptions } from '@trace-glow/logger';
import { HttpTransport } from '@trace-glow/transport';
import {
  Component,
  createContext,
  createElement,
  useContext,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
import packageMetadata from '../package.json';

/** 嵌入 Collector 事件信封的公开 React 包标识。 */
const PACKAGE_IDENTITY = { name: '@trace-glow-sdk/react', version: packageMetadata.version } as const;

/** React 端 TraceGlow 构造函数接受的统一浏览器配置。 */
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

/** React 应用的统一 Trace Glow 入口，负责组装并自动启动浏览器采集能力。 */
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
   * 创建并启动完整组装的 React 浏览器遥测客户端。
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

    /* Collector 地址必须自动排除，否则 Fetch 埋点会递归采集 SDK 自身的上传请求。 */
    this.client.use(this.context).use(new BrowserPlugin({
      ...instrumentation,
      ignoreUrls: [endpoint, ...(instrumentation?.ignoreUrls ?? [])],
    }));

    this.logger = new Logger(this.client, loggerOptions);
    this.ready = this.client.start();
  }
}

/** React 树中共享的 TraceGlow 实例；null 用于识别缺失 Provider 的开发配置错误。 */
const TraceGlowReactContext = createContext<TraceGlow | null>(null);

/** TraceGlowProvider 接受的稳定实例与子树。 */
export interface TraceGlowProviderProps {
  /** 应用入口创建的单例 TraceGlow；Provider 不接管其生命周期。 */
  telemetry: TraceGlow;
  /** 可以读取同一遥测实例的 React 子树。 */
  children?: ReactNode;
}

/**
 * 将一个已创建的 TraceGlow 实例提供给 React 子树。
 * @param props - 稳定遥测实例和子节点。
 * @returns React Context Provider 元素。
 * @remarks 不创建或关闭实例，避免 StrictMode 重复挂载破坏 SDK 生命周期。
 */
export function TraceGlowProvider({ telemetry, children }: TraceGlowProviderProps): ReactElement {
  return createElement(TraceGlowReactContext.Provider, { value: telemetry }, children);
}

/**
 * 读取最近 TraceGlowProvider 提供的遥测实例。
 * @returns 当前 React 子树的 TraceGlow 单例。
 * @throws 组件不在 TraceGlowProvider 内时抛出明确的配置错误。
 */
export function useTraceGlow(): TraceGlow {
  /** 当前组件从最近 Provider 读取的遥测实例。 */
  const telemetry = useContext(TraceGlowReactContext);
  if (!telemetry) throw new Error('useTraceGlow must be used within TraceGlowProvider');
  return telemetry;
}

/** ErrorBoundary fallbackRender 接收的错误状态与恢复操作。 */
export interface TraceGlowFallbackRenderProps {
  /** 触发当前错误边界的 React 渲染错误。 */
  error: Error;
  /** 清除错误状态并重新渲染子树的恢复操作。 */
  resetErrorBoundary: () => void;
}

/** TraceGlowErrorBoundary 的公开属性。 */
export interface TraceGlowErrorBoundaryProps {
  /** 受错误边界保护的 React 子树。 */
  children?: ReactNode;
  /** 可选显式实例；省略时从最近的 TraceGlowProvider 读取。 */
  telemetry?: TraceGlow;
  /** 未提供 fallbackRender 时展示的静态回退内容。 */
  fallback?: ReactNode;
  /** 根据错误和恢复函数动态构建回退内容。 */
  fallbackRender?: (props: TraceGlowFallbackRenderProps) => ReactNode;
  /** 完成 SDK 采集后调用的可选宿主回调；其异常会被隔离。 */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** 手动恢复错误边界时调用的可选宿主回调；其异常会被隔离。 */
  onReset?: () => void;
}

/** 内部错误边界要求包装层已经解析出一个有效 TraceGlow 实例。 */
interface ResolvedErrorBoundaryProps extends TraceGlowErrorBoundaryProps {
  /** 从属性或 Context 解析出的有效遥测实例。 */
  telemetry: TraceGlow;
}

/** 内部错误边界只保留用于决定回退渲染的最小状态。 */
interface TraceGlowErrorBoundaryState {
  /** 最近捕获的 React 组件错误；null 表示正常渲染子树。 */
  error: Error | null;
}

/** 错误边界初始状态在实例间共享只读形状，不携带可变引用。 */
const INITIAL_ERROR_BOUNDARY_STATE: TraceGlowErrorBoundaryState = { error: null };

/**
 * 将 React ErrorBoundary 提供的错误安全写入遥测队列。
 * @param telemetry - 接收组件错误的 React SDK 实例。
 * @param error - React 捕获的错误对象。
 * @param info - React 提供的组件栈信息。
 * @returns 无返回值；归一化或 SDK 异常会被吞掉，避免影响错误恢复 UI。
 */
export function captureReactError(telemetry: TraceGlow, error: unknown, info: ErrorInfo): void {
  try {
    /** 将非 Error 抛出值归一化，保证事件字段稳定。 */
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    /** 仅保留错误诊断和组件栈，不采集 Props、State 或 DOM 文本。 */
    const payload = {
      errorName: normalizedError.name,
      message: normalizedError.message,
      ...(normalizedError.stack ? { stack: normalizedError.stack } : {}),
      ...(info.componentStack ? { componentStack: info.componentStack } : {}),
    };
    telemetry.client.capture({
      type: 'monitor',
      name: 'react.component_error',
      level: 'error',
      payload,
    });
  } catch {
    /* 错误上报本身不得破坏 React 已经进入的恢复流程。 */
  }
}

/** 实际接入 React 类组件生命周期的内部错误边界。 */
class ReactErrorBoundaryInner extends Component<ResolvedErrorBoundaryProps, TraceGlowErrorBoundaryState> {
  /** 当前错误状态决定渲染子树还是 fallback。 */
  state: TraceGlowErrorBoundaryState = INITIAL_ERROR_BOUNDARY_STATE;

  /**
   * 在 React 提交错误 UI 前将异常写入边界状态。
   * @param error - React 捕获的组件错误。
   * @returns 包含当前错误的新状态。
   */
  static getDerivedStateFromError(error: Error): TraceGlowErrorBoundaryState {
    return { error };
  }

  /**
   * 在 React 提交 fallback 后采集组件错误并通知宿主。
   * @param error - React 捕获的组件错误。
   * @param info - React 生成的组件栈。
   * @returns 无返回值；SDK 和宿主回调异常均被隔离。
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureReactError(this.props.telemetry, error, info);
    try {
      this.props.onError?.(error, info);
    } catch {
      /* 可选诊断回调不应制造第二个 React 生命周期错误。 */
    }
  }

  /**
   * 清除当前错误并重新渲染受保护子树。
   * @returns 无返回值；可选恢复回调异常会被隔离。
   */
  private readonly resetErrorBoundary = (): void => {
    this.setState(INITIAL_ERROR_BOUNDARY_STATE);
    try {
      this.props.onReset?.();
    } catch {
      /* 恢复回调失败不应阻止错误边界清除自身状态。 */
    }
  };

  /**
   * 根据当前错误状态渲染正常子树或配置的 fallback。
   * @returns React 子树、动态 fallback、静态 fallback 或 null。
   */
  render(): ReactNode {
    /** 最近捕获的组件错误；为 null 时直接渲染子节点。 */
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallbackRender) {
      return this.props.fallbackRender({ error, resetErrorBoundary: this.resetErrorBoundary });
    }
    return this.props.fallback ?? null;
  }
}

/**
 * 捕获 React 子树渲染错误并上报 `react.component_error` 事件。
 * @param props - 子树、可选遥测实例、fallback 和生命周期回调。
 * @returns 连接到显式实例或最近 Provider 的 React 错误边界元素。
 * @throws 未传 telemetry 且组件不在 TraceGlowProvider 内时抛出配置错误。
 */
export function TraceGlowErrorBoundary(props: TraceGlowErrorBoundaryProps): ReactElement {
  /** 允许独立边界通过属性使用，同时让大多数应用复用 Provider 单例。 */
  const contextTelemetry = useContext(TraceGlowReactContext);
  /** 显式属性优先，便于在 Provider 外保护应用根节点。 */
  const telemetry = props.telemetry ?? contextTelemetry;
  if (!telemetry) {
    throw new Error('TraceGlowErrorBoundary requires telemetry or TraceGlowProvider');
  }
  return createElement(ReactErrorBoundaryInner, { ...props, telemetry });
}

/** 供高级 React 组装使用的浏览器埋点插件。 */
export { BrowserPlugin } from '@trace-glow/browser';
/** 供自定义 React 组装使用的共享上下文管理器。 */
export { ContextManager } from '@trace-glow/context';
/** 供高级 React 组装使用的运行时无关客户端。 */
export { TelemetryClient } from '@trace-glow/core';
/** 打包进 React 包的结构化 Logger 实现。 */
export { Logger } from '@trace-glow/logger';
/** 受支持的浏览器投递 Transport。 */
export { BeaconTransport, HttpTransport } from '@trace-glow/transport';
/** 浏览器埋点选项协议。 */
export type { BrowserPluginOptions } from '@trace-glow/browser';
/** 运行时无关的事件与客户端协议。 */
export type { DebugOptions, EventInput, TelemetryClientConfig, TelemetryEvent } from '@trace-glow/core';
/** 结构化 Logger 选项协议。 */
export type { LoggerOptions } from '@trace-glow/logger';
