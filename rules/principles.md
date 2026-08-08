# Principles for beautiful draw.io diagrams (AWS & system architecture)

Goal: draw.io XML with **correct stencil names**, **clean layout**, and a **readable flow** on the first try.

## 0. Mandatory workflow for the AI

- **Match a template first.** If the request fits an archetype with a template (the "Templates" table in `diagram-types.md` has exact `examples/<domain>/*.mjs` paths), open that file, reproduce its structure, and run the **Reproduction loop** there. Don't free-hand a pattern a template already encodes.
- **Look up every icon via `search_icon`** — do NOT recall or invent stencil names. Batch all lookups for the diagram in ONE call: `drawio-ai search "s3, lambda, nat gateway"`. Build with `icon("<name>")` using the returned `name`.

## 1. Density & compactness — pack, don't scatter (DEFAULT)

The engine computes all x/y, spacing, alignment, and sibling-size equalization; icon sizes/`aspect=fixed` come from the catalog. But it can only lay out the structure you declare — the #1 quality failure is a **sparse** sheet where every service floats alone in its own big frame. Diagrams must read **dense by default**. Structure for that:

- **Group related services into ONE labelled box, packed as a grid.** A functional area (Ingestion, Storage, Compute, Governance, Serving, AI/ML…) is a single `grid(id, null, "<Area>", { cols: 3, gap: 14, pad: 12 }, [icon, icon, …])` — NOT one `frame`/`group` per icon. **3–8 icons per area box is normal.**
- **Never give a wide/tall frame a single centered icon** — it renders as a big empty box. Either pack more services in, or drop the frame and place the icon directly.
- **Hug content:** inside a packed box use tight gaps (`gap: 12–16`) and let it size to its grid; do not hand-set oversized widths, and don't stretch a giant full-width banner.
- **Few dense boxes beat many sparse ones.** Aim for a compact grid of labelled area-boxes, each full of icons — not a scattered field of lone icons.
- Need per-component detail? Put a short caption `box` (or `note`) under the icon; keep the glyph normal-sized and the box tight — never inflate spacing to fill a page.
- One consistent icon size per diagram (`new Diagram({ iconSize })` bumps them all if a page-embedded figure needs bigger glyphs).

Sparsity is an **authoring** problem (one-icon-per-frame), not an engine limit — pack into grids and the engine hugs + balances the rest.

## 2. Flow direction

- Default **left → right** for data pipelines / request flows; **top → bottom** for tiered layering.
- Keep one consistent direction; avoid back-pointing arrows unless they represent feedback/sync (use dashed lines).

## 3. Group with official containers

Use real group shapes (`search_icon --kind group`) and nest them parent-child in the real order — see the nesting tree in your domain preset (e.g. `aws-architecture.md` "Containers").

- Use `serviceFrame(id, icon, name, opts, children)` only when one service owns or controls every child. The name is short, human-readable, and contains no generated suffix, variable, or placeholder. Its icon is flush with the top-left border and its normal-weight title sits beside it.
- `opts.borderStyle` is optional and defaults to `solid`. Set `dashed`, `dotted`, or `dash-dot` only when the user asks or the distinction materially improves the diagram.
- A service frame groups internal stages, pods, workflow states, or controls. It never replaces visible icons for separate deployed services. Keep independent services as normal icons in a normal group and connect their relationship with edges.
- Avoid deep or decorative service-frame nesting. If a short edge label already explains the relationship, use the edge.

## 4. Color — restrained & theme-aware

- Icons keep their official **category** color (hex table in the domain preset) — don't recolor icons arbitrarily.
- For **backgrounds/frames/notes**, use a **small cohesive palette** — a few neutral greys plus one or two soft accents. Do NOT scatter many ad-hoc pastel fills. Target ≤ ~8 distinct fill colors per diagram.
- **Pipeline/stage layers MAY carry a soft tint per stage** — the classic pale progression (light green → amber → yellow → purple) reads as ordered stages and looks good *when the tints are pale and cohesive*. That is desirable, not "rainbow". What to avoid is the **garish** look: saturated/clashing fills, a different colour on every small box, or colour with no meaning. For non-stage containers (Region/VPC/account), neutral grey or the AWS group stencil's own light fill is safest — let the service icons carry most of the colour.
- Prefer theme-aware tokens like `fillColor=light-dark(#fbe7d4, #3a2a16)` for backgrounds/accents so the diagram looks right in **both light and dark mode**.
- Reserve strong color for emphasis/notes (e.g. a red `#f8cecc` note box), not for every box.

## 5. Labels & typography

- Service labels kept short: service name + (role).
- **Limit to 3–4 font sizes** and keep label text **≤ 14px**; never jump to oversized (18+) titles inside the canvas — put a title in its own area.
- Long notes/constraints go in a separate **note box**, never crammed into the icon label.
- A note box is a *fallback for a note you already need*, not an invitation to add prose. If the arrows already say it, delete it; background detail belongs in the doc beside the diagram.
- Prefer structure over explanation: icons show services, containers show scope or ownership, and short edge labels show data or control flow. Do not add text that only states an absent component such as “no VPC.”

## 6. Edges — meaning is *intentional*

The builder applies the edge style, corner rounding by role, connection-point pinning, and label waypoints automatically — your calls are the *role* and the *line semantics*:

- **Solid** = primary data/control flow; **dashed** = sync/dependency/policy enforcement/lineage. Color edges by source layer to trace them.
- Double-headed arrows for bidirectional links (Direct Connect, metadata sync).
- In **dense / error-handling diagrams add deliberate waypoints** to avoid line crossings and overlaps — don't rely purely on auto-route there.
- **Point at the icon, not the box.** Linking to a container works when it holds **N replicas of one component**. When the frame holds several *different* components, an arrow on its border doesn't say which one it means.
- **Keep fan-in to about three edges.** Arrowheads spread along one face, so 4+ stack into a smudge; `role: "fanout"` won't help — it bundles the *source* side. Drop the least informative edge (move the claim into the frame label) or split the target.
- **Straight lines come from moving nodes, not re-routing** — an orthogonal edge is straight only when both nodes share an axis. `band`/`grid` space children evenly and self-centre, so to line one child up with a specific consumer use a frame with invisible spacer boxes (`fill: "none", stroke: "none"`), including a **leading** one.
- Two edges entering the same face closer than the router's 16px separation get one nudged off-axis — send it to another face with `dir`. `dir` also frees a crowded corridor when there's open space nearby, usually with fewer bends.
- A **labelled** edge freezes its waypoints, so that nudge becomes permanent. Matching `exitX`/`entryX` is not proof of a straight line — check the emitted `<Array as="points">`.

## 7. Managed vs self-managed

- **Managed** cloud services: use the official icon + (optional) a "▸ managed" label.
- Third-party/OSS components (no official icon) → rounded box clearly noting "(on EKS)"/"(on EC2)", placed next to the compute icon it runs on.

## 8. Recommended overall layout

Left: **sources/clients**. Center: the **cloud frame** holding the pipeline. Right: **consumer systems**. Cross-cutting layers (security, monitoring, governance, CI/CD) as their own band/column with dashed links to the components they touch.

## 9. Self-check

- Run `validate_diagram`; clear ALL `errors`, `warnings`, and `audit.advice` before delivering.
- **Render it and look at it every round.** `render` the PNG and `Read` it back. Make sure it should aligned with your taste, intuitive visualize, no cluster or line, no orphan service node.
- Measure using math and check manhattan rule to fix overlap line appear from your view above. Pass: build with `contract: "bake"` and read per-edge **bends** and **length vs the Manhattan minimum** (`|dx| + |dy|`) out of the XML. Measure from the **ports** (`exitX`/`exitY`). 
- Read the numbers as a hint about *layout*: small total excess over Manhattan but large individual minimums means the router is fine and the nodes are in the wrong place — the same message as `Long connector(s)` / `edge crossings`.
- The numbers are a guide, not the goal. A change that adds a bend but moves a line into open space is usually the better diagram; take it and say so.
