import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { TelemetryClient } from '../src/client';
import type { TelemetryEvent, Transport } from '../src/types';

/** SDK 快照中权威 Schema 的稳定 `$id`。 */
const CONTRACT_SCHEMA_ID = 'https://schemas.trace-glow.dev/v1/contracts.schema.json';
/** 相对于本测试模块解析的 SDK 协议快照地址。 */
const CONTRACT_SCHEMA_URL = new URL('../../../contracts/v1/contracts.schema.json', import.meta.url);

/** 验证 SDK 运行时事件与跨仓库 JSON Schema 保持一致。 */
describe('Trace Glow contract snapshot', () => {
  /** SDK 生成的完整事件必须通过共享 TelemetryEvent v1 定义。 */
  it('accepts events produced by TelemetryClient', async () => {
    /** 内存 Transport 保存完成处理后的真实事件，不模拟事件构造。 */
    const sent: TelemetryEvent[] = [];
    /** 测试 Transport 保留事件顺序并避免网络请求。 */
    const transport: Transport = {
      send: async (events) => { sent.push(...events); },
    };
    /** 覆盖可选协议字段的客户端用于发现 Schema 收窄或运行时漂移。 */
    const client = new TelemetryClient({
      projectId: 'project-123',
      environment: 'test',
      release: 'sdk@0.1.0',
      transport,
    });
    client.capture({
      type: 'monitor',
      name: 'contract.test',
      context: {
        requestId: 'request-123',
        user: { id: 'user-123' },
        tags: { region: 'cn' },
        extras: { enabled: true },
      },
      payload: { durationMs: 12.5, nested: { valid: true } },
    });
    await client.shutdown();

    /** AJV 2020 实例使用严格模式校验 Schema 本身及事件实例。 */
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    /** 读取后解析的 Schema 作为完整文档注册，以支持 `$defs` 内部引用。 */
    const schema = JSON.parse(await readFile(CONTRACT_SCHEMA_URL, 'utf8'));
    ajv.addSchema(schema);
    /** 通过完整 URI 获取事件定义，确保 `$id` 也保持稳定。 */
    const validate = ajv.getSchema(`${CONTRACT_SCHEMA_ID}#/$defs/TelemetryEvent`);
    expect(validate).toBeDefined();
    expect(validate?.(sent[0]), JSON.stringify(validate?.errors)).toBe(true);
  });
});
