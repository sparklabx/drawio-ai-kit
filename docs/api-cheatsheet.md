# Draw.io AI Kit — API Cheat Sheet (Agent Reference)

Use this single-file reference to build diagrams. Avoid opening individual library files.

## 1. Imports
```javascript
// ROOT = $(drawio-ai root) — absolute path; relative imports only work inside the kit repo
import { Diagram } from "<ROOT>/src/builder.mjs";
import { frame, icon, box, phantom, renderTree, stage, band, subnet, endpoint, ossBox, serviceFrame } from "<ROOT>/src/layout-engine.mjs";
```

## 2. Layout Elements (`src/layout-engine.mjs`)
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
  - `opts: { dir: "col"|"row", gap, fill, stroke, priv: true|false }`
- `serviceFrame(id, icon, name, opts?, children)` or `serviceFrame(id, icon, name, children)`: One AWS service owning internal children. The icon is flush with the top-left border; the title is normal-weight.
  - `name`: Short human-readable service name with no deployment variables or placeholders.
  - `opts: { borderStyle: "solid"|"dashed"|"dotted"|"dash-dot" }`; optional and defaults to `solid`.
- `stage(id, i, label, children, opts)`: Pipeline stage column. `i` is 0-based index (applies pale per-stage border color).
- `band(id, label, children, opts)`: Cross-cutting row band (governance/security/ops).
- `subnet(id, label, children, opts)`: AWS/Cloud subnet container. Border green if label contains `"Public"`, teal if `"Private"`.
- `phantom(id, label, opts, children)`: Invisible layout container used to group columns/rows without rendering a boundary.

## 3. Diagram Builder (`src/builder.mjs`)
- `const d = new Diagram(type, opts)`: Initializes a diagram.
  - `type`: `"pipeline"` | `"hierarchy"` | `"network"` | `"hubspoke"` | `"hybrid"` | `"mesh"` | `"sequence"`.
- `renderTree(d, rootNode, [x, y])`: Computes layout, places elements, and emits cells into diagram `d` starting at `[x, y]` (default: `[40, 70]`).
- `d.link(srcId, tgtId, label, opts)`: Connects two nodes.
  - `opts: { flow: true }`: Animated flow (main pipeline path).
  - `opts: { dash: true }`: Dashed line (sync/DR/governance/lineage).
  - `opts: { role: "fanout" }`: Sharp, bundled comb routing for 1-to-N fan-out.
- `d.clusterBox(id, childIds, label, opts)`: Draws a dashed, no-fill frame spanning multiple children after `renderTree`.
  - `opts: { icon, stroke, dashed: true, pad, padTop }`
- `d.validate()`: Audits diagram rules. Returns `{ ok, errors, warnings, audit: { advice } }`.
- `d.mxfile(title)`: Returns the raw XML string for saving.

## 4. Design Rules & Themes (`src/theme.mjs`)
- **Theme Colors:** Coral = `"#FF3621"`, Navy = `"#1B3139"`, VPC = `"#8C4FFF"`, Store = `"#B0752A"`.
- **Nesting Hierarchy:** Every AWS service uses black AWS Cloud → Account → Region. Network groups continue Region → VPC → AZ → Subnet → SG.
- **Recoloring Policy:** Never change catalog icon colors. Let the icons carry the color, keep frame backgrounds pale white (`light-dark(#ffffff, #0f1620)`).
