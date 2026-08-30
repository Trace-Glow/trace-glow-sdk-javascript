# Trace Glow SDK 架构

## 目标

Trace Glow 用于采集 JavaScript 监控事件和结构化日志。当采集服务缓慢或不可用时，SDK 不应改变宿主应用的行为。SDK 面向 npm 公开发布，支持 Tree Shaking，隔离浏览器与 Node.js 运行时，并为未来兼容 OTLP 做好准备。

首个版本覆盖 SDK 侧的数据采集与发送。SDK 遥测数据由
`trace-glow-collector-server` 接收；平台 API、管理、查询和告警计算由
`trace-glow-platform-server` 负责；Next.js 应用 `trace-glow-platform` 消费
平台服务。上述服务都消费 [Trace Glow contracts 仓库](https://github.com/Trace-Glow/trace-glow-contracts)定义的事件信封。

## 包边界

| Workspace 包 | 职责 | 发布方式 |
| --- | --- | --- |
| `@trace-glow-internal/core` | 生命周期、插件 API、生成的协议类型、有界队列、批处理、采样、重试 | 私有，打入公开包 |
| `@trace-glow-internal/context` | 用户、标签、环境、版本及关联上下文 | 私有，打入公开包 |
| `@trace-glow-internal/transport` | Fetch HTTP、gzip 和浏览器 Beacon 发送 | 私有，打入公开包 |
| `@trace-glow-internal/logger` | 结构化日志及日志级别过滤 | 私有，打入公开包 |
| `@trace-glow-internal/browser` | 异常、Promise rejection、资源失败、性能、Fetch 和 XHR | 私有，打入公开包 |
| `@trace-glow-internal/vue` | Vue 应用错误处理器的安装、委托和卸载 | 私有，打入公开包 |
| `@trace-glow-internal/node` | 进程异常、运行时指标、HTTP 中间件及框架适配器 | 私有，打入公开包 |
| `@trace-glow/browser` | 自包含的浏览器 SDK | 公开 npm 包 |
| `@trace-glow/react` | 带 React Provider、Hook 和 ErrorBoundary 的浏览器 SDK | 公开 npm 包；React peer dependency |
| `@trace-glow/next` | Next.js 客户端 React 集成和 Node 服务端入口 | 公开 npm 包；Next.js 与 React peer dependency |
| `@trace-glow/vue` | 自包含的 Vue 3 SDK；Vue 为 peer dependency | 公开 npm 包 |
| `@trace-glow/node` | 自包含的 Node.js SDK | 公开 npm 包 |

依赖只能向内：运行时插件可以依赖 core，但 core 永远不能导入运行时插件。所有公开包暴露相同的 `TraceGlow` 类和公共配置结构，但包入口与运行时 Bundle 仍保持隔离。公开包会内联私有实现模块及其类型声明，因此 npm tarball 不会依赖未发布的 workspace 包。

React 包遵守浏览器隔离边界，并内联相同的私有浏览器模块。React 本身保持外部依赖并声明为 peer dependency，确保 Context 和 Hook 始终使用消费应用中的唯一 React 实例。`TraceGlowProvider` 只传递已经创建的 SDK 实例，不会在 React StrictMode 重复挂载期间创建或关闭实例。

## 事件信封

`trace-glow-contracts` 中的 JSON Schema Draft 2020-12 是 `TelemetryEvent`、标准
`Envelope` 和 `BeaconRequest` 的唯一事实来源。本仓库在 `contracts/v1/` 保存
版本化 Schema 快照及其来源 SHA-256，并根据该快照生成 core 使用的 TypeScript
类型。快照使 SDK 构建保持可复现，同时不会增加对其他仓库的运行时依赖。

对于 AI 工作，远程 `trace-glow-contracts/context/` 目录是系统公共上下文的
来源。本地 `AGENTS.md` 要求 Agent 在做出跨仓库假设前，读取一个固定的
contracts commit 以及 SDK 专属上下文文件。

每个事件都包含 `id`、`timestamp`、`type`、`name`、`level`、SDK 标识、项目/环境/版本元数据、可选关联标识，以及可安全序列化为 JSON 的 payload。未知字段不会被提升为顶层索引字段。

`trace-glow-collector-server` 应使用 `(projectId, id)` 去重，以 `timestamp`
作为事件时间，补充服务端接收时间，拒绝过大的 payload，并将发送语义视为至少一次。Schema 带有版本号，使采集服务能够支持 SDK 的滚动升级。

## 生命周期与故障模型

1. `start()` 初始化插件并启动周期性刷新。
2. `capture()` 标准化事件，执行事件处理器和采样，然后写入有界队列。
3. 达到数量或时间阈值后，将一个批次交给配置的 transport。
4. 瞬时错误使用指数退避和随机抖动重试。最终失败时，仅在队列容量允许的情况下将批次放回队首。
5. `shutdown()` 拆除插件并执行最后一次有界刷新。

SDK 异常通过 `onInternalError` 报告，绝不能抛入宿主应用的事件路径。队列溢出时丢弃最旧事件，并报告内部丢弃计数。默认丢弃超过 64 KiB 的事件；该限制可配置，用于防止单个意外 payload 耗尽宿主进程资源。

## 默认安全与隐私策略

- 默认不采集请求体、响应体、Cookie、Authorization 请求头和 DOM 文本。
- 除非显式启用，否则从 URL 中移除查询参数和 Fragment。
- 用户上下文需要主动设置；应用应优先使用内部用户标识。
- 浏览器 SDK 使用的 API Key 只能是项目级写入密钥，不能是管理密钥。采集端仍必须实施来源限制、限流和配额。
- 事件处理器提供最后一道由客户控制的数据脱敏能力。

## 发布策略

Workspace 使用 pnpm 和 Changesets。在初始契约开发阶段，五个公开包作为 linked group 统一升级版本。每个公开包发布 ESM、CommonJS、已内联的类型声明和 Source Map，并且只包含自身的 `dist` 和文档。

在带 npm provenance 的发布前，CI 必须执行 `typecheck`、`test`、`build`，并将五个公开包打包到临时目录进行检查。

## 交付阶段

### 第一阶段：可用的采集闭环

- 稳定的事件和插件契约
- 浏览器异常、性能和网络采集
- Vue 组件异常采集及既有错误处理器委托
- Node.js 进程、运行时采集及 HTTP 中间件
- 上下文、结构化日志、HTTP/Beacon transport
- 有界批处理、采样、重试、关闭流程和测试

### 第二阶段：生产级加固

- 远程配置和紧急关闭开关
- 确定性的用户级采样和规则采样
- 压缩协商和服务端时钟偏差反馈
- 针对 Express、Koa 和 Nest 实际 peer 版本的集成测试
- Source Map 上传 CLI 及发布产物关联

### 第三阶段：生态兼容

- OTLP exporter 和语义约定映射
- 框架专用自动插桩包
- 带严格容量限制的浏览器离线持久化
- 签名配置和密钥轮换

## 第一阶段明确不做的内容

SDK 不将遥测数据持久化到磁盘，不采集请求体，不对所有第三方框架打补丁，不承诺恰好一次发送，也不实现服务端告警。这些限制用于保持 SDK 对宿主应用影响的可预测性。
