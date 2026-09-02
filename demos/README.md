# Trace Glow SDK demos

These applications exercise the workspace SDK packages in realistic runtime
environments. They use placeholder write keys and never contain production
credentials.

| Demo | Runtime | SDK | Command |
| --- | --- | --- | --- |
| `vanilla` | Browser, Vite | `@trace-glow/browser` | `pnpm demo:vanilla` |
| `react` | React 18, Vite | `@trace-glow/react` | `pnpm demo:react` |
| `vue` | Vue 3, Vite | `@trace-glow/vue` | `pnpm demo:vue` |
| `next` | Next.js App Router | `@trace-glow/next` | `pnpm demo:next` |
| `node` | Node.js HTTP | `@trace-glow/node` | `pnpm demo:node` |

Run `pnpm install`, copy the selected `.env.example` to `.env`, build the SDK
packages with `pnpm build`, then start the demo command. Browser write keys are
visible to users and must be project-scoped ingestion keys. The Node and Next
server demos read their keys only from server environment variables.

The browser demos enable Web Vitals, Navigation/Resource/Paint/Long Task
entries, Fetch, XHR, resource failures, console breadcrumbs, and error
instrumentation by default. Node and Next enable runtime metrics and inbound
HTTP spans. A reachable Collector is required to inspect delivered events.
