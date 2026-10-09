// drawio-ai-kit — BPMN Tier-1 swimlane domain layer.
// Thin creators over the generic layout engine: each returns a {kind:"box"} node carrying its
// mxgraph.bpmn catalog style + { lane, col } cell tags. The pool() primitive (layout-engine.ts)
// places them in a sparse (lane × col) grid; `phases` is an optional milestone-label overlay.
// Canonical monochrome; red accent for blocker events. Plain Task and collapsed Sub-process have
// no stencil and are composed as rounded rects.
import type { BoxNode } from "./model.ts";
import { loadCatalog, styleForIcon } from "./core.ts";
export { pool } from "./layout-engine.ts";

// Style tokens — canonical BPMN look (white fill, neutral stroke), red for error/cancel/terminate.
export const BPMN = {
  fill: "#FFFFFF",
  stroke: "#232F3E",
  red: "#D90000",
  taskW: 110,
  taskH: 56,
};

const CATALOG = loadCatalog();
const look = (name: string) => {
  const s = styleForIcon(CATALOG, name);
  if (!s) throw new Error(`BPMN shape not in catalog: "${name}" — verify with: drawio-ai search ${name}`);
  return s; // { style, width, height }
};

/** A stenciled flow object (event/gateway/typed-task) placed in a pool cell at (lane, col). */
type CellOpts = { lane?: number; col?: number; label?: string };
const stencil = (id: string, name: string, { lane, col, label }: CellOpts = {}): BoxNode => {
  const s = look(name);
  return { kind: "box", id, lane, col, label: label ?? "", w: s.width ?? 48, h: s.height ?? 48, style: s.style };
};

// ---- events (circles; label renders below the shape via the catalog style) ----
/** Start event. type: "none" (default) | "message" | "timer". */
export const start = (id: string, opts: CellOpts & { type?: "none" | "message" | "timer" } = {}) => stencil(id, `bpmn_start_${opts.type ?? "none"}`, opts);
/** Intermediate event. type: "message" (default) | "timer" | "link". */
export const intermediate = (id: string, opts: CellOpts & { type?: "message" | "timer" | "link" } = {}) => stencil(id, `bpmn_intermediate_${opts.type ?? "message"}`, opts);
/** End event. type: "none" (default) | "terminate" | "error" | "cancel" (last three render red). */
export const end = (id: string, opts: CellOpts & { type?: "none" | "terminate" | "error" | "cancel" } = {}) => stencil(id, `bpmn_end_${opts.type ?? "none"}`, opts);

// ---- gateways (diamonds; label below) ----
/** Gateway. type: "exclusive" (XOR, default) | "parallel" (AND) | "inclusive" (OR) | "event". */
export const gateway = (id: string, opts: CellOpts & { type?: "exclusive" | "parallel" | "inclusive" | "event" } = {}) => stencil(id, `bpmn_gateway_${opts.type ?? "exclusive"}`, opts);

// ---- activities (rounded rects; label centered inside) ----
/** Typed tasks — each carries its BPMN marker (person/gear/…). */
export const userTask = (id: string, opts: CellOpts = {}) => stencil(id, "bpmn_task_user", opts);
export const serviceTask = (id: string, opts: CellOpts = {}) => stencil(id, "bpmn_task_service", opts);
export const manualTask = (id: string, opts: CellOpts = {}) => stencil(id, "bpmn_task_manual", opts);
export const scriptTask = (id: string, opts: CellOpts = {}) => stencil(id, "bpmn_task_script", opts);
export const businessRuleTask = (id: string, opts: CellOpts = {}) => stencil(id, "bpmn_task_business_rule", opts);

/** Plain (untyped) Task — a marker-less rounded rectangle (canonical BPMN rendering). */
export const task = (id: string, { lane, col, label }: CellOpts = {}): BoxNode => ({
  kind: "box", id, lane, col, label: label ?? "", w: BPMN.taskW, h: BPMN.taskH,
  fill: BPMN.fill, stroke: BPMN.stroke, round: true,
});

/** Collapsed Sub-process — rounded rectangle. ponytail: the bottom-center "+" marker is deferred;
 *  distinguish from a Task by naming ("Sub-process: …") until the marker ships. */
export const subProcess = (id: string, { lane, col, label }: CellOpts = {}): BoxNode => ({
  kind: "box", id, lane, col, label: label ?? "", w: BPMN.taskW + 10, h: BPMN.taskH + 14,
  fill: BPMN.fill, stroke: BPMN.stroke, round: true,
});
