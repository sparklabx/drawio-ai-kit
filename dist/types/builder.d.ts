export declare class Diagram {
    /** type: pipeline|hierarchy|network|hubspoke|hybrid|mesh|sequence
     *  contract: "scaffold" (default — drag-resilient, no waypoints) | "bake" (frozen waypoints). */
    constructor(type?: string, { title, page, contract, iconSize }?: {
        contract?: string | undefined;
        iconSize?: number | undefined;
        page?: number[] | undefined;
        title?: string | undefined;
    });
    _put(id: any, parent: any, x: any, y: any, w: any, h: any, style: any, label: any): any;
    /** AWS icon by catalog name (verbatim style). [x,y] = top-left corner; size defaults to 48. */
    icon(id: any, name: any, [x, y]: [any, any], { parent, label, size, labelW }?: {
        label?: string | undefined;
        labelW?: number | undefined;
        parent?: string | undefined;
        size?: number | undefined;
    }): any;
    /** Small catalog icon at a container's top-left corner (for Azure/GCP frames — mimics the corner
     *  icon baked into AWS group stencils). Decorative but still an obstacle (ob:true) — an edge
     *  slicing through the badge looks broken, and the geometry audit rightly flags it. */
    cornerIcon(id: any, name: any, [x, y]: [any, any], size?: number, parent?: string): any;
    box(id: any, [x, y]: [any, any], [w, h]: [any, any], label?: string, { parent, fill, stroke, va, bold, fs, round, ob }?: {
        bold?: boolean | undefined;
        fill?: string | undefined;
        fs?: number | undefined;
        ob?: boolean | undefined;
        parent?: string | undefined;
        round?: boolean | undefined;
        stroke?: string | undefined;
        va?: string | undefined;
    }): any;
    /** AWS group container (group_aws_cloud_alt, group_region, group_vpc, group_account, ...).
     *  fill/stroke (optional) override the stencil's colours by appending to the style. */
    group(id: any, gname: any, [x, y]: [any, any], [w, h]: [any, any], label?: string, { parent, fill, stroke }?: {
        fill?: null | undefined;
        parent?: string | undefined;
        stroke?: null | undefined;
    }): any;
    /** Dashed "logical cluster" frame that SPANS already-placed children — call AFTER renderTree (it reads
     *  computed geometry from this.R). Draws a dashed, no-fill frame styled like the Region/AZ containers,
     *  with an icon + label at the TOP-LEFT corner. Use it for a boundary that CROSSES the real container
     *  nesting: an EKS cluster spanning the private subnets of several AZs, a service-mesh/trust boundary,
     *  a logical "platform" grouping, etc. Leave vertical room above the spanned children (a taller inter-tier
     *  gap) so the header strip (icon+label) sits clear of the children's own headers.
     *  opts: { icon (catalog name for the corner logo), stroke, dashed:true, pad, padTop, iconSize, fontColor }. */
    clusterBox(id: any, childIds: any, label?: string, { icon, stroke, dashed, pad, padTop, iconSize, strokeWidth, fontColor }?: {
        dashed?: boolean | undefined;
        fontColor?: null | undefined;
        icon?: null | undefined;
        iconSize?: number | undefined;
        pad?: number | undefined;
        padTop?: number | undefined;
        stroke?: string | undefined;
        strokeWidth?: number | undefined;
    }): any;
    /** Title centered across the page width (call after the page size is known). */
    title(label: any, { fs }?: {
        fs?: number | undefined;
    }): this;
    text(id: any, [x, y]: [any, any], w: any, label: any, { fs, parent }?: {
        fs?: number | undefined;
        parent?: string | undefined;
    }): void;
    /**
     * Panel that AUTO-SIZES to the icon count: draws a snug box, icons centered in columns + evenly distributed.
     * items = [[iconName, label], ...]. Returns the panel's rect.
     */
    panel(id: any, [x, y]: [any, any], title: any, items: any, { parent, cols, fill, stroke, itemW, itemH }?: {
        cols?: number | undefined;
        fill?: string | undefined;
        itemH?: number | undefined;
        itemW?: number | undefined;
        parent?: string | undefined;
        stroke?: string | undefined;
    }): any;
    /** Edge: just provide source→target + label; the router goes straight/through-gap automatically; corners by type+role.
     *  Recorded first — toXML() bundles edges with the SAME SOURCE and same direction into a fan-out BUNDLE
     *  (comb/trunk sharing a lane) so 1→N edges don't overlap/break.
     *  opts: { dir: LR|TB (auto by position if omitted), role: flow|fanout|tree, dash: true (sync/DR),
     *          flow: true (animated moving-dash flow — shows in SVG / draw.io app, not in PNG) }. */
    link(src: any, tgt: any, label?: string, opts?: {}): this;
    /** Build all edges — deterministic ORTHOGONAL router with HARD obstacle avoidance.
     *  Same three-stage shape as libavoid: (1) orthogonal visibility graph, (2) A* shortest path,
     *  (3) NUDGE. Ports are DE-COLLIDED first, then every edge is routed AT ITS FINAL PORT POSITION:
     *  try straight → facing-Z in the gap → L; if any still clip an icon, A* through the gaps between
     *  cards. Finally a global NUDGE pass spreads parallel overlapping segments onto distinct tracks,
     *  so the result no longer depends on link() order. A line never cuts through an icon, and parallel
     *  runs never overlap. No jump arcs. (Clear Waypoints in draw.io to re-flow after moving a node.) */
    _buildEdges(): void;
    _emitEdge({ src, tgt, label, opts }: {
        label?: string | undefined;
        opts?: {} | undefined;
        src: any;
        tgt: any;
    }, r: any, fr: any, geom: any): void;
    centerInGapX(a: any, b: any, w: any): number;
    rect(id: any): any;
    /**
     * Node that "spans vertically" (LB/bus/hub) across multiple rows — the kit computes the rect, no numbers/coords at the call site.
     *   spec: { icon, label, w, pad?, fill?, stroke? }
     *   at:   { lane }  (centered in a pre-reserved lane) OR { between:[idA,idB] } (in the gap between 2 nodes)
     *         + { from, to } (height from the top edge of `from` to the bottom edge of `to`)
     */
    spanV(id: any, { icon, label, w, pad, fill, stroke }: {
        fill?: string | undefined;
        icon: any;
        label?: string | undefined;
        pad?: number | undefined;
        stroke?: string | undefined;
        w: any;
    }, { lane, between, from, to }: {
        between: any;
        from: any;
        lane: any;
        to: any;
    }): any;
    toXML(): string;
    validate(opts?: {
        strict: boolean;
    }): {
        ok: boolean;
        errors: string[];
        warnings: any[];
        audit: {
            advice: never[];
        };
        stats?: undefined;
    } | {
        ok: boolean;
        errors: string[];
        warnings: string[];
        audit: {
            advice: string[];
            metrics: {
                fontSizes: number[];
                fillColors: number;
                edges: number;
                fanOutSources: number;
            };
        };
        stats: {
            resIcons: number;
            grIcons: number;
            shapes: number;
            uniqueStencils: number;
            cellIds: number;
        };
    };
    mxfile(name?: string): string;
    save(filename: any, dir?: string): string;
}
