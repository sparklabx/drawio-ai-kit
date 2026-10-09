# Draw.io AI Kit — API Cheat Sheet (Agent Reference)

This page is the whole engine API. **Import** `drawio-ai-kit`, but never **read** its files (or `src/`) — everything you need is here.

## 1. Imports
`drawio-ai scaffold` writes these for you. Writing a script by hand? Everything comes from ONE package. Run the script with `drawio-ai run build.mjs`
(it resolves `drawio-ai-kit` to the installed CLI, so no node_modules is needed):
```javascript
import { writeFileSync } from "node:fs";
import { Diagram, group, frame, grid, icon, box, phantom, renderTree, stage, band, subnet, endpoint, ossBox } from "drawio-ai-kit";
// BPMN creators come from the same package:
import { pool, start, end, gateway, userTask, serviceTask, task } from "drawio-ai-kit";
```

## 2. Layout Elements
Build node trees declaratively. **No hardcoded coordinates.**

### Leaf Nodes
- `icon(id, name, label, opts)`: Draws a catalog icon.
  - `name`: Catalog name (e.g., `"s3"`, `"databricks"`).
  - `label`: Display text below the icon.
- `box(id, label, opts)`: Auto-sized text box. Width/height are computed from text length unless overridden in `opts: { w, h }`.
- `endpoint(id, label, opts)`: Source/consumer card (entry/exit point, styled blue frame).
- `ossBox(id, label, opts)`: Plain open-source/component box (white fill, neutral border).

### Containers (Frames & Groups)
- `frame(id, label, opts, children)`: White frame with colored border and header text.
  - `opts: { dir: "col"|"row", gap: 12, stroke: "#HEX", fill: "#HEX", align: "center"|"left"|"right" }`
- `group(id, gname, label, opts, children)`: Native cloud group container (e.g., VPC, Region, Subnet).
  - `gname`: `"group_region"` | `"group_vpc"` | `"group_subnet"` | `"group_account"` | `"group_availability_zone"`.
  - `opts: { dir: "col"|"row", gap, fill, stroke, priv: true|false, stack: N }`
  - `stack: N` draws the frame as N offset cards (multiplicity) — the AWS idiom for N **identical** copies
    (Dev/Test/Prod accounts, mirrored regions). Draw ONE structure, label it once; NEVER nest environments
    (nesting means containment). Use peer frames only when the environments genuinely differ.
- `grid(id, gname, label, opts, children)`: **The packing primitive** — lays children into `cols` columns of
  equal cells. Use it for every functional area (3–8 icons per box) instead of one frame per icon.
  - `opts: { cols: 3, gap: 14, pad: 12, fill, stroke }`
  - **Pick `cols` to balance siblings.** Frames side by side share a bottom edge only while their heights
    are close (the engine stops equalising past ~200px of stretch, so a far-shorter box hugs its content
    rather than becoming a white hole). For a level row, choose `cols` per box so `ceil(n/cols)` (the row
    count) comes out close across siblings — 5 icons at `cols:2` = 3 rows sits level with a 2-row neighbour.
- `stage(id, i, label, children, opts)`: Pipeline stage column. `i` is 0-based index (applies pale per-stage border color).
- `band(id, label, children, opts)`: Cross-cutting row band (governance/security/ops).
- `subnet(id, label, children, opts)`: AWS/Cloud subnet container. Border green if label contains `"Public"`, teal if `"Private"`.
- `phantom(id, label, opts, children)`: Invisible layout container used to group columns/rows without rendering a boundary.

## 3. Diagram Builder
- `const d = new Diagram(type, opts)`: Initializes a diagram.
  - `type`: `"pipeline"` | `"hierarchy"` | `"network"` | `"hubspoke"` | `"hybrid"` | `"mesh"` | `"sequence"`.
- `renderTree(d, rootNode, [x, y])`: Computes layout, places elements, and emits cells into diagram `d` starting at `[x, y]` (default: `[40, 70]`).
- `d.link(srcId, tgtId, label, opts)`: Connects two nodes.
  - **Default to a bare `d.link(src, tgt)` with no routing opts** — the router picks the facing side and
    port itself (it "attacks" the nearest side: a target to the left is entered on its left, a node below
    on its top) and de-collides parallels. Add a routing opt only after a render shows a plain link failing.
  - `opts: { flow: true }`: Animated flow (main pipeline path).
  - `opts: { dash: true }`: Dashed line (sync/DR/governance/lineage).
  - `opts: { role: "fanout" }`: Sharp, bundled comb routing for 1-to-N fan-out.
  - `opts: { dir: "LR"|"TB" }`: Force horizontal-first / vertical-first exit — only when the auto side is wrong.
  - `opts: { rounded: true }`: Rounded corners (BPMN sequence flow, flow edges).
  - `opts: { route: { es: "R", en: "L" } }`: Pin exit/entry sides (`L`/`R`/`T`/`B`). Last resort — it usually moves crowding elsewhere.
  - `opts: { rail: "top"|"bottom", lane }`: ONLY for a long edge that would cut through the dense middle
    (a feedback edge across many columns). NOT for a short feedback between nodes at a similar level — a
    plain link connects them side-to-side, which is tidier than dropping to a gutter and looping.
- `d.clusterBox(id, childIds, label, opts)`: Draws a dashed, no-fill frame spanning multiple children after `renderTree`.
  - `opts: { icon, stroke, dashed: true, pad, padTop }`
- `d.validate()`: Audits diagram rules. Returns `{ ok, errors, warnings, audit: { advice } }`.
- `d.link(a, b, label, { step: 1 })`: Numbered badge on the edge (request walkthroughs, type `"sequence"`).
  `badgePos: -1…1` slides the badge/label toward the source (-1) or target (1) when it lands on a caption.
- `d.title(text)`: Page title, centered over the diagram.
- `d.mxfile(title)`: Returns the raw XML string for saving: `writeFileSync(path, d.mxfile("Title"))`.

## 4. BPMN (swimlanes)
Use `new Diagram("bpmn")` and ONE `pool` as the tree root. Every child carries `{ lane, col }`
(0-based lane index, column index); the engine places it in that cell. `phases` are header labels
over the columns — each phase spans an even share of the columns (3 phases × 6 cols = 2 cols each).
BPMN links: pass `{ rounded: true }` for sequence flow, `{ dash: true }` for message flow between pools.
```javascript
const proc = pool("order", "Order Management", { lanes: ["Customer", "Sales"], phases: ["Intake", "Review"] }, [
  start("s1", { lane: 0, col: 0, label: "Order received" }),
  userTask("t1", { lane: 0, col: 1, label: "Place order" }),
  gateway("g1", { lane: 1, col: 2, label: "Approved?" }),        // type: exclusive | parallel | inclusive | event
  end("e1", { lane: 1, col: 3, label: "Done" }),                  // type: none | terminate | error | cancel
  end("e2", { lane: 0, col: 3, label: "Rejected", type: "error" }),
]);
renderTree(d, proc);
d.link("s1", "t1"); d.link("t1", "g1"); d.link("g1", "e1", "yes"); d.link("g1", "e2", "no");   // a gateway must split or merge
```
- Creators: `start` · `intermediate` · `end` · `gateway` · `task` · `userTask` · `serviceTask` · `manualTask` · `scriptTask` · `businessRuleTask` · `subProcess`.
- `pool(..., { orientation: "vertical" })` for vertical swimlanes.

## 5. Design Rules & Themes
- **Theme Colors:** Coral = `"#FF3621"`, Navy = `"#1B3139"`, VPC = `"#8C4FFF"`, Store = `"#B0752A"`.
- **Nesting Hierarchy:** Group levels are Cloud/Account/Region (0) → VPC (2) → AZ (3) → Subnet (4) → SG (5).
- **Recoloring Policy:** Never change catalog icon colors. Let the icons carry the color, keep frame backgrounds pale white (`light-dark(#ffffff, #0f1620)`).
