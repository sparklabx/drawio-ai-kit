export declare const DEFAULT_CATALOG: string;
export declare const CATALOG_INDEX: string;
/** Read the catalog JSON and build a lookup index (memoized per file). */
export declare function loadCatalog(path?: string): any;
/** Sibling packs of the default catalog, with embedded-image styles replaced by `lazy: 1`. */
export declare function buildCatalogIndex(dir?: string): {};
/** Packs whose full JSON has been parsed so far (for tests). */
export declare const _loadedPacks: () => string[];
/** Search for an icon/group by keyword. */
export declare function searchIcon(catalog: any, query: any, { category, limit, kind, full }?: {
    full?: boolean | undefined;
    limit?: number | undefined;
}): ({
    name: any;
    label: any;
    category: any;
    kind: any;
    color: any;
} | {
    name: any;
    fqn: string;
    label: any;
    category: any;
    kind: any;
    color: any;
    aliases: any;
    style: any;
    width?: any;
    height?: any;
    score?: any;
})[];
/** Full draw.io style for an AWS resource icon (verbatim from the index if available). */
export declare function styleForIcon(catalog: any, name: any, { width, height }?: {}): {
    style: any;
    width: any;
    height: any;
} | null;
/** Style for a group container (AWS Cloud / Region / VPC / AZ ...) — verbatim from the index if available. */
export declare function styleForGroup(catalog: any, name: any): {
    style: any;
    width: any;
    height: any;
} | {
    width?: undefined;
    height?: undefined;
    style: string;
};
/**
 * Validate a draw.io XML string:
 *  - whether every resIcon / grIcon exists in the catalog (guards against the AI inventing names)
 *  - whether edges reference existing ids
 *  - a few basic lint checks on icon styles
 * Returns { ok, errors, warnings, stats }.
 */
export declare function validateDiagram(catalog: any, xml: any, { strict }?: {
    strict?: boolean | undefined;
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
/**
 * Aesthetics check derived from comparing the AI-drawn version against the human-corrected one.
 * Only considers edge routing / layout / visual consistency. Returns advisories (not hard errors).
 */
export declare function auditAesthetics(xml: any): {
    advice: string[];
    metrics: {
        fontSizes: number[];
        fillColors: number;
        edges: number;
        fanOutSources: number;
    };
};
/**
 * Check conventions specific to AWS architecture:
 *  - icons recolored away from their standard category color (loss of recognizability).
 *  - groups nested in the wrong order (AWS Cloud→Region→VPC→AZ→Subnet→SG).
 * Returns advisories.
 */
export declare function auditAwsConventions(catalog: any, xml: any): string[];
/**
 * Edge labels on bent routes (L/Z): when source & target are offset in both X and Y but the edge
 * has no waypoint, the label (by default at the midpoint of the arc) tends to fall on the bend / box
 * edge → it looks misaligned.
 * Recommendation: add one waypoint in the middle of the corridor so the label sits centered on a straight segment.
 */
export declare function auditEdgeLabels(xml: any): string[];
/**
 * Geometric audit — catches the visual bugs that name/color/nesting checks miss, WITHOUT a render:
 *  1. a child cell spilling outside its parent container ("box exceeds its frame"),
 *  2. two sibling leaf cells whose boxes PARTIALLY overlap (a real collision, not intentional layering),
 *  3. multiple edges entering one target at the same point (stacked arrowheads).
 * Works off absolute geometry resolved through the parent chain. Tuned to avoid false positives on
 * intentional layering (a badge icon fully inside a box, a bus spanning across a container).
 */
export declare function auditGeometry(xml: any): string[];
/** Measure the graph a diagram declares (from its .drawio) into archetype-selection metrics.
 *  Inspired by nexcanvas' pre-geometry "layout brainstorm" — but computed from the built diagram so
 *  it plugs into the existing validate/audit loop. */
export declare function graphFromXml(xml: any): {
    nodeCount: number;
    edgeCount: number;
    boundaryCount: number;
    nestingDepth: number;
    containmentRatio: number;
    topologyBoundary: boolean;
    maxDegree: number;
    hubId: any;
    hubScore: number;
    backEdges: number;
    maxIconsPerGroup: number;
    singleIconFrames: number;
    emptyBand: number;
    emptyBandId: any;
    emptyBandSide: string | null;
    portrait: boolean;
    aspect: number;
};
/** Recommend a layout archetype from graph metrics (nexcanvas decision-flow thresholds), plus
 *  actionable warnings (sparsity, weak hub). Returns {recommended (our Diagram type), family, signals, warnings}. */
export declare function suggestLayout(m: any): {
    recommended: string;
    family: string;
    reason: string;
    signals: {
        hubScore: any;
        containmentRatio: any;
        topologyBoundary: any;
        feedbackRatio: number;
        nodeCount: any;
        maxIconsPerGroup: any;
    };
    warnings: string[];
};
/**
 * Architecture / Well-Architected audit — semantic best-practice checks on the topology the diagram
 * already encodes (subnet placement, AZ count, gateways), NOT visual checks. Runs in the same
 * validate pass, so the advice lands in the same issues checklist the agent already loops on — it
 * catches design flaws at diagram time, before any IaC exists. AWS-only (gated on aws4 stencils).
 * Each advice cites the risk, the fix, and the pillar.
 *
 * ponytail: only rules that flag something PRESENT in the diagram (a DB literally in a public subnet,
 * a literally-singular NAT across AZs). Rules that infer from ABSENCE (e.g. "no gateway → missing
 * egress") fire on legitimate conceptual/simplified diagrams — a diagram-time tool can't read intent
 * — so they're left out; false positives erode trust in the advice faster than misses do.
 */
export declare function auditArchitecture(xml: any): any[];
/**
 * Edge orchestration audit — catches the "ugly lines" the static checks miss, WITHOUT a render:
 *  1. very long connectors that span most of the diagram (a sign a node is parked far from its
 *     consumers — e.g. shared ECR/S3/CloudWatch dumped in a far row → long detour edges);
 *  2. an excessive number of edge crossings (the flow is tangled).
 * Both are PLACEMENT smells: the fix is to move nodes closer / group fan-out-fan-in, not to reroute.
 */
export declare function auditEdges(xml: any): any[];
/** BPMN semantic checks (gated: only runs when mxgraph.bpmn shapes are present).
 *  - gateway must split (≥2 outgoing) or merge (≥2 incoming) sequence flow
 *  - start event has no incoming; end event has no outgoing
 *  - no orphan flow object (a node connected to no sequence flow)
 *  ponytail: shape-name whitelist dropped — bpmn.ts creators throw at build time on unknown names
 *  (engine path can't emit an invalid stencil), and draw.io's BPMN stencil vastly exceeds our Tier-1
 *  set so strict whitelisting would false-flag legitimate shapes. Cross-pool sequence-flow check
 *  deferred (needs pool-membership resolution from coordinates; single-pool is the Tier-1 norm). */
export declare function auditBpmn(xml: any): string[];
export declare function listCategories(catalog: any, { excludePacks }?: {}): {
    category: any;
    count: any;
}[];
export declare function getIcon(catalog: any, name: any): {
    name: any;
    label: any;
    category: any;
    kind: any;
    color: any;
} | null;
