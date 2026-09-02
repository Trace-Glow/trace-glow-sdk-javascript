# @trace-glow-internal/transport (private workspace package)

Fetch-based HTTP delivery with automatic gzip compression plus a browser Beacon
fallback for page shutdown.

## Runtime and dependencies

HTTP delivery runs in browsers and Node.js using Fetch. Beacon is browser-only
and may fall back to HTTP. Depends on `@trace-glow-internal/core`; public SDK
packages construct these transports.

## Usage and lifecycle

```ts
const transport = new HttpTransport({ endpoint, apiKey, compression: 'auto' });
```

Failed responses reject so core retry policy can apply. Beacon acceptance is not
Collector confirmation. Use project-scoped write keys only.
