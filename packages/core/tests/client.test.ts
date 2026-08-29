import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryClient } from '../src/client';
import type { TelemetryEvent, Transport } from '../src/types';

/** 每个测试后恢复控制台和函数替代实现，避免调试输出断言污染其他测试。 */
afterEach(() => {
  vi.restoreAllMocks();
});

/** 验证批处理、生命周期顺序和有界 payload 行为。 */
describe('TelemetryClient', () => {
  /** 确保处理器在达到阈值触发批次投递前运行。 */
  it('processes, batches and sends events', async () => {
    /** 捕获 Transport 批次，以便在不依赖网络的情况下断言。 */
    const batches: readonly TelemetryEvent[][] = [];
    /** 模拟 Transport 记录不可变副本，避免后续修改影响断言。 */
    const transport: Transport = {
      send: vi.fn(async (events) => { (batches as TelemetryEvent[][]).push([...events]); }),
    };
    /** 两个事件的批次大小可在测试中确定性触发投递。 */
    const client = new TelemetryClient({ projectId: 'test', transport, batchSize: 2 });
    client.addEventProcessor((event) => ({ ...event, payload: { ...event.payload, processed: true } }));
    client.capture({ type: 'log', name: 'one' });
    client.capture({ type: 'log', name: 'two' });
    await vi.waitFor(() => expect(transport.send).toHaveBeenCalledOnce());
    expect(batches[0]?.[0]?.payload.processed).toBe(true);
  });

  /** 确保 shutdown 等待异步处理器并排空多个批次。 */
  it('waits for processors and drains every batch during shutdown', async () => {
    /** 扁平发送记录保留多个批次之间的投递顺序。 */
    const sent: TelemetryEvent[] = [];
    /** 同步模拟 Transport 追加每个已投递事件。 */
    const transport: Transport = {
      send: async (events) => { sent.push(...events); },
    };
    /** 客户端使用小批次，强制 shutdown 排空循环进行迭代。 */
    const client = new TelemetryClient({ projectId: 'test', transport, batchSize: 2 });
    client.addEventProcessor(async (event) => {
      await Promise.resolve();
      return event;
    });
    client.capture({ type: 'log', name: 'one' });
    client.capture({ type: 'log', name: 'two' });
    client.capture({ type: 'log', name: 'three' });
    await client.shutdown();
    expect(sent.map((event) => event.name)).toEqual(['one', 'two', 'three']);
  });

  /** 确保字节大小限制在 Transport 投递前生效。 */
  it('drops oversized events before they enter the queue', async () => {
    /** 大小校验生效时不应调用 Transport spy。 */
    const transport: Transport = { send: vi.fn(async () => undefined) };
    /** 丢弃 spy 同时验证数量和稳定的诊断原因。 */
    const onDrop = vi.fn();
    /** 刻意使用较小字节上限，使超大事件场景保持确定性。 */
    const client = new TelemetryClient({
      projectId: 'test',
      transport,
      maxEventSizeBytes: 256,
      onDrop,
    });
    client.capture({ type: 'log', name: 'large', payload: { value: 'x'.repeat(500) } });
    await client.shutdown();
    expect(onDrop).toHaveBeenCalledWith(1, 'oversized');
    expect(transport.send).not.toHaveBeenCalled();
  });

  /** 确保 debug 打印处理后的最终事件，同时保留正常 Transport 投递。 */
  it('prints processed events in debug mode without replacing delivery', async () => {
    /** 记录最终投递事件，用于比较调试输出与 Collector 输入。 */
    const sent: TelemetryEvent[] = [];
    /** 内存 Transport 保留实际发送行为，同时避免测试访问网络。 */
    const transport: Transport = {
      send: async (events) => { sent.push(...events); },
    };
    /** 控制台替代实现捕获结构化调试参数，避免测试运行时产生噪声。 */
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    /** 启用本地事件打印的客户端仍使用正常发送队列。 */
    const client = new TelemetryClient({
      projectId: 'test',
      transport,
      debug: { printEvents: true },
    });
    client.addEventProcessor((event) => ({
      ...event,
      context: { tags: { region: 'cn-east' } },
    }));
    client.capture({ type: 'log', name: 'debug-event' });
    await client.shutdown();
    expect(debug).toHaveBeenCalledWith('[TraceGlow] event', sent[0]);
    expect(sent[0]?.context?.tags?.region).toBe('cn-east');
  });

  /** 确保默认配置不会产生本地事件输出。 */
  it('keeps local event printing disabled by default', async () => {
    /** 空 Transport 使默认行为测试只关注本地控制台输出。 */
    const transport: Transport = { send: async () => undefined };
    /** 控制台 spy 用于确认未显式开启 debug 时没有调用。 */
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    /** 未提供 debug 配置的默认客户端。 */
    const client = new TelemetryClient({ projectId: 'test', transport });
    client.capture({ type: 'log', name: 'quiet-event' });
    await client.shutdown();
    expect(debug).not.toHaveBeenCalled();
  });

  /** 确保控制台实现异常被隔离，并且不会阻止事件发送。 */
  it('isolates debug console failures from delivery', async () => {
    /** Transport spy 用于验证本地调试失败后事件仍完成发送。 */
    const transport: Transport = { send: vi.fn(async () => undefined) };
    /** 内部错误 spy 接收被归一化后的控制台异常。 */
    const onInternalError = vi.fn();
    /** 模拟不可信宿主环境中的控制台实现抛出异常。 */
    vi.spyOn(console, 'debug').mockImplementation(() => {
      throw new Error('console unavailable');
    });
    /** 启用调试输出并接收隔离诊断的客户端。 */
    const client = new TelemetryClient({
      projectId: 'test',
      transport,
      debug: { printEvents: true },
      onInternalError,
    });
    client.capture({ type: 'log', name: 'debug-console-failure' });
    await client.shutdown();
    expect(onInternalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'console unavailable' }));
    expect(transport.send).toHaveBeenCalledOnce();
  });
});
