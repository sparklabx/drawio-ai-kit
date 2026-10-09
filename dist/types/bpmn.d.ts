export { pool } from "./layout-engine.ts";
export declare const BPMN: {
    fill: string;
    stroke: string;
    red: string;
    taskW: number;
    taskH: number;
};
/** Start event. type: "none" (default) | "message" | "timer". */
export declare const start: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
/** Intermediate event. type: "message" (default) | "timer" | "link". */
export declare const intermediate: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
/** End event. type: "none" (default) | "terminate" | "error" | "cancel" (last three render red). */
export declare const end: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
/** Gateway. type: "exclusive" (XOR, default) | "parallel" (AND) | "inclusive" (OR) | "event". */
export declare const gateway: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
/** Typed tasks — each carries its BPMN marker (person/gear/…). */
export declare const userTask: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
export declare const serviceTask: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
export declare const manualTask: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
export declare const scriptTask: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
export declare const businessRuleTask: (id: any, opts?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: any;
    h: any;
    style: any;
};
/** Plain (untyped) Task — a marker-less rounded rectangle (canonical BPMN rendering). */
export declare const task: (id: any, { lane, col, label }?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: number;
    h: number;
    fill: string;
    stroke: string;
    round: boolean;
};
/** Collapsed Sub-process — rounded rectangle. ponytail: the bottom-center "+" marker is deferred;
 *  distinguish from a Task by naming ("Sub-process: …") until the marker ships. */
export declare const subProcess: (id: any, { lane, col, label }?: {}) => {
    kind: string;
    id: any;
    lane: any;
    col: any;
    label: any;
    w: number;
    h: number;
    fill: string;
    stroke: string;
    round: boolean;
};
