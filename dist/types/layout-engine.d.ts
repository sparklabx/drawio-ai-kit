export declare const icon: (id: any, name: any, label?: string, opts?: {}) => {
    kind: string;
    id: any;
    name: any;
    label: string;
};
export declare const box: (id: any, label?: string, opts?: {}) => {
    kind: string;
    id: any;
    label: string;
    w: any;
    h: any;
};
export declare const group: (id: any, gname: any, label?: string, opts?: {}, children?: never[]) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
    stack: any;
};
/** A group with no AWS stencil = a plain square frame (for logical layers/bands). */
export declare const frame: (id: any, label: any, opts?: {}, children?: never[]) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
    stack: any;
};
/** PHANTOM frame: an invisible layout-only wrapper distinct from visible containers. Lays out EXACTLY
 *  like a group (children in row/col, hugs them snugly) but emits NO mxCell — its children are
 *  reparented to the nearest VISIBLE ancestor (its own parent id is passed straight through the emit
 *  recursion). Use it to shape geometry without adding a visible frame (e.g. an alignment band). */
export declare const phantom: (id: any, label?: string, opts?: {}, children?: never[]) => {
    kind: string;
    id: any;
    gname: null;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
};
/** Grid of `cols` columns: children laid out evenly into rows, each cell = the largest cell size (centered).
 *  Use when the element count doesn't match another row's column count (e.g. 4 icons under 3 columns). */
export declare const grid: (id: any, gname: any, label?: string, opts?: {}, children?: never[]) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    cols: number;
    gap: any;
    pad: any;
    header: any;
    fill: any;
    stroke: any;
};
/** BPMN swimlane POOL: a sparse (lane, phase) grid. `lanes` = role labels (rows), `phases` = optional
 *  milestone labels (columns). Each child carries { lane, phase } indices; the pool places it in that
 *  cell and leaves empty cells blank. orientation "horizontal" (default: lanes stacked, flow L→R) |
 *  "vertical" (lanes as columns, flow T→B). Lane/phase bands are emitted as container frames so the
 *  edge router and validator let sequence flow cross them freely. */
export declare const pool: (id: any, label: any, opts?: {}, children?: never[]) => {
    kind: string;
    id: any;
    gname: null;
    label: any;
    children: never[];
    lanes: any;
    phases: any;
    orientation: any;
    gap: any;
    pad: any;
    laneLabel: any;
    phaseLabel: any;
    fill: any;
    stroke: any;
};
/** Pipeline STAGE frame i (0-based) → white fill, per-stage coloured border. */
export declare const stage: (id: any, i: any, label: any, children?: never[], opts?: {}) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
    stack: any;
};
/** Cross-cutting band (governance / security / ops) — white fill, neutral border, laid out as a row. */
export declare const band: (id: any, label: any, children?: never[], opts?: {}) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
    stack: any;
};
/** Subnet frame (AWS group_subnet stencil). Colour comes from the label: "Public…" → green,
 *  "Private…" → blue (builder.group applies it). */
export declare const subnet: (id: any, label: any, children?: never[], opts?: {}) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
    stack: any;
};
/** Source / consumer endpoint card (entry/exit of the diagram). */
export declare const endpoint: (id: any, label: any, opts?: {}) => {
    kind: string;
    id: any;
    label: string;
    w: any;
    h: any;
};
/** Plain OSS / component box (theme-aware white). */
export declare const ossBox: (id: any, label: any, opts?: {}) => {
    kind: string;
    id: any;
    label: string;
    w: any;
    h: any;
};
/** On-premise / external site frame — uses the AWS corporate-data-center group stencil so it gets
 *  a top-left corner icon like the cloud/Region zones; white fill, neutral border. */
export declare const onpremFrame: (id: any, label: any, children?: never[], opts?: {}) => {
    kind: string;
    id: any;
    gname: any;
    label: string;
    children: never[];
    dir: any;
    gap: any;
    pad: any;
    header: any;
    align: any;
    fill: any;
    stroke: any;
    cornerIcon: any;
    routeGap: any;
    stack: any;
};
export declare function renderTree(d: any, root: any, [x, y]?: [(number | undefined)?, (number | undefined)?]): any;
