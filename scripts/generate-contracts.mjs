import { mkdir, writeFile } from 'node:fs/promises';
import { compileContracts, outputPath } from './contracts-codegen.mjs';

/**
 * 从受检入 Schema 快照重建 core 使用的协议类型。
 * @returns 写入完成后 resolve；生成或文件操作失败时 reject。
 */
async function generate() {
  /** 生成源码完全由 Schema 决定，不接受手工类型覆盖。 */
  const source = await compileContracts();
  await mkdir('packages/core/src/generated', { recursive: true });
  await writeFile(outputPath, source, 'utf8');
}

await generate();

