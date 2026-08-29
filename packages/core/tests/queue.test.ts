import { describe, expect, it } from 'vitest';
import { BoundedQueue } from '../src/queue';

/** 验证严格容量行为以及失败批次的恢复顺序。 */
describe('BoundedQueue', () => {
  /** 确保队列达到容量后保留最新诊断数据。 */
  it('drops the oldest item when full', () => {
    /** 两项容量配合三次 push，可明确呈现溢出行为。 */
    const queue = new BoundedQueue<number>(2);
    queue.push(1);
    queue.push(2);
    expect(queue.push(3)).toBe(1);
    expect(queue.drain(10)).toEqual([2, 3]);
  });

  /** 确保重试恢复不会让内存增长超过配置上限。 */
  it('restores a failed batch without exceeding capacity', () => {
    /** 三项容量恰好可容纳恢复数据和已有队列数据。 */
    const queue = new BoundedQueue<number>(3);
    queue.push(3);
    expect(queue.prepend([1, 2])).toBe(0);
    expect(queue.drain(3)).toEqual([1, 2, 3]);
  });
});
