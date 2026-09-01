import { describe, expect, it } from 'vitest';
import { formatTraceparent, parseTraceparent } from '../src/trace-context';

/** 验证 W3C Trace Context 的严格解析与稳定格式化。 */
describe('W3C trace context', () => {
  /** 合法 Header 应保留 ID 和 sampled 决策。 */
  it('parses and formats a sampled traceparent', () => {
    /** 固定 Header 便于验证大小写归一化和 flags。 */
    const header = '00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01';
    /** 解析结果供格式化器往返使用。 */
    const context = parseTraceparent(header);
    expect(context).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
    expect(formatTraceparent(context!)).toBe(header.toLowerCase());
  });

  /** 全零标识和结构不完整 Header 必须被拒绝。 */
  it('rejects invalid and all-zero identifiers', () => {
    expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeUndefined();
    expect(parseTraceparent('invalid')).toBeUndefined();
  });
});
