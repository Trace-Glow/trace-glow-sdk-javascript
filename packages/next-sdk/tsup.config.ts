import { defineConfig } from 'tsup';

/** 必须嵌入公开 Next 包的私有模块；框架运行时由消费项目提供。 */
const INTERNAL_MODULES = [
  '@trace-glow-internal/browser', '@trace-glow-internal/context', '@trace-glow-internal/core',
  '@trace-glow-internal/logger', '@trace-glow-internal/node', '@trace-glow-internal/transport',
];

/** 为客户端与服务端子路径生成自包含的 ESM、CommonJS 和声明文件。 */
export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: INTERNAL_MODULES },
  sourcemap: true,
  clean: true,
  noExternal: INTERNAL_MODULES,
  external: ['next', 'react', 'react/jsx-runtime'],
  target: 'es2022',
});
