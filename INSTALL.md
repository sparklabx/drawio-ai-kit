# Install drawio-ai-kit

## Requirements
- Node.js 20.6+ **or** [Bun](https://bun.sh) 1.4+ (the bundle runs on either)
- npm (ships with Node) **or** Bun to install it

Optional (everything else works without them):
- **draw.io desktop app** — enables `drawio-ai render` (PNG/SVG export + vision self-check). If the binary isn't on PATH, set `DRAWIO_CLI` to it. On headless Linux (no display), also `apt install xvfb` and wrap exports with `xvfb-run -a`.
- **Graphviz** (`brew install graphviz` / `apt install graphviz`) — enables `vendor/autolayout.py` for large graphs (>~15 nodes), including `--tune` direction selection.

## Install

```bash
npm i -g drawio-ai-kit
# or, with Bun:
bun add -g drawio-ai-kit
```

This puts the `drawio-ai` binary on PATH. The npm package is about 2 MB, so the install takes seconds.
Releases are published from CI with npm provenance, so each version traces back to its commit and workflow run.
Pin a version with `drawio-ai-kit@3.0.0`.

One-line alternative: `install.sh` in this repo installs the CLI (Bun or npm) and registers the skill. See the README Quick start; `sh install.sh --dry-run` prints what it would run.

As a project dependency (for scripts and TypeScript types): `npm i drawio-ai-kit` (or `bun add drawio-ai-kit`), then `import { Diagram } from "drawio-ai-kit"`.

If Bun's global bin dir isn't on PATH, add `~/.bun/bin`.

Fallback when the registry is blocked: build from a clone. `dist/` is not committed (CI builds it),
so installing straight from the GitHub repo has nothing to run. In a clone:
`npm ci && bun run build && npm i -g .` (the build needs [Bun](https://bun.sh); use `npm link`
for live edits and re-run `bun run build` after editing `src/`).

The CLI is a Bun-minified production bundle in `dist/`, built by CI at release (never committed). It runs on
plain Node or Bun, so npm users never need Bun. The package has no install scripts, so Bun's
lifecycle-script blocking doesn't affect it.

## Add the skill

The kit ships ONE skill, `skills/drawio/` (SKILL.md + `references/` + `workflows/`), covering
AWS, Azure, GCP, Databricks, multi-cloud and BPMN. Install it with the `skills` CLI (auto-detects
Claude Code, Cursor, Codex, Gemini CLI, … and writes to each agent's skill dir).
`drawio-ai skill install` hands the skill folder of the package you just installed to that CLI, so nothing is downloaded twice:

```bash
drawio-ai skill install            # interactive: pick agents + scope
drawio-ai skill install -g -y      # every detected agent, user-wide, no prompts
drawio-ai skill install -a claude-code -y
```

Any extra flags pass through to `skills add`. Without the CLI, `npx skills add sparklabx/drawio-ai-kit` still works,
but it clones the repo.

Restart your agent after adding it. Try: *"draw an AWS 3-tier web app"*

Upgrading from 1.x? Remove the old domain skills first:
`npx skills remove drawio-aws drawio-azure drawio-gcp drawio-databricks drawio-bpmn`.

## Verify

```bash
drawio-ai --help
drawio-ai search s3
drawio-ai validate path/to/diagram.drawio
```
