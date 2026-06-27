# Glossary

The canonical vocabulary for the drawio-ai-kit project. Implementation details
live in code and ADRs, not here.

## Kit

**drawio-ai-kit** — the deterministic *tooling backend*. The repo itself: the
AWS/OSS stencil `catalog/`, the `src/mcp-server.mjs` MCP server, the
`src/cli.mjs` CLI, the `src/builder.mjs` + `layout-engine.mjs` diagram engine,
and the `rules/`. Requires `npm install` + Node 18+. Has no opinions about
which agent consumes it.

## Skill

**drawio-aws-architect** — the `SKILL.md` *workflow instructions* an agent
reads to produce diagrams. The agent-facing frontend. Distinct from the Kit: a
Skill is inert without a Kit behind it. One Kit backs the Skill in either of
two modes (MCP server or CLI shell-out).

## Agent

The coding assistant the Kit+Skill is being installed *into* — Claude Code,
Claude Desktop, Codex, Gemini CLI, Cursor, etc. Each Agent has its own skills
directory and (for MCP) its own server-config file/format.
