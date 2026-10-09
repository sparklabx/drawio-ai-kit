import type { Geometry as Rect, Point } from "./model.ts";
type Route = {
    pins: string;
    wp: Point[];
};
type LaneOpts = {
    tol?: number;
    laneX?: number | null;
    laneY?: number | null;
};
/** Connect horizontally. Exit/entry are pinned to the side FACING the other node (target right →
 *  exit right/enter left; target left → exit left/enter right) so the edge never loops the wrong way. */
export declare function routeLR(s: Rect, t: Rect, { tol, laneX }?: LaneOpts): Route;
/** A horizontal fan-out edge: shared vertical trunk at laneX; exit/entry face the target side. */
export declare function routeLRFan(s: Rect, t: Rect, { laneX }: {
    laneX: number;
}): Route;
/** A vertical fan-out edge: shared horizontal trunk at laneY; exit/entry face the target side. */
export declare function routeTBFan(s: Rect, t: Rect, { laneY }: {
    laneY: number;
}): Route;
/** A horizontal fan-in edge: distinct entryY; exit/entry face the source→target side. */
export declare function routeLRFanIn(s: Rect, t: Rect, { laneX, entryY }: {
    laneX: number;
    entryY: number;
}): Route;
/** A vertical fan-in edge: distinct entryX; exit/entry face the source→target side. */
export declare function routeTBFanIn(s: Rect, t: Rect, { laneY, entryX }: {
    laneY: number;
    entryX: number;
}): Route;
/** Connect vertically. Exit/entry pinned to the side FACING the other node (target below →
 *  exit bottom/enter top; target above → exit top/enter bottom) so the edge never loops. */
export declare function routeTB(s: Rect, t: Rect, { tol, laneY }?: LaneOpts): Route;
/** X to place a node of width w in the MIDDLE OF THE horizontal GAP between 2 rects (left, right). */
export declare function centerInGapX(left: Rect, right: Rect, w: number): number;
/** Y to place a node of height h in the MIDDLE OF THE vertical GAP between 2 rects (top, bottom). */
export declare function centerInGapY(top: Rect, bottom: Rect, h: number): number;
/** X to CENTER a node of width w inside a box. */
export declare function centerInBoxX(box: Rect, w: number): number;
/**
 * Y (top edge) for element i of n, distributed EVENLY vertically inside the box,
 * reserving the `top` header and `bottom` margin. itemH = cell height (icon + label).
 */
export declare function distributeY(box: Rect, n: number, i: number, { top, bottom, itemH }?: {
    top?: number;
    bottom?: number;
    itemH?: number;
}): number;
/** Child rect that fits SNUGLY INSIDE the parent rect (margins l/t/r/b). Used for tightly nested frames. */
export declare function inset(rect: Rect, { l, t, r, b }?: {
    l?: number;
    t?: number;
    r?: number;
    b?: number;
}): Rect;
/** Box size that FITS n icons (grid of cols columns) — no wasted space in the box. */
export declare function panelSize(n: number, { cols, itemW, itemH, gap, pad, header }?: {
    cols?: number;
    itemW?: number;
    itemH?: number;
    gap?: number;
    pad?: number;
    header?: number;
}): {
    w: number;
    h: number;
};
/** Auto-pick LR/TB by relative position (prefer the axis with the larger offset). */
export declare function route(s: Rect, t: Rect, opts?: LaneOpts): Route;
export {};
