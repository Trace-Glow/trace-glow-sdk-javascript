# @trace-glow/browser

The public Trace Glow SDK package for browser applications. Internal workspace
modules are bundled into this package, so consumers install only this package.

```ts
import { TraceGlow } from '@trace-glow/browser';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
});
```

Runtime-specific options are configured through `instrumentation`.

Set `debug: { printEvents: true }` to print processed, queued events through
`console.debug` during local development. This option is disabled by default
and normal Collector delivery continues while it is enabled.
