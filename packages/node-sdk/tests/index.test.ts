import { afterEach, describe, expect, it } from 'vitest';
import { TraceGlow } from '../src/index';

/** 每个公开入口测试后恢复的原始 Fetch 实现。 */
const ORIGINAL_FETCH = globalThis.fetch;

/** 恢复全局状态，防止包测试泄漏 Transport 替代实现。 */
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

/** 验证公开 Node.js 包专门暴露的行为。 */
describe('@trace-glow/node', () => {
  /** 确保事件信封标识公开包而不是私有内核。 */
  it('reports the public Node.js package identity', async () => {
    /** 由注入的全局 Fetch 替代实现捕获的 Collector 信封。 */
    let envelope: { events: Array<{ sdk: { name: string } }> } | undefined;
    /** Fetch 替代实现记录未压缩的小请求 Body 并确认投递。 */
    globalThis.fetch = async (_input, init) => {
      envelope = JSON.parse(String(init?.body)) as typeof envelope;
      return new Response(null, { status: 202 });
    };
    /** 公开 SDK 禁用进程监听器和运行时计时器，以隔离组装行为。 */
    const telemetry = new TraceGlow({
      endpoint: 'https://collector.example/v1/events',
      apiKey: 'write-key',
      projectId: 'node-test',
      instrumentation: { processErrors: false, runtimeMetrics: false },
    });
    await telemetry.ready;
    telemetry.logger.info('identity');
    await telemetry.client.shutdown();
    expect(envelope?.events[0]?.sdk.name).toBe('@trace-glow/node');
  });
});
