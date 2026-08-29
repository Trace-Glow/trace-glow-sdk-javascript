/**
 * 具有严格容量限制的内存 FIFO 队列。
 *
 * 队列通过丢弃旧数据而不是持续扩容，确保 Collector 故障期间
 * 可观测 SDK 永远不会耗尽宿主应用的内存。
 */
export class BoundedQueue<T> {
  /** 将可变存储保持为私有，确保所有写入都遵守配置上限。 */
  private readonly items: T[] = [];

  /** 创建队列，并拒绝可能导致排空循环不安全的容量。 */
  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Queue capacity must be a positive integer');
  }

  /** 返回当前保留项数量，但不暴露底层存储。 */
  get size(): number {
    return this.items.length;
  }

  /**
   * 追加一项，并在达到容量时返回被丢弃的最旧项。
   * 返回该项可让调用方直接统计损失，无需额外 Hook。
   */
  push(item: T): T | undefined {
    /** 仅在新增项将超过严格容量时移除最旧项。 */
    const dropped = this.items.length >= this.capacity ? this.items.shift() : undefined;
    this.items.push(item);
    return dropped;
  }

  /**
   * 将失败项恢复到队首，并返回从队尾丢弃的数量；
   * 这样既保留重试顺序，又能严格限制内存。
   */
  prepend(items: readonly T[]): number {
    if (items.length === 0) return 0;
    this.items.unshift(...items);
    /** 恢复后无法继续容纳的最新队列项数量。 */
    const overflow = Math.max(0, this.items.length - this.capacity);
    if (overflow > 0) this.items.splice(this.capacity, overflow);
    return overflow;
  }

  /** 移除并返回不超过指定数量的最旧项。 */
  drain(limit: number): T[] {
    return this.items.splice(0, limit);
  }
}
