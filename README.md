# Trace Glow JavaScript SDK

[English](README.md) | [简体中文](README.zh-CN.md)

Collect browser, React, Vue, Next.js, and Node.js errors, runtime signals, HTTP timing, and structured
logs, then deliver them to a Trace Glow collector through a bounded,
failure-isolated pipeline.

[Getting started](docs/en/getting-started.md) ·
[Architecture](docs/en/architecture.md) ·
[Local development](docs/en/local-development.md) ·
[简体中文文档](docs/zh-CN/README.md)

> [!IMPORTANT]
> This repository contains the JavaScript collection and delivery SDK. A Trace
> Glow collector endpoint is required to ingest its event envelope. Storage,
> querying, the management platform, and alert evaluation live in separate
> repositories.

## Why Trace Glow

- **One package per runtime.** Install the browser, React, Vue, Next.js, or Node.js SDK; shared
  implementation modules are bundled and never become consumer dependencies.
- **One constructor everywhere.** Browser, React, Vue, and Node.js applications start
  with `new TraceGlow(config)`, with runtime-specific choices isolated under
  `instrumentation`.
- **Useful defaults.** Error collection, runtime instrumentation, structured
  logging, context, batching, sampling, retry, and final flushing are composed
  by the constructor.
- **Bounded overhead.** Queue length, event size, batch size, retries, and
  request duration all have explicit limits.
- **Host application safety.** Runtime collection and delivery failures are
  isolated from application control flow and exposed through an optional
  diagnostic callback.
- **Privacy-conscious collection.** Request and response bodies, cookies,
  authorization headers, URL query strings, fragments, and DOM text are not
  collected by default.

## Install

Choose the package for the runtime you need:

```sh
# Browser applications
pnpm add @trace-glow/browser

# React applications
pnpm add @trace-glow/react

# Next.js applications
pnpm add @trace-glow/next

# Vue 3 applications
pnpm add @trace-glow/vue

# Node.js services
pnpm add @trace-glow/node
```

The same package names can be used with `npm install` or `yarn add`.

## Quick start

### Browser

```ts
import { TraceGlow } from '@trace-glow/browser';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  environment: 'production',
  release: 'web-store@1.4.0',
});

telemetry.context.setUser({ id: 'internal-user-id' });
telemetry.logger.info('checkout_started', { cartSize: 3 });
```

Browser instrumentation starts automatically. The collector URL is excluded
from Fetch and XHR instrumentation to prevent recursive telemetry.

### React

```tsx
import {
  TraceGlow,
  TraceGlowErrorBoundary,
  TraceGlowProvider,
} from '@trace-glow/react';
```

The React package includes all browser instrumentation and reports component
errors as `react.component_error`. React 18 or 19 is required as a peer
dependency. See the [React integration guide](docs/en/react.md) for hooks,
fallback rendering, reset behavior, and lifecycle ownership.

### Vue 3

```ts
import { createApp } from 'vue';
import { TraceGlow } from '@trace-glow/vue';
import App from './App.vue';

const app = createApp(App);
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  environment: 'production',
});

app.use(telemetry);
app.mount('#app');
```

Browser instrumentation starts during construction. `app.use(telemetry)` adds
Vue component error capture while preserving an existing app error handler.

### Node.js

```ts
import {
  createExpressMiddleware,
  TraceGlow,
} from '@trace-glow/node';

const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: process.env.TRACE_GLOW_API_KEY!,
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

The middleware reuses or creates an `x-request-id`, returns it in the response,
and propagates it through `AsyncLocalStorage` when `requestContext` is supplied.
Adapters for Node HTTP, Express, Koa, and Nest are included without framework
runtime dependencies.

See the [configuration reference](docs/en/getting-started.md#configuration-reference)
for every option, default value, callback, and context API. The equivalent
[Chinese reference](docs/zh-CN/getting-started.md#配置参数说明) is maintained in
parallel.

For local event inspection, enable the same debug option in any runtime:

```ts
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'project-write-key',
  projectId: 'local-debug',
  debug: { printEvents: true },
});
```

Accepted events are printed with `console.debug` after context and processors
have been applied. Debug output is disabled by default and does not stop normal
Collector delivery. See the configuration reference for delivery and privacy
details.

## What is collected

| Runtime | Default instrumentation |
| --- | --- |
| Browser | JavaScript errors, unhandled Promise rejections, console errors/warnings, bounded breadcrumbs, failed resources, supported LCP/layout-shift/long-task entries, Fetch, and XHR |
| React | All browser signals plus component errors captured by `TraceGlowErrorBoundary` |
| Node.js | Uncaught exception monitoring, CPU, memory, event-loop delay, uptime, and HTTP request timing through middleware |
| All runtimes | Structured severity-filtered logs, user/tag/extra context, release/environment metadata, and correlation IDs |
| Vue 3 | Browser instrumentation plus component render, setup, lifecycle, watcher, directive, and event-handler errors observed by Vue |
| Node.js | Uncaught exception monitoring, CPU, memory, event-loop delay, uptime, and HTTP request timing through middleware |
| All | Structured severity-filtered logs, user/tag/extra context, release/environment metadata, and correlation IDs |

Node.js unhandled rejection observation is opt-in because installing that
listener changes default process behavior. URL query collection is also opt-in
and should only be enabled after a privacy review.

## Reliability model

Trace Glow uses at-least-once delivery semantics:

1. Events are normalized, sampled, processed, and checked against the byte limit.
2. A bounded FIFO queue batches accepted events in capture order.
3. Failed delivery is retried with capped exponential backoff and jitter.
4. A batch that exhausts retries is restored to the front of the queue.
5. Queue overflow drops the oldest event and can be observed through `onDrop`.
6. `shutdown()` removes instrumentation and attempts a final flush.

At-least-once delivery can produce duplicates. Collectors should deduplicate by
the client-generated event ID; the SDK does not claim exactly-once delivery.

## Packages

Five packages are public:

| Package | Runtime | Description |
| --- | --- | --- |
| [`@trace-glow/browser`](packages/browser-sdk) | Modern browsers | Self-contained browser SDK with instrumentation, context, logging, and HTTP/Beacon transports |
| [`@trace-glow/react`](packages/react-sdk) | React 18/19 | Browser SDK plus Provider, Hook, and component ErrorBoundary; React remains a peer dependency |
| [`@trace-glow/next`](packages/next-sdk) | Next.js 14-16 | Client React integration plus Node server entry; Next.js and React remain peer dependencies |
| [`@trace-glow/vue`](packages/vue-sdk) | Vue 3 | Self-contained Vue SDK with browser instrumentation and component error capture; Vue remains a peer dependency |
| [`@trace-glow/node`](packages/node-sdk) | Node.js 18+ | Self-contained server SDK with process metrics, request context, logging, and HTTP/framework middleware |

The packages under `packages/core`, `packages/context`, `packages/transport`,
`packages/logger`, `packages/browser`, `packages/vue`, and `packages/node` are private
implementation boundaries. They are bundled into the public JavaScript and
declaration output and must not be installed directly.

For dependency direction, event flow, privacy boundaries, and repository
ownership, read the [architecture guide](docs/en/architecture.md).

## Compatibility and status

- The public packages currently use a pre-1.0 version. Public APIs may change
  before `1.0.0`; review Changesets and release notes when upgrading.
- Node.js `18` and later are supported.
- Browser output targets ES2022 and requires a modern Fetch-capable browser.
  Applications targeting older browsers must provide the required transpilation
  and polyfills.
- All five public packages provide ESM, CommonJS, source maps, and TypeScript
  declarations.

## Development

This repository is a TypeScript workspace managed with pnpm:

```sh
pnpm install
pnpm verify:push
```

`pnpm verify:push` runs linting, strict TypeScript checks, every package build,
and the unit test suite. Dependency installation configures the same command as
a Git `pre-push` hook.

Commit messages follow Conventional Commits and are checked by a `commit-msg`
hook. See the [local development guide](docs/en/local-development.md#commit-message-convention)
for accepted types and examples.

For consumer-app debugging, use the documented
[local linking and tarball workflows](docs/en/local-development.md). Publishing
uses Changesets and linked versions for the five public packages; see the
[publishing guide](docs/en/publishing.md) before preparing a release.

Repository changes must follow [AGENTS.md](AGENTS.md), including synchronized
English and Simplified Chinese documentation and Simplified Chinese code
comments.

## License

[MIT](LICENSE) © Trace Glow contributors
### Next.js

The Next.js package provides a client-safe React integration at
`@trace-glow/next` and a Node runtime entry at `@trace-glow/next/server` for
`instrumentation.ts`, route handlers, and request middleware. See the
[Next.js integration guide](docs/en/next.md).
