# Repository Guidelines

`drawio-ai-kit` helps an AI draw correct, beautiful draw.io diagrams.

> [!IMPORTANT]
> **Hard rule (see `skills/drawio/SKILL.md`)**: The kit is **read-only infrastructure**. Write generated `.drawio`/`.xml` output into the user's cwd, never into the repo folder.

## Tech Stack & Runtime
- **Node.js ≥20** (ESM, `.nvmrc` = 22; running TS tests natively needs ≥22.18) is the user runtime. `"type": "module"`; zero default exports (named exports only). Zero runtime dependencies (devDependencies only: typescript, @types/node).
- **Bun 1.4+** is the maintainer toolchain:
  - `bun test` runs the `node:test` suites. `npm test` runs the same suites on plain Node, and both must pass.
  - `bun run build` (`scripts/build.mjs`, `Bun.build`) bundles `src/cli.ts` + `src/kit.ts` into the minified `dist/`, which ships and is committed.
  - `bun run build:check` fails if `dist/` is stale.
- `package-lock.json` stays: the Node CI job runs `npm ci`/`npm audit`, and Bun writes no lockfile for a zero-dep package.
- For the architecture, directories, and files, see [docs/developer-guide.md](docs/developer-guide.md).

## Code Conventions & Common Patterns
- **Erasable-syntax TypeScript in `src/` and `test/` (`.ts`, no enums/namespaces/parameter properties); `npm run typecheck` must pass.** Bun is the only bundler, and it is used only to build `dist/`.
- **`src/` must run on Node.** No `Bun.*` APIs in `src/`; they are allowed only in `scripts/` and CI.
- **After any `src/` change**: run `bun run build`, then commit `dist/`. CI rebuilds it and fails on drift.
- **One skill**: `skills/drawio/` (`SKILL.md` + `references/` + `workflows/`). There are no per-domain skills; a new domain is a new reference file (see `docs/adding-a-domain.md`). Write skill docs in short, explicit steps that small models (Haiku-class) can follow.
- **Catalog injection**: `loadCatalog()` returns the merged catalog; every `core.mjs` function takes `catalog` as first arg; `builder.mjs` stores it as `this.c`.
- **Declarative layout > coordinates**: Build node trees with `layout-engine.ts` factories (`group`/`frame`/`grid` + `icon`/`box`) → `renderTree(d, root)` → `Diagram`. Hardcoding x/y coordinates violates the design pattern.
- **Color = Identity**: Never recolor AWS icons away from their category color (`colorFor`: entry.color → `categoryColors[category]` → `#232F3E`).
- **Nesting Hierarchy**: Group nesting order is enforced by `GROUP_LEVEL`: Cloud/Account/Region=0 → VPC=2 → AZ=3 → Subnet=4 → SG=5.
- **Edge Rounding Policy**: Tree/fanout roles → sharp (`rounded=0`); flow → type's `edgeCorner`.
