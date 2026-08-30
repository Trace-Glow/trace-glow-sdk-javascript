# Local package debugging

Build the SDK before linking because the public package exports point to
`dist/`, not TypeScript source files.

## Fast iteration with pnpm link

In this repository, build the public packages and register each package in
pnpm's global link store:

```sh
pnpm build
cd packages/browser-sdk
pnpm link --global
cd ../react-sdk
pnpm link --global
cd ../next-sdk
pnpm link --global
cd ../vue-sdk
pnpm link --global
cd ../node-sdk
pnpm link --global
cd ../..
```

Enter each public package directory explicitly before running `pnpm link
--global`. In this pnpm workspace, combining the repository root with `--dir`
can incorrectly register the workspace root package.

In a browser application repository, link the browser package:

```sh
pnpm link --global @trace-glow/browser
```

In a React application repository, link the React package:

```sh
pnpm link --global @trace-glow/react
```

In a Next.js application repository, link the Next.js package:

```sh
pnpm link --global @trace-glow/next
```

In a Vue 3 application repository, link the Vue package:

```sh
pnpm link --global @trace-glow/vue
```

In a Node.js service repository, link the Node.js package:

```sh
pnpm link --global @trace-glow/node
```

Re-run `pnpm build` in the SDK repository after source changes. The linked
consumer reads the rebuilt `dist` files. Restart the consumer dev server when
its bundler caches package output.

Remove the link in the consumer before reinstalling a registry version:

```sh
pnpm unlink @trace-glow/browser
pnpm unlink @trace-glow/react
pnpm unlink @trace-glow/next
pnpm unlink @trace-glow/vue
pnpm unlink @trace-glow/node
pnpm install
```

Only unlink the package used by that consumer. The commands are shown together
as a reference.

## Release-accurate testing with tarballs

Symlinks can hide missing files or incorrect package metadata. Before release,
test the exact npm package shape through tarballs:

```sh
mkdir -p /tmp/trace-glow-packs
pnpm build
pnpm --filter '@trace-glow/*' pack --pack-destination /tmp/trace-glow-packs
```

Install the relevant tarball in the consumer:

```sh
pnpm add /tmp/trace-glow-packs/trace-glow-browser-0.1.0.tgz
pnpm add /tmp/trace-glow-packs/trace-glow-react-0.1.0.tgz
pnpm add /tmp/trace-glow-packs/trace-glow-vue-0.1.0.tgz
pnpm add /tmp/trace-glow-packs/trace-glow-node-0.1.0.tgz
```

Tarball testing verifies `exports`, declarations, bundled private modules, and
the final file allowlist. It is the required check before publishing.

## npm link alternative

For consumers that use npm instead of pnpm, run `npm link` inside the built
public package directory, then run one of these commands in the consumer:

```sh
npm link @trace-glow/browser
npm link @trace-glow/react
npm link @trace-glow/vue
npm link @trace-glow/node
```

Do not use linked packages in CI or production deployments because links depend
on machine-local paths.

## Shared contract synchronization

The [`trace-glow-contracts`](https://github.com/Trace-Glow/trace-glow-contracts)
repository is the source of truth for transported event structures. After a
compatible contract change is reviewed there, synchronize its Schema into this
repository with an explicit local source path:

```sh
pnpm contracts:sync -- /absolute/path/to/trace-glow-contracts
pnpm contracts:check
```

Synchronization updates `contracts/v1/contracts.schema.json`, its provenance
hash, and the generated core TypeScript types. Do not edit those files by hand.
The SDK tests validate a real `TelemetryClient` event against the snapshot, and
`contracts:check` detects a changed Schema hash or stale generated output.

The shared Agent context is different from the build snapshot. Agents must
read `context/shared.md`, `context/repositories.json`, and the SDK context file
directly from a pinned contracts commit through GitHub MCP or authenticated
`gh api`; do not copy that context into this repository.

## Commit message convention

The repository uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
and validates every commit through a `commit-msg` hook. Use this shape:

```text
<type>(<optional-scope>): <description>
```

Common types are:

| Type | Use |
| --- | --- |
| `feat` | User-visible capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Internal code change without a behavior change |
| `perf` | Performance improvement |
| `test` | Test-only change |
| `build` | Build system or dependency change |
| `ci` | Continuous integration change |
| `chore` | Repository maintenance not covered above |

Examples:

```text
feat(browser): add configurable resource filters
fix(node): preserve request context across middleware
docs: document local package linking
```

Use `!` or a `BREAKING CHANGE:` footer for an incompatible public API change:

```text
feat(core)!: replace the event processor contract
```

The scope is optional but should name the affected package or area. Keep the
description concise and state what the commit does. To validate a prepared Git
message manually, run:

```sh
pnpm commitlint --edit .git/COMMIT_EDITMSG
```

A validation failure cancels the commit. Avoid `git commit --no-verify`, because
it bypasses the repository's history contract.

## Pre-push verification

Installing workspace dependencies runs `simple-git-hooks` and configures the
repository's `pre-push` hook. Before Git sends commits to a remote, the hook
runs the following checks in order:

```sh
pnpm contracts:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Run the complete sequence manually at any time with:

```sh
pnpm verify:push
```

If the hook was not installed, for example after copying the repository or
installing dependencies with lifecycle scripts disabled, enable it with:

```sh
pnpm prepare
```

A failed check cancels the push. Avoid `git push --no-verify` because it skips
all local safeguards; use it only for an exceptional recovery and run
`pnpm verify:push` separately before requesting review.
