import { describe, expect, it } from 'vitest';
import { HttpTransport } from '../src/index';

/** 验证 HTTP 鉴权、响应处理和 gzip 编码。 */
describe('HttpTransport', () => {
  /** 确保成功发送使用预期地址、Header 和信封。 */
  it('sends the authentication header and event envelope', async () => {
    /** 保留最后一次 Fetch 调用，用于请求结构断言。 */
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    /** Fetch 替代实现捕获输入并返回已确认响应。 */
    const fetchMock: typeof fetch = async (input, init) => {
      request = { input, ...(init ? { init } : {}) };
      return new Response(null, { status: 202 });
    };
    /** 被测 Transport 使用注入的 Fetch，避免访问网络。 */
    const transport = new HttpTransport({
      endpoint: 'https://collector.example/v1/events',
      apiKey: 'write-key',
      fetch: fetchMock,
    });
    await transport.send([]);
    expect(request?.input).toBe('https://collector.example/v1/events');
    expect(request?.init?.headers).toMatchObject({ 'x-trace-glow-key': 'write-key' });
    expect(JSON.parse(String(request?.init?.body))).toMatchObject({ events: [] });
  });

  /** 确保 HTTP 失败会 reject，以便内核应用重试策略。 */
  it('rejects non-success collector responses', async () => {
    /** Transport 从注入的 Fetch 接收确定性的不可用响应。 */
    const transport = new HttpTransport({
      endpoint: 'https://collector.example/v1/events',
      apiKey: 'write-key',
      fetch: async () => new Response(null, { status: 503 }),
    });
    await expect(transport.send([])).rejects.toThrow('503');
  });

  /** 确保显式 gzip 生成二进制数据和匹配的请求 Header。 */
  it('gzip compresses payloads when requested', async () => {
    /** 捕获的 RequestInit 暴露编码后的 Body 和 Header。 */
    let init: RequestInit | undefined;
    /** 启用显式 gzip 的被测 Transport。 */
    const transport = new HttpTransport({
      endpoint: 'https://collector.example/v1/events',
      apiKey: 'write-key',
      compression: 'gzip',
      fetch: async (_input, requestInit) => {
        init = requestInit;
        return new Response(null, { status: 202 });
      },
    });
    await transport.send([]);
    expect(init?.headers).toMatchObject({ 'content-encoding': 'gzip' });
    expect(init?.body).toBeInstanceOf(Uint8Array);
  });
});
