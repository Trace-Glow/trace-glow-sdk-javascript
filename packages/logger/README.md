# @trace-glow-internal/logger (private workspace package)

Structured, severity-filtered logging that emits Trace Glow log events.

## Runtime and dependencies

Runtime-neutral browser and Node.js facade depending on
`@trace-glow-internal/core`; bundled by all public SDK packages.

## Usage and lifecycle

```ts
const logger = new Logger(client, { minimumLevel: 'info' });
logger.info('checkout.started', { cartSize: 2 });
```

Records use the bounded queue and shutdown flush. Caller fields must not contain
secrets, tokens, cookies, bodies, authorization values, or unrestricted PII.
