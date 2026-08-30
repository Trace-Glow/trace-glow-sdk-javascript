import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compileContracts, outputPath, schemaPath } from './contracts-codegen.mjs';

/** contracts 仓库路径必须显式传入，并忽略 pnpm 透传的参数分隔符。 */
const contractsRoot = process.argv.slice(2).find((argument) => argument !== '--');
if (!contractsRoot) {
  throw new Error('Usage: pnpm contracts:sync -- /absolute/path/to/trace-glow-contracts');
}
/** 权威 v1 Schema 在 contracts 仓库中的固定相对位置。 */
const sourceSchemaPath = resolve(contractsRoot, 'schemas/v1/contracts.schema.json');
/** SDK 快照的来源和哈希记录。 */
const provenancePath = 'contracts/v1/provenance.json';

/**
 * 从 contracts 仓库同步 Schema、记录哈希并重建 core 协议类型。
 * @returns 所有文件更新完成后 resolve；来源缺失或生成失败时 reject。
 */
async function sync() {
  await mkdir('contracts/v1', { recursive: true });
  await mkdir('packages/core/src/generated', { recursive: true });
  await copyFile(sourceSchemaPath, schemaPath);
  /** 哈希基于同步后的字节，确保来源记录与 SDK 实际消费内容一致。 */
  const schema = await readFile(schemaPath);
  /** 来源 URL 稳定指向权威仓库，版本对应 Schema 的 `$id` 主版本。 */
  const provenance = {
    repository: 'https://github.com/Trace-Glow/trace-glow-contracts',
    schema: 'schemas/v1/contracts.schema.json',
    version: 1,
    sha256: createHash('sha256').update(schema).digest('hex'),
  };
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  /** 生成源码使用 SDK 自身锁定的工具版本，保证本地和 CI 可重复。 */
  const source = await compileContracts();
  await writeFile(outputPath, source, 'utf8');
}

await sync();
