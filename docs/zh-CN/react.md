# React 集成

## 安装

```sh
pnpm add @trace-glow/react
```

该包支持 React 18 和 19。React 是 peer dependency，不会打入 Bundle，因此应用和 SDK 会使用同一套 Context 与 Hook 运行时。

## 只初始化一次

在浏览器应用入口、React 渲染流程之外创建一次 SDK：

```tsx
import {
  TraceGlow,
  TraceGlowErrorBoundary,
  TraceGlowProvider,
} from '@trace-glow/react';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  environment: 'production',
  release: 'web-store@1.4.0',
});

root.render(
  <TraceGlowProvider telemetry={telemetry}>
    <TraceGlowErrorBoundary fallback={<p>页面发生错误。</p>}>
      <App />
    </TraceGlowErrorBoundary>
  </TraceGlowProvider>,
);
```

`new TraceGlow(config)` 会自动启动浏览器监控。Provider 只传递现有实例，不会创建或关闭它。这可以防止 React StrictMode 在开发环境重复挂载时安装重复埋点或提前关闭共享客户端。

在 SSR 框架中，只能在客户端入口或客户端组件中创建实例。React ErrorBoundary 不会捕获服务端渲染错误。

## 在组件中访问 SDK

`useTraceGlow()` 返回最近 Provider 提供的实例：

```tsx
import { useTraceGlow } from '@trace-glow/react';

export function CheckoutButton() {
  const telemetry = useTraceGlow();

  return (
    <button
      onClick={() => telemetry.logger.info('checkout_started', { source: 'cart' })}
    >
      结算
    </button>
  );
}
```

在 `TraceGlowProvider` 外调用该 Hook 会抛出配置错误。可以像浏览器包一样使用实例更新共享上下文、写入结构化日志、手动采集事件、刷新或关闭客户端。

## 组件错误边界

`TraceGlowErrorBoundary` 会将后代组件的渲染和生命周期错误采集为名为 `react.component_error`、级别为 `error` 的 `monitor` 事件。Payload 包含错误名称、消息、可用的 JavaScript stack 和 React component stack，不采集 Props、State、请求 Body 或 DOM 文本。

| 参数 | 类型 | 必填项/默认值 | 作用 |
| --- | --- | --- | --- |
| `children` | `ReactNode` | 可选 | 由错误边界保护的 React 子树。 |
| `telemetry` | `TraceGlow` | Provider 实例 | 显式 SDK 实例，适用于错误边界包裹 Provider 或应用根节点的场景。 |
| `fallback` | `ReactNode` | `null` | 未提供 `fallbackRender` 时，组件错误发生后渲染的静态内容。 |
| `fallbackRender` | `(props) => ReactNode` | 可选 | 使用 `error` 和 `resetErrorBoundary` 构建动态恢复界面，优先级高于 `fallback`。 |
| `onError` | `(error, info) => void` | 可选 | 事件采集后执行；回调异常会与 React 恢复流程隔离。 |
| `onReset` | `() => void` | 可选 | 手动重置错误边界后执行；回调异常会被隔离。 |

动态恢复示例：

```tsx
<TraceGlowErrorBoundary
  fallbackRender={({ error, resetErrorBoundary }) => (
    <section role="alert">
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>重试</button>
    </section>
  )}
  onReset={() => navigate('/')}
>
  <Checkout />
</TraceGlowErrorBoundary>
```

React ErrorBoundary 不会捕获事件处理函数、异步回调或错误边界自身抛出的错误。这些路径需要显式上报：

```ts
try {
  await submitOrder();
} catch (error) {
  telemetry.client.capture({
    type: 'monitor',
    name: 'checkout.submit_failed',
    level: 'error',
    payload: { message: error instanceof Error ? error.message : String(error) },
  });
}
```

需要自定义类错误边界时，可以调用公开的 `captureReactError(telemetry, error, info)`，复用相同的受约束事件格式。

## 生命周期与隐私

只应在应用提供的受控销毁阶段调用 `telemetry.client.shutdown()`，不要在 Provider 的清理函数中调用。启用 `debug.printEvents` 后，共享上下文和错误字段可能打印到控制台，因此生产环境应保持关闭，并避免向日志或上下文添加敏感值。
