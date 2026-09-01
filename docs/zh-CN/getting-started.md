# 快速开始

## 浏览器

```ts
import { TraceGlow } from '@trace-glow/browser';

const telemetry = new TraceGlow({
  apiKey: 'browser-write-key',
  endpoint: 'https://collector.example.com/v1/events',
  projectId: 'web-store',
  environment: 'production',
  release: 'web-store@1.4.0',
});

telemetry.context.setUser({ id: 'internal-user-id' });
telemetry.logger.info('checkout_started', { cartSize: 3 });
```

构造函数会自动启动客户端。如果运行环境提供受控的销毁阶段，请调用 `telemetry.client.shutdown()`。

## React

```tsx
import {
  TraceGlow,
  TraceGlowErrorBoundary,
  TraceGlowProvider,
} from '@trace-glow/react';
```

React 包使用与浏览器包相同的配置和自动埋点。Provider、Hook、ErrorBoundary、SSR、生命周期和隐私行为请参阅 [React 集成文档](react.md)。

## Vue 3

```ts
import { createApp } from 'vue';
import { TraceGlow } from '@trace-glow/vue';
import App from './App.vue';

const app = createApp(App);
const telemetry = new TraceGlow({
  apiKey: 'browser-write-key',
  endpoint: 'https://collector.example.com/v1/events',
  projectId: 'web-store',
  environment: 'production',
});

app.use(telemetry);
app.mount('#app');
```

构造函数会立即启动浏览器埋点。`app.use(telemetry)` 会增加 Vue 组件异常采集，并保留应用已经配置的错误处理器。在受控销毁阶段调用 `telemetry.client.shutdown()`，可以恢复错误处理器并刷新队列事件。

## Node.js

```ts
import { TraceGlow, createExpressMiddleware } from '@trace-glow/node';

const telemetry = new TraceGlow({
  apiKey: process.env.TRACE_GLOW_API_KEY!,
  endpoint: 'https://collector.example.com/v1/events',
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

## 配置参数说明

### 公共客户端参数

五个公开包都使用 `new TraceGlow(config)`。公共参数名称完全一致，只有 `instrumentation` 内部字段因运行时而不同。

| 参数 | 类型 | 必填项/默认值 | 作用 |
| --- | --- | --- | --- |
| `endpoint` | `string` | 必填 | Collector 的绝对事件接收地址，SDK 使用 `POST` 向该地址发送数据。 |
| `apiKey` | `string` | 必填 | Collector 用于鉴权的项目写入密钥。浏览器密钥必须是权限受限的写入密钥，因为用户可以查看它。 |
| `projectId` | `string` | 必填 | 附加到每个事件的项目标识，用于租户路由和查询。 |
| `environment` | `string` | 可选 | 部署环境名称，例如 `production`、`staging` 或 `development`。 |
| `release` | `string` | 可选 | 可部署版本，例如 Git SHA 或 `service@1.4.0`，用于关联版本与回归问题。 |
| `sampleRate` | `number` | `1` | 每个事件被保留的概率，范围为 `0` 到 `1`。`0` 表示全部丢弃，`1` 表示全部保留。 |
| `batchSize` | `number` | `50` | 单次 Collector 请求最多发送的事件数；队列达到该数量时会触发刷新。 |
| `maxQueueSize` | `number` | `1000` | 内存队列最多保留的事件数。队列满时丢弃最旧事件，避免内存无限增长。 |
| `maxEventSizeBytes` | `number` | `65536` | 单个事件完成处理后的最大 UTF-8 字节数，超过限制的事件会在入队前丢弃。 |
| `flushIntervalMs` | `number` | `5000` | 定时发送队列事件的时间间隔，单位为毫秒。 |
| `requestTimeoutMs` | `number` | `10000` | 一个批次完整发送流程的超时时间，单位为毫秒，包含重试耗时。 |
| `retry` | `RetryConfig` | 见下表 | 覆盖发送失败时的指数退避重试策略。 |
| `debug` | `DebugOptions` | 关闭 | 控制主动开启的本地调试输出，不会替代 Collector 投递。 |
| `onInternalError` | `(error: Error) => void` | 可选 | 接收隔离后的 SDK 或 Transport 内部错误。该回调自身抛出的异常会被 SDK 吞掉。 |
| `onDrop` | `(count, reason) => void` | 可选 | 报告因 `queue_full`、`sampled`、`invalid` 或 `oversized` 而被丢弃的事件。 |
| `instrumentation` | `BrowserPluginOptions` 或 `NodePluginOptions` | 可选 | 控制运行时专属埋点，同时保持外层配置结构一致；浏览器、React 和 Vue 使用浏览器选项。 |
| `logger` | `LoggerOptions` | 可选 | 设置默认日志级别、上下文和结构化字段。 |

除重试延迟外，所有数值限制都必须是正整数。必填参数或资源限制不合法时，构造函数会抛出异常。

### 重试参数

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `attempts` | `number` | `3` | 总发送次数，包含首次请求，必须是正整数。 |
| `baseDelayMs` | `number` | `250` | 指数退避的初始等待时间，单位为毫秒，必须大于或等于零。 |
| `maxDelayMs` | `number` | `5000` | 退避等待时间上限，单位为毫秒，必须大于或等于 `baseDelayMs`。 |

发送语义为至少一次。重试耗尽后，失败批次会恢复到有界队列头部，因此 Collector 应根据事件 ID 去重。

### Debug 参数

所有公开包都通过 `debug` 属性传入以下字段。

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `printEvents` | `boolean` | `false` | 通过 `console.debug('[TraceGlow] event', event)` 打印每个处理完成并成功进入有界队列的事件。正常批处理和 Collector 投递保持不变。 |

```ts
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'project-write-key',
  projectId: 'local-debug',
  debug: {
    printEvents: true,
  },
});
```

打印对象包含合并后的共享上下文和请求上下文，并且只在事件进入队列时输出一次。该输出不是发送成功确认，重试时也不会重复打印。显式提供的用户信息或应用字段可能出现在输出中，因此只应在可信的本地控制台开启，生产环境应保持关闭。

### 浏览器参数

以下字段通过浏览器、React 或 Vue 包的 `instrumentation` 属性传入。

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `errors` | `boolean` | `true` | 采集 `window` error 事件中的未捕获全局 JavaScript 错误。 |
| `unhandledRejections` | `boolean` | `true` | 独立于同步错误和资源错误，采集未处理的 Promise rejection。 |
| `resources` | `boolean` | `true` | 采集图片、脚本和样式表加载失败，不采集 DOM 文本。 |
| `console` | `boolean` | `true` | 采集 `console.error` 和 `console.warn` 作为监控事件，同时保留原始控制台输出。 |
| `breadcrumbs` | `boolean` | `true` | 将最近的 console、资源、HTTP 和异常 Breadcrumb 附加到错误事件。 |
| `maxBreadcrumbs` | `number` | `100` | 每个浏览器客户端在内存中保留的 Breadcrumb 最大条数，超出后优先淘汰最早条目。 |
| `performance` | `boolean` | `true` | 采集浏览器支持的 LCP、布局偏移和长任务性能条目。 |
| `fetch` | `boolean` | `true` | 采集全局 Fetch 的耗时、状态码和失败信息，同时保持原有应用行为。 |
| `xhr` | `boolean` | `true` | 采集 `XMLHttpRequest` 的耗时和状态码。 |
| `includeUrlQuery` | `boolean` | `false` | 是否保留 URL 查询参数。仅在确认查询参数不包含敏感数据后启用；URL fragment 默认仍会排除。 |
| `ignoreUrls` | `readonly (string \| RegExp)[]` | `[]` | 排除匹配指定 URL 前缀或正则表达式的 Fetch/XHR 事件。配置的 Collector 地址始终会被自动加入排除列表。 |

示例：

```ts
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  sampleRate: 0.25,
  instrumentation: {
    performance: true,
    includeUrlQuery: false,
    ignoreUrls: ['/health', /^https:\/\/analytics\.example\.com\//],
  },
  logger: { minimumLevel: 'info' },
});
```

浏览器错误默认包含有界的 Breadcrumb 快照。Breadcrumb 仅包含简短的 console 摘要和清理后的请求 URL，默认不会采集请求体、Cookie、Authorization Header、DOM 文本、URL 查询参数或 fragment。显式传入的 console 参数和上下文字段仍可能包含业务数据，因此在生产环境启用前应完成隐私评估。

### Node.js 参数

以下字段通过 Node.js 包的 `instrumentation` 属性传入。

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `runtimeMetrics` | `boolean` | `true` | 定期采集 CPU 使用率、内存、事件循环延迟和进程运行时间。 |
| `metricsIntervalMs` | `number` | `30000` | 两次运行时指标快照之间的时间间隔，单位为毫秒。 |
| `processErrors` | `boolean` | `true` | 通过 `uncaughtExceptionMonitor` 观察未捕获异常，不阻止 Node.js 按默认行为退出。 |
| `unhandledRejections` | `boolean` | `false` | 添加 `unhandledRejection` 监听器。该参数默认关闭，因为添加监听器会改变 Node.js 的默认进程行为。 |

### Vue 集成

Vue 包接受上面的浏览器 `instrumentation` 参数。Vue 专属异常采集通过 `app.use(telemetry)` 安装，不需要单独的配置对象。它会生成 `vue.exception` 事件，并包含以下 payload 字段：

| 字段 | 类型 | 作用 |
| --- | --- | --- |
| `name` | `string` | Vue 收到 Error 实例时对应的 JavaScript Error 类名。 |
| `message` | `string` | 错误消息；抛出值不是 Error 时使用安全的回退消息。 |
| `stack` | `string` | Error 实例提供的可选 JavaScript 调用栈。 |
| `info` | `string` | Vue 提供的错误来源说明，例如 render 或 setup function。 |
| `component` | `string` | 从组件公开实例读取的可选显式组件名。 |

该集成不会检查组件 props、响应式状态、渲染 DOM 或任意非 Error 抛出对象。如果应用已经设置错误处理器，Trace Glow 会在采集后继续调用它。shutdown 会恢复原处理器，除非应用在安装后又主动替换了处理器。

### Logger 参数

以下字段通过 `logger` 属性传入。

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `minimumLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'` | 低于该级别的日志不会进入遥测队列。 |
| `context` | `TelemetryContext` | 无 | 附加到该 Logger 每条记录的固定用户、标签、额外信息或关联上下文。 |
| `fields` | `Record<string, unknown>` | 无 | 合并到每条日志 payload 的固定结构化字段；单次日志调用传入的同名字段优先。 |

Logger 方法接受稳定的消息名称和可选结构化字段，例如 `logger.warn(message, fields)`。`logger.child(fields)` 会创建带有额外固定字段的独立子 Logger。

### Node.js HTTP 中间件参数

`createHttpMiddleware`、`createExpressMiddleware`、`createKoaMiddleware` 和 `createNestMiddleware` 的第二个参数支持：

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `requestContext` | `NodeRequestContext` | 无 | 通过 `AsyncLocalStorage` 传播 request ID，使请求期间创建的日志和手动事件自动继承该 ID。应传入 `TraceGlow` 实例的 `telemetry.requestContext`。 |
| `requestIdHeader` | `string` | `'x-request-id'` | 要复用的请求 Header 和要写入的响应 Header。请求未提供有效值时自动生成 UUID。 |
| `includeUrlQuery` | `boolean` | `false` | 是否在 HTTP 遥测中保留请求查询参数。仅在确认查询参数不包含敏感数据后启用。 |

## 返回对象与上下文方法参数

所有运行时类都会暴露 `client`、`context`、`logger` 和 `ready`。Node.js 类还会暴露 `requestContext`；React 还围绕相同句柄提供 Provider、Hook 和 ErrorBoundary。
三个运行时类都会暴露 `client`、`context`、`logger` 和 `ready`。Vue 类还会暴露 `vue` 并实现 Vue Plugin 的 `install(app)` 协议，Node.js 类还会暴露 `requestContext`。

| API | 参数作用 |
| --- | --- |
| `context.setUser(user)` | 替换共享用户身份。建议只传内部稳定 `id`；传入 `null` 会清除用户信息。`email`、`username` 和自定义 JSON 安全字段均为可选，使用前应明确完成隐私评估。 |
| `context.setTag(key, value)` | 添加低基数、可搜索的标签，例如区域或套餐。 |
| `context.setExtra(key, value)` | 添加 JSON 安全的诊断数据，该数据不应作为索引标签使用。 |
| `context.setCorrelation({ traceId, requestId, sessionId })` | 添加用于关联事件的非空标识。 |
| `client.startSpan(name, options)` | 创建显式 trace span；使用 `setAttribute`、`setStatus` 和 `end` 完成并入队。通过 `options.parent` 创建子 span。 |
| `context.clear()` | 清除全部共享用户、标签、额外信息和关联上下文。 |
| `client.capture(input)` | 手动事件入队。`type` 和 `name` 必填；`level` 默认为 `info`；`timestamp`、事件级 `context` 和 `payload` 可选。 |
| `client.flush()` | 等待待处理事件，并立即尝试发送当前队列。 |
| `client.shutdown()` | 停止采集、移除埋点并执行最后一次刷新。 |
| `install(app)` / `app.use(telemetry)` | 仅 Vue 包支持。幂等安装组件异常采集，同时保留应用已有的错误处理器。 |
| `ready` | 插件初始化完成后 resolve 的 Promise。应用启动流程必须等待 SDK 初始化时应显式 await。 |

## 自定义组装

所有公开包会重新导出自定义组装所需的受支持底层 API。需要自定义 transport、上下文或插件行为时，可以直接构造 `TelemetryClient`。插件必须在 `start()` 之前注册；最终的数据脱敏应通过事件处理器完成。私有的 `@trace-glow/*` workspace 包属于实现细节，不会发布到 npm。
五个公开包会重新导出自定义组装所需的受支持底层 API。需要自定义 transport、上下文或插件行为时，可以直接构造 `TelemetryClient`。插件必须在 `start()` 之前注册；最终的数据脱敏应通过事件处理器完成。私有的 `@trace-glow/*` workspace 包属于实现细节，不会发布到 npm。
