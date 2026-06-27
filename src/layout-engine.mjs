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
  header: label ? (opts.header ?? 36) : (opts.header ?? 14),
  align: opts.align ?? "center", fill: opts.fill, stroke: opts.stroke,
});
/** A group with no AWS stencil = a plain square frame (for logical layers/bands). */
export const frame = (id, label, opts = {}, children = []) => group(id, null, label, opts, children);
/** Grid of `cols` columns: children laid out evenly into rows, each cell = the largest cell size (centered).
 *  Use when the element count doesn't match another row's column count (e.g. 4 icons under 3 columns). */
export const grid = (id, gname, label = "", opts = {}, children = []) => ({
  kind: "grid", id, gname: gname || null, label, children,
  cols: Math.max(1, opts.cols ?? 2), gap: opts.gap ?? 30, pad: opts.pad ?? 24,
  header: label ? (opts.header ?? 36) : (opts.header ?? 14),
  fill: opts.fill, stroke: opts.stroke,
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

// ---- measure: assign w,h (bottom-up) ----
function measure(n) {
  if (n.kind === "icon") {
    n.w = Math.max(96, Math.min(200, (n.label?.length ?? 0) * 7 + 24));
    n.h = ICON + 34; // icon + label below
    return;
  }
  if (n.kind === "box") return; // w,h provided
  n.children.forEach(measure);
  const ch = n.children, g = n.gap, p = n.pad, head = n.header;
  const sum = (f) => ch.reduce((s, c) => s + f(c), 0);
  const max = (f) => ch.reduce((m, c) => Math.max(m, f(c)), 0);
  if (n.kind === "grid") {
    const rows = Math.ceil(ch.length / n.cols);
    n.cellW = max((c) => c.w); n.cellH = max((c) => c.h);
    n.w = p * 2 + n.cols * n.cellW + g * (n.cols - 1);
    n.h = head + p * 2 + rows * n.cellH + g * (rows - 1);
  } else if (n.dir === "row") {
    n.w = p * 2 + sum((c) => c.w) + g * Math.max(0, ch.length - 1);
    n.h = head + p * 2 + max((c) => c.h);
  } else { // col
    n.w = p * 2 + max((c) => c.w);
    n.h = head + p * 2 + sum((c) => c.h) + g * Math.max(0, ch.length - 1);
  }
  // floor by title width: a frame is never narrower than its label (avoids clipping text).
  if (n.label) n.w = Math.max(n.w, Math.ceil(n.label.length * 6.6) + p * 2);
}

// ---- place: assign x,y (top-down) ----
function place(n, x, y) {
  n.x = Math.round(x); n.y = Math.round(y);
  if (n.kind === "grid") {
    const innerX = n.x + n.pad, innerTop = n.y + n.header + n.pad;
    n.children.forEach((c, i) => {
      const r = Math.floor(i / n.cols), col = i % n.cols;
      const cellX = innerX + col * (n.cellW + n.gap), cellY = innerTop + r * (n.cellH + n.gap);
      place(c, cellX + (n.cellW - c.w) / 2, cellY + (n.cellH - c.h) / 2); // center in cell
    });
    return;
  }
  if (n.kind !== "group") return;
  const innerX = n.x + n.pad, innerTop = n.y + n.header + n.pad;
  const innerW = n.w - n.pad * 2, innerH = n.h - n.header - n.pad * 2;
  if (n.dir === "row") {
    // centre the whole row within innerW so content stays centred when the frame is widened
    // by a long label (line 97) or a wider sibling row; collapses to left-align when it fills the width.
    const totalW = n.children.reduce((s, c) => s + c.w, 0) + n.gap * Math.max(0, n.children.length - 1);
    let cx = innerX + Math.max(0, (innerW - totalW) / 2);
    for (const c of n.children) {
      const cy = n.align === "top" ? innerTop : innerTop + (innerH - c.h) / 2;
      place(c, cx, cy); cx += c.w + n.gap;
    }
  } else {
    let cy = innerTop;
    for (const c of n.children) {
      const cx = n.align === "left" ? innerX : innerX + (innerW - c.w) / 2;
      place(c, cx, cy); cy += c.h + n.gap;
    }
  }
}

// ---- emit: output to the Diagram builder ----
function emit(d, n, parent) {
  if (n.kind === "icon") {
    d.icon(n.id, n.name, [Math.round(n.x + (n.w - ICON) / 2), n.y], { parent, label: n.label });
    return;
  }
  if (n.kind === "box") {
    d.box(n.id, [n.x, n.y], [n.w, n.h], n.label, { parent, fill: n.fill, stroke: n.stroke, round: n.round, va: n.va, bold: n.bold });
    return;
  }
  if (n.gname) d.group(n.id, n.gname, [n.x, n.y], [n.w, n.h], n.label, { parent, fill: n.fill, stroke: n.stroke });
  else d.box(n.id, [n.x, n.y], [n.w, n.h], n.label, { parent, va: "top", bold: true, fill: n.fill ?? "#F5F5F5", stroke: n.stroke ?? "#999999", ob: false });
  for (const c of n.children) emit(d, c, n.id);
}

/** Compute the layout for the tree + emit into Diagram d; auto-set the page to the actual size. */
export function renderTree(d, root, [x = 40, y = 70] = []) {
  measure(root);
  place(root, x, y);
  emit(d, root, "1");
  d.page = [Math.round(root.x + root.w + 40), Math.round(root.y + root.h + 50)];
  return root;
}
