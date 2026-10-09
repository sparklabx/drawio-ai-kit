---
status: accepted
---

# ADR 0006: TypeScript source, bundled devDependencies

## Context

`src/` was plain `.mjs` with JSDoc and implicit types. Shapes shared by several
modules (layout nodes, catalog entries, validation results) were only
documented in prose, and refactors had no compiler check. The project also
promised **zero runtime dependencies** (ADR-0002), which ruled out any helper
library, even a small one that Bun could inline into `dist/`.

Users never run `src/`. They run the minified `dist/` bundle that Bun builds.
So a dependency that is bundled costs users nothing: they install no extra
package and `npm audit --omit=dev` stays clean.

## Decision

1. **`src/` and `test/` are erasable-syntax TypeScript** (`.ts`): no enums,
   namespaces or parameter properties. Node 22.18+ and Bun run it unchanged;
   `npm run typecheck` (`tsc`) is the type gate. There is no transpiler; Bun
   is used only to bundle `dist/`.
2. **Shared types live in `src/model.ts`**, types only, so it erases to nothing
   at runtime. A type used by one module stays in that module.
3. **`dist/` ships types**: `dist/types/*.d.ts` is generated and committed, and
   `package.json` `exports["."].types` points at `dist/types/kit.d.ts`. Users
   who import `"drawio-ai-kit"` get typings.
4. **The zero-runtime-dependency rule is dropped.** Libraries go in
   `devDependencies` and Bun bundles them into `dist/`. A real `dependencies`
   entry is allowed only when the library cannot be bundled (native addon, a
   separate WASM file, dynamic `require`).
5. **`package-lock.json` is the only lockfile.** `bun.lock` is never committed.
6. Support floor: Node >=20.6 (needed for `module.register`, see ADR-0007) or
   Bun.

## Consequences

- Type errors are caught before `dist/` is built; shared shapes have one
  definition.
- `dist/` grows when a library is bundled (minisearch: 77 KB to 98 KB of
  `.mjs`, see `bench/RESULTS.md`). The npm tarball stays under the 2.5 MB
  budget enforced in CI.
- `dist/` must be rebuilt and committed after any `src/` change; CI fails on
  drift (`bun run build:check`).
- Contributors must run the bench gates (`AGENTS.md`) because a bundled
  library can move cold-start time.
- README, SECURITY.md and `AGENTS.md` no longer claim "zero dependencies".
  The safety story is: no lifecycle hooks, no runtime installs, reproducible
  `dist/`.

## Alternatives considered

- **Keep `.mjs` with JSDoc types (`checkJs`).** Rejected: verbose, and shared
  types still have no single home.
- **Compile with `tsc` to `dist/`.** Rejected: a second build tool; Bun already
  bundles and minifies.
- **Keep zero-deps and hand-write each helper.** Rejected: the search rewrite
  (ADR-0008) showed that a hand-written scorer lost to a tested library on
  typos, plurals and multi-keyword queries.
- **Real `dependencies`.** Rejected as the default: every user would install
  and audit them, and `dist/` would no longer be self-contained.
