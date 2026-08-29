import type {
  JsonValue,
  TelemetryClientApi,
  TelemetryContext,
  TelemetryEvent,
  TelemetryPlugin,
  UserContext,
} from '@trace-glow/core';

/**
 * 维护共享遥测上下文，并向每个事件注入不可变快照。
 * 写时复制更新可防止调用方修改已入队数据。
 */
export class ContextManager implements TelemetryPlugin {
  /** 供内核拒绝重复注册的稳定插件标识。 */
  readonly name = '@trace-glow/context';
  /** 每次更新都会替换的当前共享上下文，用于避免引用泄漏。 */
  private context: TelemetryContext = {};
  /** 为确定性卸载插件而保留的处理器移除句柄。 */
  private removeProcessor: (() => void) | undefined;

  /**
   * 向客户端注册上下文丰富处理器。
   * @param client - 持有有序事件处理器的内核客户端。
   */
  setup(client: TelemetryClientApi): void {
    this.removeProcessor = client.addEventProcessor((event) => this.apply(event));
  }

  /** 移除丰富逻辑，确保已关闭客户端不保留插件引用。 */
  teardown(): void {
    this.removeProcessor?.();
    this.removeProcessor = undefined;
  }

  /**
   * 替换或清除共享用户身份。
   * @param user - 明确身份信息；传入 null 时移除身份字段。
   */
  setUser(user: UserContext | null): void {
    if (user) this.context = { ...this.context, user: { ...user } };
    else {
      /** 分离的上下文在移除身份前保留写时复制语义。 */
      const nextContext = { ...this.context };
      /* 从分离副本删除字段，避免保留未使用的解构绑定。 */
      delete nextContext.user;
      this.context = nextContext;
    }
  }

  /** 添加或替换一个低基数可搜索标签。 */
  setTag(key: string, value: string): void {
    this.context = { ...this.context, tags: { ...this.context.tags, [key]: value } };
  }

  /** 添加或替换一个 JSON 安全的非索引诊断值。 */
  setExtra(key: string, value: JsonValue): void {
    this.context = { ...this.context, extras: { ...this.context.extras, [key]: value } };
  }

  /**
   * 将非空关联标识合并到共享上下文。
   * 空标识会被忽略，避免清除有效的当前关联。
   */
  setCorrelation(correlation: Pick<TelemetryContext, 'traceId' | 'requestId' | 'sessionId'>): void {
    this.context = {
      ...this.context,
      ...(correlation.traceId ? { traceId: correlation.traceId } : {}),
      ...(correlation.requestId ? { requestId: correlation.requestId } : {}),
      ...(correlation.sessionId ? { sessionId: correlation.sessionId } : {}),
    };
  }

  /** 清除全部共享身份、标签、额外信息和关联状态。 */
  clear(): void {
    this.context = {};
  }

  /** 返回分离快照，防止外部修改影响后续事件。 */
  snapshot(): Readonly<TelemetryContext> {
    return structuredClone(this.context);
  }

  /**
   * 应用共享上下文，同时允许事件级值优先。
   * 嵌套的用户、标签和额外信息对象需要显式合并，
   * 因为浅展开会丢弃无关的共享字段。
   */
  private apply(event: TelemetryEvent): TelemetryEvent {
    /** 对请求专属值而言，事件级上下文具有最高优先级。 */
    const local = event.context;
    return {
      ...event,
      context: {
        ...this.context,
        ...local,
        ...(this.context.user || local?.user
          ? { user: { ...this.context.user, ...local?.user } }
          : {}),
        ...(this.context.tags || local?.tags
          ? { tags: { ...this.context.tags, ...local?.tags } }
          : {}),
        ...(this.context.extras || local?.extras
          ? { extras: { ...this.context.extras, ...local?.extras } }
          : {}),
      },
    };
  }
}
