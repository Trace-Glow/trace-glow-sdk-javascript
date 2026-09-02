import { TraceGlow } from '@trace-glow/browser';
import './style.css';

const config = {
  endpoint: import.meta.env.VITE_TRACE_GLOW_ENDPOINT ?? 'http://localhost:8080/v1/events',
  apiKey: import.meta.env.VITE_TRACE_GLOW_API_KEY ?? 'demo-browser-write-key',
  projectId: import.meta.env.VITE_TRACE_GLOW_PROJECT_ID ?? 'vanilla-demo',
  environment: 'development',
  debug: { printEvents: true },
};

const statusElement = document.querySelector('#status');
const logButton = document.querySelector('#log');
const spanButton = document.querySelector('#span');
const errorButton = document.querySelector('#error');

let telemetry;

function setStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

function captureLog() {
  if (!telemetry) return;
  telemetry.logger.info('demo.vanilla.log', { source: 'button' });
  setStatus('Log captured');
}

function createSpan() {
  if (!telemetry) return;
  const span = telemetry.client.startSpan('demo.vanilla.action');
  span.setAttribute('demo.action', 'button').setStatus('ok').end();
  setStatus('Span captured');
}

function throwDemoError() {
  throw new Error('Vanilla demo error');
}

try {
  telemetry = new TraceGlow(config);
  telemetry.ready.then(() => setStatus('SDK ready')).catch((error) => {
    setStatus(`SDK start failed: ${error.message}`);
  });
} catch (error) {
  setStatus(`SDK configuration failed: ${error.message}`);
}
logButton?.addEventListener('click', captureLog);
spanButton?.addEventListener('click', createSpan);
errorButton?.addEventListener('click', throwDemoError);
window.addEventListener('pagehide', () => {
  if (telemetry) void telemetry.client.shutdown();
});
