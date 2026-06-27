---
name: drawio-aws-architect
version: 0.1.0
description: Use when the user asks for an AWS architecture diagram (or any draw.io diagram heavy on AWS services). Builds the diagram with the declarative layout engine (no hardcoded coordinates), uses ground-truth AWS stencils, validates it (stencil names, colors, nesting, geometry — overlap/spill/stacked-arrows), and runs a render-based vision self-check before delivering. Default output is the .drawio file; PNG/SVG only on request. Backed by the drawio-ai-kit MCP server (search_icon / validate_diagram / render_diagram / get_principles / brand_logo).
license: MIT
---

# Draw.io AWS Architect

Produce **correct and beautiful** AWS architecture diagrams in draw.io. This skill is the workflow layer; the deterministic tools live in the `drawio-ai-kit` MCP server (or its CLI `src/cli.mjs`).

## Tools available (MCP `drawio-ai-kit`)

| Tool | Use |
|---|---|
| `search_icon` | Resolve the exact icon + ready-to-paste style — for **AWS stencils AND non-AWS tools** (the OSS packs: Big Data, Database, Databricks, CI/CD, Containers & Kubernetes, Observability, Network, AI/ML). Search by the tool's plain name (`spark`, `kafka`, `postgres`, `kubernetes`, `argocd`, `prometheus`, `pytorch`…). **Never hand-write `resIcon=` names; never draw a plain box for a named tool before searching.** |
| `get_icon_style` | Full style for a known stencil/icon name. |
| `brand_logo` | Fallback logo for a brand **not already in the catalog** (search_icon first — Kafka, MinIO, Dagster, etc. are now real catalog icons). Only for brands the packs still lack. |
| `validate_diagram` | Lint: unknown stencils, dangling edges, recolored icons, broken AWS group nesting, **geometry (overlap / child-spills-its-frame / stacked arrowheads)**, aesthetic `audit.advice`. |
| `render_diagram` | Render the XML to PNG and return the image — your built-in **vision self-check**. Look at it and fix before delivering. |
| `get_principles` | Design rules + AWS architecture preset + catalog categories. |

If the MCP server isn't registered, call the same logic via `node ~/.agents/skills/drawio-aws-architect/src/cli.mjs <search|validate|audit|logo|principles>`.

## Build with the layout engine — do NOT hand-place coordinates

Always construct the diagram with the declarative engine (`src/layout-engine.mjs` + `src/builder.mjs`), which computes every x/y/w/h and routes fan-out/fan-in edges as clean combs. Hand-written coordinates are the #1 cause of overlap/misalignment. Declare the nested structure with `group`/`frame`/`grid` + `icon`/`box`, call `renderTree(d, root)`, then `d.link(...)`. Use `grid({cols})` when an item count doesn't match a sibling row (e.g. 4 icons under 3 columns). See `examples/*.mjs` for each diagram type (read-only reference).

**Use the THEME for the house style — don't hand-pick colors.** Prefer the themed creators (`stage(id, i, title, children)` for pipeline layers, `band` for cross-cutting bands, `endpoint` for source/consumer cards, `ossBox`, `onpremFrame`) so every diagram inherits the pale, theme-aware (light-dark) palette and clean 2px edges automatically. Add `{ flow: true }` to a few main-flow edges for the animated look. The style system is `src/theme.mjs` + `rules/style-guide.md` (returned by `get_principles`).

## Where to write — NEVER into the kit folder

This skill is installed as a symlink to the `drawio-ai-kit` repo, so its folders are the live repo. **Treat the kit as READ-ONLY.** Do NOT create or write files under the kit's `examples/`, `out/`, `src/`, `catalog/`, `rules/`, or `vendor/` — that pollutes the repo (`examples/` is for generic templates only, not user diagrams).

Write the user's diagram to **their current working directory** (or a path they give). The build script lives outside the kit, so import the kit by ABSOLUTE path:

```js
import { Diagram } from "<ABS_KIT>/src/builder.mjs";          // <ABS_KIT> = absolute path to the kit
import { group, frame, icon, box, renderTree } from "<ABS_KIT>/src/layout-engine.mjs";
// ... build ...
writeFileSync("./my-architecture.drawio", d.mxfile("My architecture"));  // user's cwd, not the kit
```
Resolve `<ABS_KIT>` from the MCP server path or `~/.agents/skills/drawio-aws-architect`. Scratch files can go in the system temp dir. Either way: output belongs in the user's space, never in the kit.

## Workflow

1. **Clarify (if vague)** — diagram type (pipeline / VPC-network / event-driven / hybrid-DR), scope. **Default deliverable is the `.drawio` file only** — export PNG/SVG only if the user asks for an image.
2. **Read the rules** — call `get_principles` once. Follow `rules/principles.md` + `rules/aws-architecture.md` (grid/alignment, role-based edges, category colors, group nesting, Multi-AZ).
3. **Plan the structure FIRST** — reason out the architecture before touching any tool: the diagram type, the exact list of components (services/nodes), the containers/layers they sit in, and the edges (flow). This blueprint is what you build; it's also the *only* list of icons you'll need. Don't look icons up before you know what the diagram contains. **If the system spans several archetypes (e.g. a pipeline inside the cloud + an on-prem hybrid block + a cross-cutting band), COMPOSE them — nest each archetype's subtree; don't force everything into one type** (see "Composing archetypes" in `get_principles`).
4. **Resolve only the planned icons** — for each component in the blueprint (not a blind sweep), `search_icon` to get the exact stencil + style. **This includes non-AWS tools**: data/big-data engines (Spark, Kafka, Airflow, Flink, MinIO…), databases (Postgres, MySQL, MongoDB, Redis, ClickHouse…), Databricks, CI/CD (Jenkins, ArgoCD, Terraform…), containers/Kubernetes (Kubernetes, Docker, Helm, Istio…), observability (Datadog, Prometheus, Grafana…), network (NGINX, Kong…), AI/ML (PyTorch, TensorFlow, Ollama…) all have real icons — search by name, don't substitute a plain box or an unrelated AWS service. Only use `brand_logo` if `search_icon` returns nothing. Paste styles verbatim. (`get_principles` lists every catalog category + count.) For large graphs (>~15 nodes) describe the graph as JSON and run `python3 vendor/autolayout.py graph.json -o name.drawio` (needs Graphviz `dot`).
5. **Build with the engine** (see section above) — declare the nested structure; let `renderTree` compute layout. Containers nested in real order (`AWS Cloud→Region→VPC→AZ→Subnet→SG`); pipeline left→right; cross-cutting layers as a band. Edges via `d.link(...)` — fan-out/fan-in route as combs automatically. **Write the script + `.drawio` to the user's working directory, NEVER into the kit** (see "Where to write" above).
6. **Validate** — `validate_diagram`. Clear all `errors`, then resolve `warnings` and every `audit.advice` item (geometry overlap/spill/stacked-arrows, font/palette/fan-out/recolor/nesting). Re-validate until clean.
7. **Render + vision self-check** — call `render_diagram` to LOOK at the result (it renders to a TEMP png for your eyes only — not a deliverable, don't leave a png in the user's folder). Fix anything the static audit can't catch: lop-sided whitespace, clipped labels, edges crossing unrelated shapes, awkward routing, garish per-layer colors. Re-render. Max ~2 rounds.
8. **Deliver the `.drawio`** (default). Review with the user, apply targeted edits, re-render the self-check.
9. **Image export — ONLY if the user asks** for a PNG/SVG/PDF file:
   `drawio -x -f png -e -s 2 -o name.drawio.png name.drawio && python3 vendor/repair_png.py name.drawio.png`
   SVG/PDF: `drawio -x -f svg -e -o name.svg name.drawio`. (Write it to the user's dir, not the kit.)

**No draw.io CLI?** `render_diagram` will say so; fall back to `python3 vendor/encode_drawio_url.py --edit name.drawio` → open the printed URL, or deliver the `.drawio` only.

## Self-check checklist (before delivering)

- [ ] Built with the layout engine — no hand-written coordinates.
- [ ] `validate_diagram` → `ok: true`, no warnings, `audit.advice` empty (incl. geometry: no overlap / spill / stacked arrowheads).
- [ ] Every AWS icon came from `search_icon` (no recolor; category colors intact).
- [ ] Groups nested in real order; managed/global services outside the VPC.
- [ ] `render_diagram` vision self-check passed (no overlaps / clipped labels / crossing edges / lop-sided whitespace).
