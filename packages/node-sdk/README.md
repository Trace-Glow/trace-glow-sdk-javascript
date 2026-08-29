# @trace-glow-sdk/node

The public Trace Glow SDK package for Node.js services. Internal workspace
modules are bundled into this package, so consumers install only this package.

```ts
import { TraceGlow } from '@trace-glow-sdk/node';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: process.env.TRACE_GLOW_API_KEY!,
  projectId: 'checkout-api',
});
```

Runtime-specific options are configured through `instrumentation`.

Set `debug: { printEvents: true }` to print processed, queued events through
`console.debug` during local development. This option is disabled by default
and normal Collector delivery continues while it is enabled.
