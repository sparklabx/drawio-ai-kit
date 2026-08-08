# Repository Guidelines

`drawio-ai-kit` helps an AI draw correct, beautiful draw.io diagrams.

> [!IMPORTANT]
> **Hard rule (see `SKILL.md`)**: The kit is **read-only infrastructure**. Write generated `.drawio`/`.xml` output into the user's cwd, never into the repo folder.

## Tech Stack & Runtime
- **Node.js ≥18** (ESM, `.nvmrc` = 22) - `"type": "module"`; zero default exports (named exports only).
- **npm** (respect `package-lock.json`). Node built-in `node:test` (no test deps).
- For complete details on the architecture, directories, and files, see [docs/developer-guide.md](file:///Users/vanhungdo/Documents/Work/VCB/test/drawio-ai-kit/docs/developer-guide.md).

## Code Conventions & Common Patterns
- **No bundler, no transpiler, no TypeScript.** Plain `.mjs` only.
- **Catalog injection**: `loadCatalog()` returns the merged catalog; every `core.mjs` function takes `catalog` as first arg; `builder.mjs` stores it as `this.c`.
- **Declarative layout > coordinates**: Build node trees with `layout-engine.mjs` factories (`group`/`frame`/`grid` + `icon`/`box`) → `renderTree(d, root)` → `Diagram`. Hardcoding x/y coordinates violates the design pattern.
- **Color = Identity**: Never recolor AWS icons away from their category color (`colorFor`: entry.color → `categoryColors[category]` → `#232F3E`).
- **Nesting Hierarchy**: `validateAwsHierarchy` enforces black AWS Cloud → Account → Region for every service and VPC → AZ → Subnet → SG for deeper network groups.
- **Edge Rounding Policy**: Tree/fanout roles → sharp (`rounded=0`); flow → type's `edgeCorner`.
