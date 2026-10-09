import type { Diagram } from "./builder.ts";
import type { BoxNode, BoxOpts, ContainerOpts, Geometry, GridNode, GridOpts, GroupNode, IconNode, IconOpts, LayoutNode, PhantomNode, PoolNode, PoolOpts } from "./model.ts";
export declare const icon: (id: string, name: string, label?: string, opts?: IconOpts) => IconNode;
export declare const box: (id: string, label?: string, opts?: BoxOpts) => BoxNode;
export declare const group: (id: string, gname: string | null, label?: string, opts?: ContainerOpts, children?: LayoutNode[]) => GroupNode;
/** A group with no AWS stencil = a plain square frame (for logical layers/bands). */
export declare const frame: (id: string, label: string, opts?: ContainerOpts, children?: LayoutNode[]) => GroupNode;
/** PHANTOM frame: an invisible layout-only wrapper distinct from visible containers. Lays out EXACTLY
 *  like a group (children in row/col, hugs them snugly) but emits NO mxCell — its children are
 *  reparented to the nearest VISIBLE ancestor (its own parent id is passed straight through the emit
 *  recursion). Use it to shape geometry without adding a visible frame (e.g. an alignment band). */
export declare const phantom: (id: string, label?: string, opts?: ContainerOpts, children?: LayoutNode[]) => PhantomNode;
/** Grid of `cols` columns: children laid out evenly into rows, each cell = the largest cell size (centered).
 *  Use when the element count doesn't match another row's column count (e.g. 4 icons under 3 columns). */
export declare const grid: (id: string, gname: string | null, label?: string, opts?: GridOpts, children?: LayoutNode[]) => GridNode;
/** BPMN swimlane POOL: a sparse (lane, phase) grid. `lanes` = role labels (rows), `phases` = optional
 *  milestone labels (columns). Each child carries { lane, col } indices; the pool places it in that
 *  cell and leaves empty cells blank. orientation "horizontal" (default: lanes stacked, flow L→R) |
 *  "vertical" (lanes as columns, flow T→B). Lane/phase bands are emitted as container frames so the
 *  edge router and validator let sequence flow cross them freely. */
export declare const pool: (id: string, label: string, opts?: PoolOpts, children?: LayoutNode[]) => PoolNode;
/** Pipeline STAGE frame i (0-based) → white fill, per-stage coloured border. */
export declare const stage: (id: string, i: number, label: string, children?: LayoutNode[], opts?: ContainerOpts) => GroupNode;
/** Cross-cutting band (governance / security / ops) — white fill, neutral border, laid out as a row. */
export declare const band: (id: string, label: string, children?: LayoutNode[], opts?: ContainerOpts) => GroupNode;
/** Subnet frame (AWS group_subnet stencil). Colour comes from the label: "Public…" → green,
 *  "Private…" → blue (builder.group applies it). */
export declare const subnet: (id: string, label: string, children?: LayoutNode[], opts?: ContainerOpts) => GroupNode;
/** Source / consumer endpoint card (entry/exit of the diagram). */
export declare const endpoint: (id: string, label: string, opts?: BoxOpts) => BoxNode;
/** Plain OSS / component box (theme-aware white). */
export declare const ossBox: (id: string, label: string, opts?: BoxOpts) => BoxNode;
/** On-premise / external site frame — uses the AWS corporate-data-center group stencil so it gets
 *  a top-left corner icon like the cloud/Region zones; white fill, neutral border. */
export declare const onpremFrame: (id: string, label: string, children?: LayoutNode[], opts?: ContainerOpts) => GroupNode;
type Laid<N> = N & Geometry;
export declare function renderTree<N extends LayoutNode>(d: Diagram, root: N, [x, y]?: number[]): Laid<N>;
export {};
