import { defineConfig } from 'tsup';

/**
 * 列出必须嵌入公开浏览器产物的全部私有工作区模块。
 * Bundle 可防止 npm 消费者解析有意不发布的私有实现包。
 */
const INTERNAL_MODULES = [
  '@trace-glow-internal/browser',
  '@trace-glow-internal/context',
  '@trace-glow-internal/core',
  '@trace-glow-internal/logger',
  '@trace-glow-internal/transport',
];

/**
 * 将 JavaScript 和声明文件构建为自包含公开产物。
 * 声明解析规则与 JavaScript Bundle 规则一致，确保生成类型不暴露私有工作区包名。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: INTERNAL_MODULES },
  sourcemap: true,
  clean: true,
  noExternal: INTERNAL_MODULES,
  target: 'es2022',
});
