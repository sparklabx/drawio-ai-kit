# Developer Guide

This document describes the codebase structure, architecture, development commands, and internal conventions of the `drawio-ai-kit` repository.

## Tech Stack

| Layer | Stack | Notes |
|-------|-------|-------|
| Runtime (CLI) | Node.js ≥18 (ESM, `.nvmrc` = 22) | `"type": "module"`; zero default exports anywhere; **zero runtime dependencies** |
| Runtime (data cook) | Python 3.11, stdlib only | regenerates `catalog/*.json`; not run by CI |
| Dev tooling | **Bun 1.4+** (`bun test`, `bun run build`) | maintainers only; users run the bundle on plain Node |
| Package manager | **npm** (`package-lock.json`, lockfile v3) for users | zero deps, so `bun install` writes no `bun.lock`; `npm ci`/`npm audit` stay in CI |
| Test framework | Node built-in `node:test` | no test deps; runs unchanged under both `node --test` and `bun test` |
| Rendering | draw.io desktop CLI (optional) + Graphviz `dot` (optional, for >15-node autolayout) | both probed at runtime, absent → browser-URL fallback |

## Project Overview

Two runtime layers over a prebuilt content pipeline:

- **Node layer** — `src/cli.mjs` is the **sole tool surface**: the `drawio-ai` CLI with 11 subcommands (`search`, `style`, `validate`, `audit`, `logo`, `categories`, `types`, `principles`, `root`, `workflow`, `render`). `src/cli-lib.mjs` holds the pure, testable helpers behind `root`/`render`/`workflow`. `src/core.mjs` is the zero-dep catalog + validation engine; `src/builder.mjs` + `src/layout-engine.mjs` build diagrams declaratively.
- **Python layer** — `scripts/*.py` regenerate `catalog/*.json` from upstream sources (run manually, not in CI). `vendor/*.py` are runtime helpers (brand logos, PNG repair, URL encode, graphviz autolayout).
- **Content (read-only after generation)** — `catalog/*.json` icons, `data/shape-index.json.gz` raw index, `skills/drawio/` (the single skill: SKILL.md + `references/*.md` guidance + `workflows/*.md`), `examples/*/build_*.mjs` templates (grouped by domain).

> The MCP server and bespoke installer were **removed at 1.0.0** (see ADR-0002). The CLI is the only tool surface; skills shell out to it and resolve the engine for `import` via `drawio-ai root`.

## Architecture & Data Flow

Module graph (all named exports, no defaults):

```
cli.mjs ──▶ core.mjs
  │
  └──▶ cli-lib.mjs   (packageRoot, findDrawioCli, buildRenderArgs, workflowText)
             ▲
builder.mjs ─┼─▶ core.mjs, layout.mjs, types.mjs, theme.mjs
             ▲
layout-engine.mjs ──▶ theme.mjs  (feeds builder)
```

### Request → diagram XML

**Programmatic build** (the main path all examples use):

```js
import { Diagram } from './src/builder.mjs';
import { group, icon, renderTree } from './src/layout-engine.mjs';

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

`renderTree` runs `measure` (bottom-up, assign w/h) → `place` (top-down, assign x/y) → `emit` (call `d.icon/box/group` per node). Edges build lazily in `d.toXML()` → `_buildEdges()` detects fan-out (1→N) / fan-in (N→1) bundles, assigns shared lanes, then routes each edge through `layout.mjs` (`routeLR`/`routeTB`/`routeLRFan`/…).

**CLI invocation** → `cli.mjs` `switch (cmd)` dispatches to `core.mjs`/`cli-lib.mjs`/vendor fn → prints JSON (`out()`) for data commands, raw markdown for `principles`/`workflow`/`root`, or `{ ok, path }` for `render`. Exits non-zero (`1` usage/missing-CLI, `2` validate failure) with a clear stderr message.

## Key Directories (codemap)

| Path | Purpose |
|------|---------|
| `src/` | Node ESM modules — the readable source of the runtime (see Important Files). Not shipped. |
| `dist/` | **Shipped runtime**: Bun `--production` bundle of `src/cli.mjs` + `src/kit.mjs` (`bun run build` → `scripts/build.mjs`). Committed; CI fails if stale or non-deterministic. |
| `catalog/*.json` | **Prebuilt icon catalogs** (aws + 8 packs). Committed. One schema: `{ meta, categoryColors, groups[], icons[] }` where each icon carries verbatim draw.io `style` strings. `loadCatalog()` auto-merges every sibling file. |
| `packs/<name>/` | Source manifests for non-AWS packs: `manifest.json` (+ optional `assets/`). Fields: `name, label, devicon|slug|url, color, tags`. Tiles generated at build time → `catalog/<name>.json`. |
| `data/shape-index.json.gz` | Vendored 10,446-shape index (Apache-2.0, jgraph/drawio-mcp). Source of `catalog/aws.json`. |
| `data/lobe-icons.json` | lobehub icon name manifest (877 AI/LLM brand names) for `logo`. |
| `skills/drawio/` | The single skill. `SKILL.md` (4 steps: CLI check → ask → route → build), `references/*.md` (`api.md`, `principles.md`, per-domain `*-architecture.md`, `bpmn.md`, `diagram-types.md`, `style-guide.md` — also served by `principles --mode`), `workflows/*.md` (`build.md` — also served by `workflow`; `from-iac.md`; `delegate.md`). See `docs/adding-a-domain.md`. |
| `examples/<domain>/build_*.mjs` | 18 declarative templates grouped by domain (`aws/`, `azure/`, `gcp/`, `multicloud/`, `bpmn/`). Run → `out/<name>_kit.drawio`. |
| `scripts/*.py` | Catalog regenerators (Python 3.11, stdlib only). |
| `scripts/build.mjs` | Bun-only maintainer build (`Bun.build`): writes `dist/` + a size report; `--check` verifies dist is fresh, `--analyze` writes a metafile + module-graph markdown to `$TMPDIR`. |
| `vendor/*.py` | Runtime helpers (third-party/MIT): autolayout, encode URL, repair PNG, aiicons. |
| `test/` | `core.test.mjs` (engine), `edges.test.mjs` (edge audits), `save-guard.test.mjs` (kit-is-read-only), `cli.test.mjs` (`cli-lib.mjs` pure fns). |

## Important Files

- **`src/core.mjs`** — zero-dep engine. `loadCatalog(path?)` → catalog; `searchIcon(catalog, q, {category,limit,kind})`; `getIcon`, `styleForIcon`, `styleForGroup`; `validateDiagram(catalog, xml, {strict})` → `{ok,errors,warnings,audit,stats}` running 5 audit sub-checks (`auditAesthetics`, `auditAwsConventions`, `auditEdgeLabels`, `auditGeometry`, `auditEdges`); `listCategories(catalog)`. Imports only `node:fs`/`node:path`.
- **`src/builder.mjs`** — `class Diagram(type='pipeline', {title, page})`. Methods: `icon`, `box`, `group`, `frame`, `clusterBox`, `panel`, `text`, `title`; `link(src,tgt,label,opts)` (chainable); `toXML()`, `validate()`, `mxfile(name)`. Stores catalog as `this.c`, rects in `this.R`, edge specs in `this.edgeSpecs`.
- **`src/layout-engine.mjs`** — declarative node factories `icon`, `box`, `group`, `grid`, `frame`, plus themed `stage`, `band`, `subnet`, `endpoint`, `ossBox`, `onpremFrame`; `renderTree(d, root, [x,y])`. Pure factory functions returning object literals.
- **`src/layout.mjs`** — pure-math edge router: `routeLR`/`routeTB`/`routeLRFan`/`routeTBFan`/`routeLRFanIn`/`routeTBFanIn`/`route`; helpers `centerInGapX/Y`, `centerInBoxX`, `distributeY`, `inset`, `panelSize`. No imports.
- **`src/types.mjs`** — `DIAGRAM_TYPES` (pipeline/hierarchy/network/hubspoke/hybrid/mesh/sequence); `typePreset(name)`, `edgeRounded(type,role)` (0 sharp for tree/fanout, else type's `edgeCorner`), `listTypes()`.
- **`src/theme.mjs`** — `THEME` tokens (light-dark pairs, stages, subnetPublic/Private, gaps, fonts); `stageFill(i)`, `stageStroke(i)`. One edit restyles every diagram.
- **`src/cli.mjs`** — the `drawio-ai` CLI, a thin `switch (cmd)` dispatcher. 11 subcommands: `search`, `style`, `validate` (exit 2 on failure), `audit`, `logo`, `categories`, `types`, `principles [--mode aws|azure|gcp|databricks|bpmn]`, `root`, `workflow`, `render <file> [-o out.png] [--scale N] [--page N]`. Data commands print JSON; `principles`/`workflow`/`root` print raw text; `render` prints `{ ok, path }`.
- **`src/kit.mjs`** — public library entry; re-exports builder, layout-engine, bpmn, core, theme, types. Bundled to `dist/kit.mjs` — what user build scripts import.
- **`src/cli-lib.mjs`** — pure, testable helpers behind the CLI (no top-level side effects): `packageRoot()` (install dir for `root`), `findDrawioCli(env, deps)` (locates the draw.io desktop CLI: `DRAWIO_CLI` → PATH → known locations → `null`; deps injectable for tests), `buildRenderArgs({file,out,scale,page})` (draw.io argv), `workflowText()` (reads `skills/drawio/workflows/build.md`), `scaffoldSource()` (template → runnable script importing `dist/kit.mjs`).

## Development Commands

```bash
bun test                 # runs test/*.test.mjs (node:test suites) under Bun
bun test --watch         # re-run on change (also: bun run test:watch)
bun run coverage         # bun test --coverage (report only, no gate)
npm test                 # node --test — the Node compatibility check; must also pass
bun run cli search s3    # node src/cli.mjs (the CLI itself runs on Node)
bun run build            # scripts/build.mjs → dist/ + size report (commit it)
bun run build:check      # rebuild into a temp dir; fail if dist/ differs
bun run build:analyze    # build + metafile.json / bundle.md module-graph report in $TMPDIR
bun run gen:catalog      # python3.11 scripts/ingest_index.py → catalog/aws.json
node dist/cli.mjs search s3  # the shipped bundle, as users run it
```

Catalog regeneration (Python, manual, macOS-only rasterizer):

```bash
python3.11 scripts/ingest_index.py          # data/shape-index.json.gz → catalog/aws.json
python3 scripts/build_pack.py <pack>        # packs/<pack>/manifest.json → catalog/<pack>.json (default: bigdata)
```

## Runtime / Tooling Preferences

- **Node ≥18**, dev version **22** (`.nvmrc`); CI pins 20. `src/` must stay Node-compatible: no `Bun.*` APIs there.
- **Bun 1.4+** for dev commands (tests, build); CI pins 1.4.2. **npm** stays the user install path — respect `package-lock.json` (not pnpm/yarn).
- **Python 3.11** for `scripts/` and `vendor/aiicons.py`; stdlib only, no `requirements.txt`.
- **Zero runtime dependencies.** `npm audit --omit=dev --audit-level=high` runs in CI and **fails on high/critical** — keep it dep-free.
- **No transpiler, no TypeScript.** Plain `.mjs`. Edit files directly; Node runs `src/` as-is. The only bundling step is `bun run build` for the shipped `dist/`.
- Env overrides: `DRAWIO_CLI` (draw.io desktop CLI for `render`), `DRAWIO_CATALOG` (catalog path), CLI flag `--catalog PATH`.
- Optional externals: draw.io desktop CLI (PNG export via `render`), Graphviz `dot` (autolayout for >15 nodes). Both absent → `vendor/encode_drawio_url.py` browser-URL fallback (no upload).

## Code Conventions & Common Patterns

- **ESM, named exports only** — zero `export default`. `cli.mjs` is a top-level script (no exports); `cli-lib.mjs` exports the pure helpers.
- **Error handling is split by concern:**
  - `throw new Error(...)` for builder/catalog failures (e.g. `icon()` not found, `link()` bad id).
  - `return null` for not-found lookups (`getIcon`, `styleForIcon`, `clusterBox`).
  - Structured `Result` object `{ ok, errors, warnings, audit, stats }` for validation.
  - CLI → `process.exit(0|1|2)` with a clear stderr message (never throw out of a command).
- **Catalog is injected**, not global. `loadCatalog()` returns the merged catalog; every `core.mjs` fn takes `catalog` as first arg; `builder.mjs` keeps it as `this.c`; `cli.mjs` loads once and dispatches.
- **Declarative layout > coordinates.** Build node trees with `layout-engine.mjs` factories → `renderTree()` → `Diagram`. Hardcoding x/y defeats the kit.
- **Pure helpers at the function seam.** `cli-lib.mjs` functions take injectable deps (`findDrawioCli(env, deps)`) so they are tested without spawning subprocesses.
- **Builder/fluent:** `Diagram.link()` and `Diagram.title()` return `this`. Node factories return plain object literals (not class instances).
- **Largely synchronous.** Only async: `await import('./types.mjs')` in `cli.mjs` `types` subcommand. No async in core/builder/layout-engine/layout/cli-lib.
- **Color = identity.** Never recolor icons away from their category color (`colorFor`: entry.color → `categoryColors[category]` → `#232F3E`). Group nesting order enforced by `GROUP_LEVEL`: Cloud/Account/Region=0 → VPC=2 → AZ=3 → Subnet=4 → SG=5.
- **Edge rounding policy:** `edgeRounded(type, role)` — tree/fanout roles → sharp (`rounded=0`); flow → type's `edgeCorner`.
- **Naming:** functions `camelCase`, classes `PascalCase`, module constants `SCREAMING_SNAKE_CASE`. No JSDoc `@typedef`; types implicit. JSDoc prose only on higher-level fns (`validateDiagram`, `renderTree`).

### Adding content

- **New AWS icon** — no action; comes from upstream `shape-index.json.gz`, regenerated via `ingest_index.py`.
- **New non-AWS icon** — add entry to `packs/<pack>/manifest.json` (`devicon|slug|url` + `color` + `tags`) → `python3 scripts/build_pack.py <pack>`.
- **New pack** — create `packs/<name>/manifest.json` → `build_pack.py <name>` → `catalog/<name>.json` auto-merges via `loadCatalog()`.
- **New example** — copy `examples/aws/build_vpc.mjs`; write output to `out/`, not the repo.
- **New rule/type/domain** — edit `skills/drawio/references/*.md` / `src/types.mjs` `DIAGRAM_TYPES`; for a new domain follow `docs/adding-a-domain.md`.

## Testing & QA

- Framework: **`node:test`** (built-in). `core.test.mjs` (engine), `edges.test.mjs` (edge audits), `save-guard.test.mjs` (save refuses to write inside the kit), `cli.test.mjs` (`cli-lib.mjs` pure functions).
- Covered: `core.mjs` (`loadCatalog`, `searchIcon`, `getIcon`, `styleForIcon`, `validateDiagram` + all 5 audits), `layout.mjs` (`routeLR`, `routeTB`, `centerInGapX`), `layout-engine.mjs` + `builder.mjs` (`Diagram`, `renderTree`, `group`, `icon`), `cli-lib.mjs` (`packageRoot`, `findDrawioCli` all branches, `buildRenderArgs`, `workflowText`). No fixtures, no subprocess spawns.
- Run: `bun test` (fast) and `npm test` (Node). CI runs both on push/PR to `main`: the `test` job on Node 20, the `bun` job on Bun 1.4.2 (with `--coverage`).
- No coverage gate (`bun run coverage` prints a report); no Python script tests (data builders, validated by the Node catalog tests that consume their output).
