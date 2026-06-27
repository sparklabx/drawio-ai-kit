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
    return this._put(id, parent, x, y, 48, 48, s.style, label);
  }
  // Default SQUARE CORNERS — AWS diagrams rarely use rounded frames. (round:true if needed.)
  box(id, [x, y], [w, h], label = "", { parent = "1", fill = "#FFFFFF", stroke = "#5A6B7B", va = "middle", bold = false, fs = 11, round = false } = {}) {
    return this._put(id, parent, x, y, w, h, `rounded=${round ? 1 : 0};whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontColor=#1A1A1A;fontSize=${fs};fontStyle=${bold ? 1 : 0};verticalAlign=${va};`, label);
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
    // pale nested-container fills (soft layered depth instead of flat white)
    if (!fill && (gname === "group_aws_cloud" || gname === "group_aws_cloud_alt")) fill = THEME.cloudFill;
    if (!fill && gname === "group_region") fill = THEME.regionFill;
    if (!fill && gname === "group_vpc") fill = THEME.vpcFill;
    if (!fill && gname === "group_account") fill = THEME.accountFill;
    if (fill) style += `fillColor=${fill};`;
    if (stroke) style += `strokeColor=${stroke};`;
    return this._put(id, parent, x, y, w, h, style, label);
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

  /** Build all edges — a deterministic ORTHOGONAL router (we compute BOTH ports and waypoints; draw.io
   *  just draws them). Steps: (1) axis = shortest run; (2) bundle fan-out/fan-in onto one shared trunk
   *  lane (clean comb); (3) face each port at the other node and DE-COLLIDE per (node, side): one wire =
   *  centred, several = spread by far-node order so nothing stacks; (4) run the perpendicular leg through
   *  the GAP between groups, stepping AROUND any node that blocks the straight path; (5) jumpStyle=arc hops
   *  crossings. Waypoints are absolute (for a delivered diagram); after dragging a node in draw.io,
   *  right-click the edge → Clear Waypoints to re-flow. opts.style (verbatim) bypasses the router.
   *  opts: { dash, flow, stroke, label, rounded, dir:"LR"|"TB", laneX, laneY, style }. */
  _buildEdges() {
    if (this._edgesBuilt) return;
    this._edgesBuilt = true;
    const specs = this.edgeSpecs, R = (id) => this.R[id], TOL = 8;

    const dirOf = (e) => {
      if (e.opts.dir) return e.opts.dir;
      const a = R(e.src), b = R(e.tgt);
      const xOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (yOv > TOL && xOv <= TOL) return "LR";
      if (xOv > TOL && yOv <= TOL) return "TB";
      const dx = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)), dy = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2));
      return dy > dx ? "TB" : "LR";
    };

    // fan-out / fan-in bundles → one shared lane (the comb trunk)
    const route = specs.map(() => null);
    const laneFor = (axis, anchor, others) => {
      if (axis === "LR") {
        const left = others.every((o) => o.x + o.w <= anchor.x + anchor.w / 2);
        return left ? Math.round((Math.max(...others.map((o) => o.x + o.w)) + anchor.x) / 2)
                    : Math.round((anchor.x + anchor.w + Math.min(...others.map((o) => o.x))) / 2);
      }
      const up = others.every((o) => o.y + o.h <= anchor.y + anchor.h / 2);
      return up ? Math.round((Math.max(...others.map((o) => o.y + o.h)) + anchor.y) / 2)
                : Math.round((anchor.y + anchor.h + Math.min(...others.map((o) => o.y))) / 2);
    };
    const outG = {};
    specs.forEach((e, i) => ((outG[`${dirOf(e)}|${e.src}`] ||= []).push(i)));
    for (const k in outG) {
      const ix = outG[k]; if (ix.length < 2) continue;
      const axis = k.slice(0, 2), s = R(specs[ix[0]].src);
      const lane = laneFor(axis, s, ix.map((i) => R(specs[i].tgt)));
      ix.forEach((i) => (route[i] = { kind: "fanout", axis, lane, bundle: k }));
    }
    const inG = {};
    specs.forEach((e, i) => ((inG[`${dirOf(e)}|${e.tgt}`] ||= []).push(i)));
    for (const k in inG) {
      const ix = inG[k].filter((i) => !route[i]); if (ix.length < 2) continue;
      const axis = k.slice(0, 2), t = R(specs[ix[0]].tgt);
      const lane = laneFor(axis, t, ix.map((i) => R(specs[i].src)));
      ix.forEach((i) => (route[i] = { kind: "fanin", axis, lane }));
    }

    // per-edge sides (facing the far node) + obstacle-around for plain edges
    const desc = specs.map((e, i) => {
      const a = R(e.src), b = R(e.tgt), ro = route[i], axis = ro ? ro.axis : dirOf(e);
      const raw = !!e.opts.style;
      let exitSide, entrySide, lane = ro ? ro.lane : null, around = false, ax = axis;
      if (axis === "LR") { const fwd = b.x + b.w / 2 >= a.x + a.w / 2; exitSide = fwd ? "R" : "L"; entrySide = fwd ? "L" : "R"; }
      else { const dn = b.y + b.h / 2 >= a.y + a.h / 2; exitSide = dn ? "B" : "T"; entrySide = dn ? "T" : "B"; }
      if (!ro && !raw) {
        const lx = this._aroundLaneX(a, b), ly = lx == null ? this._aroundLaneY(a, b) : null;
        if (lx != null) { exitSide = entrySide = "R"; lane = lx; around = true; ax = "LR"; }
        else if (ly != null) { exitSide = entrySide = "T"; lane = ly; around = true; ax = "TB"; }
      }
      if (e.opts.laneX != null) lane = e.opts.laneX;
      if (e.opts.laneY != null) lane = e.opts.laneY;
      return { axis: ax, exitSide, entrySide, lane, around, raw, bundle: ro && ro.kind === "fanout" ? ro.bundle : null };
    });

    // de-collide ports per (node, side); fan-out source members share ONE trunk slot
    const vSide = (x) => x === "L" || x === "R";
    const grp = {};
    specs.forEach((e, i) => {
      if (desc[i].raw) return;
      (grp[`${e.src}|${desc[i].exitSide}`] ||= []).push({ i, end: "s" });
      (grp[`${e.tgt}|${desc[i].entrySide}`] ||= []).push({ i, end: "t" });
    });
    const frac = specs.map(() => ({ s: 0.5, t: 0.5, sSole: false, tSole: false }));
    for (const k in grp) {
      const arr = grp[k], side = k.slice(k.lastIndexOf("|") + 1), v = vSide(side);
      const slots = new Map();
      for (const it of arr) {
        const key = it.end === "s" && desc[it.i].bundle ? `b:${desc[it.i].bundle}` : `e:${it.i}`;
        const f = R(specs[it.i][it.end === "s" ? "tgt" : "src"]), c = v ? f.y + f.h / 2 : f.x + f.w / 2;
        if (!slots.has(key)) slots.set(key, { items: [], sum: 0, n: 0 });
        const sl = slots.get(key); sl.items.push(it); sl.sum += c; sl.n++;
      }
      const list = [...slots.values()].map((sl) => ({ ...sl, cross: sl.sum / sl.n })).sort((A, B) => A.cross - B.cross);
      const n = list.length;
      list.forEach((sl, j) => {
        const f = n === 1 ? 0.5 : (j + 1) / (n + 1);
        for (const it of sl.items) { if (it.end === "s") { frac[it.i].s = f; frac[it.i].sSole = n === 1; } else { frac[it.i].t = f; frac[it.i].tSole = n === 1; } }
      });
    }

    specs.forEach((e, i) => this._emitEdge(e, desc[i], frac[i]));
  }

  _emitEdge({ src, tgt, label = "", opts = {} }, d, fr) {
    const { dash = false, flow = false, rounded = false, stroke = THEME.edge.stroke, style = "" } = opts;
    let st = `edgeStyle=orthogonalEdgeStyle;html=1;rounded=${rounded ? 1 : 0};jettySize=auto;orthogonalLoop=1;jumpStyle=arc;jumpSize=8;fontSize=10;fontColor=${THEME.edge.fontColor};strokeColor=${stroke};strokeWidth=${THEME.edge.strokeWidth};`;
    if (dash) st += "dashed=1;";
    if (flow) st += "flowAnimation=1;";          // animated moving dashes in draw.io / SVG (not PNG)
    if (label) st += `labelBackgroundColor=${THEME.edge.labelBg};`;
    let wpXml = "";
    if (d && !d.raw) {
      const a = this.R[src], b = this.R[tgt], r3 = (v) => +(+v).toFixed(3);
      const port = (side, f) => (side === "L" ? { ex: 0, ey: f } : side === "R" ? { ex: 1, ey: f } : side === "T" ? { ex: f, ey: 0 } : { ex: f, ey: 1 });
      const sp = port(d.exitSide, fr.s), tp = port(d.entrySide, fr.t);
      const sx = a.x + sp.ex * a.w, sy = a.y + sp.ey * a.h, tx = b.x + tp.ex * b.w, ty = b.y + tp.ey * b.h;
      const exitH = d.exitSide === "L" || d.exitSide === "R", entryH = d.entrySide === "L" || d.entrySide === "R";
      const straight = !d.bundle && !d.around && fr.sSole && fr.tSole && exitH === entryH && (exitH ? Math.abs(sy - ty) < 6 : Math.abs(sx - tx) < 6);
      let pts = [];
      if (!straight) {
        const laneX = d.lane != null ? Math.round(d.lane) : Math.round((a.x + a.w <= b.x ? a.x + a.w + b.x : b.x + b.w + a.x) / 2);
        const laneY = d.lane != null ? Math.round(d.lane) : Math.round((a.y + a.h <= b.y ? a.y + a.h + b.y : b.y + b.h + a.y) / 2);
        if (exitH && entryH) pts = [{ x: laneX, y: Math.round(sy) }, { x: laneX, y: Math.round(ty) }];
        else if (!exitH && !entryH) pts = [{ x: Math.round(sx), y: laneY }, { x: Math.round(tx), y: laneY }];
        else if (exitH) pts = [{ x: Math.round(tx), y: Math.round(sy) }];   // horizontal out → vertical in
        else pts = [{ x: Math.round(sx), y: Math.round(ty) }];              // vertical out → horizontal in
      }
      st += `exitX=${sp.ex};exitY=${r3(sp.ey)};exitDx=0;exitDy=0;entryX=${tp.ex};entryY=${r3(tp.ey)};entryDx=0;entryDy=0;`;
      wpXml = pts.length ? `<Array as="points">${pts.map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join("")}</Array>` : "";
    }
    if (style) st += style.endsWith(";") ? style : style + ";";   // explicit override appended last (wins)
    this.cells.push(`<mxCell id="ed${++this.eid}" value="${esc(label)}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry">${wpXml}</mxGeometry></mxCell>`);
  }

  /** If a sibling node sits in the straight vertical path between two same-column nodes, return an x just
   *  past it so the edge routes AROUND (a clean C-bracket) instead of cutting through. Else null. */
  _aroundLaneX(a, b) {
    const xr0 = Math.max(a.x, b.x), xr1 = Math.min(a.x + a.w, b.x + b.w);
    if (xr1 - xr0 < 12) return null;
    const gTop = Math.min(a.y + a.h, b.y + b.h), gBot = Math.max(a.y, b.y);
    if (gBot - gTop < 8) return null;
    const holds = (p, q) => q.x >= p.x - 2 && q.y >= p.y - 2 && q.x + q.w <= p.x + p.w + 2 && q.y + q.h <= p.y + p.h + 2;
    let right = Math.max(a.x + a.w, b.x + b.w), blocked = false;
    for (const id in this.R) {
      const n = this.R[id];
      if (n === a || n === b || n.w <= 2 || n.h <= 2 || holds(n, a) || holds(n, b)) continue;
      const ov = Math.min(n.x + n.w, xr1) - Math.max(n.x, xr0);
      if (ov > 6 && n.y < gBot - 4 && n.y + n.h > gTop + 4) { blocked = true; right = Math.max(right, n.x + n.w); }
    }
    return blocked ? Math.round(right + 22) : null;
  }

  /** Horizontal analog of _aroundLaneX: a sibling node in the straight horizontal path → return a y above it. */
  _aroundLaneY(a, b) {
    const yr0 = Math.max(a.y, b.y), yr1 = Math.min(a.y + a.h, b.y + b.h);
    if (yr1 - yr0 < 12) return null;
    const gL = Math.min(a.x + a.w, b.x + b.w), gR = Math.max(a.x, b.x);
    if (gR - gL < 8) return null;
    const holds = (p, q) => q.x >= p.x - 2 && q.y >= p.y - 2 && q.x + q.w <= p.x + p.w + 2 && q.y + q.h <= p.y + p.h + 2;
    let top = Math.min(a.y, b.y), blocked = false;
    for (const id in this.R) {
      const n = this.R[id];
      if (n === a || n === b || n.w <= 2 || n.h <= 2 || holds(n, a) || holds(n, b)) continue;
      const ov = Math.min(n.y + n.h, yr1) - Math.max(n.y, yr0);
      if (ov > 6 && n.x < gR - 4 && n.x + n.w > gL + 4) { blocked = true; top = Math.min(top, n.y); }
    }
    return blocked ? Math.round(top - 22) : null;
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
