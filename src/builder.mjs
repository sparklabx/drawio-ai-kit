// drawio-ai-kit — Diagram builder. Bundles all boilerplate: icon/box/group/panel/link
// + auto-routing by type + auto-size panel + validate + XML export. Goal: build
// a diagram with just a few lines of declaration (easy to use, easy to extend).
import { loadCatalog, styleForIcon, styleForGroup, validateDiagram } from "./core.mjs";
import { centerInGapX, panelSize } from "./layout.mjs";
import { typePreset } from "./types.mjs";
import { THEME } from "./theme.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class Diagram {
  /** type: pipeline|hierarchy|network|hubspoke|hybrid|mesh|sequence */
  constructor(type = "pipeline", { title = "", page = [2000, 1200] } = {}) {
    this.c = loadCatalog();
    this.type = type;
    this.preset = typePreset(type);
    this.page = page;
    this.cells = [];
    this.R = {};
    this.eid = 0;
    this.edgeSpecs = [];        // edges recorded first, built later (to bundle fan-out 1→N)
    this._edgesBuilt = false;
    if (title) this.text("__title", [0, 24], page[0], title, { fs: 14 });
  }
  _put(id, parent, x, y, w, h, style, label) {
    this.R[id] = { x, y, w, h };
    const p = this.R[parent]; const ox = p ? p.x : 0, oy = p ? p.y : 0;   // layer parents ("1"/"boundaries") → offset 0
    this.cells.push(`<mxCell id="${id}" value="${esc(label)}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x - ox}" y="${y - oy}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
    return this.R[id];
  }
  /** AWS icon by catalog name (verbatim style). [x,y] = top-left corner (48×48 icon). */
  icon(id, name, [x, y], { parent = "1", label = "" } = {}) {
    const s = styleForIcon(this.c, name);
    if (!s) throw new Error(`Icon not found in catalog: "${name}" — use search_icon to look up the correct name.`);
    const r = this._put(id, parent, x, y, 48, 48, s.style, label); r.ob = true; return r;   // ob = leaf obstacle (router avoids)
  }
  // Default SQUARE CORNERS — AWS diagrams rarely use rounded frames. (round:true if needed.)
  // ob: true = a leaf card the edge-router must not cross; false = a container frame (edges pass through).
  box(id, [x, y], [w, h], label = "", { parent = "1", fill = "#FFFFFF", stroke = "#5A6B7B", va = "middle", bold = false, fs = 11, round = false, ob = true } = {}) {
    const r = this._put(id, parent, x, y, w, h, `rounded=${round ? 1 : 0};whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontColor=#1A1A1A;fontSize=${fs};fontStyle=${bold ? 1 : 0};verticalAlign=${va};`, label); r.ob = ob; return r;
  }
  /** AWS group container (group_aws_cloud_alt, group_region, group_vpc, group_account, ...).
   *  fill/stroke (optional) override the stencil's colours by appending to the style. */
  group(id, gname, [x, y], [w, h], label = "", { parent = "1", fill = null, stroke = null } = {}) {
    const s = styleForGroup(this.c, gname);
    if (!s) throw new Error(`Group not found: "${gname}"`);
    let style = s.style;
    // convention colours (overridable): public subnet green / private subnet blue; Region teal; VPC purple.
    if (!fill && gname === "group_subnet") {
      const priv = /private/i.test(label);
      fill = priv ? THEME.subnetPrivate : THEME.subnetPublic;
      stroke = stroke || (priv ? THEME.subnetPrivateStroke : THEME.subnetPublicStroke);
    }
    if (!stroke && gname === "group_region") stroke = THEME.regionStroke;
    if (!stroke && gname === "group_vpc") stroke = THEME.vpcStroke;
    if (!stroke && gname === "group_account") stroke = THEME.accountStroke;
    if (!stroke && gname === "group_availability_zone") stroke = THEME.azStroke;
    if (fill) style += `fillColor=${fill};`;
    if (stroke) style += `strokeColor=${stroke};`;
    const r = this._put(id, parent, x, y, w, h, style, label); r.ob = false; return r;   // container → edges pass through
  }
  /** Dashed "logical cluster" frame that SPANS already-placed children — call AFTER renderTree (it reads
   *  computed geometry from this.R). Draws a dashed, no-fill frame styled like the Region/AZ containers,
   *  with an icon + label at the TOP-LEFT corner. Use it for a boundary that CROSSES the real container
   *  nesting: an EKS cluster spanning the private subnets of several AZs, a service-mesh/trust boundary,
   *  a logical "platform" grouping, etc. Leave vertical room above the spanned children (a taller inter-tier
   *  gap) so the header strip (icon+label) sits clear of the children's own headers.
   *  opts: { icon (catalog name for the corner logo), stroke, dashed:true, pad, padTop, iconSize, fontColor }. */
  clusterBox(id, childIds, label = "", { icon = null, stroke = "#ED7100", dashed = true, pad = 14, padTop = 34, iconSize = 20, strokeWidth = 1, fontColor = null } = {}) {
    const rs = childIds.map((c) => this.R[c]).filter(Boolean);
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.x)) - pad;
    const y = Math.min(...rs.map((r) => r.y)) - padTop;
    const w = Math.max(...rs.map((r) => r.x + r.w)) + pad - x;
    const h = Math.max(...rs.map((r) => r.y + r.h)) + pad - y;
    const fc = fontColor || stroke;
    const spacingLeft = icon ? iconSize + 6 : 6;
    const dash = dashed ? "dashed=1;" : "";
    // Put boundary frames on their OWN draw.io layer ("boundaries", locked by default) so they can be
    // toggled/locked while hand-editing the icons & containers. No fill → only the dashed border shows.
    this._put(id, "boundaries", x, y, w, h, `rounded=0;${dash}fillColor=none;strokeColor=${stroke};strokeWidth=${strokeWidth};verticalAlign=top;align=left;spacingLeft=${spacingLeft};spacingTop=5;fontColor=${fc};fontStyle=1;fontSize=11;`, label);
    if (icon) {
      const s = styleForIcon(this.c, icon);
      if (!s) throw new Error(`clusterBox icon not found in catalog: "${icon}"`);
      this._put(`${id}_icon`, "boundaries", x + 1, y + 1, iconSize, iconSize, s.style, "");   // flush to the top-left corner
    }
    return this.R[id];
  }
  /** Title centered across the page width (call after the page size is known). */
  title(label, { fs = 14 } = {}) { this.text("__title", [0, 24], this.page[0], label, { fs }); return this; }
  text(id, [x, y], w, label, { fs = 14, parent = "1" } = {}) {
    const ox = parent === "1" ? 0 : this.R[parent].x, oy = parent === "1" ? 0 : this.R[parent].y;
    this.R[id] = { x, y, w, h: 30 };
    this.cells.push(`<mxCell id="${id}" value="${esc(label)}" style="text;html=1;align=center;fontStyle=1;fontSize=${fs};fontColor=light-dark(#232F3E,#E8E8E8);" vertex="1" parent="${parent}"><mxGeometry x="${x - ox}" y="${y - oy}" width="${w}" height="30" as="geometry"/></mxCell>`);
  }
  /**
   * Panel that AUTO-SIZES to the icon count: draws a snug box, icons centered in columns + evenly distributed.
   * items = [[iconName, label], ...]. Returns the panel's rect.
   */
  panel(id, [x, y], title, items, { parent = "1", cols = 1, fill = "#F5F5F5", stroke = "#999999", itemW = 130, itemH = 84 } = {}) {
    const { w, h } = panelSize(items.length, { cols, itemW, itemH });
    this.box(id, [x, y], [w, h], title, { parent, fill, stroke, va: "top", bold: true });
    const pad = 20, header = 34, gap = 18;
    items.forEach(([name, label], i) => {
      const r = Math.floor(i / cols), col = i % cols;
      const ix = Math.round(x + pad + col * (itemW + gap) + (itemW - 48) / 2);
      const iy = Math.round(y + header + pad + r * (itemH + gap));
      this.icon(`${id}_${i}`, name, [ix, iy], { parent: id, label });
    });
    return this.R[id];
  }
  /** Edge: just provide source→target + label; the router goes straight/through-gap automatically; corners by type+role.
   *  Recorded first — toXML() bundles edges with the SAME SOURCE and same direction into a fan-out BUNDLE
   *  (comb/trunk sharing a lane) so 1→N edges don't overlap/break.
   *  opts: { dir: LR|TB (auto by position if omitted), role: flow|fanout|tree, dash: true (sync/DR),
   *          flow: true (animated moving-dash flow — shows in SVG / draw.io app, not in PNG) }. */
  link(src, tgt, label = "", opts = {}) {
    if (!this.R[src]) throw new Error(`link: source does not exist yet "${src}"`);
    if (!this.R[tgt]) throw new Error(`link: target does not exist yet "${tgt}"`);
    this.edgeSpecs.push({ src, tgt, label, opts });
    return this;
  }

  /** Build all edges — deterministic ORTHOGONAL router with HARD obstacle avoidance.
   *  Ports are DE-COLLIDED first, then every edge is routed AT ITS FINAL PORT POSITION: try straight →
   *  facing-Z in the gap → L; if any of those still clip an icon, HOP over the top on a staggered lane
   *  that is raised until the whole path is clear. So a line never cuts through an icon, and parallel
   *  hops never overlap. No jump arcs. (Clear Waypoints in draw.io to re-flow after moving a node.) */
  _buildEdges() {
    if (this._edgesBuilt) return;
    this._edgesBuilt = true;
    const specs = this.edgeSpecs, R = (id) => this.R[id];
    const cards = [];
    for (const id in this.R) { const r = this.R[id]; if (r.ob) cards.push({ id, x: r.x, y: r.y, w: r.w, h: r.h }); }
    const M = 7;
    const segHit = (p, q, ex) => {
      for (const c of cards) {
        if (ex.has(c.id)) continue;
        const x0 = c.x - M, x1 = c.x + c.w + M, y0 = c.y - M, y1 = c.y + c.h + M;
        if (Math.abs(p.y - q.y) < 1) { if (p.y > y0 && p.y < y1 && Math.min(p.x, q.x) < x1 && Math.max(p.x, q.x) > x0) return true; }
        else if (Math.abs(p.x - q.x) < 1) { if (p.x > x0 && p.x < x1 && Math.min(p.y, q.y) < y1 && Math.max(p.y, q.y) > y0) return true; }
        else { if (Math.min(p.x, q.x) < x1 && Math.max(p.x, q.x) > x0 && Math.min(p.y, q.y) < y1 && Math.max(p.y, q.y) > y0) return true; } // diagonal (shouldn't happen) — be safe
      }
      return false;
    };
    const pathHit = (pp, ex) => { for (let i = 0; i < pp.length - 1; i++) if (segHit(pp[i], pp[i + 1], ex)) return true; return false; };
    // container frames — edges may CROSS them, but should not run PARALLEL right next to a border
    const containers = []; for (const id in this.R) { const r = this.R[id]; if (r.ob === false) containers.push(r); }
    // smallest container that strictly encloses a node (its account/zone box) — used to keep the elbow OUTSIDE it
    const enclosing = (n) => { let best = null; for (const c of containers) { if (c.x <= n.x + 1 && c.y <= n.y + 1 && c.x + c.w >= n.x + n.w - 1 && c.y + c.h >= n.y + n.h - 1 && c.w * c.h > n.w * n.h + 1) { if (!best || c.w * c.h < best.w * best.h) best = c; } } return best; };
    const BM = 16;
    const along = (p, q) => {
      if (Math.abs(p.x - q.x) < 1) { const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y); if (y1 - y0 < 28) return false;
        for (const c of containers) for (const bx of [c.x, c.x + c.w]) if (Math.abs(p.x - bx) < BM && Math.min(y1, c.y + c.h) - Math.max(y0, c.y) > 28) return true; }
      else { const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x); if (x1 - x0 < 28) return false;
        for (const c of containers) for (const by of [c.y, c.y + c.h]) if (Math.abs(p.y - by) < BM && Math.min(x1, c.x + c.w) - Math.max(x0, c.x) > 28) return true; }
      return false;
    };
    const pathAlong = (pp) => { for (let i = 0; i < pp.length - 1; i++) if (along(pp[i], pp[i + 1])) return true; return false; };
    const pt = (n, sd, f) => sd === "L" ? { x: n.x, y: Math.round(n.y + f * n.h) } : sd === "R" ? { x: n.x + n.w, y: Math.round(n.y + f * n.h) }
      : sd === "T" ? { x: Math.round(n.x + f * n.w), y: n.y } : { x: Math.round(n.x + f * n.w), y: n.y + n.h };
    const geom = (a, b, r, sf, tf) => {
      const sp = pt(a, r.es, sf), ep = pt(b, r.en, tf); let wp = [];
      if (r.kind === "Zx") wp = [{ x: r.lane, y: sp.y }, { x: r.lane, y: ep.y }];
      else if (r.kind === "Zy") wp = [{ x: sp.x, y: r.lane }, { x: ep.x, y: r.lane }];
      else if (r.kind === "Lhv") wp = [{ x: ep.x, y: sp.y }];
      else if (r.kind === "Lvh") wp = [{ x: sp.x, y: ep.y }];
      else if (r.kind === "poly") wp = r.pts;
      return { sp, ep, wp };
    };
    const clearW = (a, b, r, sf, tf, ex) => { const g = geom(a, b, r, sf, tf); return !pathHit([g.sp, ...g.wp, g.ep], ex); };
    const gapSweep = (lo, hi) => { const out = []; const mid = (lo + hi) / 2; out.push(Math.round(mid)); for (let k = 1; k <= 30; k++) { const u = mid + k * 10, d = mid - k * 10; if (d > lo + 2) out.push(Math.round(d)); if (u < hi - 2) out.push(Math.round(u)); } return out; };

    // A. facing sides + axis per edge
    const face = specs.map((e) => {
      if (e.opts.style) return null;
      const a = R(e.src), b = R(e.tgt);
      const fwdX = b.x + b.w / 2 >= a.x + a.w / 2, fwdY = b.y + b.h / 2 >= a.y + a.h / 2;
      const xOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const horiz = e.opts.dir ? e.opts.dir === "LR" : (yOv > 8 ? true : xOv > 8 ? false : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y));
      return horiz ? { es: fwdX ? "R" : "L", en: fwdX ? "L" : "R", horiz: true } : { es: fwdY ? "B" : "T", en: fwdY ? "T" : "B", horiz: false };
    });

    // de-collide helper (mutates frac): spread ports sharing one (node, side)
    const frac = specs.map(() => ({ s: 0.5, t: 0.5 }));
    const decollide = (idxs, sideOf) => {
      const grp = {};
      for (const i of idxs) for (const end of ["s", "t"]) { const sd = sideOf(i, end); if (!sd) continue; const node = end === "s" ? specs[i].src : specs[i].tgt; (grp[`${node}|${sd}`] ||= []).push({ i, end }); }
      const setF = (it, f) => { if (it.end === "s") frac[it.i].s = f; else frac[it.i].t = f; };
      for (const k in grp) {
        const arr = grp[k]; if (arr.length < 2) continue;
        const side = k.slice(k.lastIndexOf("|") + 1), v = side === "L" || side === "R";
        const node = R(k.slice(0, k.lastIndexOf("|"))), nc = v ? node.y + node.h / 2 : node.x + node.w / 2;
        const info = arr.map((it) => { const far = R(specs[it.i][it.end === "s" ? "tgt" : "src"]); return { it, fc: v ? far.y + far.h / 2 : far.x + far.w / 2 }; });
        const al = info.filter((x) => Math.abs(x.fc - nc) < 8);   // far node sits on this side's axis line → a straight shot
        if (al.length === 1 && arr.length <= 3) {                 // keep that straight wire CENTRED; push the others off-centre
          setF(al[0].it, 0.5);
          const rest = info.filter((x) => x !== al[0]);
          const lo = rest.filter((x) => x.fc <= nc).sort((A, B) => B.fc - A.fc), hi = rest.filter((x) => x.fc > nc).sort((A, B) => A.fc - B.fc);
          lo.forEach((x, j) => setF(x.it, 0.3 - j * 0.14));
          hi.forEach((x, j) => setF(x.it, 0.7 + j * 0.14));
        } else {
          info.sort((A, B) => A.fc - B.fc);
          info.forEach((x, j) => setF(x.it, (j + 1) / (arr.length + 1)));
        }
      }
    };
    const all = specs.map((_, i) => i).filter((i) => face[i]);
    decollide(all, (i, end) => (end === "s" ? face[i].es : face[i].en));

    // A* channel router (fallback): route through the gaps between cards → guaranteed clear of every icon
    const usedKey = (x1, y1, x2, y2) => (x1 < x2 || y1 < y2) ? `${x1},${y1}|${x2},${y2}` : `${x2},${y2}|${x1},${y1}`;
    const astar = (a, b, es, en, sf, tf, ex, used) => {
      const pp = (n, sd, f) => sd === "L" ? { x: n.x, y: Math.round(n.y + f * n.h), dx: -1, dy: 0 } : sd === "R" ? { x: n.x + n.w, y: Math.round(n.y + f * n.h), dx: 1, dy: 0 }
        : sd === "T" ? { x: Math.round(n.x + f * n.w), y: n.y, dx: 0, dy: -1 } : { x: Math.round(n.x + f * n.w), y: n.y + n.h, dx: 0, dy: 1 };
      const sp = pp(a, es, sf), ep = pp(b, en, tf), off = 16;
      // put the elbow OUTSIDE the icon's own container (straight entry across the border), not 16px in front of the icon
      const pushOff = (port, n) => {
        const c = enclosing(n), def = { x: port.x + port.dx * off, y: port.y + port.dy * off };
        if (!c) return def;
        const cand = port.dx < 0 ? { x: c.x - off, y: port.y } : port.dx > 0 ? { x: c.x + c.w + off, y: port.y }
          : port.dy < 0 ? { x: port.x, y: c.y - off } : { x: port.x, y: c.y + c.h + off };
        return segHit(port, cand, ex) ? def : cand;   // only if the straight run to the border clears other icons
      };
      const s0 = pushOff(sp, a), g0 = pushOff(ep, b);
      const xs = new Set([s0.x, g0.x, sp.x, ep.x]), ys = new Set([s0.y, g0.y, sp.y, ep.y]);
      for (const c of cards) { if (ex.has(c.id)) continue; xs.add(c.x - M); xs.add(c.x + c.w + M); ys.add(c.y - M); ys.add(c.y + c.h + M); }
      const X = [...xs].sort((p, q) => p - q), Y = [...ys].sort((p, q) => p - q);
      const xI = new Map(X.map((v, i) => [v, i])), yI = new Map(Y.map((v, i) => [v, i])), W = X.length;
      const idx = (i, j) => j * W + i, gi = xI.get(g0.x), gj = yI.get(g0.y);
      const start = idx(xI.get(s0.x), yI.get(s0.y)), goal = idx(gi, gj);
      const segOK = (x1, y1, x2, y2) => !segHit({ x: x1, y: y1 }, { x: x2, y: y2 }, ex);
      const heur = (n) => { const i = n % W, j = (n - i) / W; return Math.abs(X[i] - X[gi]) + Math.abs(Y[j] - Y[gj]); };
      const gsc = {}, came = {}, cdir = {}, open = new Map(); gsc[start] = 0; open.set(start, heur(start));
      let found = false, guard = 0;
      while (open.size && guard++ < 20000) {
        let cur = null, best = Infinity; for (const [k, v] of open) if (v < best) { best = v; cur = k; }
        open.delete(cur); if (cur === goal) { found = true; break; }
        const ci = cur % W, cj = (cur - ci) / W, cx = X[ci], cy = Y[cj];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Y.length) continue;
          const nx = X[ni], ny = Y[nj]; if (!segOK(cx, cy, nx, ny)) continue;
          const nid = idx(ni, nj), nd = di !== 0 ? "h" : "v";
          const cost = Math.abs(nx - cx) + Math.abs(ny - cy) + (cdir[cur] && cdir[cur] !== nd ? 30 : 0) + (used.has(usedKey(cx, cy, nx, ny)) ? 400 : 0) + (along({ x: cx, y: cy }, { x: nx, y: ny }) ? 220 : 0);
          const ng = gsc[cur] + cost;
          if (gsc[nid] === undefined || ng < gsc[nid]) { gsc[nid] = ng; came[nid] = cur; cdir[nid] = nd; open.set(nid, ng + heur(nid)); }
        }
      }
      if (!found) return null;
      let path = [], c = goal; while (c !== undefined) { const i = c % W, j = (c - i) / W; path.push({ x: X[i], y: Y[j] }); c = came[c]; } path.reverse();
      for (let k = 0; k < path.length - 1; k++) { used.add(usedKey(path[k].x, path[k].y, path[k + 1].x, path[k + 1].y)); usedSegs.push({ x1: path[k].x, y1: path[k].y, x2: path[k + 1].x, y2: path[k + 1].y }); }
      const simp = [path[0]];
      for (let k = 1; k < path.length - 1; k++) { const p = simp[simp.length - 1], q = path[k], r = path[k + 1]; if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) continue; simp.push(q); }
      simp.push(path[path.length - 1]);
      return { es, en, kind: "poly", pts: simp };
    };

    // B. route each edge AT ITS FINAL FRAC: straight → facing-Z in gap → L → A* through the gaps
    const used = new Set(), usedSegs = [];
    const reg = (g) => { const pp = [g.sp, ...g.wp, g.ep]; for (let k = 0; k < pp.length - 1; k++) { used.add(usedKey(Math.round(pp[k].x), Math.round(pp[k].y), Math.round(pp[k + 1].x), Math.round(pp[k + 1].y))); usedSegs.push({ x1: pp[k].x, y1: pp[k].y, x2: pp[k + 1].x, y2: pp[k + 1].y }); } };
    const ov1 = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
    const overlapsUsed = (pp) => {
      for (let i = 0; i < pp.length - 1; i++) { const a = pp[i], b = pp[i + 1];
        for (const s of usedSegs) {
          if (Math.abs(a.x - b.x) < 1 && Math.abs(s.x1 - s.x2) < 1 && Math.abs(a.x - s.x1) < 6) { if (ov1(Math.min(a.y, b.y), Math.max(a.y, b.y), Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)) > 14) return true; }
          else if (Math.abs(a.y - b.y) < 1 && Math.abs(s.y1 - s.y2) < 1 && Math.abs(a.y - s.y1) < 6) { if (ov1(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)) > 14) return true; }
        }
      }
      return false;
    };
    const routes = specs.map(() => null);
    const heuristic = (e, i, strict) => {
      const a = R(e.src), b = R(e.tgt), ex = new Set([e.src, e.tgt]), f = face[i], sf = frac[i].s, tf = frac[i].t;
      const tryR = (r) => { if (!clearW(a, b, r, sf, tf, ex)) return null; const g = geom(a, b, r, sf, tf), pp = [g.sp, ...g.wp, g.ep]; if (pathAlong(pp)) return null; if (strict && overlapsUsed(pp)) return null; return r; };
      let r = null;
      if (f.horiz) {
        if (Math.abs(a.y + sf * a.h - (b.y + tf * b.h)) < 2) r = tryR({ es: f.es, en: f.en, kind: "straight" });
        if (!r) { const lo = Math.min(a.x + a.w, b.x + b.w), hi = Math.max(a.x, b.x); for (const lx of gapSweep(lo, hi)) { r = tryR({ es: f.es, en: f.en, kind: "Zx", lane: lx }); if (r) break; } }
        if (!r) for (const cand of [{ es: f.es, en: b.y + b.h / 2 >= a.y + a.h / 2 ? "T" : "B", kind: "Lhv" }, { es: b.y + b.h / 2 >= a.y + a.h / 2 ? "B" : "T", en: f.en, kind: "Lvh" }]) { r = tryR(cand); if (r) break; }
      } else {
        if (Math.abs(a.x + sf * a.w - (b.x + tf * b.w)) < 2) r = tryR({ es: f.es, en: f.en, kind: "straight" });
        if (!r) { const lo = Math.min(a.y + a.h, b.y + b.h), hi = Math.max(a.y, b.y); for (const ly of gapSweep(lo, hi)) { r = tryR({ es: f.es, en: f.en, kind: "Zy", lane: ly }); if (r) break; } }
        if (!r) for (const cand of [{ es: f.es, en: b.x + b.w / 2 >= a.x + a.w / 2 ? "L" : "R", kind: "Lvh" }, { es: b.x + b.w / 2 >= a.x + a.w / 2 ? "R" : "L", en: f.en, kind: "Lhv" }]) { r = tryR(cand); if (r) break; }
      }
      return r;
    };
    // pass 1: heuristic (register the channels they occupy)
    const need = [];
    specs.forEach((e, i) => { if (e.opts.style) { routes[i] = { raw: true }; return; } const r = heuristic(e, i, true) || heuristic(e, i, false); if (r) { routes[i] = r; reg(geom(R(e.src), R(e.tgt), r, frac[i].s, frac[i].t)); } else need.push(i); });
    // pass 2: A* for the rest, trying facing sides then top/bottom/side fallbacks, avoiding used channels
    for (const i of need) {
      const e = specs[i], a = R(e.src), b = R(e.tgt), ex = new Set([e.src, e.tgt]), f = face[i];
      const fwdY = b.y + b.h / 2 >= a.y + a.h / 2, fwdX = b.x + b.w / 2 >= a.x + a.w / 2;
      const tries = f.horiz ? [[f.es, f.en], ["T", "T"], ["B", "B"], [fwdY ? "B" : "T", fwdX ? "L" : "R"]] : [[f.es, f.en], ["L", "L"], ["R", "R"], [fwdX ? "R" : "L", fwdY ? "T" : "B"]];
      let r = null;
      for (const [es, en] of tries) { r = astar(a, b, es, en, frac[i].s, frac[i].t, ex, used); if (r) break; }
      routes[i] = r || { es: f.es, en: f.en, kind: "Zx", lane: Math.round((a.x + a.w + b.x) / 2) };
    }

    // D. report residual crossings (for verification)
    this._cross = 0;
    specs.forEach((e, i) => { const r = routes[i]; if (r.raw) return; const a = R(e.src), b = R(e.tgt), ex = new Set([e.src, e.tgt]); if (!clearW(a, b, r, frac[i].s, frac[i].t, ex)) this._cross++; });

    specs.forEach((e, i) => this._emitEdge(e, routes[i], frac[i], geom));
  }

  _emitEdge({ src, tgt, label = "", opts = {} }, r, fr, geom) {
    const { dash = false, flow = false, rounded = false, stroke = THEME.edge.stroke, style = "" } = opts;
    let st = `edgeStyle=orthogonalEdgeStyle;html=1;rounded=${rounded ? 1 : 0};jettySize=auto;orthogonalLoop=1;fontSize=10;fontColor=${THEME.edge.fontColor};strokeColor=${stroke};strokeWidth=${THEME.edge.strokeWidth};`;
    if (dash) st += "dashed=1;";
    if (flow) st += "flowAnimation=1;";          // animated moving dashes in draw.io / SVG (not PNG)
    if (label) st += `labelBackgroundColor=${THEME.edge.labelBg};`;
    let wpXml = "";
    if (r && !r.raw) {
      const a = this.R[src], b = this.R[tgt], r3 = (v) => +(+v).toFixed(3);
      const g = geom(a, b, r, fr.s, fr.t);
      const port = (s, f) => s === "L" ? { x: 0, y: f } : s === "R" ? { x: 1, y: f } : s === "T" ? { x: f, y: 0 } : { x: f, y: 1 };
      const ps = port(r.es, fr.s), pe = port(r.en, fr.t);
      st += `exitX=${ps.x};exitY=${r3(ps.y)};exitDx=0;exitDy=0;entryX=${pe.x};entryY=${r3(pe.y)};entryDx=0;entryDy=0;`;
      wpXml = g.wp.length ? `<Array as="points">${g.wp.map((q) => `<mxPoint x="${Math.round(q.x)}" y="${Math.round(q.y)}"/>`).join("")}</Array>` : "";
    }
    if (style) st += style.endsWith(";") ? style : style + ";";
    this.cells.push(`<mxCell id="ed${++this.eid}" value="${esc(label)}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry">${wpXml}</mxGeometry></mxCell>`);
  }

  // reusable layout helpers
  centerInGapX(a, b, w) { return centerInGapX(a, b, w); }
  rect(id) { return this.R[id]; }

  /**
   * Node that "spans vertically" (LB/bus/hub) across multiple rows — the kit computes the rect, no numbers/coords at the call site.
   *   spec: { icon, label, w, pad?, fill?, stroke? }
   *   at:   { lane }  (centered in a pre-reserved lane) OR { between:[idA,idB] } (in the gap between 2 nodes)
   *         + { from, to } (height from the top edge of `from` to the bottom edge of `to`)
   */
  spanV(id, { icon, label = "", w, pad = 16, fill = "#FFFFFF", stroke = "#5A6B7B" }, { lane, between, from, to }) {
    const F = this.R[from], T = this.R[to] || F;
    const x = lane ? Math.round(this.R[lane].x + (this.R[lane].w - w) / 2)
                   : centerInGapX(this.R[between[0]], this.R[between[1]], w);
    const y = Math.round(F.y - pad), h = Math.round(T.y + T.h - F.y + pad * 2);
    this.box(id, [x, y], [w, h], label, { fill, stroke, va: "bottom", fs: 10 });
    if (icon) this.icon(`${id}_ic`, icon, [Math.round(x + (w - 48) / 2), y + 12]);
    return this.R[id];
  }

  toXML() {
    this._buildEdges();
    const cellsXml = this.cells.join("");
    // emit a separate (locked) layer for the dashed boundary frames, so editing the content layer is easy.
    const boundsLayer = cellsXml.includes('parent="boundaries"') ? `<mxCell id="boundaries" value="Stack boundaries (locked)" parent="0" style="locked=1;"/>` : "";
    return `<mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.page[0]}" pageHeight="${this.page[1]}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boundsLayer}${cellsXml}</root></mxGraphModel>`;
  }
  validate(opts = { strict: true }) { return validateDiagram(this.c, this.toXML(), opts); }
  mxfile(name = "Diagram") { return `<mxfile host="app.diagrams.net"><diagram name="${esc(name)}" id="d">${this.toXML()}</diagram></mxfile>`; }
}
