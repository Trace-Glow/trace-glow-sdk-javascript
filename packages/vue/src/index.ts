import type { TelemetryClientApi, TelemetryPlugin } from '@trace-glow-internal/core';
import type { App, ComponentPublicInstance } from 'vue';

/** Vue 应用配置公开的错误处理器签名。 */
type VueErrorHandler = NonNullable<App['config']['errorHandler']>;

/** 单个 Vue 应用安装前后的处理器状态。 */
interface VueInstallation {
  /** SDK 安装前由应用或其他插件注册的处理器。 */
  previous: App['config']['errorHandler'];
  /** SDK 安装的包装处理器，用于安全判断是否可以恢复。 */
  handler: VueErrorHandler;
}

/**
 * 将 Vue 抛出的任意值归一化为稳定且不读取组件状态的诊断字段。
 * @param error - Vue errorHandler 接收到的未知异常值。
 * @returns 仅包含错误名称、消息和可选堆栈的结构化对象。
 */
function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : 'Unknown Vue error' };
}

/**
 * 尽力读取组件定义名称，不访问 props、响应式状态或 DOM。
 * @param instance - Vue 提供的可选组件公开实例。
 * @returns 显式组件名称；不可用或读取失败时返回 undefined。
 */
function componentName(instance: ComponentPublicInstance | null): string | undefined {
  try {
    /** Vue 编译器可能通过 `__name` 保存单文件组件名称。 */
    const options = instance?.$options as { name?: string; __name?: string } | undefined;
    return options?.name ?? options?.__name;
  } catch {
    return undefined;
  }
}

/** 将 Vue 全局错误处理器连接到 Trace Glow 客户端的生命周期插件。 */
export class VuePlugin implements TelemetryPlugin {
  /** 用于拒绝重复注册的私有工作区插件标识。 */
  readonly name = '@trace-glow-internal/vue';
  /** 接收 Vue 异常且保证 capture 不影响宿主控制流的客户端。 */
  private readonly client: TelemetryClientApi;
  /** 保留每个应用的原处理器，以便 shutdown 时精确恢复。 */
  private readonly installations = new Map<App, VueInstallation>();

  /**
   * 创建绑定到一个遥测客户端的 Vue 集成。
   * @param client - 接收 Vue 监控事件的运行时无关客户端。
   */
  constructor(client: TelemetryClientApi) {
    this.client = client;
  }

  /**
   * 参与客户端插件生命周期；实际 Vue App 由 install 单独提供。
   * @returns 无返回值且不修改全局状态。
   */
  setup(): void {}

  /**
   * 在 Vue App 上安装幂等错误处理器并保留原有处理器。
   * @param app - 需要接入监控的 Vue 3 应用实例。
   * @returns 无返回值；不可写的应用配置会被安全忽略。
   */
  install(app: App): void {
    if (this.installations.has(app)) return;
    /** 保存 SDK 安装前的处理器，以保持应用既有错误处理行为。 */
    const previous = app.config.errorHandler;
    /** 包装处理器先采集事件，再透明调用应用原处理器。 */
    const handler: VueErrorHandler = (error, instance, info) => {
      /** 组件名是唯一读取的组件元数据，避免泄漏 props、状态或 DOM。 */
      const component = componentName(instance);
      this.client.capture({
        type: 'monitor',
        name: 'vue.exception',
        level: 'error',
        payload: {
          ...errorPayload(error),
          info,
          ...(component ? { component } : {}),
        },
      });
      previous?.(error, instance, info);
    };
    try {
      app.config.errorHandler = handler;
      this.installations.set(app, { previous, handler });
    } catch {
      // 冻结或代理限制的应用配置不得导致 SDK 安装破坏应用启动。
    }
  }

  /**
   * 恢复仍由本插件持有的处理器，并释放全部 Vue App 引用。
   * @returns 无返回值；应用配置恢复失败会被隔离。
   */
  teardown(): void {
    /** 当前安装记录提供需要恢复的应用、原处理器和包装器。 */
    for (const [app, installation] of this.installations) {
      try {
        /* 应用后续替换处理器时保留其新值，避免 shutdown 覆盖宿主修改。 */
        if (app.config.errorHandler === installation.handler) {
          if (installation.previous) app.config.errorHandler = installation.previous;
          else delete app.config.errorHandler;
        }
      } catch {
        // 宿主配置恢复失败不得中断客户端最终刷新。
      }
    }
    this.installations.clear();
  }
}

/** Vue 插件安装所需的公开类型。 */
export type { App as VueApp } from 'vue';
