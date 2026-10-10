# Developer Guide

This document describes the codebase structure, architecture, development commands, and internal conventions of the `drawio-ai-kit` repository.

## Tech Stack

| Layer | Stack | Notes |
|-------|-------|-------|
| Runtime (CLI) | Node.js ≥20.6 or Bun (ESM, `.nvmrc` = 22) | `"type": "module"`; zero default exports anywhere; no runtime `dependencies`: libraries (`minisearch`) are devDependencies that Bun bundles into `dist/` (ADR-0006) |
| Runtime (data cook) | Python 3.11, stdlib only | regenerates `catalog/*.json`; not run by CI |
| Dev tooling | **Bun 1.4+** (`bun test`, `bun run build`) | maintainers only; users run the bundle on plain Node |
| Package manager | **npm** (`package-lock.json`, lockfile v3) | the only lockfile; never commit `bun.lock`; `npm ci`/`npm audit` stay in CI |
| Test framework | Node built-in `node:test` | no test deps; runs unchanged under both `node --test` and `bun test` |
| Types | Erasable-syntax TypeScript, `tsc` for checking only | `npm run typecheck`; `dist/types/*.d.ts` ships for `import "drawio-ai-kit"` |
| Rendering | draw.io desktop CLI (optional) + Graphviz `dot` (optional, for >15-node autolayout) | both probed at runtime, absent → browser-URL fallback |

## Project Overview

Two runtime layers over a prebuilt content pipeline:

- **Node layer** — `src/cli.ts` is the **sole tool surface**: the `drawio-ai` CLI with subcommands `search`, `style`, `validate`, `audit`, `logo`, `categories`, `types`, `principles`, `root`, `workflow`, `render`, `scaffold`, `run`, `skill install`. `src/cli-lib.ts` holds the pure, testable helpers behind `root`/`render`/`workflow`. `src/core.ts` is the catalog + validation engine; `src/search.ts` is icon search (minisearch); `src/model.ts` holds the shared types; `src/builder.ts` + `src/layout-engine.ts` build diagrams declaratively.
- **Python layer** — `scripts/*.py` regenerate `catalog/*.json` from upstream sources (run manually, not in CI). `vendor/*.py` are runtime helpers (brand logos, PNG repair, URL encode, graphviz autolayout).
- **Content (read-only after generation)** — `catalog/*.json` icons, `data/shape-index.json.gz` raw index, `skills/drawio/` (the single skill: SKILL.md + `references/*.md` guidance + `workflows/*.md`), `examples/*/build_*.mjs` templates (grouped by domain).

> The MCP server and bespoke installer were **removed at 1.0.0** (see ADR-0002). The CLI is the only tool surface; skills shell out to it. Build scripts import `"drawio-ai-kit"` by name and run with `drawio-ai run` (ADR-0007).

## Architecture & Data Flow

Module graph (all named exports, no defaults):

```
cli.ts ──▶ core.ts ──▶ search.ts ──▶ minisearch (bundled)
  │
  ├──▶ cli-lib.ts   (packageRoot, findDrawioCli, buildRenderArgs, workflowText)
  └──▶ run-hook.ts  (preloaded by `drawio-ai run`: maps "drawio-ai-kit" to this install)
             ▲
builder.ts ──┼─▶ core.ts, layout.ts, types.ts, theme.ts
             ▲
layout-engine.ts ──▶ theme.ts  (feeds builder)

model.ts: shared types only (import type), erased at build
```

### Request → diagram XML

**Programmatic build** (the main path all examples use):

```js
import { Diagram, group, icon, renderTree } from "drawio-ai-kit";   // run: drawio-ai run build.mjs

const tree = group('region', 'group_region', 'AWS Region', { dir: 'row' }, [
  group('acc', 'group_account', 'Account', { dir: 'col' }, [
    icon('s3', 's3', 'S3'),
    icon('ec2', 'ec2', 'EC2'),
  ]),
]);

const d = new Diagram('pipeline', { title: 'My Diagram' });
renderTree(d, tree, [40, 70]);   // measure → place → emit (no coordinates anywhere)
d.link('s3', 'ec2', 'read/write');
const xml  = d.toXML();           // <mxGraphModel>
const file = d.mxfile('My Diagram'); // <mxfile host="app.diagrams.net">
const report = d.validate({ strict: true }); // { ok, errors, warnings, audit, stats }
```

`renderTree` runs `measure` (bottom-up, assign w/h) → `place` (top-down, assign x/y) → `emit` (call `d.icon/box/group` per node). Edges build lazily in `d.toXML()` → `_buildEdges()` detects fan-out (1→N) / fan-in (N→1) bundles, assigns shared lanes, then routes each edge through `layout.ts` (`routeLR`/`routeTB`/`routeLRFan`/…).

**CLI invocation** → `cli.ts` `switch (cmd)` dispatches to `core.ts`/`cli-lib.ts`/vendor fn → prints JSON (`out()`) for data commands, raw markdown for `principles`/`workflow`/`root`, or `{ ok, path }` for `render`. Exits non-zero (`1` usage/missing-CLI, `2` validate failure) with a clear stderr message.

## Key Directories (codemap)

| Path | Purpose |
|------|---------|
| `src/` | Erasable-syntax TypeScript — the readable source of the runtime (see Important Files). Not shipped. |
| `dist/` | **Shipped runtime**: Bun `--production` bundle of `src/cli.ts` + `src/kit.ts` (`bun run build` → `scripts/build.mjs`), plus `dist/types/*.d.ts`. Bundled devDependencies (minisearch) are inlined. Gitignored: built by CI (artifact shared by the Node jobs) and by the release job; CI fails if the build is non-deterministic. |
| `data/aliases.json` | Curated search shorthand and synonyms: `{ "<entry name>": ["alias", ...] }`. Read by `src/search.ts`; shipped in the package. Every key must be a real catalog name. |
| `bench/`, `scripts/bench*.mjs` | Perf and search-quality gates (see Benchmarks below). |
| `catalog/*.json` | **Prebuilt icon catalogs** (aws + 8 packs). Committed. One schema: `{ meta, categoryColors, groups[], icons[] }` where each icon carries verbatim draw.io `style` strings. `loadCatalog()` auto-merges every sibling file. |
| `packs/<name>/` | Source manifests for non-AWS packs: `manifest.json` (+ optional `assets/`). Fields: `name, label, devicon|slug|url, color, tags`. Tiles generated at build time → `catalog/<name>.json`. |
| `data/shape-index.json.gz` | Vendored 10,446-shape index (Apache-2.0, jgraph/drawio-mcp). Source of `catalog/aws.json`. |
| `data/lobe-icons.json` | lobehub icon name manifest (877 AI/LLM brand names) for `logo`. |
| `skills/drawio/` | The single skill. `SKILL.md` (4 steps: CLI check → ask → route → build), `references/*.md` (`api.md`, `principles.md`, per-domain `*-architecture.md`, `bpmn.md`, `diagram-types.md`, `style-guide.md` — also served by `principles --mode`), `workflows/*.md` (`build.md` — also served by `workflow`; `from-iac.md`; `delegate.md`). See `docs/adding-a-domain.md`. |
| `examples/<domain>/build_*.mjs` | 18 declarative templates grouped by domain (`aws/`, `azure/`, `gcp/`, `multicloud/`, `bpmn/`). Run → `out/<name>_kit.drawio`. |
| `scripts/*.py` | Catalog regenerators (Python 3.11, stdlib only). |
| `install.sh` | POSIX one-line installer: global install (Bun or npm) + `drawio-ai skill install -g -y`; `--dry-run` prints the commands. CI runs shellcheck on it. |
| `scripts/build.mjs` | Bun-only maintainer build (`Bun.build`): writes `dist/` + a size report; `--check` verifies the build is deterministic, `--analyze` writes a metafile + module-graph markdown to `$TMPDIR`. |
| `vendor/*.py` | Runtime helpers (third-party/MIT): autolayout, encode URL, repair PNG, aiicons. |
| `test/` | `core.test.ts` (engine), `edges.test.ts` (edge audits), `save-guard.test.ts` (kit-is-read-only), `cli.test.ts` (`cli-lib.ts` pure fns), `run.test.ts` (`drawio-ai run`), `characterization/` (snapshots of the dist CLI, API and 30 examples; `UPDATE_SNAPSHOTS=1` regenerates). |

## Important Files

- **`src/core.ts`** — catalog + validation engine. `loadCatalog(path?)` → catalog; `searchIcon(catalog, q, {category,limit,kind})` (delegates to `search.ts`); `getIcon`, `styleForIcon`, `styleForGroup`; `validateDiagram(catalog, xml, {strict})` → `{ok,errors,warnings,audit,stats}` running 5 audit sub-checks (`auditAesthetics`, `auditAwsConventions`, `auditEdgeLabels`, `auditGeometry`, `auditEdges`); `listCategories(catalog)`. Imports only `node:*` and `search.ts`.
- **`src/model.ts`** — the one place for types used by more than one module (layout nodes, `Rect`/`Vertex`, catalog entries). Types only; import with `import type`. A type used by one module stays in that module.
- **`src/search.ts`** — icon search. See Search design below.
- **`src/run-hook.ts`** — preload for `drawio-ai run`: Node `module.register` resolve hook, Bun `Bun.plugin` virtual module; both map the bare name `drawio-ai-kit` to this install's `kit`.
- **`src/builder.ts`** — `class Diagram(type='pipeline', {title, page})`. Methods: `icon`, `box`, `group`, `frame`, `clusterBox`, `panel`, `text`, `title`; `link(src,tgt,label,opts)` (chainable); `toXML()`, `validate()`, `mxfile(name)`. Stores catalog as `this.c`, rects in `this.R`, edge specs in `this.edgeSpecs`.
- **`src/layout-engine.ts`** — declarative node factories `icon`, `box`, `group`, `grid`, `frame`, plus themed `stage`, `band`, `subnet`, `endpoint`, `ossBox`, `onpremFrame`; `renderTree(d, root, [x,y])`. Pure factory functions returning object literals.
- **`src/layout.ts`** — pure-math edge router: `routeLR`/`routeTB`/`routeLRFan`/`routeTBFan`/`routeLRFanIn`/`routeTBFanIn`/`route`; helpers `centerInGapX/Y`, `centerInBoxX`, `distributeY`, `inset`, `panelSize`. No imports.
- **`src/types.ts`** — `DIAGRAM_TYPES` (pipeline/hierarchy/network/hubspoke/hybrid/mesh/sequence); `typePreset(name)`, `edgeRounded(type,role)` (0 sharp for tree/fanout, else type's `edgeCorner`), `listTypes()`.
- **`src/theme.ts`** — `THEME` tokens (light-dark pairs, stages, subnetPublic/Private, gaps, fonts); `stageFill(i)`, `stageStroke(i)`. One edit restyles every diagram.
- **`src/cli.ts`** — the `drawio-ai` CLI, a thin `switch (cmd)` dispatcher. subcommands: `search`, `style`, `validate` (exit 2 on failure), `audit`, `logo`, `categories`, `types`, `principles [--mode aws|azure|gcp|databricks|bpmn]`, `root`, `workflow`, `render <file> [-o out.png] [--scale N] [--page N]`, `scaffold`, `run <script.mjs> [args]` (runs a script with `drawio-ai-kit` resolvable), `skill install [skills-add flags]` (runs `npx skills add <root>/skills/drawio`). Data commands print JSON; `principles`/`workflow`/`root` print raw text; `render` prints `{ ok, path }`.
- **`src/kit.ts`** — public library entry; re-exports builder, layout-engine, bpmn, core, theme, types. Bundled to `dist/kit.mjs`; the package `exports` map exposes it (with `dist/types/kit.d.ts`) as `"drawio-ai-kit"` — what user build scripts import.
- **`src/cli-lib.ts`** — pure, testable helpers behind the CLI (no top-level side effects): `packageRoot()` (install dir for `root`), `findDrawioCli(env, deps)` (locates the draw.io desktop CLI: `DRAWIO_CLI` → PATH → known locations → `null`; deps injectable for tests), `buildRenderArgs({file,out,scale,page})` (draw.io argv), `workflowText()` (reads `skills/drawio/workflows/build.md`), `scaffoldSource()` (template → runnable script importing `drawio-ai-kit`).

## Development Commands

```bash
bun test                 # runs test/*.test.ts (node:test suites) under Bun
bun test --watch         # re-run on change (also: bun run test:watch)
bun run coverage         # bun test --coverage (report only, no gate)
npm test                 # node --test — the Node compatibility check; must also pass
bun run cli search s3    # bun src/cli.ts (the CLI itself runs on Node)
bun run build            # scripts/build.mjs → dist/ + size report (gitignored; run before tests)
bun run build:check      # rebuild into a temp dir; fail if it differs (non-deterministic)
bun run build:analyze    # build + metafile.json / bundle.md module-graph report in $TMPDIR
bun run gen:catalog      # python3.11 scripts/ingest_index.py → catalog/aws.json
node dist/cli.mjs search s3  # the shipped bundle, as users run it
```

Catalog regeneration (Python, manual, macOS-only rasterizer):

```bash
python3.11 scripts/ingest_index.py          # data/shape-index.json.gz → catalog/aws.json
python3 scripts/build_pack.py <pack>…       # packs/<pack>/ → catalog/<pack>.json (minified SVG icons; 96 px PNG only when smaller)
python3 scripts/build_pack.py --shrink-png <pack>…   # re-encode a catalog's embedded PNGs at 96 px, in place
scripts/bench-install.sh [spec]             # cold-cache install timing + packed size
```

Icons are embedded as `data:image/svg+xml,<base64>` (vector, small). Keep each icon ≤16 KB and the catalog ≤6 MB:
`test/catalog-size.test.ts` enforces both limits.
`bun run build` also writes `data/catalog-index.json` (pack metadata without images). The CLI searches it and parses a pack's full JSON only when one of its styles is used. Commit it after any `catalog/` change; `build:check` and `npm test` fail when it is stale.

## Runtime / Tooling Preferences

- **Node ≥20.6 or Bun** for users (CI smoke-tests dist/ on Node 20 and Bun); dev **≥22.18** or Bun (`.nvmrc` = 22; CI tests on 24). `src/` must stay Node-compatible: no `Bun.*` APIs there.
- **Bun 1.4+** for dev commands (tests, build); CI pins 1.4.2. **npm** stays the user install path — respect `package-lock.json` (not pnpm/yarn).
- **Python 3.11** for `scripts/` and `vendor/aiicons.py`; stdlib only, no `requirements.txt`.
- **Dependencies are devDependencies, bundled by Bun into `dist/`.** Add a real `dependencies` entry only if the library cannot be bundled. `npm audit --omit=dev --audit-level=high` runs in CI and **fails on high/critical**, so the runtime list stays empty.
- **Erasable-syntax TypeScript** (`.ts`; no transpiler needed: Node ≥22.18 and Bun run `src/` as-is; `npm run typecheck` gates types). The only bundling step is `bun run build` for the shipped `dist/`.
- Env overrides: `DRAWIO_CLI` (draw.io desktop CLI for `render`), `DRAWIO_CATALOG` (catalog path), CLI flag `--catalog PATH`.
- Optional externals: draw.io desktop CLI (PNG export via `render`), Graphviz `dot` (autolayout for >15 nodes). Both absent → `vendor/encode_drawio_url.py` browser-URL fallback (no upload).

## Code Conventions & Common Patterns

- **ESM, named exports only** — zero `export default`. `cli.ts` is a top-level script (no exports); `cli-lib.ts` exports the pure helpers.
- **Error handling is split by concern:**
  - `throw new Error(...)` for builder/catalog failures (e.g. `icon()` not found, `link()` bad id).
  - `return null` for not-found lookups (`getIcon`, `styleForIcon`, `clusterBox`).
  - Structured `Result` object `{ ok, errors, warnings, audit, stats }` for validation.
  - CLI → `process.exit(0|1|2)` with a clear stderr message (never throw out of a command).
- **Catalog is injected**, not global. `loadCatalog()` returns the merged catalog; every `core.ts` fn takes `catalog` as first arg; `builder.ts` keeps it as `this.c`; `cli.ts` loads once and dispatches.
- **Declarative layout > coordinates.** Build node trees with `layout-engine.ts` factories → `renderTree()` → `Diagram`. Hardcoding x/y defeats the kit.
- **Pure helpers at the function seam.** `cli-lib.ts` functions take injectable deps (`findDrawioCli(env, deps)`) so they are tested without spawning subprocesses.
- **Builder/fluent:** `Diagram.link()` and `Diagram.title()` return `this`. Node factories return plain object literals (not class instances).
- **Largely synchronous.** Only async: `await import('./types.ts')` in `cli.ts` `types` subcommand. No async in core/builder/layout-engine/layout/cli-lib.
- **Color = identity.** Never recolor icons away from their category color (`colorFor`: entry.color → `categoryColors[category]` → `#232F3E`). Group nesting order enforced by `GROUP_LEVEL`: Cloud/Account/Region=0 → VPC=2 → AZ=3 → Subnet=4 → SG=5.
- **Edge rounding policy:** `edgeRounded(type, role)` — tree/fanout roles → sharp (`rounded=0`); flow → type's `edgeCorner`.
- **Naming:** functions `camelCase`, classes `PascalCase`, module constants `SCREAMING_SNAKE_CASE`. Types are TypeScript (`model.ts` for shared ones). JSDoc prose only on higher-level fns (`validateDiagram`, `renderTree`).

### Adding content

- **New AWS icon** — no action; comes from upstream `shape-index.json.gz`, regenerated via `ingest_index.py`.
- **New non-AWS icon** — add entry to `packs/<pack>/manifest.json` (`devicon|slug|url` + `color` + `tags`) → `python3 scripts/build_pack.py <pack>`.
- **New pack** — create `packs/<name>/manifest.json` → `build_pack.py <name>` → `catalog/<name>.json` auto-merges via `loadCatalog()`.
- **New example** — copy `examples/aws/build_vpc.mjs`; it imports `"drawio-ai-kit"`; write output to `out/`, not the repo.
- **New search alias** — add it to `data/aliases.json` (entry name → phrases) and add a labeled query to `bench/search/queries.json`; run `bench-search` (see below).
- **New rule/type/domain** — edit `skills/drawio/references/*.md` / `src/types.ts` `DIAGRAM_TYPES`; for a new domain follow `docs/adding-a-domain.md`.

## Testing & QA

- Framework: **`node:test`** (built-in). `core.test.ts` (engine), `edges.test.ts` (edge audits), `save-guard.test.ts` (save refuses to write inside the kit), `cli.test.ts` (`cli-lib.ts` pure functions).
- Covered: `core.ts` (`loadCatalog`, `searchIcon`, `getIcon`, `styleForIcon`, `validateDiagram` + all 5 audits), `layout.ts` (`routeLR`, `routeTB`, `centerInGapX`), `layout-engine.ts` + `builder.ts` (`Diagram`, `renderTree`, `group`, `icon`), `cli-lib.ts` (`packageRoot`, `findDrawioCli` all branches, `buildRenderArgs`, `workflowText`). No fixtures, no subprocess spawns.
- Run: `bun test` (fast) and `npm test` (Node). CI runs both on push/PR to `main`: the `test` job on Node 24, `smoke-node20` on Node 20.6.0 (dist only), the `bun` job on Bun 1.4.2 (with `--coverage`).
- No coverage gate (`bun run coverage` prints a report); no Python script tests (data builders, validated by the Node catalog tests that consume their output).

## Search design

`src/search.ts` (decision record: ADR-0008, numbers: `bench/RESULTS.md`, research: `docs/research/`).

1. **Index**: minisearch, built lazily on the first search per catalog (about 9 ms cold, 2,168 docs). Fields `name`, `label`, `alias`, boosts 3/2/4. Plural "s" stemming; prefix for terms over 2 chars; up to 2 edits for terms of 5+ chars; 1-2 char terms match exactly.
2. **Tiers**: exact name → curated alias (order in `data/aliases.json`) → BM25.
3. **Multi-keyword** (comma or space separated): AND over all tokens → AND over shorter tails → one search per token, merged round-robin. Stop words and 1-char tokens are dropped.
4. **Vendor words** (`aws`, `azure`, `gcp`, `google`) scope to that pack, with fallback to all packs.
5. **To fix a miss**: add an alias in `data/aliases.json`, add a labeled query in `bench/search/queries.json`, run the quality gate.

## Benchmarks (gates for contributors)

Rebuild first (`bun run build`): both harnesses test `dist/`.

```bash
node scripts/bench.mjs --runtime both --compare bench/baseline.json          # perf: wall, RSS, import, examples, package size; exit 1 if >10% worse
node scripts/bench-search.mjs --compare bench/search/baseline.json           # search quality: 110 labeled queries, no drop allowed
UPDATE_SNAPSHOTS=1 npm test                                                  # regenerate characterization snapshots (only when the change is intended)
```

- Known artifact: `node.inproc.loadCatalog_ms` reads as a regression because import cost moved from `import` to `loadCatalog` (lazy loading). Compare `import_ms + loadCatalog_ms`.
- Known accepted miss: cold one-shot `search` is about +50% wall (index build, ADR-0008). Do not "fix" it by dropping features; re-baseline only on purpose.
- Update `bench/RESULTS.md` when numbers move on purpose. Details: `bench/README.md`.
