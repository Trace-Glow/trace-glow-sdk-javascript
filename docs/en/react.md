# React integration

## Install

```sh
pnpm add @trace-glow-sdk/react
```

The package supports React 18 and 19. React is a peer dependency and is not
bundled, so the application and the SDK use the same Context and Hooks runtime.

## Initialize once

Create the SDK once in the browser application entry point, outside React
rendering:

```tsx
import {
  TraceGlow,
  TraceGlowErrorBoundary,
  TraceGlowProvider,
} from '@trace-glow-sdk/react';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  environment: 'production',
  release: 'web-store@1.4.0',
});

root.render(
  <TraceGlowProvider telemetry={telemetry}>
    <TraceGlowErrorBoundary fallback={<p>Something went wrong.</p>}>
      <App />
    </TraceGlowErrorBoundary>
  </TraceGlowProvider>,
);
```

`new TraceGlow(config)` starts browser monitoring automatically. The Provider
only distributes the existing instance and deliberately does not create or shut
it down. This prevents React StrictMode development remounts from installing
duplicate instrumentation or closing the shared client.

In SSR frameworks, create the instance only in a client entry point or client
component. React Error Boundaries do not catch server-rendering failures.

## Access the SDK from components

`useTraceGlow()` returns the nearest Provider instance:

```tsx
import { useTraceGlow } from '@trace-glow-sdk/react';

export function CheckoutButton() {
  const telemetry = useTraceGlow();

  return (
    <button
      onClick={() => telemetry.logger.info('checkout_started', { source: 'cart' })}
    >
      Checkout
    </button>
  );
}
```

Calling the Hook outside `TraceGlowProvider` throws a configuration error. Use
the instance to update shared context, write structured logs, manually capture
events, flush, or shut down exactly as with the browser package.

## Component error boundary

`TraceGlowErrorBoundary` captures descendant render and lifecycle errors as a
`monitor` event named `react.component_error` with level `error`. Its payload
contains the error name, message, JavaScript stack when available, and React
component stack. It does not collect Props, State, request bodies, or DOM text.

| Prop | Type | Required / default | Purpose |
| --- | --- | --- | --- |
| `children` | `ReactNode` | Optional | React subtree protected by the boundary. |
| `telemetry` | `TraceGlow` | Provider instance | Explicit SDK instance, useful when the boundary wraps the Provider or application root. |
| `fallback` | `ReactNode` | `null` | Static content rendered after a component error when `fallbackRender` is absent. |
| `fallbackRender` | `(props) => ReactNode` | Optional | Builds dynamic recovery UI from `error` and `resetErrorBoundary`. Takes precedence over `fallback`. |
| `onError` | `(error, info) => void` | Optional | Runs after event capture. Callback failures are isolated from React recovery. |
| `onReset` | `() => void` | Optional | Runs after manual boundary reset. Callback failures are isolated. |

Dynamic recovery example:

```tsx
<TraceGlowErrorBoundary
  fallbackRender={({ error, resetErrorBoundary }) => (
    <section role="alert">
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </section>
  )}
  onReset={() => navigate('/')}
>
  <Checkout />
</TraceGlowErrorBoundary>
```

React Error Boundaries do not catch event-handler errors, asynchronous callback
errors, or errors thrown by the boundary itself. Report those paths explicitly:

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

`captureReactError(telemetry, error, info)` is exported for custom class-based
boundaries that need the same constrained event format.

## Lifecycle and privacy

Call `telemetry.client.shutdown()` only during a controlled application teardown,
not from the Provider cleanup function. Shared context and error fields may be
printed when `debug.printEvents` is enabled, so keep Debug mode disabled in
production and avoid adding sensitive values to logs or context.
