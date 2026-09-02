import { TraceGlow } from '@trace-glow/browser';
import './style.css';

const telemetry = new TraceGlow({ endpoint: import.meta.env.VITE_TRACE_GLOW_ENDPOINT, apiKey: import.meta.env.VITE_TRACE_GLOW_API_KEY, projectId: import.meta.env.VITE_TRACE_GLOW_PROJECT_ID, environment: 'development', debug: { printEvents: true } });
const status = document.querySelector('#status');
telemetry.ready.then(() => { status.textContent = 'SDK ready'; });
document.querySelector('#log').addEventListener('click', () => telemetry.logger.info('demo.native.log', { source: 'button' }));
document.querySelector('#span').addEventListener('click', () => { const span = telemetry.client.startSpan('demo.native.action'); span.setAttribute('demo.action', 'button').setStatus('ok').end(); });
document.querySelector('#error').addEventListener('click', () => { throw new Error('Native demo error'); });
window.addEventListener('pagehide', () => { void telemetry.client.shutdown(); });
