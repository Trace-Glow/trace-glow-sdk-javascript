import { afterEach, describe, expect, it } from 'vitest';
import type { App, ComponentPublicInstance, Plugin } from 'vue';
import { TraceGlow } from '../src/index';

/** 每个公开入口测试后恢复的原始 Fetch 实现。 */
const ORIGINAL_FETCH = globalThis.fetch;

/** 恢复全局状态，防止公开 Vue 包测试影响其他测试模块。 */
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

/** 验证公开 Vue SDK 的统一构造函数和 Vue Plugin 协议。 */
describe('@trace-glow/vue', () => {
  /** 确保 app.use 兼容入口采集 Vue 错误并标识公开 Vue 包。 */
  it('installs as a Vue plugin and reports the public package identity', async () => {
    /** 由全局 Fetch 替代实现捕获的 Collector 信封。 */
    let envelope: { events: Array<{ name: string; sdk: { name: string } }> } | undefined;
    /** Fetch 替代实现记录未压缩请求 Body 并确认投递。 */
    globalThis.fetch = async (_input, init) => {
      envelope = JSON.parse(String(init?.body)) as typeof envelope;
      return new Response(null, { status: 202 });
    };
    /** 公开 Vue SDK 禁用浏览器埋点，以隔离 Vue 组装行为。 */
    const telemetry = new TraceGlow({
      endpoint: 'https://collector.example/v1/events',
      apiKey: 'write-key',
      projectId: 'vue-sdk-test',
      instrumentation: { errors: false, resources: false, performance: false, fetch: false, xhr: false },
    });
    /** 编译期赋值确保 TraceGlow 满足 Vue 的 Plugin 结构协议。 */
    const vuePlugin: Plugin = telemetry;
    /** 最小 Vue App 替身提供 install 所需的错误处理配置。 */
    const app = { config: {} } as unknown as App;
    /** 组件替身验证公开入口能够传递 Vue 组件名称。 */
    const instance = { $options: { name: 'RootView' } } as unknown as ComponentPublicInstance;
    vuePlugin.install?.(app);
    await telemetry.ready;
    app.config.errorHandler?.(new Error('setup failed'), instance, 'setup function');
    await telemetry.client.shutdown();
    expect(envelope?.events[0]).toMatchObject({
      name: 'vue.exception',
      sdk: { name: '@trace-glow/vue' },
    });
  });
});
