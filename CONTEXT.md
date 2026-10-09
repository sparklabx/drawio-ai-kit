# Glossary

The canonical vocabulary for the drawio-ai-kit project. Implementation details
live in code and ADRs, not here.

## Kit

**drawio-ai-kit** — the deterministic *tooling backend*. The repo itself: the
AWS/OSS stencil catalog, the `drawio-ai` CLI, the diagram engine, and the
rules. A zero-dependency global npm package
(`npm i -g drawio-ai-kit`) on Node 18+. Has no opinions about which
agent consumes it.

## CLI

**`drawio-ai`** — the Kit's sole tool surface: the deterministic commands an
agent shells out to (`search`, `validate`, `render`, `principles`, `workflow`,
`logo`, `root`, …). Replaced the former MCP server; there is no MCP mode.
Skills call the CLI at any time.

## Shared Workflow

The build → validate → render → write-path loop every diagram follows (`skills/drawio/workflows/build.md`),
served once by `drawio-ai workflow` (not copied into each skill).

## Skill

The single agent-facing frontend, `skills/drawio/`. `SKILL.md` routes: check the CLI, ask the
user only what's missing (domain, scope), load **one** domain reference from `references/`, then
run `workflows/build.md`. Replaced the five per-domain Domain Skills at 2.0.0 — a capable agent
picks the domain by asking, so one skill with strong references beats five thin ones. Written in
short explicit steps so a small model (Haiku-class) can drive it. Inert without the Kit behind it.

## Agent

The coding assistant the skill is installed *into* — Claude Code, Codex,
Gemini CLI, Cursor, etc. Each Agent has its own skills directory; skills are
distributed via the standard npm skills tooling.

## Output contracts

The kit can emit a diagram under one of two contracts with the draw.io editor.
Which one is in force is a per-render choice, not a property of the diagram.

**Scaffold** — the drag-resilient contract. Edges carry only their pinned
connection sides (`exitX`/`exitY`/`entryX`/`entryY` fractions) and **no** frozen
waypoints, so draw.io's native `orthogonalEdgeStyle` recomputes the route from
the terminal bounds on every edit. A human moving an element never has to
re-link arrows — they follow automatically. This is the default, and the one
that serves the kit's "easy to pick up and edit later" north star. Route
quality is capped by draw.io's native engine.

**Bake** — the presentation contract. A full route (collision-free, nudged,
deterministic) is computed up front and frozen into the XML as absolute
waypoints. Gorgeous on first open and for final export to PNG/PDF, but the
route deforms if a human edits it — the kit's own comment says "Clear Waypoints
in draw.io to re-flow after moving a node." Opt-in — selected at diagram build
time (`{ contract: "bake" }`), so the waypoints are baked into the `.drawio`
before `drawio-ai render` ever runs.

The tension is irreducible: a pre-computed route and a drag-resilient route are
different contracts. A route either freezes on drag (bake) or is discarded on
drag (scaffold). There is no third option.

## Frame

A **container** in the layout tree that holds children. Two species, which the
output treats differently:

- **Visible frame** — a container that means something in the topology (VPC,
  Account, Region, VNet). Has a real stroke. Emits a real `<mxCell>` and is the
  parent of its children, so it supports draw.io group-move (drag the frame,
  contents follow). An arrow to a visible frame is meaningful and follows the
  frame on drag.
- **Phantom frame** — an invisible layout-only wrapper (`stroke:none`), used
  purely to compute geometry during layout. Emits **no cell**: its children are
  reparented to the nearest visible ancestor. It exists only at layout time.
  An arrow to a phantom frame is meaningless and is a build error.

## Router

The edge-routing engine that decides how arrows run between elements. Two
coexist:

- **Kit router** — the in-process A* + nudge orthogonal router. Collision-free,
  deterministic, zero-dependency. Used for the bake contract.
- **Graphviz** (`dot`, optional) — an external binary detected at runtime. When
  available it replaces the kit router for the bake contract, producing
  higher-quality presentation routes. When absent, the kit router is the
  fallback. It is **never** consulted at drag time — drag-time routing is
  always owned by draw.io's native engine, regardless of which router produced
  a bake.

**Pin** — an arrow's connection point, expressed as exit/entry side fractions
(`exitX`/`exitY`/`entryX`/`entryY`) against a terminal's bounding box.
Recomputed against live bounds on every drag, so a pin always follows the
element it is attached to. The only routing signal that survives editing.
