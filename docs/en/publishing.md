# Publishing

## Prerequisites

1. Confirm that the npm account or organization owns the `@trace-glow`
   scope. The public packages are `@trace-glow/browser`,
   `@trace-glow/react`, `@trace-glow/vue`, `@trace-glow/next`, and
   `@trace-glow/node`.
2. Add an npm automation token as the repository secret `NPM_TOKEN`.
3. Enable GitHub Actions to create pull requests and use npm trusted publishing
   or retain the token-based configuration in the release workflow.

## Creating a release

Run `pnpm changeset`, select the affected packages, and commit the generated
markdown file with the code change. Before publishing, update package versions
and changelogs, commit the result, then create and push a version tag:

```sh
pnpm version-packages
git add .
git commit -m "chore: version packages"
git tag v0.1.0
git push origin main --follow-tags
```

Pushing a `v*` tag triggers the release workflow. It builds and tests the
workspace, then runs `changeset publish` to publish the linked package versions
with npm provenance.

Private `@trace-glow-internal/*` modules are bundled rather than published. A change to a
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
pnpm --filter '@trace-glow/*' pack --pack-destination /tmp/trace-glow-packs
```

Inspect all five public tarballs. Verify that browser, React, Next, and Vue output do
not reference Node built-ins, framework packages remain external peer
dependencies, and no
tarball declares runtime dependencies on private `@trace-glow-internal/*` workspace
packages.
