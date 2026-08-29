# Publishing

## Prerequisites

1. Confirm that the npm account or organization owns the `@trace-glow-sdk`
   scope. The public packages are `@trace-glow-sdk/browser`,
   `@trace-glow-sdk/react`, `@trace-glow-sdk/vue`, and
   `@trace-glow-sdk/node`.
2. Add an npm automation token as the repository secret `NPM_TOKEN`.
3. Enable GitHub Actions to create pull requests and use npm trusted publishing
   or retain the token-based configuration in the release workflow.

## Creating a release

Run `pnpm changeset`, select the affected packages, and commit the generated
markdown file with the code change. On `main`, the release workflow maintains a
version pull request. Merging that pull request builds, tests, and publishes the
linked package versions with npm provenance.

Private `@trace-glow/*` modules are bundled rather than published. A change to a
private module must still include a Changeset for every public package whose
bundled behavior changes.

Before the first public release, replace `0.1.0` with an initial Changeset-based
version if the API should remain explicitly prerelease, for example `0.1.0-next.0`.
Do not overwrite an npm version that has already been published.

## Local verification

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
mkdir -p /tmp/trace-glow-packs
pnpm --filter '@trace-glow-sdk/*' pack --pack-destination /tmp/trace-glow-packs
```

Inspect all four public tarballs. Verify that browser, React, and Vue output do
not reference Node built-ins, framework packages remain external peer
dependencies, and no
tarball declares runtime dependencies on private `@trace-glow/*` workspace
packages.
