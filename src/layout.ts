// drawio-ai-kit — edge router (auto edge routing).
// Given 2 rectangles, it generates exit/entry points + waypoints to keep the line STRAIGHT when possible,
// and routes through the MIDDLE OF THE CORRIDOR (balanced label) when a corner is unavoidable. No hardcoding per edge.
//
// rect = { x, y, w, h }.  Returns { pins, wp } — pins is a style string; wp is {x,y} or null.

const frac = (v, lo, len) => ((v - lo) / len).toFixed(3);

// laneX/laneY: the "gap" coordinate for the perpendicular segment — it should be the MIDDLE OF THE WHITE GAP between two columns/rows,
// not the midpoint of two nodes (a node may be a narrow icon centered in a column → the node midpoint lands on a frame edge).
// If not provided, defaults to the midpoint between the two nearest node edges (good enough when there is no frame).

// wp is always an ARRAY of points (empty if the line is straight). A bent line uses 2 points on the same lane
// to force the perpendicular segment to sit exactly in the gap (preventing drawio from bending it along node edges).

/** Connect horizontally. Exit/entry are pinned to the side FACING the other node (target right →
 *  exit right/enter left; target left → exit left/enter right) so the edge never loops the wrong way. */
export function routeLR(s, t, { tol = 8, laneX = null } = {}) {
  const fwd = (t.x + t.w / 2) >= (s.x + s.w / 2);   // target to the right of source?
  const exX = fwd ? 1 : 0, enX = fwd ? 0 : 1;
  const ov0 = Math.max(s.y, t.y);
  const ov1 = Math.min(s.y + s.h, t.y + t.h);
  if (ov1 - ov0 >= tol) {
    const y = (ov0 + ov1) / 2; // overlapping vertical band → straight horizontal line at the shared Y
    return {
      pins: `exitX=${exX};exitY=${frac(y, s.y, s.h)};exitDx=0;exitDy=0;entryX=${enX};entryY=${frac(y, t.y, t.h)};entryDx=0;entryDy=0;`,
      wp: [],
    };
  }
  const lx = Math.round(laneX != null ? laneX : (fwd ? s.x + s.w + t.x : s.x + t.x + t.w) / 2);
  const sy = Math.round(s.y + s.h / 2), ty = Math.round(t.y + t.h / 2);
  return {
    pins: `exitX=${exX};exitY=0.5;exitDx=0;exitDy=0;entryX=${enX};entryY=0.5;entryDx=0;entryDy=0;`,
    wp: [{ x: lx, y: sy }, { x: lx, y: ty }], // horizontal → vertical (at lx) → horizontal
  };
}

// FAN-OUT (1 source → many targets): the "comb" rule (comb/trunk) for a clean look —
// EVERY edge in the bundle SHARES one lane (laneX/laneY) and exits from the source's CENTER, so
// collinear segments stack exactly into ONE shared trunk, leaving each target only a single
// short branch. Force a corner (even when bands overlap) so a straight line doesn't break the trunk.

/** A horizontal fan-out edge: shared vertical trunk at laneX; exit/entry face the target side. */
export function routeLRFan(s, t, { laneX }) {
  const fwd = (t.x + t.w / 2) >= (s.x + s.w / 2);
  const exX = fwd ? 1 : 0, enX = fwd ? 0 : 1;
  const sy = Math.round(s.y + s.h / 2), ty = Math.round(t.y + t.h / 2);
  const lx = Math.round(laneX);
  return {
    pins: `exitX=${exX};exitY=0.5;exitDx=0;exitDy=0;entryX=${enX};entryY=0.5;entryDx=0;entryDy=0;`,
    wp: sy === ty ? [] : [{ x: lx, y: sy }, { x: lx, y: ty }],
  };
}

/** A vertical fan-out edge: shared horizontal trunk at laneY; exit/entry face the target side. */
export function routeTBFan(s, t, { laneY }) {
  const down = (t.y + t.h / 2) >= (s.y + s.h / 2);
  const exY = down ? 1 : 0, enY = down ? 0 : 1;
  const sx = Math.round(s.x + s.w / 2), tx = Math.round(t.x + t.w / 2);
  const ly = Math.round(laneY);
  return {
    pins: `exitX=0.5;exitY=${exY};exitDx=0;exitDy=0;entryX=0.5;entryY=${enY};entryDx=0;entryDy=0;`,
    wp: sx === tx ? [] : [{ x: sx, y: ly }, { x: tx, y: ly }],
  };
}

// FAN-IN (many sources → 1 target): mirror of fan-out. Edges share one lane just
// before the target and arrive at DISTINCT entry points (entryY/entryX spread), so the
// arrowheads don't stack on one spot — a clean "reverse comb" into the target edge.

/** A horizontal fan-in edge: distinct entryY; exit/entry face the source→target side. */
export function routeLRFanIn(s, t, { laneX, entryY }) {
  const fwd = (t.x + t.w / 2) >= (s.x + s.w / 2);
  const exX = fwd ? 1 : 0, enX = fwd ? 0 : 1;
  const sy = Math.round(s.y + s.h / 2), ty = Math.round(t.y + t.h * entryY);
  const lx = Math.round(laneX);
  return {
    pins: `exitX=${exX};exitY=0.5;exitDx=0;exitDy=0;entryX=${enX};entryY=${entryY.toFixed(3)};entryDx=0;entryDy=0;`,
    wp: sy === ty ? [] : [{ x: lx, y: sy }, { x: lx, y: ty }],
  };
}

/** A vertical fan-in edge: distinct entryX; exit/entry face the source→target side. */
export function routeTBFanIn(s, t, { laneY, entryX }) {
  const down = (t.y + t.h / 2) >= (s.y + s.h / 2);
  const exY = down ? 1 : 0, enY = down ? 0 : 1;
  const sx = Math.round(s.x + s.w / 2), tx = Math.round(t.x + t.w * entryX);
  const ly = Math.round(laneY);
  return {
    pins: `exitX=0.5;exitY=${exY};exitDx=0;exitDy=0;entryX=${entryX.toFixed(3)};entryY=${enY};entryDx=0;entryDy=0;`,
    wp: sx === tx ? [] : [{ x: sx, y: ly }, { x: tx, y: ly }],
  };
}

/** Connect vertically. Exit/entry pinned to the side FACING the other node (target below →
 *  exit bottom/enter top; target above → exit top/enter bottom) so the edge never loops. */
export function routeTB(s, t, { tol = 8, laneY = null } = {}) {
  const down = (t.y + t.h / 2) >= (s.y + s.h / 2);   // target below source?
  const exY = down ? 1 : 0, enY = down ? 0 : 1;
  const ov0 = Math.max(s.x, t.x);
  const ov1 = Math.min(s.x + s.w, t.x + t.w);
  if (ov1 - ov0 >= tol) {
    const x = (ov0 + ov1) / 2;
    return {
      pins: `exitX=${frac(x, s.x, s.w)};exitY=${exY};exitDx=0;exitDy=0;entryX=${frac(x, t.x, t.w)};entryY=${enY};entryDx=0;entryDy=0;`,
      wp: [],
    };
  }
  const ly = Math.round(laneY != null ? laneY : (down ? s.y + s.h + t.y : s.y + t.y + t.h) / 2);
  const sx = Math.round(s.x + s.w / 2), tx = Math.round(t.x + t.w / 2);
  return {
    pins: `exitX=0.5;exitY=${exY};exitDx=0;exitDy=0;entryX=0.5;entryY=${enY};entryDx=0;entryDy=0;`,
    wp: [{ x: sx, y: ly }, { x: tx, y: ly }], // vertical → horizontal (at ly) → vertical
  };
}

/** X to place a node of width w in the MIDDLE OF THE horizontal GAP between 2 rects (left, right). */
export function centerInGapX(left, right, w) {
  return Math.round((left.x + left.w + right.x) / 2 - w / 2);
}
/** Y to place a node of height h in the MIDDLE OF THE vertical GAP between 2 rects (top, bottom). */
export function centerInGapY(top, bottom, h) {
  return Math.round((top.y + top.h + bottom.y) / 2 - h / 2);
}

/** X to CENTER a node of width w inside a box. */
export function centerInBoxX(box, w) {
  return Math.round(box.x + (box.w - w) / 2);
}
/**
 * Y (top edge) for element i of n, distributed EVENLY vertically inside the box,
 * reserving the `top` header and `bottom` margin. itemH = cell height (icon + label).
 */
export function distributeY(box, n, i, { top = 50, bottom = 24, itemH = 78 } = {}) {
  const usable = box.h - top - bottom;
  const step = usable / n;
  return Math.round(box.y + top + step * (i + 0.5) - itemH / 2);
}

/** Child rect that fits SNUGLY INSIDE the parent rect (margins l/t/r/b). Used for tightly nested frames. */
export function inset(rect, { l = 18, t = 24, r = 18, b = 12 } = {}) {
  return { x: rect.x + l, y: rect.y + t, w: rect.w - l - r, h: rect.h - t - b };
}

/** Box size that FITS n icons (grid of cols columns) — no wasted space in the box. */
export function panelSize(n, { cols = 1, itemW = 130, itemH = 84, gap = 18, pad = 20, header = 34 } = {}) {
  const rows = Math.ceil(n / cols);
  return {
    w: pad * 2 + cols * itemW + (cols - 1) * gap,
    h: header + pad + rows * itemH + (rows - 1) * gap + pad - 10,
  };
}

/** Auto-pick LR/TB by relative position (prefer the axis with the larger offset). */
export function route(s, t, opts) {
  const dx = (t.x + t.w / 2) - (s.x + s.w / 2);
  const dy = (t.y + t.h / 2) - (s.y + s.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? routeLR(s, t, opts) : routeLR(t, s, opts);
  return dy >= 0 ? routeTB(s, t, opts) : routeTB(t, s, opts);
}
