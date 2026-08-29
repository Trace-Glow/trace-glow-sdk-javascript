# 发布流程

## 前置条件

1. 确认 npm 账户或组织拥有 `@trace-glow-sdk` scope。公开发布 `@trace-glow-sdk/browser`、`@trace-glow-sdk/react` 和 `@trace-glow-sdk/node` 三个包。
2. 将 npm automation token 添加为仓库 Secret：`NPM_TOKEN`。
3. 允许 GitHub Actions 创建 Pull Request，并配置 npm trusted publishing；也可以保留发布工作流中的 Token 认证方式。

## 创建发布版本

运行 `pnpm changeset`，选择受影响的包，并将生成的 Markdown 文件与代码改动一起提交。在 `main` 分支上，发布工作流会维护一个版本 Pull Request。合并该 Pull Request 后，将执行构建、测试，并使用 npm provenance 发布所有关联版本。

私有 `@trace-glow/*` 模块只会被内联，不会单独发布。修改私有模块时，仍必须为行为受到影响的 browser、React 或 Node.js 公开包添加 Changeset。

第一次公开发布前，如果 API 仍应处于明确的预发布状态，可以通过 Changesets 将 `0.1.0` 调整为类似 `0.1.0-next.0` 的版本。不要覆盖 npm 上已经发布的版本。

## 本地验证

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
mkdir -p /tmp/trace-glow-packs
pnpm --filter '@trace-glow-sdk/*' pack --pack-destination /tmp/trace-glow-packs
```

检查三个公开包的 tarball，确认浏览器和 React 产物没有引用 Node.js 内置模块，React 包仍将 React 声明为 peer dependency，并且所有 tarball 都没有声明对私有 `@trace-glow/*` workspace 包的运行时依赖。
