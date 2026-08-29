import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 将一个仓库相对源码入口解析为绝对文件路径。
 * @param relativePath - 相对于根配置模块的路径。
 */
const workspaceSource = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * 测试配置将测试模块保留在生产 `src` 目录之外。
 * 显式匹配模式可防止 npm 构建输入意外包含测试专属 import、mock 或全局变量。
 * 运行时别名与 TypeScript 路径一致，使测试执行当前源码而不是过期的工作区 `dist` 产物。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@trace-glow/core': workspaceSource('./packages/core/src/index.ts'),
      '@trace-glow/context': workspaceSource('./packages/context/src/index.ts'),
      '@trace-glow/transport': workspaceSource('./packages/transport/src/index.ts'),
      '@trace-glow/logger': workspaceSource('./packages/logger/src/index.ts'),
      '@trace-glow/browser': workspaceSource('./packages/browser/src/index.ts'),
      '@trace-glow/vue': workspaceSource('./packages/vue/src/index.ts'),
      '@trace-glow/node': workspaceSource('./packages/node/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'json-summary'] },
  },
});
