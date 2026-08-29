# @trace-glow/next

Next.js integration for Trace Glow. The root entry is client-safe and provides
the browser SDK plus React Provider, Hook, and Error Boundary. The `./server`
subpath is for Node runtime `instrumentation.ts`, route handlers, and request
middleware; it is never imported by Client Components.

```tsx
// app/providers.tsx
'use client';
import { TraceGlow, TraceGlowProvider } from '@trace-glow/next';

const telemetry = new TraceGlow({ endpoint: 'https://collector.example/v1/events', apiKey: 'write-key', projectId: 'web-app' });
export function Providers({ children }: { children: React.ReactNode }) {
  return <TraceGlowProvider telemetry={telemetry}>{children}</TraceGlowProvider>;
}
```

```ts
// instrumentation.ts (Node runtime)
import { NextServerTraceGlow } from '@trace-glow/next/server';
export const telemetry = new NextServerTraceGlow({ endpoint: process.env.TRACE_GLOW_ENDPOINT!, apiKey: process.env.TRACE_GLOW_API_KEY!, projectId: 'web-app' });
export async function register() { await telemetry.ready; }
```

The package keeps `next` and `react` as peer dependencies and does not include
request bodies, cookies, authorization headers, query strings, fragments, or
DOM text by default.

See the complete [Next.js integration guide](../../docs/en/next.md) for App
Router, Pages Router, `instrumentation.ts`, Route Handlers, middleware,
lifecycle, and privacy guidance.
