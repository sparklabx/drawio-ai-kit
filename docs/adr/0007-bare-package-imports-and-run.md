---
status: accepted
---

# ADR 0007: Bare package imports and `drawio-ai run`

## Context

Build scripts imported the engine by absolute or relative path
(`<ROOT>/src/builder.ts`, found with `drawio-ai root`). That broke in three
ways: agents copied a machine-specific path into the script, `src/` is no
longer shipped (only `dist/`), and the script could not be committed to the
user's project and re-run on another machine.

## Decision

1. **The public API is the package name.** Scripts write
   `import { Diagram, group, icon, renderTree } from "drawio-ai-kit"`. The
   package `exports` map points at `dist/kit.mjs` with types in
   `dist/types/kit.d.ts`. BPMN creators come from the same package.
2. **`drawio-ai run <script.mjs> [args]` runs a script against this install.**
   It spawns the current runtime (Node or Bun) with a preload
   (`src/run-hook.ts`) that resolves the bare name `"drawio-ai-kit"` to the
   installed kit, whatever the script's cwd or `node_modules`. Node uses
   `module.register` (hence Node >=20.6); Bun uses `Bun.plugin`.
3. **Project-local use needs no `run`.** After `npm i drawio-ai-kit` (or
   `bun add`), plain `node build.mjs` and `bun build.mjs` work and
   TypeScript users get types.
4. **`scaffold` writes the bare-import form** and a self-check tail
   (validate, render). Its output prints the exact `drawio-ai run <path>`
   command.
5. **`drawio-ai root` stays**, for one purpose: the skill tells agents never to
   write output into that folder (read-only kit rule). It is no longer used to
   find import paths.
6. `install.sh` (POSIX sh) is the one-line installer: it installs the CLI
   globally with Bun or npm, then runs `drawio-ai skill install -g -y`. It
   never installs a runtime and has a `--dry-run` mode.
7. `dist/cli.mjs` keeps the standard `#!/usr/bin/env node` shebang. A `/bin/sh`
   polyglot launcher was rejected: npm's Windows cmd-shim reads the shebang and
   would invoke `/bin/sh`. On a Bun-only machine (no `node`), `install.sh` instead
   replaces Bun's global `drawio-ai` bin with a POSIX wrapper that runs
   `exec bun "<global pkg>/dist/cli.mjs"`. Re-run `install.sh` after
   `bun update -g`. `test/install.test.ts` pins the shebang.

## Consequences

- Scripts are portable and can live in the user's repo.
- Skills and docs get shorter: no "find the root, then splice a path".
- A stale global `drawio-ai` on PATH can shadow a newer local install. The
  scaffolded script calls `drawio-ai` by bare name for validate and render.
- The hook is a runtime-specific shim (two code paths). It is covered by
  `test/run.test.ts`.
- Piping a downloaded installer into a shell is now offered. It is optional;
  the manual `npm i -g` and `bun add -g` routes remain, and the script can be
  downloaded and read first.

## Alternatives considered

- **Keep path imports via `drawio-ai root`.** Rejected: fragile, not portable,
  and incompatible with a dist-only package.
- **Require every project to install the package locally.** Rejected as the
  only route: agents work in arbitrary directories with no `package.json`.
- **A `NODE_PATH` symlink or temp `node_modules`.** Rejected: ESM ignores
  `NODE_PATH`, and writing symlinks into the user's cwd is intrusive.
