# @trace-glow-internal/browser (private workspace package)

Browser error, rejected promise, resource, performance, Fetch, and XHR
instrumentation. Sensitive request headers and bodies are never collected.

## Runtime and dependencies

Runs in browsers and is safe to import during SSR. Depends on
`@trace-glow-internal/core` and `web-vitals`; consumed by browser, React, Vue,
and Next.js browser packages.

## Usage and lifecycle

```ts
client.use(new BrowserPlugin({ performance: true, fetch: true }));
await client.start();
```

Shutdown restores global APIs and listeners. Bodies, cookies, authorization
headers, query strings, fragments, and DOM text are excluded by default.
