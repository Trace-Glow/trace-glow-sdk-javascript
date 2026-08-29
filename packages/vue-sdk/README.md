# @trace-glow-sdk/vue

The public Trace Glow SDK package for Vue 3 applications. Internal workspace
modules are bundled; Vue remains a peer dependency.

```ts
import { createApp } from 'vue';
import { TraceGlow } from '@trace-glow-sdk/vue';
import App from './App.vue';

const app = createApp(App);
const telemetry = new TraceGlow({
  endpoint: 'https://collector.example.com/v1/events',
  apiKey: 'browser-write-key',
  projectId: 'web-store',
});

app.use(telemetry);
app.mount('#app');
```

`new TraceGlow(config)` starts browser monitoring immediately. `app.use()` adds
Vue component error capture while preserving an existing Vue error handler.
