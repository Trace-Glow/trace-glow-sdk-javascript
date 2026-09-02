import { TraceGlow } from '@trace-glow/browser';
import './style.css';

const config = {
  endpoint: import.meta.env.VITE_TRACE_GLOW_ENDPOINT,
  apiKey: import.meta.env.VITE_TRACE_GLOW_API_KEY,
  projectId: import.meta.env.VITE_TRACE_GLOW_PROJECT_ID,
  environment: 'development',
  debug: { printEvents: true },
};

const telemetry = new TraceGlow(config);
const statusElement = document.querySelector('#status');
const logButton = document.querySelector('#log');
const spanButton = document.querySelector('#span');
const errorButton = document.querySelector('#error');

function setStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

function captureLog() {
  telemetry.logger.info('demo.vanilla.log', { source: 'button' });
  setStatus('Log captured');
}

function createSpan() {
  const span = telemetry.client.startSpan('demo.vanilla.action');
  span.setAttribute('demo.action', 'button').setStatus('ok').end();
  setStatus('Span captured');
}

function throwDemoError() {
  throw new Error('Vanilla demo error');
}

telemetry.ready.then(() => setStatus('SDK ready'));
logButton?.addEventListener('click', captureLog);
spanButton?.addEventListener('click', createSpan);
errorButton?.addEventListener('click', throwDemoError);
window.addEventListener('pagehide', () => void telemetry.client.shutdown());
