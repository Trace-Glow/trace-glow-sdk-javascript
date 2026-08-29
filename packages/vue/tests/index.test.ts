import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryClient } from '@trace-glow-internal/core';
import type { TelemetryEvent, Transport } from '@trace-glow-internal/core';
import type { App, ComponentPublicInstance } from 'vue';
import { VuePlugin } from '../src/index';

/** 每个测试后恢复函数替代实现，避免 Vue 处理器断言相互污染。 */
afterEach(() => {
  vi.restoreAllMocks();
});

/** 验证 Vue 全局错误处理器的采集、委托和恢复行为。 */
describe('VuePlugin', () => {
  /** 确保组件错误进入遥测队列，同时原处理器仍被调用。 */
  it('captures Vue errors, delegates and restores the previous handler', async () => {
    /** 保存最终发送事件，避免单元测试依赖外部 Collector。 */
    const sent: TelemetryEvent[] = [];
    /** 内存 Transport 记录 shutdown 刷新的事件。 */
    const transport: Transport = { send: async (events) => { sent.push(...events); } };
    /** 原始 Vue 错误处理器 spy 用于验证应用行为保持不变。 */
    const previous = vi.fn();
    /** 最小 Vue App 替身只实现插件访问的 config 边界。 */
    const app = { config: { errorHandler: previous } } as unknown as App;
    /** 公开组件实例替身提供允许采集的组件定义名称。 */
    const instance = { $options: { name: 'CheckoutView' } } as unknown as ComponentPublicInstance;
    /** 真实内核客户端验证插件与队列和 shutdown 生命周期协同。 */
    const client = new TelemetryClient({ projectId: 'vue-test', transport });
    /** 被测插件绑定到同一个客户端并参与 teardown。 */
    const plugin = new VuePlugin(client);
    client.use(plugin);
    await client.start();
    plugin.install(app);
    /** SDK 安装后由 Vue 调用的包装错误处理器。 */
    const installed = app.config.errorHandler;
    installed?.(new Error('render failed'), instance, 'render function');
    await client.shutdown();
    expect(previous).toHaveBeenCalledOnce();
    expect(app.config.errorHandler).toBe(previous);
    expect(sent[0]).toMatchObject({
      name: 'vue.exception',
      level: 'error',
      payload: {
        name: 'Error',
        message: 'render failed',
        component: 'CheckoutView',
        info: 'render function',
      },
    });
  });

  /** 确保重复安装幂等，并且 shutdown 不覆盖应用后续设置的新处理器。 */
  it('is idempotent and preserves handlers installed later by the app', async () => {
    /** 空 Transport 让生命周期测试无需产生网络副作用。 */
    const transport: Transport = { send: async () => undefined };
    /** 最小 Vue App 替身从空错误处理器状态开始。 */
    const app = { config: {} } as unknown as App;
    /** 客户端仅用于驱动插件 teardown 生命周期。 */
    const client = new TelemetryClient({ projectId: 'vue-test', transport });
    /** 被测 Vue 插件。 */
    const plugin = new VuePlugin(client);
    client.use(plugin);
    await client.start();
    plugin.install(app);
    /** 首次安装的处理器用于确认第二次安装没有再包装。 */
    const firstHandler = app.config.errorHandler;
    plugin.install(app);
    expect(app.config.errorHandler).toBe(firstHandler);
    /** 模拟应用在 SDK 之后主动替换错误处理器。 */
    const laterHandler = vi.fn();
    app.config.errorHandler = laterHandler;
    await client.shutdown();
    expect(app.config.errorHandler).toBe(laterHandler);
  });
});
