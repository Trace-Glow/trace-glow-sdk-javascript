import { defineConfig } from 'tsup';

/**
 * 列出必须嵌入公开 Vue 产物的全部私有工作区模块。
 * Vue 自身保持 external peer dependency，防止 SDK 打包第二份框架运行时。
 */
const INTERNAL_MODULES = [
  '@trace-glow/browser',
  '@trace-glow/context',
  '@trace-glow/core',
  '@trace-glow/logger',
  '@trace-glow/transport',
  '@trace-glow/vue',
];

/**
 * 将 JavaScript 和声明文件构建为自包含公开 Vue SDK。
 * 私有模块会内联，而 Vue 类型继续由消费项目的 peer dependency 提供。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: INTERNAL_MODULES },
  sourcemap: true,
  clean: true,
  noExternal: INTERNAL_MODULES,
  external: ['vue'],
  target: 'es2022',
});
