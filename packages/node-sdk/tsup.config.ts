import { defineConfig } from 'tsup';

/** 嵌入公开 Node.js 包的私有工作区模块。 */
const INTERNAL_MODULES = [
  '@trace-glow-internal/context',
  '@trace-glow-internal/core',
  '@trace-glow-internal/logger',
  '@trace-glow-internal/node',
  '@trace-glow-internal/transport',
];

/**
 * 生成自包含的 JavaScript 和声明文件，同时将 Node 内置模块保持为外部依赖，
 * 使包使用消费方运行时提供的实现。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: INTERNAL_MODULES },
  sourcemap: true,
  clean: true,
  noExternal: INTERNAL_MODULES,
  target: 'node18',
  platform: 'node',
});
