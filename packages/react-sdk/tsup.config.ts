import { defineConfig } from 'tsup';

/** 必须嵌入 React 公开包的浏览器运行时与共享私有模块。 */
const INTERNAL_MODULES = [
  '@trace-glow/browser',
  '@trace-glow/context',
  '@trace-glow/core',
  '@trace-glow/logger',
  '@trace-glow/transport',
];

/**
 * 构建自包含的 React SDK，同时将 React 保留为消费项目提供的 peer dependency。
 * 该边界可避免 Bundle 内出现第二个 React 实例，从而防止 Context 和 Hook 失效。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: INTERNAL_MODULES },
  sourcemap: true,
  clean: true,
  noExternal: INTERNAL_MODULES,
  external: ['react', 'react/jsx-runtime'],
  target: 'es2022',
});
