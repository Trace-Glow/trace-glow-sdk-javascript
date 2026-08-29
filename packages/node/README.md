# @trace-glow/node (private workspace package)

Node.js process/runtime monitoring, async request correlation, and middleware
compatible with Node HTTP, Express, Koa, and Nest middleware consumers.

Unhandled rejection monitoring is opt-in because attaching a listener changes
Node.js default rejection behavior. Uncaught exceptions use
`uncaughtExceptionMonitor`, which preserves the process exit behavior.
