# @trace-glow-internal/node (private workspace package)

Node.js process/runtime monitoring, async request correlation, and middleware
compatible with Node HTTP, Express, Koa, and Nest middleware consumers.

Unhandled rejection monitoring is opt-in because attaching a listener changes
Node.js default rejection behavior. Uncaught exceptions use
`uncaughtExceptionMonitor`, which preserves the process exit behavior.

## Runtime and dependencies

Requires Node.js 18 or newer and uses Node built-ins plus
`@trace-glow-internal/core`. It has no Express, Koa, or Nest runtime
dependency; `@trace-glow/node` and the Next.js server entry consume it.

## Usage and lifecycle

```ts
client.use(new NodePlugin({ runtimeMetrics: true }));
app.use(createExpressMiddleware(client));
```

AsyncLocalStorage provides request correlation. Middleware preserves downstream
return values, errors, and response behavior. URLs are sanitized by default;
bodies, cookies, authorization headers, and query strings are excluded.
