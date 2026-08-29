import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraceGlow, TraceGlowErrorBoundary, TraceGlowProvider, useTraceGlow } from '../src/index';
import { NextServerTraceGlow } from '../src/server';

/** 保存测试前的 Fetch，避免客户端 SDK 改写全局实现。 */
const ORIGINAL_FETCH = globalThis.fetch;

/** 每个测试后恢复全局 Fetch 和 mock。 */
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; vi.restoreAllMocks(); });

/** 创建关闭自动采集的客户端实例。 */
function createClient(): TraceGlow { return new TraceGlow({ endpoint: 'https://collector.example/v1/events', apiKey: 'write-key', projectId: 'next-test', instrumentation: { errors: false, resources: false, performance: false, fetch: false, xhr: false } }); }

/** 验证 Next 客户端和服务端入口的公开契约。 */
describe('@trace-glow/next', () => {
  /** 客户端入口保持 React 集成 API。 */
  it('exports the client React integration', () => { expect(TraceGlow).toBeTypeOf('function'); expect(TraceGlowProvider).toBeTypeOf('function'); expect(useTraceGlow).toBeTypeOf('function'); expect(TraceGlowErrorBoundary).toBeTypeOf('function'); });
  /** 客户端实例使用 Next 包身份并可以正常关闭。 */
  it('starts the client SDK', async () => { globalThis.fetch = async () => new Response(null, { status: 202 }); const telemetry = createClient(); await telemetry.ready; await telemetry.client.shutdown(); });
  /** 服务端入口提供请求中间件且可以正常关闭。 */
  it('creates the server SDK and middleware', async () => { globalThis.fetch = async () => new Response(null, { status: 202 }); const telemetry = new NextServerTraceGlow({ endpoint: 'https://collector.example/v1/events', apiKey: 'server-key', projectId: 'next-test', instrumentation: { runtimeMetrics: false } }); await telemetry.ready; expect(telemetry.middleware()).toBeTypeOf('function'); await telemetry.client.shutdown(); });
});
