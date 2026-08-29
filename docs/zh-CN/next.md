# Next.js 集成

`@trace-glow/next` 支持 Next.js 14-16，并提供两个运行时入口：

| 入口 | 运行时 | 使用位置 |
| --- | --- | --- |
| `@trace-glow/next` | 浏览器 | Client Component 和客户端 Provider |
| `@trace-glow/next/server` | Node.js | `instrumentation.ts`、Node Route Handler、Node 中间件 |

两个入口会创建独立 SDK 实例，因为浏览器和服务端运行在不同 runtime。客户端使用
浏览器写入密钥，服务端密钥必须放在仅服务端可见的环境变量中。

## 安装

```sh
pnpm add @trace-glow/next
```

`next` 和 `react` 是 peer dependency。服务端入口不支持 Edge runtime。

## App Router 客户端接入

在标记为 `'use client'` 的文件中创建一个客户端实例，并放在模块级别，避免 React
StrictMode 和路由切换重复安装埋点。

```tsx
// app/providers.tsx
'use client';
import type { ReactNode } from 'react';
import { TraceGlow, TraceGlowErrorBoundary, TraceGlowProvider } from '@trace-glow/next';

const telemetry = new TraceGlow({
  endpoint: process.env.NEXT_PUBLIC_TRACE_GLOW_ENDPOINT!,
  apiKey: process.env.NEXT_PUBLIC_TRACE_GLOW_WRITE_KEY!,
  projectId: 'web-app',
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TraceGlowProvider telemetry={telemetry}>
      <TraceGlowErrorBoundary fallback={<p>Something went wrong.</p>}>
        {children}
      </TraceGlowErrorBoundary>
    </TraceGlowProvider>
  );
}
```

在根布局中挂载 Provider。`layout.tsx` 仍是 Server Component，只有 Provider 文件
需要客户端指令：

```tsx
// app/layout.tsx
import { Providers } from './providers';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><Providers>{children}</Providers></body></html>;
}
```

Client Component 中通过 `useTraceGlow()` 使用 SDK：

```tsx
'use client';
import { useTraceGlow } from '@trace-glow/next';
export function CheckoutButton() {
  const telemetry = useTraceGlow();
  return <button onClick={() => telemetry.logger.info('checkout_started', { source: 'cart' })}>Checkout</button>;
}
```

在 `TraceGlowProvider` 外调用 Hook 会抛出配置错误。React Error Boundary 不会捕获
事件处理器或异步错误，需要显式采集：

```ts
try { await submitOrder(); } catch (error) {
  telemetry.client.capture({ type: 'monitor', name: 'checkout.submit_failed', level: 'error',
    payload: { message: error instanceof Error ? error.message : String(error) } });
}
```

`TraceGlowErrorBoundary` 会将客户端渲染和生命周期错误采集为 `next.component_error`
监控事件，支持 `fallback`、`fallbackRender`、`onError`、`onReset`；自定义边界可调用
`captureReactError()`。

## App Router 服务端接入

在项目根目录 `instrumentation.ts` 中创建一次 Node 实例。Next 会在服务端启动时加载
该模块，`register()` 等待 SDK 启动完成：

```ts
// instrumentation.ts
import { NextServerTraceGlow } from '@trace-glow/next/server';

export const telemetry = new NextServerTraceGlow({
  endpoint: process.env.TRACE_GLOW_ENDPOINT!,
  apiKey: process.env.TRACE_GLOW_WRITE_KEY!,
  projectId: 'web-app',
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
  instrumentation: { runtimeMetrics: true, processErrors: true, unhandledRejections: false },
});
export async function register() { await telemetry.ready; }
```

不要在 Client Component 中导入该入口，也不要通过 `NEXT_PUBLIC_` 变量暴露服务端密钥。

### Route Handler

在需要 Node API 的路由中使用服务端单例，并声明 Node runtime：

```ts
// app/api/checkout/route.ts
import { telemetry } from '../../../instrumentation';
export const runtime = 'nodejs';
export async function POST() {
  telemetry.logger.info('checkout_request');
  return Response.json({ ok: true });
}
```

### 请求中间件

`telemetry.middleware()` 返回兼容 Connect 的 Node 中间件，记录方法、清理后的 URL、
状态、耗时和请求 ID。除非显式设置 `includeUrlQuery: true`，否则不会保留查询字符串：

```ts
const requestTelemetry = telemetry.middleware({ requestIdHeader: 'x-request-id' });
```

只能在 Node server 或框架适配器中使用。运行在 Edge 上的 Next Middleware 不能使用
`@trace-glow/next/server`。

## Pages Router

可以从 `pages/_app.tsx` 挂载同一个客户端 Provider：

```tsx
import type { AppProps } from 'next/app';
import { Providers } from '../app/providers';
export default function App({ Component, pageProps }: AppProps) {
  return <Providers><Component {...pageProps} /></Providers>;
}
```

Node-only API route 或自定义 Node server 使用服务端入口，并确保它不会进入浏览器 Bundle。

## 配置和生命周期

两个构造函数都接受[快速开始指南](getting-started.md)中的公共字段：`projectId`、
`environment`、`release`、队列限制、采样、调试选项和 `logger`。客户端使用浏览器
`instrumentation`，服务端使用 Node `instrumentation`：

| 选项 | 默认值 | 行为 |
| --- | --- | --- |
| `runtimeMetrics` | `true` | CPU、内存、事件循环延迟和运行时间指标。 |
| `metricsIntervalMs` | `30000` | 运行时指标采集间隔，单位为毫秒。 |
| `processErrors` | `true` | 观察未捕获异常，但不阻止进程退出。 |
| `unhandledRejections` | `false` | 显式启用后观察未处理 Promise rejection。 |

两个构造函数都会立即启动；需要控制顺序时等待 `ready`。Provider 不拥有生命周期，
只在受控销毁阶段调用 `telemetry.client.shutdown()`；它会移除埋点并执行最终 flush。
投递语义是 at-least-once，可能出现重复事件。Serverless 部署应将实例放在请求处理器
之外，以便 warm invocation 复用。

## 隐私和常见错误

SDK 默认不采集请求/响应 Body、Cookie、授权 Header、查询字符串、URL Fragment 或 DOM
文本。不要把密钥写入自定义 Payload、Tags、Extras 或 Debug 输出。浏览器与服务端实例
拥有独立队列和上下文。

避免在 Client Component 或 Edge 函数中导入服务端入口、在每次渲染/请求中创建实例、将
服务端密钥放入 `NEXT_PUBLIC_` 变量、期待 React Error Boundary 捕获服务端错误，或在
Provider cleanup 中调用 `shutdown()`。
