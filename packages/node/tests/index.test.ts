import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { EventInput, Span, SpanOptions, TelemetryClientApi } from '@trace-glow-internal/core';
import { createHttpMiddleware } from '../src/index';

/** 验证 Node 入站 HTTP 自动 Span 和远程父上下文传播。 */
describe('Node HTTP trace propagation', () => {
  /** 合法 traceparent 应创建 server Span 并关联兼容 monitor 事件。 */
  it('continues an incoming W3C trace', () => {
    /** 保存 monitor 输入以验证 request/trace 关联。 */
    const events: EventInput[] = [];
    /** 保存 startSpan 参数以验证远程父级。 */
    const spanOptions: SpanOptions[] = [];
    /** 固定本地 Span 使断言与随机 ID 无关。 */
    const span: Span = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '1111111111111111',
      parentSpanId: '00f067aa0ba902b7',
      sampled: true,
      setAttribute: () => span,
      setStatus: () => span,
      end: vi.fn(),
    };
    /** 最小客户端替身覆盖中间件使用的全部 API。 */
    const client: TelemetryClientApi = {
      capture: (input) => events.push(input),
      addEventProcessor: () => () => undefined,
      flush: async () => undefined,
      startSpan: (_name, options = {}) => { spanOptions.push(options); return span; },
    };
    /** 请求替身包含远程 traceparent 和稳定方法/路径。 */
    const request = {
      method: 'GET',
      url: '/orders?token=secret',
      headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    } as unknown as IncomingMessage;
    /** EventEmitter 模拟响应 finish 生命周期。 */
    const response = new EventEmitter() as unknown as ServerResponse;
    response.statusCode = 200;
    response.setHeader = vi.fn() as unknown as ServerResponse['setHeader'];
    /** next spy 验证中间件继续宿主控制流。 */
    const next = vi.fn();
    createHttpMiddleware(client)(request, response, next);
    (response as unknown as EventEmitter).emit('finish');
    expect(spanOptions[0]?.parent).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
    expect(events[0]?.context).toMatchObject({ traceId: span.traceId });
    expect(events[0]?.payload?.url).toBe('/orders');
    expect(next).toHaveBeenCalledOnce();
    expect(span.end).toHaveBeenCalledOnce();
  });
});
