import type { BoxNode } from "./model.ts";
export { pool } from "./layout-engine.ts";
export declare const BPMN: {
    fill: string;
    stroke: string;
    red: string;
    taskW: number;
    taskH: number;
};
/** A stenciled flow object (event/gateway/typed-task) placed in a pool cell at (lane, col). */
type CellOpts = {
    lane?: number;
    col?: number;
    label?: string;
};
/** Start event. type: "none" (default) | "message" | "timer". */
export declare const start: (id: string, opts?: CellOpts & {
    type?: "none" | "message" | "timer";
}) => BoxNode;
/** Intermediate event. type: "message" (default) | "timer" | "link". */
export declare const intermediate: (id: string, opts?: CellOpts & {
    type?: "message" | "timer" | "link";
}) => BoxNode;
/** End event. type: "none" (default) | "terminate" | "error" | "cancel" (last three render red). */
export declare const end: (id: string, opts?: CellOpts & {
    type?: "none" | "terminate" | "error" | "cancel";
}) => BoxNode;
/** Gateway. type: "exclusive" (XOR, default) | "parallel" (AND) | "inclusive" (OR) | "event". */
export declare const gateway: (id: string, opts?: CellOpts & {
    type?: "exclusive" | "parallel" | "inclusive" | "event";
}) => BoxNode;
/** Typed tasks — each carries its BPMN marker (person/gear/…). */
export declare const userTask: (id: string, opts?: CellOpts) => BoxNode;
export declare const serviceTask: (id: string, opts?: CellOpts) => BoxNode;
export declare const manualTask: (id: string, opts?: CellOpts) => BoxNode;
export declare const scriptTask: (id: string, opts?: CellOpts) => BoxNode;
export declare const businessRuleTask: (id: string, opts?: CellOpts) => BoxNode;
/** Plain (untyped) Task — a marker-less rounded rectangle (canonical BPMN rendering). */
export declare const task: (id: string, { lane, col, label }?: CellOpts) => BoxNode;
/** Collapsed Sub-process — rounded rectangle. ponytail: the bottom-center "+" marker is deferred;
 *  distinguish from a Task by naming ("Sub-process: …") until the marker ships. */
export declare const subProcess: (id: string, { lane, col, label }?: CellOpts) => BoxNode;
