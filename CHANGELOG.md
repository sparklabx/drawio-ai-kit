# Changelog

All notable changes to `drawio-ai-kit`. Format follows [Keep a Changelog](https://keepachangelog.com/);
versions follow [SemVer](https://semver.org/).

## [2.0.1] - 2026-10-10

The first public 2.x release (npm already held an early `2.0.0` build that never had real users). It folds in the earlier 2.0.0 work (one skill, a bundled CLI) and the planned 3.0.0 work
(TypeScript, a new search engine, a new installer). The characterization snapshots of the kit's output did not change. Numbers come from `bench/RESULTS.md`.

### Breaking
- **One skill** (`skills/drawio/`) replaces the five domain skills. Each domain is now a reference file.
- The CLI ships as a Bun-minified bundle that runs on Node or Bun. The maintainer toolchain moved to Bun,
  and CI tests on both runtimes.
- Install from the npm registry (`npm i -g drawio-ai-kit` / `bun add -g`). The new command
  `drawio-ai skill install` passes the bundled skill to the `skills` CLI.
- **Engines: Node ≥ 20.6 or Bun ≥ 1.4** (was Node ≥ 18). `install.sh` checks for Node 20.6 or later.
- **Scaffolds import by name.** Generated scripts use `import { Diagram } from "drawio-ai-kit"`.
  Run them with `drawio-ai run script.mjs` (or install the package locally). Path-based imports still resolve.
- **Search result shapes.** `search "a, b, c"` (comma form) returns an object keyed per keyword.
  `search "a b c"` (space form) returns one merged list that takes hits from each keyword in turn.
  Ranking differs from 1.x. `--full` output no longer has `score`.
- **Valueless string flags** (e.g. `--mode` with no value) now fall back to the default instead of
  being read as `true`.
- **`dist/` is no longer committed.** CI builds it, and so does the release job.
  **The npm registry is the only supported install source.** Installing from git or GitHub is no longer supported.

### Added
- **TypeScript sources** (`src/*.ts`), using only erasable syntax with strict checks. They run as-is on Bun and on Node 22.18+
  (type stripping). The published package ships `.d.ts` types under `dist/types`.
- **Importable package**: bare `import "drawio-ai-kit"` from any Node or Bun project, with named exports
  (`Diagram`, layout factories, `loadCatalog`, …).
- **`drawio-ai run <script>`** runs a diagram script with bare imports resolved to the installed kit,
  through a Node `module.register` hook or a Bun preload plugin.
- **minisearch-based icon search**, with:
  - an alias table (`data/aliases.json`: `k8s`, `pg`, `es`, `tf`, …)
  - typo correction against the catalog vocabulary (1 edit for 4-letter words, 2 from 5 letters; swaps count as one),
    so `kubernets`, `terafrom`, `promethues`, `cloud wtach` rank the right icon first
  - plurals, vendor scoping and stopwords
  - multi-keyword queries
  - an exact or alias fast path that fills the rest of the results with icons sharing the name prefix
- **`install.sh`**, a POSIX one-line installer:
  - uses Bun if present, otherwise npm
  - registers the skill
  - installs `drawio-ai-kit@latest` by default (`--version` to pin)
  - links `drawio-ai` into `~/.local/bin`, or `BIN_DIR` / `--bin-dir`, and prints a PATH hint if that dir isn't on PATH
  - flags: `--version`, `--bin-dir`, `--runtime`, `--no-skill`, `--agent`, `--dry-run`
  - on Bun-only machines, writes a small wrapper so `drawio-ai` runs without Node
  - removes old installs before installing, so exactly one copy remains (`--no-clean` to skip):
    - global copies from npm or Bun, including old git installs, and the Bun wrapper
    - pre-2.0 skills and the skill folders and symlinks left by pre-1.0 installers
    - the pre-1.0 `drawio-ai-kit` MCP entry
- **Benchmarks**:
  - `scripts/bench.mjs`: perf, compared against `bench/baseline.json` with a 10% tolerance.
  - `scripts/bench-search.mjs`: 166 labeled queries in 12 scenarios (53 typo queries, all top-1).
- **Characterization tests** (`test/characterization/`) that snapshot CLI and builder output.
- CI checks the package size budget, smoke-tests the tarball and publishes to npm with provenance.
- `suggest-layout` warning for wasted white space; `stack:N` layout option.
- Numbered step edges on service pipeline spines.
- ADRs 0006 (TypeScript), 0007 (package import + `run`), 0008 (minisearch).

### Improved
- **Search quality**: on the original 98-query set, the pass rate went from 60.2% to 100%. All 166 queries
  in the current set pass. `k8s, pg, es` returns Kubernetes, PostgreSQL and Elasticsearch in the top K.
- Icon packs load lazily from a slim catalog index, and each catalog is parsed once per process.
- Icons are embedded as minified SVG. PNGs were shrunk to 96 px.
- **Startup and memory** (`drawio-ai root`):

  | Runtime | Time | RSS |
  |---|---|---|
  | Node | 24 → ~20 ms | 54 → 40 MB |
  | Bun | 15 → ~11 ms | 26 → 16 MB |

  Importing the kit on Node went from 5.7 ms to 1.6 ms, because the catalog now loads lazily.
- **Known tradeoff**: the first search that misses the exact or alias fast path costs about 10 ms more
  on a cold start, because the index is built then.
- **CI**:
  - runs on `main` and `v2`
  - the Bun job builds `dist/`, checks that the build is deterministic and shares `dist/` as an artifact
  - tests run on Node 24, and a smoke test checks the bundle on Node 20.6.0
- **Releases**: npm `latest` publishes from the `v2` branch when `package.json` gains a new version (CI then tags
  it). Other versions publish from `vX.Y.Z` tags under `release-<major>`.

### Fixed
- `render` was broken: draw.io page indexes are 1-based.
- Edges stay off frames and captions. Fixed pointless kinks, and fixed the straightener merging two wires onto one track.
- Caption height follows the line count; the equal-height stretch is capped.
- Subnet icons use the padlock glyph. `group_security_group` was labeled "Private subnet" and now has the right label.
  Searches now favour icons whose name ends with the query's main noun.
- `skill install` uses `bunx` under Bun and reports a missing launcher instead of crashing.
- `dist/cli.mjs` keeps a `#!/usr/bin/env node` shebang, so the Windows npm shims work.
- `spanV` now falls back cleanly when it is given no members. Public types match the runtime exports.

## [1.0.2] - 2026-08-04

### Added
- Layouts are compact by default. Added numbered step badges, balanced fill and thin black edges,
  and polished the templates.
- `validate` runs a Well-Architected architecture audit.
- CI runs a gitleaks secret scan and a deep Semgrep scan. Pinned actions moved to their Node 24 majors.

### Fixed
- Step labels on edges carry a text prefix, and ports snap so arrows no longer run through nodes (#58).

## [1.0.1] - 2026-07-15

### Added
- Batch icon search, with the same depth as single-query search.
- An API cheatsheet. The CLI commands are auto-approved in the agent permission settings.

### Changed
- Agent-facing CLI output uses about 50% fewer tokens. More token cuts came from subagent delegation, clean templates
  and freezing the engine's waypoints.

### Fixed
- Search expands shorthand aliases, so common open-source tool names resolve.
- The Databricks skill is portable. `validate` rejects compressed `.drawio` files.

## [1.0.0] - 2026-07-10

### Changed
- **CLI only**: the MCP server and its installer were removed, along with the SDK dependency (ADR 0002 supersedes ADR 0001).
- The large root `SKILL.md` was replaced by five thin domain skills.

### Added
- CLI commands: `root`, `workflow`, `render`, `principles --mode`.
- Phantom frames, scaffold and bake contracts, a layout registry and optional Graphviz autolayout,
  with `route_score` and `--tune` to pick the layout direction.
- The router chooses sides by cost, uses a heap-based A* and falls back safely.

## [0.3.0] - 2026-07-03

### Added
- Azure and GCP icon packs, a Databricks Data Intelligence Platform reference, and canonical
  examples for each.
- BPMN swimlane diagrams.
- A libavoid-style nudge pass in the edge router.
- `save()` detects the user's workspace and refuses to write into the kit repo.

### Fixed
- The validator detects duplicate cell IDs.

## [0.2.0] - 2026-06-28

### Added
- A* router that avoids obstacles and places elbows with awareness of containers.
- Multi-agent installer built on the `skills` package (ADR 0001).
- A `clusterBox` spanning frame drawn on a lockable boundaries layer.
- Icon packs: open-source logos, Confluent, Keycloak, OpenMetadata, Starburst.
- CI (audit + test), `SECURITY.md`, MIT license and `NOTICE`.

## [0.1.1] - 2026-06-19

### Added
- Icon packs: containers, observability, network, AI/ML, big data, Databricks, database, CI/CD.

## [0.1.0] - 2026-06-18

### Added
- First release: an AI toolkit for AWS draw.io diagrams.
- `Diagram` builder, a declarative layout engine (no hardcoded coordinates) and a registry of diagram types.
- Edge router with fan-out/fan-in combs, obstacle avoidance and automatic direction.
- House design system (theme tokens) and a geometric validator.
- Template examples and a one-line installer.

[2.0.1]: https://github.com/sparklabx/drawio-ai-kit/compare/v1.0.2...v2.0.1
[1.0.2]: https://github.com/sparklabx/drawio-ai-kit/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/sparklabx/drawio-ai-kit/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/sparklabx/drawio-ai-kit/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/sparklabx/drawio-ai-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sparklabx/drawio-ai-kit/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/sparklabx/drawio-ai-kit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sparklabx/drawio-ai-kit/releases/tag/v0.1.0
