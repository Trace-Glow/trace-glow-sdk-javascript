# @trace-glow-internal/core (private workspace package)

Runtime-neutral lifecycle, plugin, event, batching, sampling, and retry APIs for
Trace Glow SDK packages.

## Runtime and dependencies

Runs in browsers, Node.js, and framework adapters without runtime-specific
imports. It has no browser, Node, framework, or transport dependency; every
public package bundles it.

## Usage and lifecycle

```ts
const client = new TelemetryClient({ projectId: 'project', transport });
client.capture({ type: 'log', name: 'checkout.started' });
await client.shutdown();
```

Capture isolates failures, applies processors and sampling, bounds memory, and
shutdown flushes pending events. Delivery is at-least-once.
