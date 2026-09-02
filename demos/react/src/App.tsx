import { useState } from 'react';
import { TraceGlowErrorBoundary, useTraceGlow } from '@trace-glow/react';
function Actions() { const sdk = useTraceGlow(); const [fail, setFail] = useState(false); if (fail) throw new Error('React demo render error'); return <main><h1>React demo</h1><button onClick={() => sdk.logger.info('demo.react.log')}>Capture log</button><button onClick={() => setFail(true)}>Trigger boundary</button></main>; }
export function App() { return <TraceGlowErrorBoundary fallback={<p>Error captured by Trace Glow.</p>}><Actions /></TraceGlowErrorBoundary>; }
