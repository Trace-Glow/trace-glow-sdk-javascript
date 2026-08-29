# Next.js integration

`@trace-glow/next` supports Next.js 14-16 with two runtime entries:

| Entry | Runtime | Use from |
| --- | --- | --- |
| `@trace-glow/next` | Browser | Client Components and client providers |
| `@trace-glow/next/server` | Node.js | `instrumentation.ts`, Node Route Handlers, Node middleware |

These entries create separate SDK instances because browser and server code run
in different runtimes. Use a browser write key in client code and keep the
server write key in a server-only environment variable.

## Install

```sh
pnpm add @trace-glow/next
```

`next` and `react` are peer dependencies. The server entry is not supported in
the Edge runtime.

## App Router client setup

Create one client instance in a file marked `'use client'`. Keep it at module
scope so React StrictMode and route transitions do not install duplicate
instrumentation.

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

Mount it from the root layout. `layout.tsx` remains a Server Component; only
the provider file needs the client directive:

```tsx
// app/layout.tsx
import { Providers } from './providers';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
```

Use the SDK from a Client Component with `useTraceGlow()`:

```tsx
'use client';
import { useTraceGlow } from '@trace-glow/next';
export function CheckoutButton() {
  const telemetry = useTraceGlow();
  return <button onClick={() => telemetry.logger.info('checkout_started', { source: 'cart' })}>Checkout</button>;
}
```

The Hook throws outside `TraceGlowProvider`. React Error Boundaries do not catch
event-handler or async errors; capture those paths explicitly:

```ts
try { await submitOrder(); } catch (error) {
  telemetry.client.capture({ type: 'monitor', name: 'checkout.submit_failed', level: 'error',
    payload: { message: error instanceof Error ? error.message : String(error) } });
}
```

`TraceGlowErrorBoundary` captures client render and lifecycle failures as the
`next.component_error` monitor event. It accepts `fallback`, `fallbackRender`,
`onError`, and `onReset`; `captureReactError()` is available for custom
boundaries.

## App Router server setup

Create the Node instance once in the root `instrumentation.ts`. Next loads this
module during server startup, and `register()` waits for SDK startup:

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

Do not import this entry from a Client Component. Never expose the server key
through a `NEXT_PUBLIC_` variable.

### Route Handlers

Use the server singleton for manual events and force the Node runtime when the
route needs Node APIs:

```ts
// app/api/checkout/route.ts
import { telemetry } from '../../../instrumentation';
export const runtime = 'nodejs';
export async function POST() {
  telemetry.logger.info('checkout_request');
  return Response.json({ ok: true });
}
```

### Request middleware

`telemetry.middleware()` returns Connect-compatible Node middleware. It records
method, sanitized URL, status, duration, and request ID. Query strings are
excluded unless `includeUrlQuery: true` is explicitly set:

```ts
const requestTelemetry = telemetry.middleware({ requestIdHeader: 'x-request-id' });
```

Use this only in a Node server/framework adapter. Next Middleware running on
Edge cannot use `@trace-glow/next/server`.

## Pages Router

Mount the same client provider from `pages/_app.tsx`:

```tsx
import type { AppProps } from 'next/app';
import { Providers } from '../app/providers';
export default function App({ Component, pageProps }: AppProps) {
  return <Providers><Component {...pageProps} /></Providers>;
}
```

Use the server entry from Node-only API routes or a custom Node server, keeping
it out of browser bundles.

## Configuration and lifecycle

Both constructors accept the common fields in the [getting started guide](getting-started.md):
`projectId`, `environment`, `release`, queue limits, sampling, debug options,
and `logger`. The client uses browser `instrumentation`; the server uses Node
`instrumentation`:

| Option | Default | Behavior |
| --- | --- | --- |
| `runtimeMetrics` | `true` | CPU, memory, event-loop delay, and uptime metrics. |
| `metricsIntervalMs` | `30000` | Runtime metric interval in milliseconds. |
| `processErrors` | `true` | Observes uncaught exceptions without preventing process exit. |
| `unhandledRejections` | `false` | Observes unhandled rejections when explicitly enabled. |

Both constructors start immediately; await `ready` when ordering matters. The
Provider does not own lifecycle. Call `telemetry.client.shutdown()` only during
controlled teardown; it removes instrumentation and performs a final flush.
Delivery is at-least-once and may produce duplicates. In Serverless deployments,
keep the instance outside the request handler so warm invocations can reuse it.

## Privacy and common mistakes

The SDK does not collect request/response bodies, cookies, authorization
headers, query strings, URL fragments, or DOM text by default. Do not place
secrets in custom payloads, tags, extras, or debug output. Browser and server
instances have separate queues and context.

Avoid importing the server entry in Client Components or Edge functions,
creating an instance during every render/request, putting the server key in a
`NEXT_PUBLIC_` variable, expecting a React Error Boundary to catch server
errors, or calling `shutdown()` from Provider cleanup.
