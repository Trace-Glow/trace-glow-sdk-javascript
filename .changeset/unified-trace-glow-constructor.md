---
'@trace-glow-sdk/browser': minor
'@trace-glow-sdk/node': minor
---

Replace the runtime-specific factory functions with the unified `new TraceGlow(config)` API. Runtime-specific options now use the shared `instrumentation` configuration key.
