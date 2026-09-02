import { TraceGlow } from '@trace-glow/react';
export const telemetry = new TraceGlow({ endpoint: import.meta.env.VITE_TRACE_GLOW_ENDPOINT, apiKey: import.meta.env.VITE_TRACE_GLOW_API_KEY, projectId: import.meta.env.VITE_TRACE_GLOW_PROJECT_ID, environment: 'development', debug: { printEvents: true } });
