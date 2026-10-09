# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

Use GitHub's **"Report a vulnerability"** (the repo's **Security** tab → *Report a vulnerability*),
which opens a private advisory with the maintainers. We aim to acknowledge within a few days.

## Supported versions

The latest `main` is supported.

## What this project runs (threat surface)

- **No runtime dependencies** — the package declares none. The one library it uses
  (`minisearch`) is a devDependency bundled into the committed `dist/`, which CI rebuilds
  and compares on every PR.
- **No `postinstall` (or any lifecycle) hooks** — nothing executes on `npm install`.
- The **CLI runs locally** and sends **no telemetry**. The only optional outbound
  calls are icon-logo fetches from public CDNs (lobe-icons), invoked explicitly by `drawio-ai logo`.

To remove everything:

```bash
npm uninstall -g drawio-ai-kit              # remove the CLI
npx skills remove drawio                  # remove the skill
```
