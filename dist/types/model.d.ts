export interface Geometry {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Point {
    x: number;
    y: number;
}
interface LayoutBase extends Partial<Geometry> {
    id: string;
    label: string;
    lane?: number;
    col?: number;
}
export interface IconOpts {
    size?: number;
}
export interface IconNode extends LayoutBase, IconOpts {
    kind: "icon";
    name: string;
}
export interface BoxOpts {
    w?: number;
    h?: number;
    fill?: string;
    stroke?: string;
    round?: boolean;
    va?: string;
    bold?: boolean;
    fs?: number;
    style?: string;
    lane?: number;
    col?: number;
}
export interface BoxNode extends LayoutBase, Omit<BoxOpts, "w" | "h"> {
    kind: "box";
    w: number;
    h: number;
}
type Dir = "row" | "col";
export interface ContainerOpts {
    dir?: Dir;
    gap?: number;
    pad?: number;
    header?: number;
    align?: "center" | "top" | "left";
    fill?: string;
    stroke?: string;
    cornerIcon?: string | null;
    routeGap?: number;
    stack?: number;
}
export interface GroupNode extends LayoutBase {
    kind: "group";
    gname: string | null;
    children: LayoutNode[];
    dir: Dir;
    gap: number;
    pad: number;
    header: number;
    align: "center" | "top" | "left";
    fill?: string;
    stroke?: string;
    cornerIcon: string | null;
    routeGap: number;
    stack: number;
}
export interface PhantomNode extends Omit<GroupNode, "kind" | "stack"> {
    kind: "phantom";
}
export interface GridOpts {
    cols?: number;
    gap?: number;
    pad?: number;
    header?: number;
    fill?: string;
    stroke?: string;
}
export interface GridNode extends LayoutBase {
    kind: "grid";
    gname: string | null;
    children: LayoutNode[];
    cols: number;
    gap: number;
    pad: number;
    header: number;
    fill?: string;
    stroke?: string;
}
export interface PoolOpts {
    lanes?: string[];
    phases?: string[];
    orientation?: "horizontal" | "vertical";
    gap?: number;
    pad?: number;
    laneLabel?: number;
    phaseLabel?: number;
    fill?: string | null;
    stroke?: string | null;
}
export interface PoolNode extends LayoutBase {
    kind: "pool";
    gname: null;
    children: LayoutNode[];
    lanes: string[];
    phases: string[];
    orientation: "horizontal" | "vertical";
    gap: number;
    pad: number;
    laneLabel: number;
    phaseLabel: number;
    fill: string | null;
    stroke: string | null;
    header?: number;
}
export type LayoutNode = IconNode | BoxNode | GroupNode | PhantomNode | GridNode | PoolNode;
/** Axis-aligned rectangle in absolute page coordinates. */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** A placed node's rect. ob: true = leaf obstacle the router avoids; false = container frame. labelH/labelW = caption band under an icon. */
export interface Vertex extends Rect {
    ob?: boolean | null;
    labelH?: number;
    labelW?: number;
}
/** Port side of a node: Left, Right, Top, Bottom. */
export type Side = "L" | "R" | "T" | "B";
export type ContractName = "scaffold" | "bake";
export interface DiagramOptions {
    title?: string;
    page?: [number, number];
    contract?: ContractName;
    iconSize?: number;
}
export interface IconOptions {
    parent?: string;
    label?: string;
    size?: number;
    labelW?: number;
}
export interface BoxOptions {
    parent?: string;
    fill?: string;
    stroke?: string;
    va?: string;
    bold?: boolean;
    fs?: number;
    round?: boolean;
    ob?: boolean | null;
}
export interface GroupOptions {
    parent?: string;
    fill?: string | null;
    stroke?: string | null;
}
export interface ClusterOptions {
    icon?: string | null;
    stroke?: string;
    dashed?: boolean;
    pad?: number;
    padTop?: number;
    iconSize?: number;
    strokeWidth?: number;
    fontColor?: string | null;
}
/** Options for Diagram.link(). route pins both ports; rail routes along a top/bottom gutter (or a Y); style = raw style (no routing). */
export interface EdgeOptions {
    dir?: "LR" | "TB";
    role?: string;
    dash?: boolean;
    flow?: boolean;
    rounded?: boolean;
    stroke?: string;
    style?: string;
    step?: number | string | null;
    badge?: string | number | null;
    badgePos?: number | null;
    route?: {
        es: Side;
        en: Side;
    };
    rail?: "top" | "bottom" | number;
    lane?: number;
}
/** An edge recorded by link(), built later by toXML() so fan-outs can be bundled. */
export interface EdgeSpec {
    src: string;
    tgt: string;
    label: string;
    opts: EdgeOptions;
}
/** `--key value` -> string, bare `--key` -> true. */
export type Flags = Record<string, string | true>;
export interface ParsedArgs {
    flags: Flags;
    positional: string[];
}
/** Injectable probes for findDrawioCli / findDot (tests run without real binaries). */
export interface FindDeps {
    existsSync?: (path: string) => boolean;
    locateOnPath?: (env: Record<string, string | undefined>) => string;
}
export interface RenderArgs {
    file: string;
    out: string;
    scale?: number;
    page?: number;
}
export type RouterName = "graphviz" | "kit";
export type EntryKind = "icon" | "group";
/** One catalog icon/group as stored in a pack JSON (no pack/kind yet). */
export interface RawEntry {
    name: string;
    label?: string;
    category?: string;
    tags?: string | string[];
    aliases?: string[];
    keywords?: string[];
    color?: string;
    /** Group-only appearance hints used when no verbatim style exists. */
    fill?: string;
    stroke?: string;
    dashed?: boolean;
    style?: string;
    w?: number;
    h?: number;
    /** Set in the slim index: the style lives in the pack JSON and is read on demand. */
    lazy?: 1;
}
export interface CatalogEntry extends RawEntry {
    pack: string;
    /** Only set on `byName` entries. */
    kind?: EntryKind;
}
/** A pack JSON file (also the shape of each catalog-index.json value). */
export interface Pack {
    categoryColors?: Record<string, string>;
    icons?: RawEntry[];
    groups?: RawEntry[];
}
export interface Catalog {
    meta: {
        incomplete?: boolean;
        [key: string]: unknown;
    };
    categoryColors: Record<string, string>;
    icons: CatalogEntry[];
    groups: CatalogEntry[];
    byName: Map<string, CatalogEntry>;
    validNames: Set<string>;
}
/** draw.io style string with an optional default size (groups carry the size only when the catalog has it). */
export interface StyleResult {
    style: string;
    width?: number;
    height?: number;
}
export interface SearchOptions {
    category?: string;
    limit?: number;
    kind?: string;
    full?: boolean;
}
/** Compact search hit (default) or the full decorated entry (`full` / getIcon). */
export interface SearchHit {
    name: string;
    label: string;
    category: string | null;
    kind?: EntryKind;
    color: string;
    fqn?: string;
    aliases?: string[];
    style?: string;
    width?: number;
    height?: number;
    score?: number;
}
export interface AuditMetrics {
    fontSizes: number[];
    fillColors: number;
    edges: number;
    fanOutSources: number;
}
export interface AuditResult {
    advice: string[];
    metrics?: AuditMetrics;
}
export interface ValidationStats {
    resIcons: number;
    grIcons: number;
    shapes: number;
    uniqueStencils: number;
    cellIds: number;
}
export interface ValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    audit: AuditResult;
    /** Absent when the XML had no cells at all. */
    stats?: ValidationStats;
}
/** Archetype-selection metrics measured from a built .drawio (graphFromXml). */
export interface GraphMetrics {
    nodeCount: number;
    edgeCount: number;
    boundaryCount: number;
    nestingDepth: number;
    containmentRatio: number;
    topologyBoundary: boolean;
    maxDegree: number;
    hubId: string | null;
    hubScore: number;
    backEdges: number;
    maxIconsPerGroup: number;
    singleIconFrames: number;
    emptyBand: number;
    emptyBandId: string | null;
    emptyBandSide: "top" | "bottom" | null;
    portrait: boolean;
    aspect: number;
}
export interface LayoutSuggestion {
    recommended: string;
    family: string;
    reason: string;
    signals: Record<string, number | boolean>;
    warnings: string[];
}
export interface DiagramTypePreset {
    label: string;
    orientation: string;
    edgeCorner: "rounded" | "sharp";
    laneStrategy: string;
    grouping: string;
    notes: string;
    mirrorAZ?: boolean;
}
export {};
