import { loadCatalog } from "./core.ts";
import { typePreset } from "./types.ts";
import type { Rect, Vertex, Side, EdgeOptions, EdgeSpec, DiagramOptions, ContractName, IconOptions, BoxOptions, GroupOptions, ClusterOptions } from "./model.ts";
type Pt = {
    x: number;
    y: number;
};
type Frac = {
    s: number;
    t: number;
};
/** A routed edge: ports (es/en) + how the path between them bends. raw (opts.style) edges have no Route. */
type Route = {
    es: Side;
    en: Side;
    kind: "straight" | "Zx" | "Zy" | "Lhv" | "Lvh" | "poly";
    lane?: number;
    pts?: Pt[];
    freeze?: boolean;
};
export declare class Diagram {
    c: ReturnType<typeof loadCatalog>;
    type: string;
    contract: ContractName;
    iconSize: number;
    preset: ReturnType<typeof typePreset>;
    page: [number, number];
    cells: string[];
    R: Record<string, Vertex>;
    phantoms: Set<string>;
    eid: number;
    edgeSpecs: EdgeSpec[];
    _edgesBuilt: boolean;
    _titleText: string;
    _titleFs: number;
    _cross: number;
    _overlaps: number;
    /** type: pipeline|hierarchy|network|hubspoke|hybrid|mesh|sequence
     *  contract: "scaffold" (default — drag-resilient, no waypoints) | "bake" (frozen waypoints). */
    constructor(type?: string, { title, page, contract, iconSize }?: DiagramOptions);
    _put(id: string, parent: string, x: number, y: number, w: number, h: number, style: string, label: string): Vertex;
    /** AWS icon by catalog name (verbatim style). [x,y] = top-left corner; size defaults to 48. */
    icon(id: string, name: string, [x, y]: [number, number], { parent, label, size, labelW }?: IconOptions): Vertex;
    /** Small catalog icon at a container's top-left corner (for Azure/GCP frames — mimics the corner
     *  icon baked into AWS group stencils). Decorative but still an obstacle (ob:true) — an edge
     *  slicing through the badge looks broken, and the geometry audit rightly flags it. */
    cornerIcon(id: string, name: string, [x, y]: [number, number], size?: number, parent?: string): Vertex;
    box(id: string, [x, y]: [number, number], [w, h]: [number, number], label?: string, { parent, fill, stroke, va, bold, fs, round, ob }?: BoxOptions): Vertex;
    /** AWS group container (group_aws_cloud_alt, group_region, group_vpc, group_account, ...).
     *  fill/stroke (optional) override the stencil's colours by appending to the style. */
    group(id: string, gname: string, [x, y]: [number, number], [w, h]: [number, number], label?: string, { parent, fill, stroke }?: GroupOptions): Vertex;
    /** Dashed "logical cluster" frame that SPANS already-placed children — call AFTER renderTree (it reads
     *  computed geometry from this.R). Draws a dashed, no-fill frame styled like the Region/AZ containers,
     *  with an icon + label at the TOP-LEFT corner. Use it for a boundary that CROSSES the real container
     *  nesting: an EKS cluster spanning the private subnets of several AZs, a service-mesh/trust boundary,
     *  a logical "platform" grouping, etc. Leave vertical room above the spanned children (a taller inter-tier
     *  gap) so the header strip (icon+label) sits clear of the children's own headers.
     *  opts: { icon (catalog name for the corner logo), stroke, dashed:true, pad, padTop, iconSize, fontColor }. */
    clusterBox(id: string, childIds: string[], label?: string, { icon, stroke, dashed, pad, padTop, iconSize, strokeWidth, fontColor }?: ClusterOptions): Vertex | null;
    /** Title centered across the page width (call after the page size is known). */
    title(label: string, { fs }?: {
        fs?: number;
    }): this;
    text(id: string, [x, y]: [number, number], w: number, label: string, { fs, parent }?: {
        fs?: number;
        parent?: string;
    }): void;
    /**
     * Panel that AUTO-SIZES to the icon count: draws a snug box, icons centered in columns + evenly distributed.
     * items = [[iconName, label], ...]. Returns the panel's rect.
     */
    panel(id: string, [x, y]: [number, number], title: string, items: [string, string][], { parent, cols, fill, stroke, itemW, itemH }?: {
        parent?: string;
        cols?: number;
        fill?: string;
        stroke?: string;
        itemW?: number;
        itemH?: number;
    }): Vertex;
    /** Edge: just provide source→target + label; the router goes straight/through-gap automatically; corners by type+role.
     *  Recorded first — toXML() bundles edges with the SAME SOURCE and same direction into a fan-out BUNDLE
     *  (comb/trunk sharing a lane) so 1→N edges don't overlap/break.
     *  opts: { dir: LR|TB (auto by position if omitted), role: flow|fanout|tree, dash: true (sync/DR),
     *          flow: true (animated moving-dash flow — shows in SVG / draw.io app, not in PNG) }. */
    link(src: string, tgt: string, label?: string, opts?: EdgeOptions): this;
    /** Build all edges — deterministic ORTHOGONAL router with HARD obstacle avoidance.
     *  Same three-stage shape as libavoid: (1) orthogonal visibility graph, (2) A* shortest path,
     *  (3) NUDGE. Ports are DE-COLLIDED first, then every edge is routed AT ITS FINAL PORT POSITION:
     *  try straight → facing-Z in the gap → L; if any still clip an icon, A* through the gaps between
     *  cards. Finally a global NUDGE pass spreads parallel overlapping segments onto distinct tracks,
     *  so the result no longer depends on link() order. A line never cuts through an icon, and parallel
     *  runs never overlap. No jump arcs. (Clear Waypoints in draw.io to re-flow after moving a node.) */
    _buildEdges(): void;
    _emitEdge({ src, tgt, label, opts }: EdgeSpec, r: Route | null, fr: Frac): void;
    centerInGapX(a: Rect, b: Rect, w: number): number;
    rect(id: string): Vertex;
    /**
     * Node that "spans vertically" (LB/bus/hub) across multiple rows — the kit computes the rect, no numbers/coords at the call site.
     *   spec: { icon, label, w, pad?, fill?, stroke? }
     *   at:   { lane }  (centered in a pre-reserved lane) OR { between:[idA,idB] } (in the gap between 2 nodes)
     *         + { from, to } (height from the top edge of `from` to the bottom edge of `to`)
     */
    spanV(id: string, { icon, label, w, pad, fill, stroke }: {
        icon?: string;
        label?: string;
        w: number;
        pad?: number;
        fill?: string;
        stroke?: string;
    }, { lane, between, from, to }: {
        lane?: string;
        between?: [string, string];
        from: string;
        to?: string;
    }): Vertex;
    toXML(): string;
    validate(opts?: {
        strict?: boolean;
    }): import("./model.ts").ValidationResult;
    mxfile(name?: string): string;
    save(filename: string, dir?: string): string;
}
export {};
