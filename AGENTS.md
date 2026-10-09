# Repository Guidelines

`drawio-ai-kit` helps an AI draw correct, beautiful draw.io diagrams.

> [!IMPORTANT]
> **Hard rule (see `skills/drawio/SKILL.md`)**: The kit is **read-only infrastructure**. Write generated `.drawio`/`.xml` output into the user's cwd, never into the repo folder.

## Tech Stack & Runtime
- **Node.js ≥20.6 or Bun** (ESM, `.nvmrc` = 22; running TS tests natively needs ≥22.18) is the user runtime. `"type": "module"`; zero default exports (named exports only).
- **Dependencies**: add libraries as `devDependencies`; Bun bundles them into `dist/`, so users install nothing extra. Add a real `dependencies` entry only if the library cannot be bundled (native addon, WASM file, dynamic `require`). Today `minisearch` is bundled this way. Never add a `postinstall` hook.
- **Bun 1.4+** is the maintainer toolchain:
  - `bun test` runs the `node:test` suites. `npm test` runs the same suites on plain Node, and both must pass.
  - `bun run build` (`scripts/build.mjs`, `Bun.build`) bundles `src/cli.ts` + `src/kit.ts` into the minified `dist/`, which ships and is committed.
  - `bun run build:check` fails if `dist/` is stale.
- `package-lock.json` is the only lockfile. Run `npm install` after changing dependencies. Never commit `bun.lock`.
- For the architecture, directories, and files, see [docs/developer-guide.md](docs/developer-guide.md).

## Code Conventions & Common Patterns
- **Erasable-syntax TypeScript in `src/` and `test/` (`.ts`, no enums/namespaces/parameter properties); `npm run typecheck` must pass.** Bun is the only bundler, and it is used only to build `dist/`. Import local files with the `.ts` extension. Use `import type` for types.
- **Shared types live in `src/model.ts`** (types only, erased at build). A type used by one module stays in that module.
- **`src/` must run on Node.** No `Bun.*` APIs in `src/`; they are allowed only in `scripts/` and CI. Sole exception: `src/run-hook.ts` uses `Bun.plugin` behind a runtime check (it only runs under Bun).
- **After any `src/` change**: run `bun run build`, then commit `dist/`. CI rebuilds it and fails on drift.
- **One skill**: `skills/drawio/` (`SKILL.md` + `references/` + `workflows/`). There are no per-domain skills; a new domain is a new reference file (see `docs/adding-a-domain.md`). Write skill docs in short, explicit steps that small models (Haiku-class) can follow.
- **Catalog injection**: `loadCatalog()` returns the merged catalog; every `core.ts` function takes `catalog` as first arg; `builder.ts` stores it as `this.c`.
- **Declarative layout > coordinates**: Build node trees with `layout-engine.ts` factories (`group`/`frame`/`grid` + `icon`/`box`) → `renderTree(d, root)` → `Diagram`. Hardcoding x/y coordinates violates the design pattern.
- **Color = Identity**: Never recolor AWS icons away from their category color (`colorFor`: entry.color → `categoryColors[category]` → `#232F3E`).
- **Nesting Hierarchy**: Group nesting order is enforced by `GROUP_LEVEL`: Cloud/Account/Region=0 → VPC=2 → AZ=3 → Subnet=4 → SG=5.
- **Edge Rounding Policy**: Tree/fanout roles → sharp (`rounded=0`); flow → type's `edgeCorner`.
- **Icon search** is `src/search.ts` (minisearch, bundled). Curated shorthand and synonyms live in `data/aliases.json` (entry name → phrases). To fix a bad search, add an alias there. Do not edit scoring code first.
- **Imports in user scripts**: always `import { ... } from "drawio-ai-kit"`, never a path into the kit. Run scripts with `drawio-ai run build.mjs`. Examples and `scaffold` output follow this rule.

## Gates to run before you open a PR
Run these in order. All must pass.
1. `npm run typecheck`, `bun test`, `npm test`
2. `bun run build`, then commit `dist/`. `bun run build:check` must report it is up to date.
3. If you touched `src/`, `data/` or `catalog/`: `node scripts/bench.mjs --runtime both --compare bench/baseline.json` (perf gate, +10% tolerance). Update `bench/RESULTS.md` if numbers move on purpose.
4. If you touched search (`src/search.ts`, `data/aliases.json`, `bench/search/queries.json`): `node scripts/bench-search.mjs --compare bench/search/baseline.json` (quality gate, no drop allowed). Add a labeled query for every alias you add.
5. Characterization snapshots (`test/characterization/**`) changed on purpose? Regenerate with `UPDATE_SNAPSHOTS=1` and say why in the commit message.
