# Contributing

Thanks for helping make AI-drawn diagrams better. PRs and issues welcome.

## Setup

```bash
git clone https://github.com/sparklabx/drawio-ai-kit && cd drawio-ai-kit
bun test           # fast runner for the node:test suites (no test framework dependency)
npm test           # the same suites on plain Node (node --test): the compatibility check
bun run build      # build dist/ (gitignored; tests use it, run before testing)
```

Dev tooling is [Bun](https://bun.sh) 1.4+ plus Node ≥20 (`.nvmrc` = 22). Run `npm ci` first (typescript and minisearch are devDependencies). The code is erasable-syntax TypeScript (`.ts`) and must stay
runnable on Node: no `Bun.*` APIs in `src/`. Bun APIs are fine in `scripts/` and CI.

## Ground rules

- **Dependencies are devDependencies that Bun bundles into `dist/`.** Users install nothing extra. If a few lines can do it, write the few lines; otherwise add a devDependency (`npm install -D <pkg>`; never commit `bun.lock`). A real `dependencies` entry only if it cannot be bundled. See ADR-0006.
- **Named exports only**, no default exports.
- **Scripts import `"drawio-ai-kit"` by name** (never a path into the kit) and run with `drawio-ai run`.
- **Declarative layout, never hardcoded coordinates** — build node trees with `layout-engine.ts` factories and let `renderTree` compute geometry.
- **The kit is read-only infrastructure**: generated `.drawio`/`.xml` output belongs in the user's cwd, never in this repo.
- New catalog entries / colors / nesting rules must pass the structural validator (`bun run cli validate <file>`).

Architecture details live in [docs/developer-guide.md](docs/developer-guide.md); adding a new domain is covered in [docs/adding-a-domain.md](docs/adding-a-domain.md).

## Pull requests

- Keep diffs small and focused; one concern per PR.
- Add or extend a test in [test/](test/) when behavior changes — `npm run typecheck`, `bun test` and `npm test` must all pass.
- Touched `src/`, `data/` or `catalog/`? Run the perf gate: `node scripts/bench.mjs --runtime both --compare bench/baseline.json`.
- Touched search (`src/search.ts`, `data/aliases.json`)? Run the quality gate: `node scripts/bench-search.mjs --compare bench/search/baseline.json`, and add a labeled query in `bench/search/queries.json` for each alias.
- Changed output on purpose? Regenerate the characterization snapshots with `UPDATE_SNAPSHOTS=1` and explain why in the commit.
- For security issues, don't open a public issue — see [SECURITY.md](SECURITY.md).
- CI fails if the npm tarball grows past 2.5 MB (`npm pack`), or if any catalog icon is over 16 KB. Check locally with `scripts/bench-install.sh`.

## Releasing

`.github/workflows/release.yml` publishes whatever `version` in `package.json` says, if npm doesn't have it yet:
- **Latest (normal release):** bump `version` on `v2` and push. CI runs the tests and `build:check`, runs
  `npm publish --provenance --tag latest`, then tags the commit `vX.Y.Z`.
- **Other versions (old lines, backports):** bump `version` on that branch, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
  CI checks the tag matches the version and publishes under `release-<major>` (prereleases: `next`), so `latest` never moves.
- Pushes to `v2` that don't change the version publish nothing.
   Auth uses npm trusted publishing (OIDC) for `sparklabx/drawio-ai-kit` + `release.yml` + environment `npm`, falling back to the `NPM_TOKEN` secret.
