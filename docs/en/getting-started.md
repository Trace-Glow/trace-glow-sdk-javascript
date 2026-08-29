# Getting started

## Browser

```ts
import { TraceGlow } from '@trace-glow-sdk/browser';

const telemetry = new TraceGlow({
  apiKey: 'browser-write-key',
  endpoint: 'https://collector.example.com/v1/events',
  projectId: 'web-store',
  environment: 'production',
  release: 'web-store@1.4.0',
});

telemetry.context.setUser({ id: 'internal-user-id' });
telemetry.logger.info('checkout_started', { cartSize: 3 });
```

The constructor starts automatically. Call `telemetry.client.shutdown()` during a
controlled teardown when the environment provides one.

## Node.js

```ts
import { TraceGlow, createExpressMiddleware } from '@trace-glow-sdk/node';

const telemetry = new TraceGlow({
  apiKey: process.env.TRACE_GLOW_API_KEY!,
  endpoint: 'https://collector.example.com/v1/events',
  projectId: 'checkout-api',
  environment: process.env.NODE_ENV ?? 'production',
  ...(process.env.APP_VERSION ? { release: process.env.APP_VERSION } : {}),
});

app.use(createExpressMiddleware(telemetry.client, {
  requestContext: telemetry.requestContext,
}));
telemetry.logger.info('service_started');

process.on('SIGTERM', async () => {
  await telemetry.client.shutdown();
  process.exit(0);
});
```

## Configuration reference

### Common client options

Both public packages expose `new TraceGlow(config)`. Common option names are
identical; only the fields inside `instrumentation` are runtime-specific.

| Option | Type | Required / default | Purpose |
| --- | --- | --- | --- |
| `endpoint` | `string` | Required | Absolute collector event endpoint. Delivery requests are sent here with `POST`. |
| `apiKey` | `string` | Required | Project write key used by the collector to authenticate ingestion. Browser keys must be restricted write keys because users can inspect them. |
| `projectId` | `string` | Required | Project identifier attached to every event for tenant routing and querying. |
| `environment` | `string` | Optional | Deployment name such as `production`, `staging`, or `development`. |
| `release` | `string` | Optional | Deployable version such as a Git SHA or `service@1.4.0`, used to associate regressions with releases. |
| `sampleRate` | `number` | `1` | Probability from `0` to `1` that each event is retained. `0` drops all events and `1` keeps all events. |
| `batchSize` | `number` | `50` | Maximum events sent in one collector request. Reaching this count triggers a flush. |
| `maxQueueSize` | `number` | `1000` | Maximum events held in memory. When full, the oldest event is dropped to keep memory bounded. |
| `maxEventSizeBytes` | `number` | `65536` | Maximum UTF-8 size of one fully processed event. Larger events are dropped before queueing. |
| `flushIntervalMs` | `number` | `5000` | Periodic interval in milliseconds for sending queued events. |
| `requestTimeoutMs` | `number` | `10000` | Millisecond deadline for one batch's complete delivery sequence, including retries. |
| `retry` | `RetryConfig` | See below | Overrides exponential retry behavior for transient delivery failures. |
| `debug` | `DebugOptions` | Disabled | Controls opt-in local diagnostic output without replacing Collector delivery. |
| `onInternalError` | `(error: Error) => void` | Optional | Receives isolated SDK or transport diagnostics. Exceptions thrown by this callback are suppressed. |
| `onDrop` | `(count, reason) => void` | Optional | Reports events discarded because of `queue_full`, `sampled`, `invalid`, or `oversized`. |
| `instrumentation` | `BrowserPluginOptions` or `NodePluginOptions` | Optional | Controls runtime-specific instrumentation while keeping the outer configuration shape identical. |
| `logger` | `LoggerOptions` | Optional | Sets the default log severity, context, and fields. |

All numeric limits except retry delays must be positive integers. An invalid
required value or resource limit causes constructor execution to throw.

### Retry options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `attempts` | `number` | `3` | Total delivery attempts, including the initial request. Must be a positive integer. |
| `baseDelayMs` | `number` | `250` | Initial exponential backoff delay in milliseconds. Must be non-negative. |
| `maxDelayMs` | `number` | `5000` | Maximum backoff delay in milliseconds. Must be at least `baseDelayMs`. |

Delivery is at least once. A failed batch is restored to the front of the
bounded queue after retries are exhausted, so the collector should deduplicate
events by event ID.

### Debug options

Pass these fields through the `debug` property in either public package.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `printEvents` | `boolean` | `false` | Prints each processed event that successfully enters the bounded queue with `console.debug('[TraceGlow] event', event)`. Normal batching and Collector delivery continue unchanged. |

```ts
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'project-write-key',
  projectId: 'local-debug',
  debug: {
    printEvents: true,
  },
});
```

The printed object includes merged shared and request context and is emitted once
when the event enters the queue. It is not a delivery acknowledgement and is not
printed again during retries. Because explicitly supplied user or application
fields can appear in the output, enable it only in a trusted local console and
leave it disabled in production.

### Browser options

Pass these fields through the `instrumentation` property of the browser package.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `errors` | `boolean` | `true` | Captures global JavaScript errors. Unhandled Promise rejections are also observed by the global error instrumentation. |
| `resources` | `boolean` | `true` | Captures failed image, script, and stylesheet loads without collecting DOM text. |
| `performance` | `boolean` | `true` | Captures supported LCP, layout shift, and long-task performance entries. |
| `fetch` | `boolean` | `true` | Instruments global Fetch duration, status, and failures while preserving application behavior. |
| `xhr` | `boolean` | `true` | Instruments `XMLHttpRequest` duration and status. |
| `includeUrlQuery` | `boolean` | `false` | Retains URL query strings. Leave disabled unless query data has been reviewed for sensitive values. URL fragments remain excluded by default. |
| `ignoreUrls` | `readonly (string \| RegExp)[]` | `[]` | Excludes matching URL prefixes or regular expressions from Fetch/XHR telemetry. The configured collector endpoint is always added automatically. |

Example:

```ts
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
  sampleRate: 0.25,
  instrumentation: {
    performance: true,
    includeUrlQuery: false,
    ignoreUrls: ['/health', /^https:\/\/analytics\.example\.com\//],
  },
  logger: { minimumLevel: 'info' },
});
```

### Node.js options

Pass these fields through the `instrumentation` property of the Node.js package.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `runtimeMetrics` | `boolean` | `true` | Periodically captures CPU utilization, memory, event-loop delay, and process uptime. |
| `metricsIntervalMs` | `number` | `30000` | Interval in milliseconds between runtime metric snapshots. |
| `processErrors` | `boolean` | `true` | Observes uncaught exceptions through `uncaughtExceptionMonitor` without preventing Node.js from exiting normally. |
| `unhandledRejections` | `boolean` | `false` | Adds an `unhandledRejection` listener. It is opt-in because adding the listener changes Node.js default process behavior. |

### Logger options

Pass these fields through the `logger` property.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `minimumLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'` | Drops log calls below this severity before they enter the telemetry queue. |
| `context` | `TelemetryContext` | None | Fixed user, tag, extra, or correlation context attached to every record from this logger. |
| `fields` | `Record<string, unknown>` | None | Fixed structured fields merged into each log payload. Fields passed to an individual log call take precedence. |

Logger methods accept a stable message name and optional structured fields, for
example `logger.warn(message, fields)`. `logger.child(fields)` creates an
independent child logger with additional fixed fields.

### Node.js HTTP middleware options

`createHttpMiddleware`, `createExpressMiddleware`, `createKoaMiddleware`, and
`createNestMiddleware` accept the following second argument:

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `requestContext` | `NodeRequestContext` | None | Propagates the request ID through `AsyncLocalStorage` so logs and manual events created during the request inherit it. Pass `telemetry.requestContext` from the `TraceGlow` instance. |
| `requestIdHeader` | `string` | `'x-request-id'` | Incoming header to reuse and response header to emit. A UUID is generated when the incoming value is absent. |
| `includeUrlQuery` | `boolean` | `false` | Retains request query strings in HTTP telemetry. Leave disabled unless query data has been reviewed for sensitive values. |

## Returned handles and context parameters

Both runtime classes expose `client`, `context`, `logger`, and `ready`. The
Node.js class additionally exposes `requestContext`.

| API | Parameter purpose |
| --- | --- |
| `context.setUser(user)` | Replaces shared user identity. Prefer an internal stable `id`; passing `null` clears the user. `email`, `username`, and custom JSON-safe fields are optional and require an explicit privacy decision. |
| `context.setTag(key, value)` | Adds a low-cardinality searchable label such as region or plan. |
| `context.setExtra(key, value)` | Adds JSON-safe diagnostic data that is not intended as an indexed tag. |
| `context.setCorrelation({ traceId, requestId, sessionId })` | Adds non-empty identifiers used to correlate events. |
| `context.clear()` | Removes all shared user, tag, extra, and correlation context. |
| `client.capture(input)` | Queues a manual event. `type` and `name` are required; `level` defaults to `info`; `timestamp`, event-local `context`, and `payload` are optional. |
| `client.flush()` | Waits for pending processing and attempts immediate delivery of the current queue. |
| `client.shutdown()` | Stops collection, removes instrumentation, and performs a final flush. |
| `ready` | Promise that resolves after plugin setup. Await it when application startup must not proceed before initialization completes. |

## Custom composition

The public packages re-export the supported lower-level APIs required for custom
composition. Construct `TelemetryClient` directly when custom transport,
context, or plugin behavior is required. Register plugins before `start()` and
use an event processor for final redaction. Private `@trace-glow/*` workspace
packages are implementation details and are not published.
