# ADR 0001: Multi-agent installer via the `skills` package

- **Status:** Accepted
- **Date:** 2026-06-27

## Context

The Kit (`drawio-ai-kit`) ships an agent-facing **Skill** (`drawio-aws-architect`,
in `SKILL.md`) whose value lives in its MCP tools (`search_icon`,
`validate_diagram`, `render_diagram`, …) backed by `src/mcp-server.mjs`,
`catalog/*.json`, and `node_modules`. The Skill is inert without that backend.

Today two **Claude-only, non-interactive** scripts install it: `install.sh`
(Claude Code, via `claude mcp add`) and `install_desktop.sh` (Claude Desktop,
via JSON edit). Both symlink the whole repo *in-place* as the Skill and register
MCP for one target. There is no path to other agents (Codex, Gemini CLI, Cursor,
…).

The [`skills`](https://github.com/vercel-labs/skills) package (`npx skills add`)
is the open ecosystem tool for placing Skill files into 72+ agents' skills
directories — but it is **only a file distributor**: it never runs `npm install`,
never registers an MCP server, and has no install hooks (verified in
`installer.ts` / `install.ts`). So it can never install *this* Skill end-to-end.

Research into how each target agent adds an MCP server shows only **Claude Code**
has an `mcp add` CLI; the rest are config-file edits — three JSON
(`claude_desktop_config.json`, `~/.gemini/settings.json`, `~/.cursor/mcp.json`,
all sharing the `mcpServers.<name> = {command, args, env?}` schema) and one TOML
(`~/.codex/config.toml` → `[mcp_servers.<id>]`).

## Decision

Adopt a **synthesis**: one interactive installer owns the Kit + MCP wiring;
`npx skills add` owns the Skill-file fan-out.

**Division of labor**

| Concern | Owner |
|---|---|
| Place `SKILL.md` into N agents (canonical copy + symlinks) | `npx skills add` |
| `npm install` in the canonical dir | our installer |
| Per-agent MCP server registration | our installer |

**Canonical location.** The Kit and the Skill live together at the `skills`
package's canonical dir, `~/.agents/skills/drawio-aws-architect` (a copy of the
repo, with deps installed). Universal agents (Codex, Cursor, Cline, Amp, …) read
it directly; Claude Code / Gemini get a symlink. One physical copy, shared.

**Backend modes (user-selectable).**
- *MCP mode* — installer also writes each selected agent's MCP config pointing
  at `node ~/.agents/skills/drawio-aws-architect/src/mcp-server.mjs`.
- *CLI mode* — no MCP config written; the agent reaches the Kit via the
  `node …/src/cli.mjs` fallback that `SKILL.md` already documents. This is what
  makes the Skill **universal**: any agent is functional, MCP-wired or not.

**Installer shape.** `install.mjs` (Node — this is a Node-first repo, and JSON
+ TOML config writes are trivial in Node) behind a thin `install.sh` shim that
preserves `curl … | bash` / `./install.sh` ergonomics. It replaces both legacy
scripts. MCP wiring uses three mechanisms: shell out to `claude mcp add`
(Claude Code); JSON-merge `mcpServers` into a path-parameterized file (Claude
Desktop, Gemini, Cursor — one helper); TOML-merge `[mcp_servers.drawio-ai-kit]`
(Codex). The `command`/`args` payload (`<abs-node>` + `<canonical>/src/mcp-server.mjs`)
is computed once and fanned out.

**Interactive flow.** detect installed agents → multi-select targets → global
MCP/CLI toggle → place (`skills add -g -a <agents>`) → `npm install` → wire MCP
for the supported subset. Re-runs are idempotent (re-sync canonical, re-install,
re-merge configs).

**Source resolution.** If run inside a clone → `npx skills add .`; if run via
`curl | sh` with no clone → `npx skills add sparklabx/drawio-ai-kit`.

## Consequences

- One installer, five MCP-wired agents + CLI fallback for the rest; both legacy
  scripts and the `drawio-aws-architect.skill` zip are deleted.
- `SKILL.md` is updated so its CLI-fallback path resolves the canonical Kit
  (`~/.agents/skills/drawio-aws-architect`), not the old `~/.claude/skills/…`
  symlink assumption.
- Runtime dependency on `npx` (network on first run to fetch the `skills`
  package). No new dependency is added to the Kit's `package.json`.
- The canonical copy is a **snapshot**; refresh it with `npx skills update`
  after iterating on a dev clone.

## Alternatives considered

- **Self-contained installer, hardcode the ~5 agent skills-dir paths** (no
  `skills` package). Rejected: re-implements the agent map the ecosystem already
  maintains, and loses the universal long tail for ~no gain since `skills add`
  still can't do the Kit/MCP work either way.
- **Pure `npx skills add` as the single entry.** Rejected: it cannot `npm
  install` or register MCP, so the Skill would be inert.
- **CLI-only (drop MCP entirely).** Rejected: loses live MCP tool-calling, which
  is the Skill's primary value, for no real simplification (the Kit must still be
  cloned + deps installed).
