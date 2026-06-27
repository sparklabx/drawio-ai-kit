# Repository Guidelines

`drawio-ai-kit` helps an AI draw correct, beautiful draw.io diagrams. It ships three things: a ground-truth **AWS stencil catalog** (verbatim draw.io styles, not recolored), a **declarative layout engine** that computes all coordinates (never hardcode x/y), and a **validator**. All three are exposed to an AI agent via an **MCP server** over stdio and a **CLI**. Designed to be installed into Claude Code / Claude Desktop as a skill + MCP server.

> Hard rule (see `SKILL.md`): the kit is **read-only infrastructure**. Write generated `.drawio`/`.xml` output into the user's cwd, never into the repo.

## Tech Stack

| Layer | Stack | Notes |
|-------|-------|-------|
| Runtime (MCP + CLI) | Node.js ≥18 (ESM, `.nvmrc` = 22) | `"type": "module"`; zero default exports anywhere |
| Runtime (data cook) | Python 3.11, stdlib only | regenerates `catalog/*.json`; not run by CI |
| Package manager | **npm** (`package-lock.json`, lockfile v3) | single dep: `@modelcontextprotocol/sdk` |
| Test framework | Node built-in `node:test` | no test deps |
| Rendering | draw.io desktop CLI (optional) + Graphviz `dot` (optional, for >15-node autolayout) | both probed at runtime, absent → browser-URL fallback |

## Project Overview

Two runtime layers over a prebuilt content pipeline:

- **Node layer** — `src/mcp-server.mjs` exposes 6 tools to the agent; `src/cli.mjs` exposes the same logic as 8 shell subcommands. `src/core.mjs` is the zero-dep catalog + validation engine; `src/builder.mjs` + `src/layout-engine.mjs` build diagrams declaratively.
- **Python layer** — `scripts/*.py` regenerate `catalog/*.json` from upstream sources (run manually, not in CI). `vendor/*.py` are runtime helpers (brand logos, PNG repair, URL encode, graphviz autolayout).
- **Content (read-only after generation)** — `catalog/*.json` icons, `data/shape-index.json.gz` raw index, `rules/*.md` guidance, `examples/build_*.mjs` templates.

## Architecture & Data Flow

Module graph (all named exports, no defaults):

```
cli.mjs ──▶ core.mjs ◀── mcp-server.mjs
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

**MCP tool call** → `mcp-server.mjs` `CallToolRequestSchema` handler → switches on tool name → calls `core.mjs`/vendor fn → wraps result as `{ content:[{type:'text', text}] }`, errors as `{ isError:true }`.

## Key Directories (codemap)

| Path | Purpose |
|------|---------|
| `src/` | Node ESM modules — the entire runtime (see Important Files) |
| `catalog/*.json` | **Prebuilt icon catalogs** (aws + 8 packs). Committed. One schema: `{ meta, categoryColors, groups[], icons[] }` where each icon carries verbatim draw.io `style` strings. `loadCatalog()` auto-merges every sibling file. |
| `packs/<name>/` | Source manifests for non-AWS packs: `manifest.json` (+ optional `assets/`). Fields: `name, label, devicon|slug|url, color, tags`. Tiles generated at build time → `catalog/<name>.json`. |
| `data/shape-index.json.gz` | Vendored 10,446-shape index (Apache-2.0, jgraph/drawio-mcp). Source of `catalog/aws.json`. |
| `data/lobe-icons.json` | lobehub icon name manifest (877 AI/LLM brand names) for `brand_logo`. |
| `rules/*.md` | Guidance consumed by `get_principles`: `principles.md` (grid/color/edges), `aws-architecture.md` (AWS nesting), `diagram-types.md` (7 types + 14 templates), `style-guide.md` (themed tokens). |
| `examples/build_*.mjs` | 14 declarative templates (vpc, serverless, pipeline, landingzone, …). Run → `out/<name>_kit.drawio`. |
| `scripts/*.py` | Catalog regenerators (Python 3.11, stdlib only). |
| `vendor/*.py` | Runtime helpers (third-party/MIT): autolayout, encode URL, repair PNG, aiicons. |
| `test/` | `core.test.mjs` (engine) + `installer.test.mjs` (installer). |
| `install.sh` | Thin shell entry point — `exec node src/install.mjs "$@"`. |
| `src/install.mjs` | Installer orchestrator: prereq check → source resolution → agent detection → MCP wiring → skill placement. Exports `orchestrate(io, opts)` + `buildIo()` for testability. |
| `src/installer.mjs` | Installer primitives: `AGENT_REGISTRY` (Claude Code, Claude Desktop, Codex, Gemini CLI, …), `mcpPayload`, `claudeCodeAddCommand`, `resolveSource`, `detectAgents`, `mergeJsonServers`, `mergeTomlServers`. Pure logic, no I/O. |

## Important Files

- **`src/core.mjs`** — zero-dep engine. `loadCatalog(path?)` → catalog; `searchIcon(catalog, q, {category,limit,kind})`; `getIcon`, `styleForIcon`, `styleForGroup`; `validateDiagram(catalog, xml, {strict})` → `{ok,errors,warnings,audit,stats}` running 5 audit sub-checks (`auditAesthetics`, `auditAwsConventions`, `auditEdgeLabels`, `auditGeometry`, `auditEdges`); `listCategories(catalog)`. Imports only `node:fs`/`node:path`.
- **`src/builder.mjs`** — `class Diagram(type='pipeline', {title, page})`. Methods: `icon`, `box`, `group`, `frame`, `clusterBox`, `panel`, `text`, `title`; `link(src,tgt,label,opts)` (chainable); `toXML()`, `validate()`, `mxfile(name)`. Stores catalog as `this.c`, rects in `this.R`, edge specs in `this.edgeSpecs`.
- **`src/layout-engine.mjs`** — declarative node factories `icon`, `box`, `group`, `grid`, `frame`, plus themed `stage`, `band`, `subnet`, `endpoint`, `ossBox`, `onpremFrame`; `renderTree(d, root, [x,y])`. Pure factory functions returning object literals.
- **`src/layout.mjs`** — pure-math edge router: `routeLR`/`routeTB`/`routeLRFan`/`routeTBFan`/`routeLRFanIn`/`routeTBFanIn`/`route`; helpers `centerInGapX/Y`, `centerInBoxX`, `distributeY`, `inset`, `panelSize`. No imports.
- **`src/types.mjs`** — `DIAGRAM_TYPES` (pipeline/hierarchy/network/hubspoke/hybrid/mesh/sequence); `typePreset(name)`, `edgeRounded(type,role)` (0 sharp for tree/fanout, else type's `edgeCorner`), `listTypes()`.
- **`src/theme.mjs`** — `THEME` tokens (light-dark pairs, stages, subnetPublic/Private, gaps, fonts); `stageFill(i)`, `stageStroke(i)`. One edit restyles every diagram.
- **`src/mcp-server.mjs`** — MCP server, 6 tools: `search_icon`, `get_icon_style`, `validate_diagram`, `get_principles`, `render_diagram`, `brand_logo`. Top-level `await server.connect(transport)`.
- **`src/cli.mjs`** — 8 subcommands: `search`, `style`, `validate`, `audit`, `logo`, `categories`, `types`, `principles`. All output JSON except `principles` (concatenates rules). Exits 2 on `validate` failure.
- **`src/installer.mjs`** — pure installer primitives (no I/O): `AGENT_REGISTRY` (one entry per supported agent — Claude Code, Claude Desktop, Codex, Gemini CLI; each carries `id`, `kind`, `configPath`, `present` probe); `mcpPayload`, `claudeCodeAddCommand`, `resolveSource`, `detectAgents`, `mergeJsonServers`, `mergeTomlServers`.
- **`src/install.mjs`** — installer orchestrator (impure, all I/O injected via `io`): `orchestrate(io, opts)` runs prereq → source resolution → agent detection → npm install → MCP wiring → restart guidance. `buildIo({dryRun})` builds the real I/O object. Entry point: `node src/install.mjs [--mode mcp|cli] [--agents <id,...>] [--dry-run]`.
- **`SKILL.md`** — Claude skill manifest (YAML frontmatter) + mandatory AI workflow (template-first → `search_icon` → build → `validate_diagram` → render → vision self-check).

## Development Commands

```bash
npm install              # one dep
npm test                 # node --test (runs test/*.test.mjs)
npm run mcp              # start MCP server over stdio (node src/mcp-server.mjs)
npm run cli              # node src/cli.mjs
npm run gen:catalog      # python3.11 scripts/ingest_index.py → catalog/aws.json
npx drawio-ai search s3  # via bin
```

Catalog regeneration (Python, manual, macOS-only rasterizer):

```bash
python3.11 scripts/ingest_index.py          # data/shape-index.json.gz → catalog/aws.json
python3 scripts/build_pack.py <pack>        # packs/<pack>/manifest.json → catalog/<pack>.json (default: bigdata)
```

- Installers: `bash install.sh` or `node src/install.mjs` (unified multi-agent installer; Claude Code + MCP, Claude Desktop, Gemini, Cursor, Codex).

## Runtime / Tooling Preferences

- **Node ≥18**, dev version **22** (`.nvmrc`); CI pins 20.
- **npm** (not pnpm/yarn) — respect `package-lock.json`.
- **Python 3.11** for `scripts/` and `vendor/aiicons.py`; stdlib only, no `requirements.txt`.
- `npm audit --omit=dev --audit-level=high` runs in CI and **fails on high/critical** — keep deps clean.
- **No bundler, no transpiler, no TypeScript.** Plain `.mjs`. Edit files directly; Node runs them.
- Env overrides: `DRAWIO_CATALOG` (MCP catalog path), `DRAWIO_CLI` (draw.io desktop CLI for `render_diagram`), CLI flag `--catalog PATH`.
- Optional externals: draw.io desktop CLI (PNG export), Graphviz `dot` (autolayout for >15 nodes). Both absent → `vendor/encode_drawio_url.py` browser-URL fallback (no upload).

## Code Conventions & Common Patterns

- **ESM, named exports only** — zero `export default`. `cli.mjs`/`mcp-server.mjs` are top-level scripts (no exports).
- **Error handling is split by concern:**
  - `throw new Error(...)` for builder/catalog failures (e.g. `icon()` not found, `link()` bad id).
  - `return null` for not-found lookups (`getIcon`, `styleForIcon`, `clusterBox`).
  - Structured `Result` object `{ ok, errors, warnings, audit, stats }` for validation.
  - CLI → `process.exit(0|1|2)`; MCP → `{ isError: true }` (never throw out of handler).
- **Catalog is injected**, not global. `loadCatalog()` returns the merged catalog; every `core.mjs` fn takes `catalog` as first arg; `builder.mjs` keeps it as `this.c`; MCP loads once and closes over it.
- **Declarative layout > coordinates.** Build node trees with `layout-engine.mjs` factories → `renderTree()` → `Diagram`. Hardcoding x/y defeats the kit.
- **Builder/fluent:** `Diagram.link()` and `Diagram.title()` return `this`. Node factories return plain object literals (not class instances).
- **Largely synchronous.** Only async: `await import('./types.mjs')` in `cli.mjs` `types` subcommand, and MCP `await server.connect()` / async SDK handlers. No async in core/builder/layout-engine/layout.
- **Color = identity.** Never recolor AWS icons away from their category color (`colorFor`: entry.color → `categoryColors[category]` → `#232F3E`). Group nesting order enforced by `GROUP_LEVEL`: Cloud/Account/Region=0 → VPC=2 → AZ=3 → Subnet=4 → SG=5.
- **Edge rounding policy:** `edgeRounded(type, role)` — tree/fanout roles → sharp (`rounded=0`); flow → type's `edgeCorner`.
- **Naming:** functions `camelCase`, classes `PascalCase`, module constants `SCREAMING_SNAKE_CASE`. No JSDoc `@typedef`; types implicit. JSDoc prose only on higher-level fns (`validateDiagram`, `renderTree`).

### Adding content

- **New AWS icon** — no action; comes from upstream `shape-index.json.gz`, regenerated via `ingest_index.py`.
- **New non-AWS icon** — add entry to `packs/<pack>/manifest.json` (`devicon|slug|url` + `color` + `tags`) → `python3 scripts/build_pack.py <pack>`.
- **New pack** — create `packs/<name>/manifest.json` → `build_pack.py <name>` → `catalog/<name>.json` auto-merges via `loadCatalog()`.
- **New example** — copy `examples/build_vpc.mjs`; write output to `out/`, not the repo.
- **New rule/type** — edit `rules/*.md` / `src/types.mjs` `DIAGRAM_TYPES`.

## Testing & QA

- Framework: **`node:test`** (built-in). `core.test.mjs` (engine) + `installer.test.mjs` (installer).
- Covered: `core.mjs` (`loadCatalog`, `searchIcon`, `getIcon`, `styleForIcon`, `validateDiagram` + all 5 audits), `layout.mjs` (`routeLR`, `routeTB`, `centerInGapX`), `layout-engine.mjs` + `builder.mjs` (`Diagram`, `renderTree`, `group`, `icon`). No fixtures.
- Run: `npm test`. CI runs the same on push/PR to `main`.
- No coverage gate; no Python script tests (data builders, validated by the Node catalog tests that consume their output).
