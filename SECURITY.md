# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

Use GitHub's **"Report a vulnerability"** (the repo's **Security** tab → *Report a vulnerability*),
which opens a private advisory with the maintainers. We aim to acknowledge within a few days.

## Supported versions

The latest `main` is supported.

## What this project runs (threat surface)

- **One runtime dependency** — the official `@modelcontextprotocol/sdk` — pinned via
  `package-lock.json`. `npm audit` runs in CI and must pass.
- **No `postinstall` (or any lifecycle) hooks** — nothing executes on `npm install`.
- The installer (`install.sh`, unified) is **local-only**: `npm install`,
  register the MCP server, symlink the skill. **No `sudo`, no `curl | bash`, no remote code.**
- The **MCP server and CLI run locally** and send **no telemetry**. The only optional outbound
  calls are icon-logo fetches from public CDNs (lobe-icons), invoked explicitly by `brand_logo`.

To remove everything the installer added:

```bash
claude mcp remove drawio-ai-kit --scope user   # or delete it from your host's MCP config
rm ~/.agents/skills/drawio-aws-architect
```
