# @trace-glow-internal/context (private workspace package)

Mutable global context and scoped correlation context for Trace Glow events.

## Runtime and dependencies

Runtime-neutral browser and Node.js plugin depending only on
`@trace-glow-internal/core`; all public SDK packages consume it.

## Usage and lifecycle

```ts
const context = new ContextManager();
client.use(context);
context.setTag('feature', 'checkout');
```

Changes affect subsequent events and shutdown clears stored state. Do not place
secrets, tokens, cookies, bodies, or authorization credentials in context.
