# 本地包联调

公开包的 `exports` 指向 `dist/`，而不是 TypeScript 源文件，因此创建链接前必须先构建 SDK。

## 使用 pnpm link 快速迭代

在本仓库中构建公开包，并将四个包注册到 pnpm 全局链接存储：

```sh
pnpm build
cd packages/browser-sdk
pnpm link --global
cd ../react-sdk
cd ../vue-sdk
pnpm link --global
cd ../node-sdk
pnpm link --global
cd ../..
```

需要明确进入每个公开包目录执行 `pnpm link --global`。在当前 pnpm 工作区中，从仓库根目录配合 `--dir` 执行可能会错误注册工作区根包。

在浏览器应用仓库中链接浏览器包：

```sh
pnpm link --global @trace-glow/browser
```

在 React 应用仓库中链接 React 包：

```sh
pnpm link --global @trace-glow/react
```

在 Vue 3 应用仓库中链接 Vue 包：

```sh
pnpm link --global @trace-glow/vue
```

在 Node.js 服务仓库中链接 Node.js 包：

```sh
pnpm link --global @trace-glow/node
```

SDK 源码发生变化后，需要在 SDK 仓库中重新运行 `pnpm build`。消费项目会读取重新构建的 `dist` 文件。如果构建工具缓存了依赖产物，需要重启消费项目的开发服务器。

重新安装 npm registry 版本前，先在消费项目中移除链接：

```sh
pnpm unlink @trace-glow/browser
pnpm unlink @trace-glow/react
pnpm unlink @trace-glow/vue
pnpm unlink @trace-glow/node
pnpm install
```

消费项目只需要移除自己实际使用的包。这里同时列出四个命令仅供参考。

## 使用 tarball 做发布形态验证

符号链接可能掩盖文件缺失或包元数据错误。发布前应通过 tarball 验证真实 npm 包形态：

```sh
mkdir -p /tmp/trace-glow-packs
pnpm build
pnpm --filter '@trace-glow/*' pack --pack-destination /tmp/trace-glow-packs
```

在消费项目中安装对应 tarball：

```sh
pnpm add /tmp/trace-glow-packs/trace-glow-browser-0.1.0.tgz
pnpm add /tmp/trace-glow-packs/trace-glow-react-0.1.0.tgz
pnpm add /tmp/trace-glow-packs/trace-glow-vue-0.1.0.tgz
pnpm add /tmp/trace-glow-packs/trace-glow-node-0.1.0.tgz
```

Tarball 测试可以验证 `exports`、类型声明、私有模块内联结果和最终文件白名单，是发布前的必做检查。

## npm link 替代方式

如果消费项目使用 npm，可以在构建后的公开包目录中运行 `npm link`，再在消费项目中执行对应命令：

```sh
npm link @trace-glow/browser
npm link @trace-glow/react
npm link @trace-glow/vue
npm link @trace-glow/node
```

不要在 CI 或生产部署中使用链接包，因为链接依赖当前机器的本地路径。

## 共享协议同步

[`trace-glow-contracts`](https://github.com/Trace-Glow/trace-glow-contracts) 仓库
是事件传输结构的唯一事实来源。在该仓库完成兼容协议变更评审后，通过明确的
本地来源路径同步 Schema：

```sh
pnpm contracts:sync -- /absolute/path/to/trace-glow-contracts
pnpm contracts:check
```

同步命令会更新 `contracts/v1/contracts.schema.json`、来源哈希和 core 使用的
TypeScript 生成类型。不要手工编辑这些文件。SDK 测试会使用快照校验真实
`TelemetryClient` 事件，`contracts:check` 会发现 Schema 哈希变化或过期的生成
产物。

共享 Agent 上下文与构建快照不同。Agent 必须通过 GitHub MCP 或已认证的
`gh api`，直接从固定的 contracts commit 读取 `context/shared.md`、
`context/repositories.json` 和 SDK 上下文文件；不要将这些上下文复制到本仓库。

## Commit Message 规范

仓库采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)，并通过 `commit-msg` Hook 校验每次提交。提交信息格式为：

```text
<type>(<可选 scope>): <描述>
```

常用 type 如下：

| Type | 用途 |
| --- | --- |
| `feat` | 用户可感知的新能力 |
| `fix` | Bug 修复 |
| `docs` | 仅修改文档 |
| `refactor` | 不改变行为的内部代码调整 |
| `perf` | 性能优化 |
| `test` | 仅修改测试 |
| `build` | 构建系统或依赖调整 |
| `ci` | 持续集成调整 |
| `chore` | 以上类型未覆盖的仓库维护 |

示例：

```text
feat(browser): add configurable resource filters
fix(node): preserve request context across middleware
docs: document local package linking
```

不兼容的公开 API 变更应使用 `!` 或 `BREAKING CHANGE:` Footer：

```text
feat(core)!: replace the event processor contract
```

scope 可以省略，但建议填写受影响的包或领域。描述应简洁，并明确说明该提交做了什么。需要手动校验 Git 已准备的提交信息时，运行：

```sh
pnpm commitlint --edit .git/COMMIT_EDITMSG
```

校验失败会取消提交。请避免使用 `git commit --no-verify`，因为它会绕过仓库的历史记录规范。

## 推送前校验

安装工作区依赖时会运行 `simple-git-hooks`，为仓库配置 `pre-push` Hook。在 Git 将提交发送到远程仓库前，Hook 会依次执行：

```sh
pnpm contracts:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

需要随时手动执行完整校验时，运行：

```sh
pnpm verify:push
```

如果 Hook 未安装，例如复制过仓库或安装依赖时禁用了生命周期脚本，可以通过以下命令启用：

```sh
pnpm prepare
```

任意检查失败都会取消推送。请避免使用 `git push --no-verify`，因为它会跳过全部本地保护；仅在特殊恢复场景使用，并在请求代码审查前单独运行 `pnpm verify:push`。
