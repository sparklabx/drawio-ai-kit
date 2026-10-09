/** Connect horizontally. Exit/entry are pinned to the side FACING the other node (target right →
 *  exit right/enter left; target left → exit left/enter right) so the edge never loops the wrong way. */
export declare function routeLR(s: any, t: any, { tol, laneX }?: {
    laneX?: null | undefined;
    tol?: number | undefined;
}): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
/** A horizontal fan-out edge: shared vertical trunk at laneX; exit/entry face the target side. */
export declare function routeLRFan(s: any, t: any, { laneX }: {
    laneX: any;
}): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
/** A vertical fan-out edge: shared horizontal trunk at laneY; exit/entry face the target side. */
export declare function routeTBFan(s: any, t: any, { laneY }: {
    laneY: any;
}): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
/** A horizontal fan-in edge: distinct entryY; exit/entry face the source→target side. */
export declare function routeLRFanIn(s: any, t: any, { laneX, entryY }: {
    entryY: any;
    laneX: any;
}): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
/** A vertical fan-in edge: distinct entryX; exit/entry face the source→target side. */
export declare function routeTBFanIn(s: any, t: any, { laneY, entryX }: {
    entryX: any;
    laneY: any;
}): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
/** Connect vertically. Exit/entry pinned to the side FACING the other node (target below →
 *  exit bottom/enter top; target above → exit top/enter bottom) so the edge never loops. */
export declare function routeTB(s: any, t: any, { tol, laneY }?: {
    laneY?: null | undefined;
    tol?: number | undefined;
}): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
/** X to place a node of width w in the MIDDLE OF THE horizontal GAP between 2 rects (left, right). */
export declare function centerInGapX(left: any, right: any, w: any): number;
/** Y to place a node of height h in the MIDDLE OF THE vertical GAP between 2 rects (top, bottom). */
export declare function centerInGapY(top: any, bottom: any, h: any): number;
/** X to CENTER a node of width w inside a box. */
export declare function centerInBoxX(box: any, w: any): number;
/**
 * Y (top edge) for element i of n, distributed EVENLY vertically inside the box,
 * reserving the `top` header and `bottom` margin. itemH = cell height (icon + label).
 */
export declare function distributeY(box: any, n: any, i: any, { top, bottom, itemH }?: {
    bottom?: number | undefined;
    itemH?: number | undefined;
    top?: number | undefined;
}): number;
/** Child rect that fits SNUGLY INSIDE the parent rect (margins l/t/r/b). Used for tightly nested frames. */
export declare function inset(rect: any, { l, t, r, b }?: {
    b?: number | undefined;
    l?: number | undefined;
    r?: number | undefined;
    t?: number | undefined;
}): {
    x: any;
    y: any;
    w: number;
    h: number;
};
/** Box size that FITS n icons (grid of cols columns) — no wasted space in the box. */
export declare function panelSize(n: any, { cols, itemW, itemH, gap, pad, header }?: {
    cols?: number | undefined;
    gap?: number | undefined;
    header?: number | undefined;
    itemH?: number | undefined;
    itemW?: number | undefined;
    pad?: number | undefined;
}): {
    w: number;
    h: number;
};
/** Auto-pick LR/TB by relative position (prefer the axis with the larger offset). */
export declare function route(s: any, t: any, opts: any): {
    pins: string;
    wp: {
        x: number;
        y: number;
    }[];
};
