import type { RetryConfig } from './types';

/**
 * 延迟后 resolve，且不阻塞 JavaScript 事件循环。
 * @param delayMs - 重试策略选定的非负延迟。
 */
const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

/**
 * 使用带上限和抖动的指数退避执行异步操作。
 *
 * 抖动可防止大量 SDK 实例在 Collector 恢复后同时重试。
 * 最终错误会重新抛出，供内核恢复队列。
 *
 * @param operation - 成功时 resolve、失败时 reject 的投递操作。
 * @param config - 已完整归一化的尝试次数与延迟限制。
 */
export async function withRetry(
  operation: () => Promise<void>,
  config: Required<RetryConfig>,
): Promise<void> {
  /** 保留最近一次 reject，使调用方收到原始失败。 */
  let lastError: unknown;
  /** 用于计算指数延迟、从零开始的尝试索引。 */
  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= config.attempts) break;
      /** 限制指数延迟上限，确保关闭与恢复耗时有界。 */
      const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt);
      await sleep(Math.round(exponential * (0.75 + Math.random() * 0.5)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
