import { describe, expect, it } from 'vitest';
import { TelemetryClient, type TelemetryEvent, type Transport } from '@trace-glow-internal/core';
import { ContextManager } from '../src/index';

/** 验证共享遥测上下文与事件级上下文之间的优先级。 */
describe('ContextManager', () => {
  /** 确保局部值覆盖对应全局值，同时不丢失其他全局值。 */
  it('merges global context while preserving event-local values', async () => {
    /** 保留已投递事件，供 shutdown 后进行上下文断言。 */
    const sent: TelemetryEvent[] = [];
    /** 内存 Transport 使该单元测试不依赖外部 Collector 行为。 */
    const transport: Transport = { send: async (events) => { sent.push(...events); } };
    /** 共享上下文管理器接收进程级身份和标签。 */
    const context = new ContextManager();
    context.setUser({ id: 'global-user' });
    context.setTag('region', 'cn');
    /** 内核客户端运行真实处理器和 shutdown 流程。 */
    const client = new TelemetryClient({ projectId: 'test', transport });
    client.use(context);
    await client.start();
    client.capture({
      type: 'monitor',
      name: 'request',
      context: { requestId: 'req-1', tags: { region: 'local' } },
    });
    await client.shutdown();
    expect(sent[0]?.context).toMatchObject({
      requestId: 'req-1',
      user: { id: 'global-user' },
      tags: { region: 'local' },
    });
  });
});
