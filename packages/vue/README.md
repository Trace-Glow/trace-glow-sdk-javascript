# @trace-glow-internal/vue (private workspace package)

Private Vue 3 error-handler integration bundled into `@trace-glow/vue`.
Consumer applications should install the public package instead.

## Runtime and dependencies

Runs with Vue 3 and depends on `@trace-glow-internal/core` plus Vue as a peer
dependency. It is consumed by `@trace-glow/vue` only.

## Usage and lifecycle

```ts
app.use(new VuePlugin());
```

The plugin delegates to and restores the previous error handler during teardown
without changing host error semantics. Props, DOM text, bodies, cookies, and
authorization headers are not collected automatically.
