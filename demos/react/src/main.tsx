import React from 'react'; import ReactDOM from 'react-dom/client'; import { TraceGlowProvider } from '@trace-glow/react'; import { App } from './App'; import { telemetry } from './telemetry'; import './style.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><TraceGlowProvider telemetry={telemetry}><App /></TraceGlowProvider></React.StrictMode>);
