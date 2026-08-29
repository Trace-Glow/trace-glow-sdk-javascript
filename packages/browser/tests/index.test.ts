import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserPlugin } from '../src/index';
import type { EventInput, TelemetryClientApi } from '@trace-glow/core';

/** 测试期间替换的浏览器窗口对象，记录插件安装的事件监听器。 */
const ORIGINAL_WINDOW = globalThis.window;

/** 恢复浏览器全局对象和控制台 spy，避免测试之间互相污染。 */
afterEach(() => {
  globalThis.window = ORIGINAL_WINDOW;
  vi.restoreAllMocks();
});

/** 构造仅实现插件所需监听 API 的最小窗口替身。 */
function installWindowStub(): { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> } {
  /** 窗口替身记录 add/remove 调用，测试无需启动真实浏览器。 */
  const windowStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  globalThis.window = windowStub as unknown as Window & typeof globalThis;
  return windowStub;
}

/** 生成只记录采集输入的 TelemetryClientApi 替身。 */
function createClient(events: EventInput[]): TelemetryClientApi {
  return {
    capture: (event) => events.push(event),
    addEventProcessor: () => () => undefined,
    flush: async () => undefined,
  };
}

/** 验证浏览器错误插件的开关、控制台和 Breadcrumb 行为。 */
describe('BrowserPlugin error monitoring', () => {
  /** 确认未处理 rejection 开关关闭时不会安装对应全局监听器。 */
  it('does not install unhandled rejection listener when disabled', () => {
    /** 记录窗口事件监听安装情况。 */
    const windowStub = installWindowStub();
    /** 空事件列表隔离本测试对采集行为的关注。 */
    const events: EventInput[] = [];
    /** 关闭其他自动埋点，仅检查 rejection 开关。 */
    const plugin = new BrowserPlugin({
      errors: false,
      resources: false,
      unhandledRejections: false,
      console: false,
      performance: false,
      fetch: false,
      xhr: false,
    });
    plugin.setup(createClient(events));
    expect(windowStub.addEventListener).not.toHaveBeenCalledWith('unhandledrejection', expect.anything());
    plugin.teardown();
  });

  /** 确认 console.error 保留原始输出并附加此前 Breadcrumb。 */
  it('captures console errors and preserves the original output', () => {
    /** 使用真实窗口替身使插件进入浏览器安装路径。 */
    installWindowStub();
    /** 保存所有监控事件，便于断言错误事件结构。 */
    const events: EventInput[] = [];
    /** 替换原始控制台，验证包装器不会吞掉业务输出。 */
    const originalError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    /** 仅启用 Console 与 Breadcrumb，隔离其他埋点影响。 */
    const plugin = new BrowserPlugin({
      errors: false,
      resources: false,
      unhandledRejections: false,
      console: true,
      breadcrumbs: true,
      performance: false,
      fetch: false,
      xhr: false,
    });
    plugin.setup(createClient(events));
    console.error('checkout failed', { code: 'PAYMENT_FAILED' });
    plugin.teardown();
    expect(originalError).toHaveBeenCalledWith('checkout failed', { code: 'PAYMENT_FAILED' });
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('browser.console_error');
    /** 事件 payload 已由插件构造为结构化记录，此处仅转换测试读取类型。 */
    const payload = events[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.message).toContain('checkout failed');
    expect(payload?.breadcrumbs).toEqual([
      expect.objectContaining({ category: 'console', level: 'error' }),
    ]);
  });

  /** 确认 Breadcrumb 缓冲区遵守配置上限，避免高频日志造成内存增长。 */
  it('evicts the oldest breadcrumbs beyond the configured limit', () => {
    /** 安装窗口替身并准备事件记录器。 */
    installWindowStub();
    /** 保存 Console 监控事件用于检查最终 Breadcrumb 快照。 */
    const events: EventInput[] = [];
    /** 隔离原始控制台输出，避免测试日志污染。 */
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    /** 配置单条 Breadcrumb 上限，验证环形淘汰行为。 */
    const plugin = new BrowserPlugin({
      errors: false,
      resources: false,
      unhandledRejections: false,
      console: true,
      breadcrumbs: true,
      maxBreadcrumbs: 1,
      performance: false,
      fetch: false,
      xhr: false,
    });
    plugin.setup(createClient(events));
    console.warn('first');
    console.warn('second');
    plugin.teardown();
    /** 读取第二条 console 事件的 Breadcrumb 快照。 */
    const breadcrumbs = (events[1]?.payload as Record<string, unknown> | undefined)?.breadcrumbs as Array<{ message: string }> | undefined;
    expect(breadcrumbs?.[0]?.message).toContain('second');
  });
});
