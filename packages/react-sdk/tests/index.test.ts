import { gunzipSync } from 'node:zlib';
import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TraceGlow,
  TraceGlowErrorBoundary,
  TraceGlowProvider,
  useTraceGlow,
} from '../src/index';

/** 每个公开入口测试后恢复的原始 Fetch 实现。 */
const ORIGINAL_FETCH = globalThis.fetch;

/** React act 在非 DOM 测试运行时使用的显式环境标志。 */
const REACT_ACT_ENVIRONMENT_KEY = 'IS_REACT_ACT_ENVIRONMENT';

/**
 * 将 Collector 请求 Body 还原为 JSON 文本，覆盖 Transport 的自动 gzip 路径。
 * @param init - Fetch 替代实现接收的请求初始化参数。
 * @returns 未压缩 JSON 文本；缺少 Body 时返回空字符串。
 */
function readCollectorBody(init: RequestInit | undefined): string {
  /** Transport 生成的字符串或压缩字节请求体。 */
  const body = init?.body;
  /** 测试只需读取 Transport 生成的普通对象 Header。 */
  const headers = init?.headers as Record<string, string> | undefined;
  if (headers?.['content-encoding'] === 'gzip' && body instanceof Uint8Array) {
    return gunzipSync(body).toString('utf8');
  }
  return body ? String(body) : '';
}

/** 恢复全局状态和函数替代实现，防止 React 包测试污染其他模块。 */
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete (globalThis as Record<string, unknown>)[REACT_ACT_ENVIRONMENT_KEY];
  vi.restoreAllMocks();
});

/**
 * 创建禁用自动浏览器埋点的 React SDK，隔离公开组装行为。
 * @returns 已自动启动且使用测试 Collector 配置的 React SDK。
 */
function createTelemetry(): TraceGlow {
  return new TraceGlow({
    endpoint: 'https://collector.example/v1/events',
    apiKey: 'write-key',
    projectId: 'react-test',
    instrumentation: { errors: false, resources: false, performance: false, fetch: false, xhr: false },
  });
}

/** 验证 React 公开入口、Context 和错误边界行为。 */
describe('@trace-glow/react', () => {
  /** 确保事件信封标识 React 公开包而不是浏览器或私有内核。 */
  it('reports the public React package identity', async () => {
    /** 由注入的全局 Fetch 替代实现捕获的 Collector 信封。 */
    let envelope: { events: Array<{ sdk: { name: string } }> } | undefined;
    /** Fetch 替代实现记录未压缩的小请求 Body 并确认投递。 */
    globalThis.fetch = async (_input, init) => {
      envelope = JSON.parse(readCollectorBody(init)) as typeof envelope;
      return new Response(null, { status: 202 });
    };
    /** 被测 React SDK 实例。 */
    const telemetry = createTelemetry();
    await telemetry.ready;
    telemetry.logger.info('identity');
    await telemetry.client.shutdown();
    expect(envelope?.events[0]?.sdk.name).toBe('@trace-glow/react');
  });

  /** 确保 Hook 从 Provider 读取同一个应用级实例。 */
  it('provides the TraceGlow instance through React context', async () => {
    /** 启用 React act 环境，避免测试渲染产生无关警告。 */
    (globalThis as Record<string, unknown>)[REACT_ACT_ENVIRONMENT_KEY] = true;
    /** 被 Provider 共享的遥测实例。 */
    const telemetry = createTelemetry();
    /** Probe 组件观察到的 Context 实例。 */
    let observed: TraceGlow | undefined;
    /**
     * 读取 Hook 并将结果暴露给测试断言。
     * @returns 不产生可见输出的空 React 节点。
     */
    function Probe(): ReactNode {
      observed = useTraceGlow();
      return null;
    }
    /** React 测试渲染器句柄用于显式卸载子树。 */
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(createElement(
        TraceGlowProvider,
        { telemetry },
        createElement(Probe),
      ));
    });
    expect(observed).toBe(telemetry);
    await act(async () => renderer?.unmount());
    await telemetry.client.shutdown();
  });

  /** 确保错误边界显示 fallback，并上传经过约束的组件错误字段。 */
  it('captures React component errors and renders the fallback', async () => {
    /** 启用 React act 环境，确保错误边界更新在断言前提交。 */
    (globalThis as Record<string, unknown>)[REACT_ACT_ENVIRONMENT_KEY] = true;
    /** 捕获组件错误事件的 Collector 信封。 */
    let envelope: { events: Array<{ name: string; payload: Record<string, unknown> }> } | undefined;
    /** Fetch 替代实现记录最终事件并返回成功确认。 */
    globalThis.fetch = async (_input, init) => {
      envelope = JSON.parse(readCollectorBody(init)) as typeof envelope;
      return new Response(null, { status: 202 });
    };
    /** React 在开发模式输出组件错误的控制台替代实现。 */
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    /** 接收错误边界采集事件的 SDK 实例。 */
    const telemetry = createTelemetry();
    /**
     * 始终抛错以触发 ErrorBoundary。
     * @throws 每次渲染都抛出确定性测试错误。
     */
    function BrokenComponent(): ReactNode {
      throw new Error('render failed');
    }
    /** 渲染错误恢复 UI 的 React 测试实例。 */
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(createElement(
        TraceGlowErrorBoundary,
        { telemetry, fallback: createElement('span', null, 'fallback') },
        createElement(BrokenComponent),
      ));
    });
    await telemetry.client.shutdown();
    expect(renderer?.toJSON()).toEqual({ type: 'span', props: {}, children: ['fallback'] });
    expect(envelope?.events[0]?.name).toBe('react.component_error');
    expect(envelope?.events[0]?.payload.message).toBe('render failed');
    expect(envelope?.events[0]?.payload.componentStack).toContain('BrokenComponent');
  });

  /** 确保动态 fallback 可以清除错误状态并重新渲染子树。 */
  it('resets a dynamic error boundary through fallbackRender', async () => {
    /** 启用 React act 环境，确保恢复更新在断言前提交。 */
    (globalThis as Record<string, unknown>)[REACT_ACT_ENVIRONMENT_KEY] = true;
    /** Collector 替代实现确认错误事件，避免测试访问网络。 */
    globalThis.fetch = async () => new Response(null, { status: 202 });
    /** React 开发错误日志替代实现避免测试输出噪声。 */
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    /** 接收可恢复组件错误的 SDK 实例。 */
    const telemetry = createTelemetry();
    /** 控制测试组件在首次渲染时抛错、恢复后成功。 */
    let shouldThrow = true;
    /** 从 fallbackRender 暴露给测试的恢复函数。 */
    let resetBoundary: (() => void) | undefined;
    /** 恢复回调在边界重试前切换组件行为。 */
    const onReset = vi.fn(() => { shouldThrow = false; });
    /**
     * 首次失败、重置后返回稳定内容。
     * @returns 恢复后的稳定 React 元素。
     * @throws 恢复标志设置前抛出确定性测试错误。
     */
    function RecoverableComponent(): ReactNode {
      if (shouldThrow) throw new Error('recoverable failure');
      return createElement('span', null, 'recovered');
    }
    /**
     * 保存恢复函数并展示错误消息。
     * @param props - 当前错误与边界恢复操作。
     * @returns 展示错误消息的 fallback 元素。
     */
    function renderFallback({
      error,
      resetErrorBoundary,
    }: {
      error: Error;
      resetErrorBoundary: () => void;
    }): ReactNode {
      resetBoundary = resetErrorBoundary;
      return createElement('span', null, error.message);
    }
    /** 保存错误和恢复界面的 React 测试渲染器。 */
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(createElement(
        TraceGlowErrorBoundary,
        { telemetry, fallbackRender: renderFallback, onReset },
        createElement(RecoverableComponent),
      ));
    });
    expect(renderer?.toJSON()).toEqual({
      type: 'span',
      props: {},
      children: ['recoverable failure'],
    });
    await act(async () => resetBoundary?.());
    expect(renderer?.toJSON()).toEqual({ type: 'span', props: {}, children: ['recovered'] });
    expect(onReset).toHaveBeenCalledOnce();
    await telemetry.client.shutdown();
  });
});
