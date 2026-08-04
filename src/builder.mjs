// drawio-ai-kit — Diagram builder. Bundles all boilerplate: icon/box/group/panel/link
// + auto-routing by type + auto-size panel + validate + XML export. Goal: build
// a diagram with just a few lines of declaration (easy to use, easy to extend).
import { writeFileSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, styleForIcon, styleForGroup, validateDiagram } from "./core.mjs";
import { centerInGapX, panelSize } from "./layout.mjs";
import { typePreset } from "./types.mjs";
import { THEME } from "./theme.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Kit repo root (parent of src/), real path so the symlinked-skill install resolves to the true repo.
const KIT_ROOT = (() => { const d = resolve(dirname(fileURLToPath(import.meta.url)), ".."); try { return realpathSync(d); } catch { return d; } })();
// True iff an output path lands inside the kit repo → the hard rule forbids writing there.
const insideKit = (dir, filename) => {
  let base; try { base = realpathSync(dir); } catch { base = resolve(dir); }   // dir may not exist yet → resolve without symlinks
  const rel = relative(KIT_ROOT, resolve(base, filename));                      // resolve filename too, so "../" escapes can't sneak back in
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

export class Diagram {
  /** type: pipeline|hierarchy|network|hubspoke|hybrid|mesh|sequence
   *  contract: "scaffold" (default — drag-resilient, no waypoints) | "bake" (frozen waypoints). */
  constructor(type = "pipeline", { title = "", page = [2000, 1200], contract = "scaffold", iconSize = 48 } = {}) {
    if (contract !== "scaffold" && contract !== "bake")
      throw new Error(`Invalid contract "${contract}" — use "scaffold" or "bake".`);
    this.c = loadCatalog();
    this.type = type;
    this.contract = contract;
    this.iconSize = iconSize;   // global icon glyph size; per-icon {size} overrides (issue #58)
    this.preset = typePreset(type);
    this.page = page;
    this.cells = [];
    this.R = {};
    this.phantoms = new Set();   // ids of phantom frames (layout-only, absent from this.R) — lets link() teach the phantom-vs-typo distinction
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
  /** AWS icon by catalog name (verbatim style). [x,y] = top-left corner; size defaults to 48. */
  icon(id, name, [x, y], { parent = "1", label = "", size = 48 } = {}) {
    const s = styleForIcon(this.c, name);
    if (!s) throw new Error(`Icon not found in catalog: "${name}" — use search_icon to look up the correct name.`);
    const r = this._put(id, parent, x, y, size, size, s.style, label); r.ob = true; return r;   // ob = leaf obstacle (router avoids)
  }
  /** Small catalog icon at a container's top-left corner (for Azure/GCP frames — mimics the corner
   *  icon baked into AWS group stencils). Decorative but still an obstacle (ob:true) — an edge
   *  slicing through the badge looks broken, and the geometry audit rightly flags it. */
  cornerIcon(id, name, [x, y], size = 22, parent = "1") {
    const s = styleForIcon(this.c, name);
    if (!s) throw new Error(`cornerIcon not found in catalog: "${name}" — use search_icon.`);
    const r = this._put(id, parent, x, y, size, size, s.style, ""); r.ob = true; return r;
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
    // THEME always wins for group_subnet — never let a caller hardcode subnet fill.
    // (AI-generated code often copies stale fills; ignoring them keeps colors consistent.)
    if (gname === "group_subnet") {
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
    for (const [id, role] of [[src, "source"], [tgt, "target"]]) {
      if (!this.R[id]) {
        if (this.phantoms.has(id)) throw new Error(`link: cannot link to phantom frame "${id}" — target a visible frame or leaf instead.`);
        throw new Error(`link: ${role} does not exist yet "${id}"`);
      }
    }
    this.edgeSpecs.push({ src, tgt, label, opts });
    return this;
  }

  /** Build all edges — deterministic ORTHOGONAL router with HARD obstacle avoidance.
   *  Same three-stage shape as libavoid: (1) orthogonal visibility graph, (2) A* shortest path,
   *  (3) NUDGE. Ports are DE-COLLIDED first, then every edge is routed AT ITS FINAL PORT POSITION:
   *  try straight → facing-Z in the gap → L; if any still clip an icon, A* through the gaps between
   *  cards. Finally a global NUDGE pass spreads parallel overlapping segments onto distinct tracks,
   *  so the result no longer depends on link() order. A line never cuts through an icon, and parallel
   *  runs never overlap. No jump arcs. (Clear Waypoints in draw.io to re-flow after moving a node.) */
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
    const enclosing = (n, other = null) => {
      let best = null;
      for (const c of containers) {
        if (c.x <= n.x + 1 && c.y <= n.y + 1 && c.x + c.w >= n.x + n.w - 1 && c.y + c.h >= n.y + n.h - 1 && c.w * c.h > n.w * n.h + 1) {
          if (other) {
            const encOther = c.x <= other.x + 1 && c.y <= other.y + 1 && c.x + c.w >= other.x + other.w - 1 && c.y + c.h >= other.y + other.h - 1;
            if (encOther) continue;
            if (!best || c.w * c.h > best.w * best.h) best = c;
          } else {
            if (!best || c.w * c.h < best.w * best.h) best = c;
          }
        }
      }
      return best;
    };
    const BM = 24;
    const insideAny = (px, py) => containers.some(c => px > c.x + 1 && px < c.x + c.w - 1 && py > c.y + 1 && py < c.y + c.h - 1);
    const along = (p, q, a = null, b = null) => {
      if (Math.abs(p.x - q.x) < 1) { const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y); if (y1 - y0 < 28) return false;
        // interior routing — skip border-hugging penalty, only cross-container check applies
        if (!insideAny(p.x, (y0 + y1) / 2)) {
          for (const c of containers)
            for (const bx of [c.x, c.x + c.w]) if (Math.abs(p.x - bx) < BM && Math.min(y1, c.y + c.h) - Math.max(y0, c.y) > 28) return true;
        }
        if (a && b) for (const c of containers) {
          if (p.x > c.x + 8 && p.x < c.x + c.w - 8 && Math.min(y1, c.y + c.h) - Math.max(y0, c.y) > 28) {
            const encA = c.x <= a.x + 1 && c.y <= a.y + 1 && c.x + c.w >= a.x + a.w - 1 && c.y + c.h >= a.y + a.h - 1;
            const encB = c.x <= b.x + 1 && c.y <= b.y + 1 && c.x + c.w >= b.x + b.w - 1 && c.y + c.h >= b.y + b.h - 1;
            if (encA !== encB) return true;
          }
        }
      }
      else { const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x); if (x1 - x0 < 28) return false;
        if (!insideAny((x0 + x1) / 2, p.y)) {
          for (const c of containers)
            for (const by of [c.y, c.y + c.h]) if (Math.abs(p.y - by) < BM && Math.min(x1, c.x + c.w) - Math.max(x0, c.x) > 28) return true;
        }
        if (a && b) for (const c of containers) {
          if (p.y > c.y + 8 && p.y < c.y + c.h - 8 && Math.min(x1, c.x + c.w) - Math.max(x0, c.x) > 28) {
            const encA = c.x <= a.x + 1 && c.y <= a.y + 1 && c.x + c.w >= a.x + a.w - 1 && c.y + c.h >= a.y + a.h - 1;
            const encB = c.x <= b.x + 1 && c.y <= b.y + 1 && c.x + c.w >= b.x + b.w - 1 && c.y + c.h >= b.y + b.h - 1;
            if (encA !== encB) return true;
          }
        }
      }
      return false;
    };
    const pathAlong = (pp, a = null, b = null) => { for (let i = 0; i < pp.length - 1; i++) if (along(pp[i], pp[i + 1], a, b)) return true; return false; };
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
      if (e.opts.route) return { es: e.opts.route.es, en: e.opts.route.en, horiz: e.opts.route.es === "L" || e.opts.route.es === "R" };
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
      const sp = pp(a, es, sf), ep = pp(b, en, tf), off = 24;
      // put the elbow OUTSIDE the icon's own container (straight entry across the border), not 16px in front of the icon
      const pushOff = (port, n, other) => {
        const c = enclosing(n, other), def = { x: port.x + port.dx * off, y: port.y + port.dy * off };
        if (!c) return def;
        const cand = port.dx < 0 ? { x: c.x - off, y: port.y } : port.dx > 0 ? { x: c.x + c.w + off, y: port.y }
          : port.dy < 0 ? { x: port.x, y: c.y - off } : { x: port.x, y: c.y + c.h + off };
        return segHit(port, cand, ex) ? def : cand;   // only if the straight run to the border clears other icons
      };
      const s0 = pushOff(sp, a, b), g0 = pushOff(ep, b, a);
      const xs = new Set([s0.x, g0.x, sp.x, ep.x]), ys = new Set([s0.y, g0.y, sp.y, ep.y]);
      for (const c of cards) { if (ex.has(c.id)) continue; xs.add(c.x - M); xs.add(c.x + c.w + M); ys.add(c.y - M); ys.add(c.y + c.h + M); }
      for (const c of containers) { xs.add(c.x - M); xs.add(c.x + c.w + M); ys.add(c.y - M); ys.add(c.y + c.h + M); }
      let X = [...xs].sort((p, q) => p - q), Y = [...ys].sort((p, q) => p - q);
      const newX = new Set(X), newY = new Set(Y);
      const step = 20;
      const margin = 24; // Ensure at least 24px clearance from container borders
      for (let k = 0; k < X.length - 1; k++) {
        const gap = X[k+1] - X[k];
        if (gap >= 2 * margin + 8) {
          const available = gap - 2 * margin;
          const numLanes = Math.floor(available / step) + 1;
          if (numLanes > 0) {
            const occupied = (numLanes - 1) * step;
            const leftMargin = Math.round((gap - occupied) / 2);
            for (let i = 0; i < numLanes; i++) newX.add(X[k] + leftMargin + i * step);
          }
        } else if (gap > 32) {
          newX.add(Math.round((X[k] + X[k+1]) / 2));
        }
      }
      for (let k = 0; k < Y.length - 1; k++) {
        const gap = Y[k+1] - Y[k];
        if (gap >= 2 * margin + 8) {
          const available = gap - 2 * margin;
          const numLanes = Math.floor(available / step) + 1;
          if (numLanes > 0) {
            const occupied = (numLanes - 1) * step;
            const leftMargin = Math.round((gap - occupied) / 2);
            for (let i = 0; i < numLanes; i++) newY.add(Y[k] + leftMargin + i * step);
          }
        } else if (gap > 32) {
          newY.add(Math.round((Y[k] + Y[k+1]) / 2));
        }
      }
      X = [...newX].sort((p, q) => p - q); Y = [...newY].sort((p, q) => p - q);

      const xI = new Map(X.map((v, i) => [v, i])), yI = new Map(Y.map((v, i) => [v, i])), W = X.length;
      const idx = (i, j) => j * W + i, gi = xI.get(g0.x), gj = yI.get(g0.y);
      const start = idx(xI.get(s0.x), yI.get(s0.y)), goal = idx(gi, gj);
      const segOK = (x1, y1, x2, y2) => !segHit({ x: x1, y: y1 }, { x: x2, y: y2 }, ex);
      const checkCrossing = (cx, cy, nx, ny) => {
        const isHoriz = Math.abs(cy - ny) < 1;
        const x0 = Math.min(cx, nx), x1 = Math.max(cx, nx);
        const y0 = Math.min(cy, ny), y1 = Math.max(cy, ny);
        let crossings = 0;
        for (const s of usedSegs) {
          const sHoriz = Math.abs(s.y1 - s.y2) < 1;
          if (isHoriz && !sHoriz) {
            const sx = s.x1, syMin = Math.min(s.y1, s.y2), syMax = Math.max(s.y1, s.y2);
            if (sx > x0 && sx < x1 && cy > syMin && cy < syMax) crossings++;
          } else if (!isHoriz && sHoriz) {
            const sy = s.y1, sxMin = Math.min(s.x1, s.x2), sxMax = Math.max(s.x1, s.x2);
            if (sy > y0 && sy < y1 && cx > sxMin && cx < sxMax) crossings++;
          }
        }
        return crossings;
      };
      const heur = (n) => { const i = n % W, j = (n - i) / W; return Math.abs(X[i] - X[gi]) + Math.abs(Y[j] - Y[gj]); };
      // binary min-heap open set (lazy deletion) — the old linear-scan Map was O(V²) and burned
      // the guard budget on large pages, silently dropping edges to the dirty fallback.
      const gsc = {}, came = {}, cdir = {}, heap = [[heur(start), start]]; gsc[start] = 0;
      const hpush = (f, n) => { heap.push([f, n]); for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
      const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; for (let i = 0;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
      let found = false, guard = 0;
      while (heap.length && guard++ < 60000) {
        const [fs, cur] = hpop();
        if (fs > gsc[cur] + heur(cur) + 1e-6) continue;   // stale heap entry — a better g arrived later
        if (cur === goal) { found = true; break; }
        const ci = cur % W, cj = (cur - ci) / W, cx = X[ci], cy = Y[cj];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Y.length) continue;
          const nx = X[ni], ny = Y[nj]; if (!segOK(cx, cy, nx, ny)) continue;
          const nid = idx(ni, nj), nd = di !== 0 ? "h" : "v";
          const cost = Math.abs(nx - cx) + Math.abs(ny - cy) + (cdir[cur] && cdir[cur] !== nd ? 80 : 0) + (used.has(usedKey(cx, cy, nx, ny)) ? 400 : 0) + (along({ x: cx, y: cy }, { x: nx, y: ny }, a, b) ? 220 : 0) + checkCrossing(cx, cy, nx, ny) * 250;
          const ng = gsc[cur] + cost;
          if (gsc[nid] === undefined || ng < gsc[nid]) { gsc[nid] = ng; came[nid] = cur; cdir[nid] = nd; hpush(ng + heur(nid), nid); }
        }
      }
      if (!found) return null;
      let path = [], c = goal; while (c !== undefined) { const i = c % W, j = (c - i) / W; path.push({ x: X[i], y: Y[j] }); c = came[c]; } path.reverse();
      const simp = [path[0]];
      for (let k = 1; k < path.length - 1; k++) { const p = simp[simp.length - 1], q = path[k], r = path[k + 1]; if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) continue; simp.push(q); }
      simp.push(path[path.length - 1]);
      // NO side effects here: the caller compares candidate paths by cost and registers only the
      // winner's channels — registering every try would poison `used` for the losing candidates.
      return { es, en, kind: "poly", pts: simp, cost: gsc[goal] };
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
      const tryR = (r) => { if (!clearW(a, b, r, sf, tf, ex)) return null; const g = geom(a, b, r, sf, tf), pp = [g.sp, ...g.wp, g.ep]; if (pathAlong(pp, a, b)) return null; if (strict && overlapsUsed(pp)) return null; return r; };
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
    specs.forEach((e, i) => {
      if (e.opts.style) { routes[i] = { raw: true }; return; }
      if (e.opts.route) { routes[i] = e.opts.route; reg(geom(R(e.src), R(e.tgt), routes[i], frac[i].s, frac[i].t)); return; }
      const r = heuristic(e, i, true) || heuristic(e, i, false);
      if (r) { routes[i] = r; reg(geom(R(e.src), R(e.tgt), r, frac[i].s, frac[i].t)); } else need.push(i);
    });
    // pass 2: A* for the rest — try EVERY side combo and keep the CHEAPEST path. First-found was
    // the root cause of page-wide detours: a bad approach side "won" just by being tried first.
    // Ports are re-de-collided per candidate side (the global de-collide pass only saw the facing
    // sides, so a switched side could stack several arrowheads on one spot).
    const portUsed = {};
    const takePort = (node, side, fv) => (portUsed[`${node}|${side}`] ||= []).push(fv);
    specs.forEach((e, i) => { const r = routes[i]; if (!r || r.raw) return; takePort(e.src, r.es, frac[i].s); takePort(e.tgt, r.en, frac[i].t); });
    const freePort = (node, side, want) => {
      const taken = portUsed[`${node}|${side}`] || [];
      for (const fv of [want, 0.5, 0.3, 0.7, 0.2, 0.8]) if (taken.every((t) => Math.abs(t - fv) >= 0.12)) return fv;
      return want;
    };
    for (const i of need) {
      const e = specs[i], a = R(e.src), b = R(e.tgt), ex = new Set([e.src, e.tgt]), f = face[i];
      const fwdY = b.y + b.h / 2 >= a.y + a.h / 2, fwdX = b.x + b.w / 2 >= a.x + a.w / 2;
      const tries = f.horiz ? [[f.es, f.en], ["T", "T"], ["B", "B"], [fwdY ? "B" : "T", fwdX ? "L" : "R"]] : [[f.es, f.en], ["L", "L"], ["R", "R"], [fwdX ? "R" : "L", fwdY ? "T" : "B"]];
      let best = null;
      for (const [es, en] of tries) {
        const sf = freePort(e.src, es, frac[i].s), tf = freePort(e.tgt, en, frac[i].t);
        const r = astar(a, b, es, en, sf, tf, ex, used);
        if (r && (!best || r.cost < best.r.cost)) best = { r, sf, tf };
      }
      if (best) {
        frac[i].s = best.sf; frac[i].t = best.tf;
        routes[i] = { es: best.r.es, en: best.r.en, kind: "poly", pts: best.r.pts };
      } else {
        // last resort: sweep for a lane that still clears every icon before accepting a dirty
        // route — the old unconditional Zx could cut straight through nodes (and kinked at T/B ports).
        const lo = f.horiz ? Math.min(a.x, b.x) - 160 : Math.min(a.y, b.y) - 160;
        const hi = f.horiz ? Math.max(a.x + a.w, b.x + b.w) + 160 : Math.max(a.y + a.h, b.y + b.h) + 160;
        let r = null;
        for (const lane of gapSweep(lo, hi)) {
          const cand = { es: f.es, en: f.en, kind: f.horiz ? "Zx" : "Zy", lane };
          if (clearW(a, b, cand, frac[i].s, frac[i].t, ex)) { r = cand; break; }
        }
        routes[i] = r || { es: f.es, en: f.en, kind: f.horiz ? "Zx" : "Zy", lane: Math.round(f.horiz ? (a.x + a.w + b.x) / 2 : (a.y + a.h + b.y) / 2) };
      }
      reg(geom(a, b, routes[i], frac[i].s, frac[i].t));   // register the winner so later edges avoid its channels
      takePort(e.src, routes[i].es, frac[i].s); takePort(e.tgt, routes[i].en, frac[i].t);
    }

    // C. NUDGE (libavoid stage 3): separate parallel, overlapping INTERIOR segments onto distinct
    //    tracks. Global + deterministic, so routing no longer depends on link() order. Terminal
    //    segments (touching a port) stay pinned; any nudge that would clip an icon or hug a border is
    //    reverted — so this never makes routing worse, only tidier.
    const SEP = 16;
    // fresh mutable absolute point-paths; only auto-routed edges participate (skip raw / user-pinned)
    const paths = routes.map((r, i) =>
      (!r || r.raw || specs[i].opts.route || specs[i].opts.style) ? null
        : ((g) => [g.sp, ...g.wp.map((p) => ({ x: p.x, y: p.y })), g.ep])(geom(R(specs[i].src), R(specs[i].tgt), r, frac[i].s, frac[i].t)));
    // Iterate (max 3 passes): a nudge can push a segment to within SEP of a bundle it was NOT
    // grouped with — a single pass only counted those new conflicts, it never resolved them.
    const conflict = (s, t) => s.o === t.o && Math.abs(s.pos - t.pos) < SEP && Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 8;
    for (let pass = 0; pass < 3; pass++) {
      const nseg = [];   // interior (nudgeable) segments, holding refs to their shared corner points
      paths.forEach((P, i) => { if (!P) return;
        for (let k = 1; k < P.length - 2; k++) { const p = P[k], q = P[k + 1];   // k=0 / k=len-2 touch ports → fixed
          if (Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) >= 1) nseg.push({ i, o: "v", a: P[k], b: P[k + 1], pos: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y), tie: P[k - 1].x + P[k + 2].x });
          else if (Math.abs(p.y - q.y) < 1 && Math.abs(p.x - q.x) >= 1) nseg.push({ i, o: "h", a: P[k], b: P[k + 1], pos: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x), tie: P[k - 1].y + P[k + 2].y });
        }
      });
      // group conflicting segments (same axis, within SEP, overlapping extent) into bundles (connected comps).
      // ponytail: O(n²) component labeling — fine for diagram edge counts; switch to union-find at thousands.
      const comp = nseg.map(() => -1); let nc = 0;
      for (let x = 0; x < nseg.length; x++) { if (comp[x] === -1) comp[x] = nc++;
        for (let y = x + 1; y < nseg.length; y++) if (conflict(nseg[x], nseg[y])) {
          if (comp[y] === -1) comp[y] = comp[x];
          else if (comp[y] !== comp[x]) { const from = comp[y], to = comp[x]; for (let z = 0; z < nseg.length; z++) if (comp[z] === from) comp[z] = to; }
        }
      }
      const bundles = {}; nseg.forEach((s, idx) => (bundles[comp[idx]] ||= []).push(s));
      let moved = 0;
      for (const key in bundles) {
        const g = bundles[key]; if (g.length < 2) continue;
        g.sort((A, B) => A.pos - B.pos || A.tie - B.tie);                 // order by track then topology → no new crossings
        const center = g.reduce((s, x) => s + x.pos, 0) / g.length;
        g.forEach((s, j) => {
          const target = Math.round(center + (j - (g.length - 1) / 2) * SEP);
          if (target === s.pos) return;
          const old = s.pos, P = paths[s.i], a = R(specs[s.i].src), b = R(specs[s.i].tgt), ex = new Set([specs[s.i].src, specs[s.i].tgt]);
          const alongBefore = pathAlong(P, a, b);   // container entry inherent to this path is NOT the nudge's fault
          if (s.o === "v") { s.a.x = target; s.b.x = target; } else { s.a.y = target; s.b.y = target; }
          // revert only if the move makes it WORSE: a new icon hit, or border-hugging it didn't have before
          if (pathHit(P, ex) || (!alongBefore && pathAlong(P, a, b))) { if (s.o === "v") { s.a.x = old; s.b.x = old; } else { s.a.y = old; s.b.y = old; } }
          else { s.pos = target; moved++; }
        });
      }
      if (!moved) break;
    }
    // re-emit nudged paths as explicit polylines (drop points the move made collinear/duplicate)
    paths.forEach((P, i) => { if (!P) return;
      const out = [P[0]];
      for (let k = 1; k < P.length - 1; k++) { const p = out[out.length - 1], q = P[k], n = P[k + 1];
        if ((Math.abs(p.x - q.x) < 1 && Math.abs(q.x - n.x) < 1) || (Math.abs(p.y - q.y) < 1 && Math.abs(q.y - n.y) < 1)) continue;   // collinear
        if (Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1) continue;                                                            // duplicate
        out.push(q);
      }
      out.push(P[P.length - 1]);
      routes[i] = { es: routes[i].es, en: routes[i].en, kind: "poly", pts: out.slice(1, -1) };
    });

    // Mark routes whose straight pin→pin line would clip an icon: scaffold must freeze their
    // waypoints too — with no <mxPoint>s, draw.io's re-route (and the geometry audit) can put the
    // path through the very node the router bent around.
    specs.forEach((e, i) => { const r = routes[i]; if (!r || r.raw) return;
      const g = geom(R(e.src), R(e.tgt), r, frac[i].s, frac[i].t);
      if (g.wp.length && segHit(g.sp, g.ep, new Set([e.src, e.tgt]))) r.freeze = true;
    });

    // D. report residual crossings + parallel overlaps (for verification)
    this._cross = 0;
    specs.forEach((e, i) => { const r = routes[i]; if (r.raw) return; const a = R(e.src), b = R(e.tgt), ex = new Set([e.src, e.tgt]); if (!clearW(a, b, r, frac[i].s, frac[i].t, ex)) this._cross++; });
    const finSeg = [];
    paths.forEach((P) => { if (!P) return;
      for (let k = 1; k < P.length - 2; k++) { const p = P[k], q = P[k + 1];
        if (Math.abs(p.x - q.x) < 1) finSeg.push({ o: "v", pos: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
        else if (Math.abs(p.y - q.y) < 1) finSeg.push({ o: "h", pos: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
      }
    });
    this._overlaps = 0;
    for (let x = 0; x < finSeg.length; x++) for (let y = x + 1; y < finSeg.length; y++) { const a = finSeg[x], b = finSeg[y]; if (a.o === b.o && Math.abs(a.pos - b.pos) < 6 && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 14) this._overlaps++; }

    specs.forEach((e, i) => this._emitEdge(e, routes[i], frac[i], geom));
  }

  _emitEdge({ src, tgt, label = "", opts = {} }, r, fr, geom) {
    const { dash = false, flow = false, rounded = false, stroke = THEME.edge.stroke, style = "", step = null } = opts;
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
      // Contract fork: Scaffold omits waypoints (draw.io re-routes from pins on every edit);
      // Bake freezes the router's waypoints as absolute <mxPoint>s. Pins are emitted in BOTH.
      // Exceptions that freeze in scaffold too: (a) LABELED bent edges — the label sits at the path
      // midpoint, and only an explicit corridor waypoint keeps it centered on a straight segment;
      // (b) routes flagged r.freeze — a straight pin→pin re-route would clip a node the router
      // deliberately bent around. (The declarative API has no other way to satisfy the audits.)
      const freeze = this.contract === "bake" || label || r.freeze;
      wpXml = (!freeze || !g.wp.length) ? "" : `<Array as="points">${g.wp.map((q) => `<mxPoint x="${Math.round(q.x)}" y="${Math.round(q.y)}"/>`).join("")}</Array>`;
    }
    if (style) st += style.endsWith(";") ? style : style + ";";
    const eid = `ed${++this.eid}`;
    this.cells.push(`<mxCell id="${eid}" value="${esc(label)}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry">${wpXml}</mxGeometry></mxCell>`);
    // Numbered step badge: a filled circle riding near the edge's source end (the AWS
    // reference-diagram convention for a request walkthrough). Parented to the edge, non-connectable,
    // so it moves with the line and the router/validator treat it as a label, not a node.
    if (step != null) {
      const bs = `text;html=1;shape=ellipse;perimeter=ellipsePerimeter;fillColor=${THEME.edge.stroke};strokeColor=none;fontColor=#FFFFFF;fontStyle=1;fontSize=9;verticalAlign=middle;align=center;`;
      this.cells.push(`<mxCell id="${eid}_n" value="${esc(String(step))}" style="${bs}" vertex="1" connectable="0" parent="${eid}"><mxGeometry x="-0.7" relative="1" width="16" height="16" as="geometry"><mxPoint x="-8" y="-8" as="offset"/></mxGeometry></mxCell>`);
    }
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
  // dir: pass the user's workspace explicitly. Default keeps Gemini CLI's env var,
  // then cwd — but any agent that knows its workspace should pass dir to honor the
  // hard rule (write to user's cwd, never the kit repo).
  save(filename, dir = process.env.GEMINI_CLI_IDE_WORKSPACE_PATH || process.cwd()) {
    if (insideKit(dir, filename))   // refuse to pollute the read-only kit repo (see SKILL.md "Where to write")
      throw new Error(`Refusing to save into the kit repo: "${join(dir, filename)}". Pass the user's workspace explicitly, e.g. d.save("${filename}", "/path/to/project").`);
    const fullPath = join(dir, filename);
    writeFileSync(fullPath, this.mxfile(filename));
    process.stderr.write(`Saved diagram to: ${fullPath}\n`); // stdout is MCP's JSON-RPC channel
    return fullPath;
  }
}
