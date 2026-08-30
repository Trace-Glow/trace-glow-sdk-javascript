import { compileFromFile } from 'json-schema-to-typescript';

/** SDK 内受检入协议 Schema 快照。 */
export const schemaPath = 'contracts/v1/contracts.schema.json';
/** core 包内由 Schema 生成的传输协议类型。 */
export const outputPath = 'packages/core/src/generated/contracts.ts';
/** 与 contracts 仓库一致的生成文件声明。 */
const bannerComment = `/**
 * 此文件由 json-schema-to-typescript 从 ${schemaPath} 生成。
 * 请勿手工编辑；使用 pnpm contracts:sync 更新协议快照。
 */`;

/**
 * 从 SDK 协议快照编译确定性的 TypeScript 源码。
 * @returns 生成完成的 TypeScript 源码；Schema 无效时 reject。
 */
export async function compileContracts() {
  return compileFromFile(schemaPath, {
    bannerComment,
    cwd: process.cwd(),
    format: true,
    strictIndexSignatures: false,
    unreachableDefinitions: true,
  });
}
