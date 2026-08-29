# Agent instructions

## Documentation languages

- English documentation under `docs/` belongs in `docs/en/`; Simplified Chinese documentation belongs in `docs/zh-CN/`. Root and package `README.md` files are npm/GitHub entry points and may remain English while linking to both language indexes.
- Every user-facing document under either language directory must have an equivalent file at the same relative path in the other language directory.
- Any content change, new document, rename, or deletion must update both language versions in the same change.
- Keep code examples, commands, package names, configuration keys, and behavioral claims equivalent across both languages.
- Update both language indexes and repository links when documentation paths change.

## Project context

Trace Glow is a JavaScript observability SDK intended for public npm distribution. The broader observability system is a multi-repository project: SDK collection and delivery live here, while ingestion, storage, querying, the management platform, and alert evaluation belong in separate repositories.

This repository is a TypeScript pnpm workspace. It publishes exactly four self-contained packages:

- `@trace-glow/browser`: public browser SDK with all required private modules bundled.
- `@trace-glow/vue`: public Vue 3 SDK with browser instrumentation and Vue error integration bundled; Vue remains a peer dependency.
- `@trace-glow/node`: public Node.js SDK with all required private modules bundled.
- `@trace-glow/react`: public React SDK with browser modules bundled and React kept as a peer dependency.

The remaining packages are private workspace implementation modules:

- `@trace-glow-internal/core`: runtime-neutral event contract, lifecycle, plugins, bounded queue, batching, sampling, retry, and shutdown.
- `@trace-glow-internal/context`: user, tags, extras, release/environment, and correlation context.
- `@trace-glow-internal/transport`: HTTP, gzip, and Beacon delivery.
- `@trace-glow-internal/logger`: structured, severity-filtered logging.
- `@trace-glow-internal/browser`: browser errors, rejected promises, resource failures, performance, Fetch, and XHR instrumentation.
- `@trace-glow-internal/vue`: Vue application error-handler installation, delegation, and teardown.
- `@trace-glow-internal/node`: process/runtime monitoring, async request context, and HTTP/Express/Koa/Nest middleware.

## Architecture constraints

- Dependencies point inward. Runtime packages may depend on `core`; `core` must never import browser, Node.js, framework, or transport implementations.
- Browser and Node.js entry points must remain isolated. Browser output must not reference `node:*` or `@trace-glow-internal/node`.
- React output follows the browser isolation boundary and must not reference `node:*` or `@trace-glow-internal/node`; React itself must remain external as a peer dependency.
- All public packages expose the same `new TraceGlow(config)` entry point and common configuration names. Keep runtime-only options under `instrumentation`; Vue implements the Vue Plugin install protocol, React exposes framework integration components and hooks, and Node.js may expose request-context capabilities.
- Public package JavaScript and declarations must bundle private `@trace-glow-internal/*` modules. Published package manifests must not declare runtime dependencies on private workspace packages.
- SDK failures must not escape into host application control flow. Preserve bounded memory, bounded payloads, retry limits, teardown behavior, and final flushing.
- Do not collect request/response bodies, cookies, authorization headers, URL query strings, fragments, or DOM text by default.
- Preserve the versioned event envelope and at-least-once delivery semantics. Do not claim exactly-once delivery.
- Avoid adding framework runtime dependencies to the generic Node.js package. Framework-specific integrations should use peer dependencies or separate packages when they require framework APIs.

## Development and verification

- Use TypeScript strict mode and the existing workspace patterns.
- Add descriptive block comments to every function, method, class, interface, type alias, constant, class field, and local variable in TypeScript source, configuration, and test files. Function comments must document parameters, return behavior, side effects, and failure behavior where relevant.
- Write all code comments in Simplified Chinese. Keep standard technical identifiers, API names, protocol names, and JSDoc tags in their canonical form when translating them would reduce precision.
- Add block comments at critical control-flow and architecture boundaries explaining why the design exists, not merely restating what the following code does. Keep comments synchronized whenever behavior changes.
- Keep tests outside production source directories. Package tests belong in `packages/<package-name>/tests/`, as a sibling of `src/`; never place `*.test.ts` or `*.spec.ts` under `src/`.
- Configure test runners to load `tests/` directly. Production TypeScript and npm package inputs must continue to include only runtime source and build configuration.
- Add focused tests for changes to shared contracts, lifecycle, queueing, context propagation, transport, or runtime instrumentation.
- Before considering implementation complete, run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Preserve the `pre-push` hook and its `pnpm verify:push` entry point. Every push must pass linting, TypeScript checks, a complete build, and the unit test suite; keep the hook, scripts, and bilingual development documentation synchronized when these checks change.
- Preserve the Conventional Commits `commit-msg` hook and Commitlint configuration. Use `type(optional-scope): description`, mark breaking public API changes with `!` or a `BREAKING CHANGE:` footer, and keep the bilingual development documentation synchronized with the accepted convention.
- For publishing changes, pack all four public packages to a temporary directory. Inspect file contents, bundled declarations, browser/React/Vue/Node isolation, React and Vue peer dependency externalization, and the absence of private runtime dependencies.
- The repository uses Changesets and links the four public package versions. Do not publish to npm or create a release without explicit user authorization.
