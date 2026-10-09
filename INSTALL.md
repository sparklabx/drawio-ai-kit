# Install drawio-ai-kit

## Requirements
- Node.js 18+ (the CLI runs on Node, even when installed with Bun)
- npm (ships with Node) **or** [Bun](https://bun.sh) 1.4+ to install it

Optional (everything else works without them):
- **draw.io desktop app** — enables `drawio-ai render` (PNG/SVG export + vision self-check). If the binary isn't on PATH, set `DRAWIO_CLI` to it. On headless Linux (no display), also `apt install xvfb` and wrap exports with `xvfb-run -a`.
- **Graphviz** (`brew install graphviz` / `apt install graphviz`) — enables `vendor/autolayout.py` for large graphs (>~15 nodes), including `--tune` direction selection.

## Install

```bash
npm i -g github:sparklabx/drawio-ai-kit
# or, with Bun:
bun add -g github:sparklabx/drawio-ai-kit
```

This puts the `drawio-ai` binary on PATH. The package isn't on the npm registry —
it installs straight from GitHub. Pin a specific version for reproducibility:
`npm i -g github:sparklabx/drawio-ai-kit#<commit-sha>` (or `#v2.0.0` once a tag
exists). The `#<ref>` suffix works the same with `bun add -g`. If Bun's global bin dir isn't on PATH,
add `~/.bun/bin`. To install from a local clone instead: `npm i -g .` (the committed `dist/` is
ready to run; after editing `src/`, rebuild it with `bun run build`, which needs
[Bun](https://bun.sh); `npm link` for live edits).

The CLI is a Bun-minified production bundle in `dist/` (committed, ~76 KB of JS). It runs on
plain Node, so npm users never need Bun. The package has no install scripts, so Bun's
lifecycle-script blocking doesn't affect it.

## Add the skill

The kit ships ONE skill, `skills/drawio/` (SKILL.md + `references/` + `workflows/`), covering
AWS, Azure, GCP, Databricks, multi-cloud and BPMN. Install it with the `skills` CLI (auto-detects
Claude Code, Cursor, Codex, Gemini CLI, … and writes to each agent's skill dir):

```bash
npx skills add sparklabx/drawio-ai-kit
# or, with Bun:
bunx skills add sparklabx/drawio-ai-kit
```

Restart your agent after adding it. Try: *"draw an AWS 3-tier web app"*

Upgrading from 1.x? Remove the old domain skills first:
`npx skills remove drawio-aws drawio-azure drawio-gcp drawio-databricks drawio-bpmn`.

## Verify

```bash
drawio-ai --help
drawio-ai search s3
drawio-ai validate path/to/diagram.drawio
```
