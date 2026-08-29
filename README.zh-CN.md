# Trace Glow JavaScript SDK

[English](README.md) | [简体中文](README.zh-CN.md)

采集浏览器与 Node.js 的错误、运行时信号、HTTP 耗时和结构化日志，并通过有界、故障隔离的管道将数据发送到 Trace Glow Collector。

[快速开始](docs/zh-CN/getting-started.md) ·
[架构方案](docs/zh-CN/architecture.md) ·
[本地开发](docs/zh-CN/local-development.md) ·
[English documentation](docs/en/README.md)

> [!IMPORTANT]
> 本仓库只包含 JavaScript 数据采集与发送 SDK。SDK 需要 Trace Glow Collector 地址来接收事件信封。数据存储、查询、管理平台和告警评估位于其他独立仓库。

## 为什么选择 Trace Glow

- **每个运行时只需一个包。** 根据需要安装浏览器或 Node.js SDK；共享实现模块会打包进公开产物，不会成为消费项目的依赖。
- **所有环境使用同一个构造函数。** 浏览器和 Node.js 应用都通过 `new TraceGlow(config)` 启动，运行时专属差异只放在 `instrumentation` 中。
- **实用的默认配置。** 构造函数会统一组装错误采集、运行时埋点、结构化日志、上下文、批处理、采样、重试和最终刷新。
- **有界资源开销。** 队列长度、事件大小、批次大小、重试次数和请求时长都有明确限制。
- **保护宿主应用。** 运行时采集和发送失败不会进入应用控制流，并可通过可选诊断回调进行观察。
- **注重隐私的采集策略。** 默认不采集请求与响应 Body、Cookie、Authorization Header、URL 查询参数、fragment 和 DOM 文本。

## 安装

根据运行环境选择对应的包：

```sh
# 浏览器应用
pnpm add @trace-glow-sdk/browser

# Node.js 服务
pnpm add @trace-glow-sdk/node
```

使用 `npm install` 或 `yarn add` 时，包名保持不变。

## 快速开始

### 浏览器

```ts
import { TraceGlow } from '@trace-glow-sdk/browser';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  environment: 'production',
  release: 'web-store@1.4.0',
});

telemetry.context.setUser({ id: 'internal-user-id' });
telemetry.logger.info('checkout_started', { cartSize: 3 });
```

浏览器埋点会自动启动。Collector URL 会自动从 Fetch 和 XHR 埋点中排除，防止递归产生遥测事件。

### Node.js

```ts
import {
  createExpressMiddleware,
  TraceGlow,
} from '@trace-glow-sdk/node';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: process.env.TRACE_GLOW_API_KEY!,
  projectId: 'checkout-api',
  environment: process.env.NODE_ENV ?? 'production',
  ...(process.env.APP_VERSION ? { release: process.env.APP_VERSION } : {}),
});

app.use(createExpressMiddleware(telemetry.client, {
  requestContext: telemetry.requestContext,
}));

telemetry.logger.info('service_started');

process.on('SIGTERM', async () => {
  await telemetry.client.shutdown();
  process.exit(0);
});
```

中间件会复用或创建 `x-request-id`，将其写入响应，并在传入 `requestContext` 时通过 `AsyncLocalStorage` 传播该 ID。SDK 内置 Node HTTP、Express、Koa 和 Nest 适配器，不引入对应框架的运行时依赖。

完整选项、默认值、回调和上下文 API 请查看[配置参数说明](docs/zh-CN/getting-started.md#配置参数说明)，对应的[英文参数说明](docs/en/getting-started.md#configuration-reference)会同步维护。

在本地查看事件时，两个运行时都使用同一个 debug 参数：

```ts
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'project-write-key',
  projectId: 'local-debug',
  debug: { printEvents: true },
});
```

事件完成上下文合并和处理器处理后，会通过 `console.debug` 输出。Debug 默认关闭，并且不会停止正常的 Collector 投递。发送语义和隐私注意事项请查看配置参数说明。

## 采集内容

| 运行时 | 默认埋点 |
| --- | --- |
| 浏览器 | JavaScript 错误、未处理的 Promise rejection、资源加载失败、浏览器支持的 LCP/布局偏移/长任务条目、Fetch 和 XHR |
| Node.js | 未捕获异常监控、CPU、内存、事件循环延迟、运行时间，以及通过中间件采集的 HTTP 请求耗时 |
| 两者共有 | 带严重级别过滤的结构化日志、用户/标签/额外信息上下文、版本/环境元数据和关联 ID |

Node.js 的未处理 rejection 监控需要主动启用，因为安装该监听器会改变进程默认行为。URL 查询参数采集同样需要主动启用，并且只应在完成隐私评估后使用。

## 可靠性模型

Trace Glow 使用至少一次投递语义：

1. 对事件进行归一化、采样和处理，然后检查字节大小限制。
2. 有界 FIFO 队列按照采集顺序对已接受事件进行批处理。
3. 发送失败后使用带上限和抖动的指数退避进行重试。
4. 耗尽重试次数的批次会恢复到队首。
5. 队列溢出时丢弃最旧事件，并可通过 `onDrop` 观察。
6. `shutdown()` 会移除埋点并尝试执行最后一次刷新。

至少一次投递可能产生重复数据。Collector 应根据客户端生成的事件 ID 去重；SDK 不承诺恰好一次投递。

## 包结构

只有两个包会公开发布：

| 包 | 运行时 | 说明 |
| --- | --- | --- |
| [`@trace-glow-sdk/browser`](packages/browser-sdk) | 现代浏览器 | 自包含浏览器 SDK，提供埋点、上下文、日志以及 HTTP/Beacon Transport |
| [`@trace-glow-sdk/node`](packages/node-sdk) | Node.js 18+ | 自包含服务端 SDK，提供进程指标、请求上下文、日志以及 HTTP/框架中间件 |

`packages/core`、`packages/context`、`packages/transport`、`packages/logger`、`packages/browser` 和 `packages/node` 属于私有实现边界。它们会打包进公开 JavaScript 和类型声明产物，不应由消费项目直接安装。

依赖方向、事件流程、隐私边界和仓库职责请参阅[架构方案](docs/zh-CN/architecture.md)。

## 兼容性与项目状态

- 公开包目前处于 pre-1.0 版本阶段。公开 API 在 `1.0.0` 前可能发生变化；升级时请检查 Changesets 和发布说明。
- 支持 Node.js `18` 及更高版本。
- 浏览器产物以 ES2022 为目标，并要求使用支持 Fetch 的现代浏览器。面向旧浏览器的应用必须自行提供必要的转译和 Polyfill。
- 两个公开包均提供 ESM、CommonJS、Source Map 和 TypeScript 类型声明。

## 开发

本仓库是使用 pnpm 管理的 TypeScript 工作区：

```sh
pnpm install
pnpm verify:push
```

`pnpm verify:push` 会运行 lint、TypeScript 严格检查、所有包的构建和单元测试。安装依赖时还会将同一命令配置为 Git `pre-push` Hook。

Commit Message 遵循 Conventional Commits，并通过 `commit-msg` Hook 校验。允许的 type 和示例请参阅[本地开发文档](docs/zh-CN/local-development.md#commit-message-规范)。

在消费项目中调试 SDK 时，请使用文档中的[本地链接和 tarball 流程](docs/zh-CN/local-development.md)。发布流程通过 Changesets 管理两个公开包的关联版本；准备发布前请阅读[发布流程](docs/zh-CN/publishing.md)。

仓库改动必须遵守 [AGENTS.md](AGENTS.md)，包括同步维护英文与简体中文文档，以及使用简体中文代码注释。

## 许可证

[MIT](LICENSE) © Trace Glow contributors
