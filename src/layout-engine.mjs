// drawio-ai-kit — declarative layout engine (flexbox-style for AWS diagrams).
// You DECLARE the nested structure (group/row/col + icon/box); the engine COMPUTES
// all x/y/w/h: frames hug their children snugly, rows/columns spread out evenly. NO hardcoded coordinates.
//
//   const tree = group("region","group_region","AWS Region",{dir:"row"},[
//     group("acc","group_account","Account",{dir:"col"},[ icon("s3","s3","S3"), ... ]),
//   ]);
//   renderTree(d, tree, [40, 70]);   // emit into the Diagram builder, auto-set page
//   d.title("...");  d.link("a","b","...");

import { THEME, stageFill, stageStroke } from "./theme.mjs";

const ICON = 48;

// ---- node creators ----
export const icon = (id, name, label = "", opts = {}) => ({ kind: "icon", id, name, label, ...opts });
// A text box AUTO-SIZES to its label (longest wrapped line → width, line count → height), so you
// don't hand-pick w/h. Pass w/h only to override (e.g. a deliberately tall source/consumer card).
function autoBox(label) {
  const lines = String(label ?? "").split("\n");
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  return {
    w: Math.min(260, Math.max(120, Math.round(maxLen * 6.6 + 28))),
    h: Math.max(44, lines.length * 18 + 26),
  };
}
export const box = (id, label = "", opts = {}) => {
  const a = autoBox(label);
  return { kind: "box", id, label, ...opts, w: opts.w ?? a.w, h: opts.h ?? a.h };
};
export const group = (id, gname, label = "", opts = {}, children = []) => ({
  kind: "group", id, gname: gname || null, label, children,
  dir: opts.dir ?? "row", gap: opts.gap ?? 30, pad: opts.pad ?? 24,
  header: label ? (opts.header ?? 36) : (opts.header ?? 0),   // no label → no dead title strip (issue #58)
  align: opts.align ?? "center", fill: opts.fill, stroke: opts.stroke,
  // cornerIcon: a catalog icon name drawn at the container's top-left (Azure/GCP frames — mimics the
  // corner icon baked into AWS group stencils; the label shifts right to sit next to it).
  cornerIcon: opts.cornerIcon ?? null,
  // routeGap: minimum gap enforced between children when routing lanes need to pass between them.
  // Set to ≥ 2×BM (48px) so the A* router has clearance. Overrides gap only when larger.
  routeGap: opts.routeGap ?? 0,
});
/** A group with no AWS stencil = a plain square frame (for logical layers/bands). */
export const frame = (id, label, opts = {}, children = []) => group(id, null, label, opts, children);
/** PHANTOM frame: an invisible layout-only wrapper distinct from visible containers. Lays out EXACTLY
 *  like a group (children in row/col, hugs them snugly) but emits NO mxCell — its children are
 *  reparented to the nearest VISIBLE ancestor (its own parent id is passed straight through the emit
 *  recursion). Use it to shape geometry without adding a visible frame (e.g. an alignment band). */
export const phantom = (id, label = "", opts = {}, children = []) => ({
  kind: "phantom", id, gname: null, label, children,
  // A phantom emits NO cell — with no label it must reserve NO pad/header, else the invisible wrapper
  // silently pads the content (compounds across nested row/col wrappers — issue #58). Big waste win.
  dir: opts.dir ?? "row", gap: opts.gap ?? 30, pad: opts.pad ?? (label ? 24 : 0),
  header: label ? (opts.header ?? 36) : (opts.header ?? 0),
  align: opts.align ?? "center", fill: opts.fill, stroke: opts.stroke,
  cornerIcon: opts.cornerIcon ?? null, routeGap: opts.routeGap ?? 0,
});
/** Grid of `cols` columns: children laid out evenly into rows, each cell = the largest cell size (centered).
 *  Use when the element count doesn't match another row's column count (e.g. 4 icons under 3 columns). */
export const grid = (id, gname, label = "", opts = {}, children = []) => ({
  kind: "grid", id, gname: gname || null, label, children,
  cols: Math.max(1, opts.cols ?? 2), gap: opts.gap ?? 30, pad: opts.pad ?? 24,
  header: label ? (opts.header ?? 36) : (opts.header ?? 0),   // no label → no dead title strip (issue #58)
  fill: opts.fill, stroke: opts.stroke,
});
/** BPMN swimlane POOL: a sparse (lane, phase) grid. `lanes` = role labels (rows), `phases` = optional
 *  milestone labels (columns). Each child carries { lane, phase } indices; the pool places it in that
 *  cell and leaves empty cells blank. orientation "horizontal" (default: lanes stacked, flow L→R) |
 *  "vertical" (lanes as columns, flow T→B). Lane/phase bands are emitted as container frames so the
 *  edge router and validator let sequence flow cross them freely. */
export const pool = (id, label, opts = {}, children = []) => ({
  kind: "pool", id, gname: null, label, children,
  lanes: opts.lanes ?? [],
  phases: opts.phases ?? [],
  orientation: opts.orientation ?? "horizontal",
  gap: opts.gap ?? 40, pad: opts.pad ?? 16,
  laneLabel: opts.laneLabel ?? 110,    // width of the role-name column (h) / height (v)
  phaseLabel: opts.phaseLabel ?? 26,   // height of the milestone band (h) / width (v)
  fill: opts.fill ?? null, stroke: opts.stroke ?? null,
});

// ---- themed creators (apply the THEME so diagrams inherit the house style by default) ----
// Big frames use a WHITE (theme-aware) background; the AWS icons carry the color. A per-stage
// border colour keeps layers distinguishable without tinting the fill.
/** Pipeline STAGE frame i (0-based) → white fill, per-stage coloured border. */
export const stage = (id, i, label, children = [], opts = {}) =>
  group(id, null, label, { dir: "col", gap: THEME.gaps.item, fill: THEME.base, stroke: stageStroke(i), ...opts }, children);
/** Cross-cutting band (governance / security / ops) — white fill, neutral border, laid out as a row. */
export const band = (id, label, children = [], opts = {}) =>
  group(id, null, label, { dir: "row", gap: 36, fill: THEME.base, stroke: THEME.bandStroke, ...opts }, children);
/** Subnet frame (AWS group_subnet stencil). Colour comes from the label: "Public…" → green,
 *  "Private…" → blue (builder.group applies it). */
export const subnet = (id, label, children = [], opts = {}) =>
  group(id, "group_subnet", label, { dir: "col", gap: THEME.gaps.item, ...opts }, children);
/** Source / consumer endpoint card (entry/exit of the diagram). */
export const endpoint = (id, label, opts = {}) =>
  box(id, label, { fill: THEME.endpoint, stroke: THEME.endpointStroke, bold: true, ...opts });
/** Plain OSS / component box (theme-aware white). */
export const ossBox = (id, label, opts = {}) =>
  box(id, label, { fill: THEME.base, stroke: THEME.baseStroke, fs: THEME.fonts.small, ...opts });
/** On-premise / external site frame — uses the AWS corporate-data-center group stencil so it gets
 *  a top-left corner icon like the cloud/Region zones; white fill, neutral border. */
export const onpremFrame = (id, label, children = [], opts = {}) =>
  group(id, "group_corporate_data_center", label, { dir: "row", gap: 26, fill: THEME.base, stroke: THEME.onpremStroke, ...opts }, children);

// ---- per-type layout registry ----
// Each node kind maps to a { measure, place, emit } triple. The top-level measure/place/emit
// dispatch through this map instead of switching on n.kind, so a new container kind is one new
// registry entry — no shared switch to edit. icon/box have place:null: place() still sets n.x/n.y
// for every kind (the round happens unconditionally at the top).
function mIcon(n) {
  const s = n.size ?? ICON;
  n.w = Math.max(96, s + 20, Math.min(200, (n.label?.length ?? 0) * 7 + 24)); // cell never narrower than the glyph
  n.h = s + 34; // icon + label below
}
function mBox(n) { /* w,h provided */ }
function mPool(n) {
  n.children.forEach(measure);
  const horiz = n.orientation !== "vertical";
  const laneN = Math.max(1, n.lanes.length || 1);
  n.cols = Math.max(1, ...n.children.map((c) => (c.col ?? 0) + 1));   // col = horizontal slot, one node per cell
  const phaseN = n.phases.length;
  n.phaseLabel = phaseN ? n.phaseLabel : 0;                            // no milestone band unless labels given
  n.cellW = n.children.reduce((m, c) => Math.max(m, c.w || 0), 80);
  n.cellH = n.children.reduce((m, c) => Math.max(m, c.h || 0), 40) + 14;   // lane band = tallest node + vertical pad; bands stack flush (grid)
  // lane axis is contiguous (grid rows); the flow axis keeps `gap` for node spacing
  const contentW = horiz ? n.cols * n.cellW + n.gap * (n.cols - 1) : laneN * n.cellW;
  const contentH = horiz ? laneN * n.cellH : n.cols * n.cellH + n.gap * (n.cols - 1);
  n.header = n.label ? 34 : 0;
  if (horiz) { n.w = n.pad * 2 + n.laneLabel + contentW; n.h = n.header + n.phaseLabel + n.pad * 2 + contentH; }
  else { n.w = n.pad * 2 + contentW + n.phaseLabel; n.h = n.header + n.pad * 2 + n.laneLabel + contentH; }
  if (n.label) n.w = Math.max(n.w, Math.ceil(n.label.length * 6.6) + n.pad * 2);
}
/** Shared container measure: recurse into children, then grid/row/col sizing + floor by title width.
 *  Runs for both `group` and `grid` (the grid cell math lives inside the dir switch on n.kind). */
function measureContainer(n) {
  n.children.forEach(measure);
  const ch = n.children, p = n.pad, head = n.header;
  const eg = Math.max(n.gap, n.routeGap ?? 0); // effective gap: routeGap wins when larger
  const sum = (f) => ch.reduce((s, c) => s + f(c), 0);
  const max = (f) => ch.reduce((m, c) => Math.max(m, f(c)), 0);
  if (n.kind === "grid") {
    const rows = Math.ceil(ch.length / n.cols);
    n.cellW = max((c) => c.w); n.cellH = max((c) => c.h);
    n.w = p * 2 + n.cols * n.cellW + n.gap * (n.cols - 1);
    n.h = head + p * 2 + rows * n.cellH + n.gap * (rows - 1);
  } else if (n.dir === "row") {
    // Equal-height siblings: stretch each container block in a row up to the tallest sibling, so
    // side-by-side frames share a bottom edge (leaf icons/boxes keep their natural size, top-aligned).
    const maxH = max((c) => c.h);
    for (const c of ch) if (c.kind === "group" || c.kind === "grid" || c.kind === "pool") c.h = Math.max(c.h, maxH);
    n.w = p * 2 + sum((c) => c.w) + eg * Math.max(0, ch.length - 1);
    n.h = head + p * 2 + max((c) => c.h);
  } else { // col
    // Equal-width siblings: stretch each group frame in a column up to the widest sibling, so
    // stacked frames (e.g. subnet tiers) share left/right edges. Only `group` — it re-places its
    // children to fill the new width; grid/pool have self-computed internal geometry that a forced
    // outer width would leave a gap inside, and leaf icons/boxes keep their natural size.
    const maxW = max((c) => c.w);
    for (const c of ch) if (c.kind === "group") c.w = Math.max(c.w, maxW);
    n.w = p * 2 + max((c) => c.w);
    n.h = head + p * 2 + sum((c) => c.h) + eg * Math.max(0, ch.length - 1);
  }
  // floor by title width: a frame is never narrower than its label (avoids clipping text).
  if (n.label) n.w = Math.max(n.w, Math.ceil(n.label.length * 6.6) + p * 2);
}
const mGroup = measureContainer, mGrid = measureContainer;

// ---- place: assign x,y (top-down) ----
function pGrid(n) {
  const innerX = n.x + n.pad, innerTop = n.y + n.header + n.pad;
  n.children.forEach((c, i) => {
    const r = Math.floor(i / n.cols), col = i % n.cols;
    const cellX = innerX + col * (n.cellW + n.gap), cellY = innerTop + r * (n.cellH + n.gap);
    place(c, cellX + (n.cellW - c.w) / 2, cellY + (n.cellH - c.h) / 2); // center in cell
  });
}
function pPool(n) {
  const horiz = n.orientation !== "vertical";
  const contentX = horiz ? n.x + n.pad + n.laneLabel : n.x + n.pad;
  const contentY = horiz ? n.y + n.header + n.phaseLabel + n.pad : n.y + n.header + n.pad + n.laneLabel;
  for (const c of n.children) {
    const lane = c.lane ?? 0, col = c.col ?? 0;
    const cellX = horiz ? contentX + col * (n.cellW + n.gap) : contentX + lane * n.cellW;
    const cellY = horiz ? contentY + lane * n.cellH : contentY + col * (n.cellH + n.gap);
    place(c, Math.round(cellX + (n.cellW - c.w) / 2), Math.round(cellY + (n.cellH - c.h) / 2));
  }
}
function pGroup(n) {
  const innerX = n.x + n.pad, innerTop = n.y + n.header + n.pad;
  const innerW = n.w - n.pad * 2, innerH = n.h - n.header - n.pad * 2;
  const eg = Math.max(n.gap, n.routeGap ?? 0);
  // Distribute-to-fill: when a frame is stretched past its content (by equal-height/equal-width or a
  // long label), spread the SLACK evenly between children (space-between) instead of clustering them
  // with dead space. This makes 2 small blocks span the same extent as a big sibling (nested balance)
  // and removes the empty margins. Not stretched → slack≈0 → behaves like the old fixed-gap layout.
  // Extra spacing from slack is CAPPED at one base gap (max gap = 2×eg), then the moderately-filled
  // cluster is CENTRED. Fills the dead space enough to look intentional without blowing a stretched
  // frame into a sparse void — compact beats fully-spread once slack is large.
  const ch = n.children, k = ch.length, sizes = ch.map((c) => n.dir === "row" ? c.w : c.h);
  const sumSz = sizes.reduce((s, v) => s + v, 0);
  const inner = n.dir === "row" ? innerW : innerH;
  const gap = k > 1 ? eg + Math.min(eg, Math.max(0, (inner - sumSz - eg * (k - 1)) / (k - 1))) : eg;
  const span = sumSz + gap * Math.max(0, k - 1);
  let cur = (n.dir === "row" ? innerX : innerTop) + Math.max(0, (inner - span) / 2);   // centre the filled cluster
  for (const c of ch) {
    if (n.dir === "row") { place(c, cur, n.align === "top" ? innerTop : innerTop + (innerH - c.h) / 2); cur += c.w + gap; }
    else { place(c, n.align === "left" ? innerX : innerX + (innerW - c.w) / 2, cur); cur += c.h + gap; }
  }
}
/** Emit a pool: container frame + faint lane bands + lane/phase labels + flow-object children on top.
 *  Bands/labels carry container=1 (validator treats as non-obstacle) and no .ob flag (router ignores). */
function emitPool(d, n, parent) {
  const horiz = n.orientation !== "vertical";
  const laneN = Math.max(1, n.lanes.length || 1);
  const cols = n.cols;
  const phaseN = n.phases.length;
  const contentW = horiz ? cols * n.cellW + n.gap * (cols - 1) : laneN * n.cellW;
  const contentH = horiz ? laneN * n.cellH : cols * n.cellH + n.gap * (cols - 1);
  const contentX = horiz ? n.x + n.pad + n.laneLabel : n.x + n.pad;
  const contentY = horiz ? n.y + n.header + n.phaseLabel + n.pad : n.y + n.header + n.pad + n.laneLabel;
  const POOL_FILL = n.fill ?? "#FFFFFF", POOL_STROKE = n.stroke ?? "#5A6B7B";
  const HAIR = "#D8E0E8", BAND_ALT = "#F5F8FB", LABEL_FILL = "#EEF2F7";
  const frame = (id, x, y, w, h, style, label) => d._put(id, n.id, Math.round(x), Math.round(y), Math.round(w), Math.round(h), style, label);
  // pool container frame (ob:false → edges cross it freely)
  d.box(n.id, [n.x, n.y], [n.w, n.h], n.label, { parent, fill: POOL_FILL, stroke: POOL_STROKE, round: false, ob: false, va: "top", bold: true, fs: 13 });
  // lane bands (faint background) + role labels
  for (let i = 0; i < laneN; i++) {
    if (horiz) frame(`${n.id}__band${i}`, contentX, contentY + i * n.cellH, contentW, n.cellH, `rounded=0;whiteSpace=wrap;html=1;fillColor=${i % 2 ? BAND_ALT : "#FFFFFF"};strokeColor=${HAIR};container=1;`, "");
    else frame(`${n.id}__band${i}`, n.x + n.pad + i * n.cellW, contentY, n.cellW, contentH, `rounded=0;whiteSpace=wrap;html=1;fillColor=${i % 2 ? BAND_ALT : "#FFFFFF"};strokeColor=${HAIR};container=1;`, "");
    let lx, ly, lw, lh;
    if (horiz) { lx = n.x + n.pad; ly = contentY + i * n.cellH; lw = n.laneLabel; lh = n.cellH; }
    else { lx = n.x + n.pad + i * n.cellW; ly = n.y + n.header + n.pad; lw = n.cellW; lh = n.laneLabel; }
    frame(`${n.id}__lane${i}`, lx, ly, lw, lh, `rounded=0;whiteSpace=wrap;html=1;fillColor=${LABEL_FILL};strokeColor=${HAIR};verticalAlign=middle;align=center;fontStyle=1;fontSize=11;container=1;`, n.lanes[i] ?? "");
  }
  // phase (milestone) header bands — each label spans its even share of the columns
  if (phaseN) {
    for (let j = 0; j < phaseN; j++) {
      const from = Math.floor((j * cols) / phaseN), to = Math.floor(((j + 1) * cols) / phaseN), last = j === phaseN - 1;
      let px, py, pw, ph;
      if (horiz) { px = contentX + from * (n.cellW + n.gap); pw = (to - from) * (n.cellW + n.gap) - (last ? n.gap : 0); py = n.y + n.header; ph = n.phaseLabel; }
      else { py = contentY + from * (n.cellH + n.gap); ph = (to - from) * (n.cellH + n.gap) - (last ? n.gap : 0); px = n.x + n.pad + contentW + n.gap; pw = n.phaseLabel; }
      frame(`${n.id}__phase${j}`, px, py, pw, ph, `rounded=0;whiteSpace=wrap;html=1;fillColor=${POOL_FILL};strokeColor=${HAIR};verticalAlign=middle;align=center;fontStyle=1;fontSize=11;container=1;`, n.phases[j] ?? "");
    }
  }
  // flow-object nodes last → render on top of the bands
  for (const c of n.children) emit(d, c, n.id);
}

// ---- emit: output to the Diagram builder ----
function eIcon(d, n, parent) {
  const s = n.size ?? ICON;
  d.icon(n.id, n.name, [Math.round(n.x + (n.w - s) / 2), n.y], { parent, label: n.label, size: s });
}
function eBox(d, n, parent) {
  if (n.style) { const r = d._put(n.id, parent, n.x, n.y, n.w, n.h, n.style, n.label); r.ob = true; return; }   // BPMN/curated shape: raw style, leaf obstacle
  d.box(n.id, [n.x, n.y], [n.w, n.h], n.label, { parent, fill: n.fill, stroke: n.stroke, round: n.round, va: n.va, bold: n.bold });
}
function eGroup(d, n, parent) {
  if (n.gname) d.group(n.id, n.gname, [n.x, n.y], [n.w, n.h], n.label, { parent, fill: n.fill, stroke: n.stroke });
  else if (n.cornerIcon) {
    // Azure/GCP-style container: corner icon top-left, label beside it (like an AWS group stencil).
    const CI = 22;
    const style = `rounded=0;whiteSpace=wrap;html=1;fillColor=${n.fill ?? "#FFFFFF"};strokeColor=${n.stroke ?? "#999999"};fontColor=#1A1A1A;fontSize=12;fontStyle=1;verticalAlign=top;align=left;spacingLeft=${CI + 12};spacingTop=8;`;
    const r = d._put(n.id, parent, n.x, n.y, n.w, n.h, style, n.label); r.ob = false;
    d.cornerIcon(`${n.id}__ci`, n.cornerIcon, [Math.round(n.x + 8), Math.round(n.y + 7)], CI, n.id);
  } else {
    // stroke:"none" = layout-only wrapper (no visible border) → ob:null so the router ignores it
    // entirely. Registering it as a container (ob:false) made insideAny() true across the whole
    // page (a root wrapper encloses everything), which silently disabled the border-hugging
    // penalty for every renderTree diagram — and gave pushOff phantom borders to jump outside of.
    d.box(n.id, [n.x, n.y], [n.w, n.h], n.label, { parent, va: "top", bold: true, fill: n.fill ?? "#FFFFFF", stroke: n.stroke ?? "#999999", ob: n.stroke === "none" ? null : false });
  }
  for (const c of n.children) emit(d, c, n.id);
}
function ePool(d, n, parent) { emitPool(d, n, parent); }
/** Phantom emit: emits NO cell and does NOT touch this.R. It records its id in d.phantoms (so link()
 *  can teach the distinction between a phantom and a typo) then recurses children with the SAME
 *  parent it received — that passes children straight through the phantom layer to the nearest
 *  VISIBLE ancestor (the reparent mechanism: the phantom never inserts its id into the parent chain). */
function ePhantom(d, n, parent) {
  d.phantoms.add(n.id);
  for (const c of n.children) emit(d, c, parent);
}

const LAYOUT = {
  icon:    { measure: mIcon,   place: null,   emit: eIcon },
  box:     { measure: mBox,    place: null,   emit: eBox },
  group:   { measure: mGroup,  place: pGroup, emit: eGroup },
  grid:    { measure: mGrid,   place: pGrid,  emit: eGroup },
  pool:    { measure: mPool,   place: pPool,  emit: ePool },
  phantom: { measure: mGroup,  place: pGroup, emit: ePhantom },   // group geometry, NO cell emit
};

function measure(n) { LAYOUT[n.kind].measure(n); }
function place(n, x, y) {
  n.x = Math.round(x); n.y = Math.round(y);   // set for ALL kinds (even icon/box with place:null)
  const t = LAYOUT[n.kind];
  if (t.place) t.place(n, x, y);
}
function emit(d, n, parent) { LAYOUT[n.kind].emit(d, n, parent); }

/** Compute the layout for the tree + emit into Diagram d; auto-set the page to the actual size. */
// Global icon size from the Diagram flows to every icon that didn't set its own — per-icon {size} wins.
function applyIconSize(n, s) {
  if (n.kind === "icon") n.size = n.size ?? s;
  (n.children ?? []).forEach((c) => applyIconSize(c, s));
}
export function renderTree(d, root, [x = 40, y = 70] = []) {
  if (d.iconSize && d.iconSize !== ICON) applyIconSize(root, d.iconSize);
  measure(root);
  place(root, x, y);
  emit(d, root, "1");
  d.page = [Math.round(root.x + root.w + 40), Math.round(root.y + root.h + 50)];
  return root;
}
