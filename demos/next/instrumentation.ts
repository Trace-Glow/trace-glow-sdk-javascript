import { NextServerTraceGlow } from '@trace-glow/next/server';
export const telemetry = new NextServerTraceGlow({ endpoint: process.env.TRACE_GLOW_ENDPOINT!, apiKey: process.env.TRACE_GLOW_API_KEY!, projectId: 'next-demo', instrumentation: { runtimeMetrics: true } });
export async function register() { await telemetry.ready; }
