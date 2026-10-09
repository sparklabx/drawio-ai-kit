# Contributing

Thanks for helping make AI-drawn diagrams better. PRs and issues welcome.

## Setup

```bash
git clone https://github.com/sparklabx/drawio-ai-kit && cd drawio-ai-kit
bun test           # fast runner for the node:test suites (zero test dependencies)
npm test           # the same suites on plain Node (node --test): the compatibility check
bun run build      # rebuild dist/ (commit it; CI fails if it is stale)
```

Dev tooling is [Bun](https://bun.sh) 1.4+ plus Node ≥18 (`.nvmrc` = 22). There are no dependencies, so
there is nothing to install. The code is plain ESM `.mjs` (no transpiler, no TypeScript) and must stay
runnable on Node: no `Bun.*` APIs in `src/`. Bun APIs are fine in `scripts/` and CI.

## Ground rules

- **Zero runtime dependencies.** Don't add any — it's the project's core promise. If a few lines of code can do it, write the few lines.
- **Named exports only**, no default exports.
- **Declarative layout, never hardcoded coordinates** — build node trees with `layout-engine.mjs` factories and let `renderTree` compute geometry.
- **The kit is read-only infrastructure**: generated `.drawio`/`.xml` output belongs in the user's cwd, never in this repo.
- New catalog entries / colors / nesting rules must pass the structural validator (`bun run cli validate <file>`).

Architecture details live in [docs/developer-guide.md](docs/developer-guide.md); adding a new domain is covered in [docs/adding-a-domain.md](docs/adding-a-domain.md).

## Pull requests

- Keep diffs small and focused; one concern per PR.
- Add or extend a test in [test/](test/) when behavior changes — `bun test` and `npm test` must both pass.
- For security issues, don't open a public issue — see [SECURITY.md](SECURITY.md).
- CI fails if the npm tarball grows past 2.5 MB (`npm pack`), or if any catalog icon is over 16 KB. Check locally with `scripts/bench-install.sh`.

## Releasing

1. Bump `version` in `package.json`, run `bun run build`, and commit.
2. Tag and push the tag: `git tag v2.0.1 && git push origin v2.0.1`.
3. `.github/workflows/release.yml` checks that the tag matches the version, runs the tests and `build:check`, then runs `npm publish --provenance`.
   Auth uses npm trusted publishing (OIDC) for `sparklabx/drawio-ai-kit` + `release.yml` + environment `npm`, falling back to the `NPM_TOKEN` secret.
