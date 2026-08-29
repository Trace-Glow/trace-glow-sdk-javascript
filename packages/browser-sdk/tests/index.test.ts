import { afterEach, describe, expect, it } from 'vitest';
import { TraceGlow } from '../src/index';

/** 每个公开入口测试后恢复的原始 Fetch 实现。 */
const ORIGINAL_FETCH = globalThis.fetch;

/** 恢复全局状态，防止一个包测试影响其他测试模块。 */
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

/** 验证公开浏览器包专门暴露的行为。 */
describe('@trace-glow-sdk/browser', () => {
  /** 确保事件信封标识公开包而不是私有内核。 */
  it('reports the public browser package identity', async () => {
    /** 由注入的全局 Fetch 替代实现捕获的 Collector 信封。 */
    let envelope: { events: Array<{ sdk: { name: string } }> } | undefined;
    /** Fetch 替代实现记录未压缩的小请求 Body 并确认投递。 */
    globalThis.fetch = async (_input, init) => {
      envelope = JSON.parse(String(init?.body)) as typeof envelope;
      return new Response(null, { status: 202 });
    };
    /** 公开 SDK 禁用浏览器埋点，以隔离构造函数组装行为。 */
    const telemetry = new TraceGlow({
      endpoint: 'https://collector.example/v1/events',
      apiKey: 'write-key',
      projectId: 'browser-test',
      instrumentation: { errors: false, resources: false, performance: false, fetch: false, xhr: false },
    });
    await telemetry.ready;
    telemetry.logger.info('identity');
    await telemetry.client.shutdown();
    expect(envelope?.events[0]?.sdk.name).toBe('@trace-glow-sdk/browser');
  });
});
