# Trace Glow SDK architecture

## Goals

Trace Glow collects JavaScript monitoring events and structured logs without
changing application behavior when the collector is slow or unavailable. The
SDK is designed for public npm distribution, tree shaking, browser/Node runtime
isolation, and future OTLP interoperability.

The first release covers SDK-side collection and delivery. SDK telemetry is
received by `trace-glow-collector-server`; platform APIs, management, querying,
and alert evaluation are owned by `trace-glow-platform-server`. The Next.js
`trace-glow-platform` application consumes the platform server. These services
consume the event envelope defined by the [Trace Glow contracts repository](https://github.com/Trace-Glow/trace-glow-contracts).

## Package boundaries

| Workspace package | Responsibility | Publication |
| --- | --- | --- |
| `@trace-glow-internal/core` | lifecycle, plugin API, generated contract types, bounded queue, batching, sampling, retry | private, bundled |
| `@trace-glow-internal/context` | user, tags, environment, release and correlation context | private, bundled |
| `@trace-glow-internal/transport` | Fetch HTTP, gzip, and browser Beacon delivery | private, bundled |
| `@trace-glow-internal/logger` | structured logger and severity filtering | private, bundled |
| `@trace-glow-internal/browser` | errors, rejected promises, resource failures, performance, fetch and XHR | private, bundled |
| `@trace-glow-internal/vue` | Vue application error-handler installation, delegation and teardown | private, bundled |
| `@trace-glow-internal/node` | process failures, runtime metrics, HTTP middleware and framework adapters | private, bundled |
| `@trace-glow/browser` | self-contained public browser SDK | public npm package |
| `@trace-glow/react` | browser SDK with React Provider, Hook, and ErrorBoundary | public npm package; React peer |
| `@trace-glow/next` | client React integration plus Node server entry for Next.js | public npm package; Next.js and React peers |
| `@trace-glow/vue` | self-contained public Vue 3 SDK; Vue is a peer dependency | public npm package |
| `@trace-glow/node` | self-contained public Node.js SDK | public npm package |

Dependencies point inward: runtime plugins may depend on core, but core never
imports a runtime plugin. All public packages expose the same `TraceGlow` class
and common configuration shape, while their package entry points and runtime
bundles remain isolated. The public packages bundle their private implementation
modules and declarations, so their npm tarballs have no runtime dependency on
unpublished workspace packages.

The React package follows the browser isolation boundary and bundles the same
private browser modules. React is externalized and declared as a peer dependency
so Context and Hooks always use the consuming application's single React
instance. `TraceGlowProvider` only distributes an existing SDK instance; it does
not create or shut one down during React StrictMode remounts.

## Event envelope

JSON Schema Draft 2020-12 in `trace-glow-contracts` is the source of truth for
`TelemetryEvent`, standard `Envelope`, and `BeaconRequest`. This repository
stores a versioned Schema snapshot under `contracts/v1/`, records its SHA-256
source hash, and generates the core TypeScript types from that snapshot. The
snapshot keeps SDK builds reproducible without introducing a runtime dependency
on another repository.

For AI work, the sibling local `../trace-glow-contracts/context/` directory is
the source of shared system context. The local `AGENTS.md` instructs agents to
read one pinned contracts commit plus the SDK-specific context document before
making cross-repository assumptions, and to compare the local commit with
`origin/main` when checking for remote updates.

Every event contains `id`, `timestamp`, `type`, `name`, `level`, SDK identity,
project/environment/release metadata, optional correlation identifiers, and a
JSON-safe payload. Unknown fields are not promoted to top-level indexed fields.

Trace events may additionally carry `spanId`, `parentSpanId`, `spanKind`,
`spanStatus`, `startTimestamp`, `durationMs`, and bounded JSON-safe attributes.
The SDK exposes explicit spans first; automatic runtime propagation is added by
later tracing integration work.

The Collector should deduplicate by `(projectId, id)`, use `timestamp` as event
time, add a server receive time, reject oversized payloads, and treat delivery
as at-least-once. The schema carries a version so
`trace-glow-collector-server` can support rolling SDK upgrades.

## Lifecycle and failure model

1. `start()` sets up plugins and begins periodic flushing.
2. `capture()` normalizes an event, applies processors and sampling, then adds it
   to a bounded queue.
3. A size or time threshold drains one batch to the configured transport.
4. Transient failures retry with exponential backoff and jitter. A failed final
   attempt restores the batch only while queue capacity remains.
5. `shutdown()` tears down plugins and performs one final bounded flush.

SDK exceptions are reported through `onInternalError` and never thrown into the
host application's event path. Queue overflow drops the oldest event and emits
an internal diagnostic count. Events larger than 64 KiB are dropped by default;
the limit is configurable but prevents one accidental payload from consuming the
entire host process budget.

## Security and privacy defaults

- Request/response bodies, cookies, authorization headers, and DOM text are not
  collected by default.
- URLs have query strings and fragments removed unless explicitly enabled.
- User context is opt-in; applications should prefer an internal identifier.
- API keys used by browser SDKs are project write keys, never administrative
  secrets. Collector-side origin controls, rate limits, and quotas remain
  mandatory.
- Event processors provide a final customer-controlled redaction point.

## Release strategy

The workspace uses pnpm and Changesets. The five public packages are versioned as
a linked group during the initial contract-development period. Each public
package publishes ESM, CommonJS, bundled declarations, source maps, and only its
`dist` and documentation. CI must run `typecheck`, `test`, `build`, and pack all
five public packages to a temporary directory before npm publishing with provenance.
`dist` and documentation. CI must run `typecheck`, `test`, `build`, and pack all three
public packages to a temporary directory before npm publishing with provenance.

## Delivery phases

### Phase 1: usable collection loop

- Stable event and plugin contracts
- Browser error/performance/network collection
- Vue component error collection with existing-handler delegation
- Node process/runtime collection and HTTP middleware
- Context, structured logging, HTTP/Beacon transport
- Bounded batching, sampling, retry, shutdown and tests

### Phase 2: production hardening

- Remote configuration and emergency kill switch
- Deterministic per-user and rule-based sampling
- Compression negotiation and server clock-skew feedback
- Express, Koa and Nest packages tested against their actual peer versions
- Sourcemap upload CLI and release artifact association

### Phase 3: ecosystem compatibility

- OTLP exporter and semantic convention mapping
- Framework-specific auto-instrumentation packages
- Offline browser persistence with strict storage quotas
- Signed configuration and key rotation support

## Explicit non-goals for Phase 1

The SDK does not persist telemetry to disk, capture request bodies, patch every
third-party framework, guarantee exactly-once delivery, or implement server-side
alerting. These omissions keep the host application impact predictable.
