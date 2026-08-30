import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { compileContracts, outputPath, schemaPath } from './contracts-codegen.mjs';

/** SDK 协议快照的来源与完整性记录。 */
const provenancePath = 'contracts/v1/provenance.json';

/**
 * 比较 Schema 哈希和生成源码，阻止手工编辑或未生成的协议变更进入构建。
 * @returns 两项检查均通过时无返回值；发现漂移或读取失败时 reject。
 */
async function check() {
  /** 原始 Schema 字节用于计算可复现 SHA-256，而不是重新序列化 JSON。 */
  const schema = await readFile(schemaPath);
  /** 来源记录由同步脚本维护，包含预期 Schema 内容哈希。 */
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  /** 实际哈希精确覆盖 SDK 编译和测试所读取的 Schema 快照。 */
  const actualHash = createHash('sha256').update(schema).digest('hex');
  if (provenance.sha256 !== actualHash) {
    throw new Error('Contract schema hash differs from contracts/v1/provenance.json');
  }
  /** 当前生成文件必须逐字节等于生成器针对同一 Schema 的输出。 */
  const actualSource = await readFile(outputPath, 'utf8');
  const expectedSource = await compileContracts();
  if (actualSource !== expectedSource) {
    throw new Error('Generated contract types are stale; run pnpm contracts:generate');
  }
}

await check();

