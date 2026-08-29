import { describe, expect, it } from 'vitest';
import type { EventInput, TelemetryClientApi } from '@trace-glow/core';
import { Logger } from '../src/index';

/** 验证严重级别过滤和不可变子字段继承。 */
describe('Logger', () => {
  /** 确保禁用记录被忽略，并保留范围更小的子字段。 */
  it('filters levels and merges child fields', () => {
    /** 捕获的输入可呈现内核归一化前的 Logger 输出。 */
    const inputs: EventInput[] = [];
    /** 最小客户端 Stub 将 Logger 行为与队列和 Transport 行为隔离。 */
    const client: TelemetryClientApi = {
      capture: (input) => { inputs.push(input); },
      addEventProcessor: () => () => undefined,
      flush: async () => undefined,
    };
    /** Logger 阈值隐藏 debug，固定字段用于模拟服务元数据。 */
    const logger = new Logger(client, { minimumLevel: 'info', fields: { service: 'api' } });
    logger.debug('hidden');
    logger.child({ component: 'checkout' }).error('failed', { attempt: 2 });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.payload).toEqual({
      message: 'failed',
      service: 'api',
      component: 'checkout',
      attempt: 2,
    });
  });
});
