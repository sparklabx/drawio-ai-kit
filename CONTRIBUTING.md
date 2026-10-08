# Contributing

Thanks for helping make AI-drawn diagrams better. PRs and issues welcome.

## Setup

```bash
git clone https://github.com/sparklabx/drawio-ai-kit && cd drawio-ai-kit
npm install   # no runtime deps — this only wires up the workspace
npm test      # node:test, zero test dependencies
```

Node ≥18 (`.nvmrc` = 22), plain ESM `.mjs` — no bundler, no transpiler, no TypeScript.

## Ground rules

- **Zero runtime dependencies.** Don't add any — it's the project's core promise. If a few lines of code can do it, write the few lines.
- **Named exports only**, no default exports.
- **Declarative layout, never hardcoded coordinates** — build node trees with `layout-engine.mjs` factories and let `renderTree` compute geometry.
- **The kit is read-only infrastructure**: generated `.drawio`/`.xml` output belongs in the user's cwd, never in this repo.
- New catalog entries / colors / nesting rules must pass the structural validator (`npm run cli -- validate`).

Architecture details live in [docs/developer-guide.md](docs/developer-guide.md); adding a new domain is covered in [docs/adding-a-domain.md](docs/adding-a-domain.md).

## Pull requests

- Keep diffs small and focused; one concern per PR.
- Add or extend a test in [test/](test/) when behavior changes — `npm test` must pass.
- For security issues, don't open a public issue — see [SECURITY.md](SECURITY.md).
