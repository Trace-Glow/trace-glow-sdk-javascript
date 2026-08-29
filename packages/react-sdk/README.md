# @trace-glow/react

The public Trace Glow SDK for React 18 and 19 applications. It bundles the
browser telemetry implementation while keeping `react` as a peer dependency.

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
});

root.render(
  <TraceGlowProvider telemetry={telemetry}>
    <TraceGlowErrorBoundary fallback={<p>Something went wrong.</p>}>
      <App />
    </TraceGlowErrorBoundary>
  </TraceGlowProvider>,
);
```

Use `useTraceGlow()` inside the provider for context and structured logging.
The provider does not own the SDK lifecycle; call
`telemetry.client.shutdown()` during a controlled application teardown.
