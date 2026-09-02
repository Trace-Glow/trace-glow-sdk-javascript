import { createServer } from 'node:http';
import { TraceGlow, createHttpMiddleware } from '@trace-glow/node';

const telemetry = new TraceGlow({
  endpoint: process.env.TRACE_GLOW_ENDPOINT ?? 'http://localhost:8080/v1/events',
  apiKey: process.env.TRACE_GLOW_API_KEY ?? 'demo-server-write-key',
  projectId: process.env.TRACE_GLOW_PROJECT_ID ?? 'node-demo',
  environment: 'development',
  instrumentation: { runtimeMetrics: true },
});

const middleware = createHttpMiddleware(telemetry.client);
const server = createServer((request, response) => {
  middleware(request, response, () => {
    if (request.url === '/error') {
      telemetry.logger.error('demo.node.error');
      response.statusCode = 500;
      response.end('error');
      return;
    }

    telemetry.logger.info('demo.node.request', { method: request.method });
    response.end('Trace Glow Node demo; runtime metrics and inbound HTTP spans are enabled.');
  });
});

server.listen(3000, () => {
  console.log('Node demo listening on http://localhost:3000');
});

process.on('SIGTERM', async () => {
  await telemetry.client.shutdown();
  server.close();
});
