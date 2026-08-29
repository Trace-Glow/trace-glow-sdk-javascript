# Trace Glow SDK architecture

## Goals

Trace Glow collects JavaScript monitoring events and structured logs without
changing application behavior when the collector is slow or unavailable. The
SDK is designed for public npm distribution, tree shaking, browser/Node runtime
isolation, and future OTLP interoperability.

The first release covers SDK-side collection and delivery. Server ingestion,
storage, querying, and alert evaluation are separate repositories and consume
the event envelope defined here.

## Package boundaries

| Workspace package | Responsibility | Publication |
| --- | --- | --- |
| `@trace-glow/core` | lifecycle, plugin API, event contract, bounded queue, batching, sampling, retry | private, bundled |
| `@trace-glow/context` | user, tags, environment, release and correlation context | private, bundled |
| `@trace-glow/transport` | Fetch HTTP, gzip, and browser Beacon delivery | private, bundled |
| `@trace-glow/logger` | structured logger and severity filtering | private, bundled |
| `@trace-glow/browser` | errors, rejected promises, resource failures, performance, fetch and XHR | private, bundled |
| `@trace-glow/node` | process failures, runtime metrics, HTTP middleware and framework adapters | private, bundled |
| `@trace-glow-sdk/browser` | self-contained public browser SDK | public npm package |
| `@trace-glow-sdk/node` | self-contained public Node.js SDK | public npm package |

Dependencies point inward: runtime plugins may depend on core, but core never
imports a runtime plugin. Both public packages expose the same `TraceGlow` class
and common configuration shape, while their package entry points and runtime
bundles remain isolated. The public packages bundle their private implementation
modules and declarations, so their npm tarballs have no runtime dependency on
unpublished workspace packages.

## Event envelope

Every event contains `id`, `timestamp`, `type`, `name`, `level`, SDK identity,
project/environment/release metadata, optional correlation identifiers, and a
JSON-safe payload. Unknown fields are not promoted to top-level indexed fields.

The collector should deduplicate by `(projectId, id)`, use `timestamp` as event
time, add a server receive time, reject oversized payloads, and treat delivery
as at-least-once. The schema carries a version so the server can support rolling
SDK upgrades.

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

The workspace uses pnpm and Changesets. The two public packages are versioned as
a linked group during the initial contract-development period. Each public
package publishes ESM, CommonJS, bundled declarations, source maps, and only its
`dist` and documentation. CI must run `typecheck`, `test`, `build`, and pack both
public packages to a temporary directory before npm publishing with provenance.

## Delivery phases

### Phase 1: usable collection loop

- Stable event and plugin contracts
- Browser error/performance/network collection
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
