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

  /** Build all edges. Routing is DELEGATED to draw.io's native orthogonal router
   *  (orthogonalEdgeStyle + orthogonalLoop + jettySize=auto): we emit only source→target and let the
   *  engine choose sides, distribute connection points and route around nodes — and re-route live when
   *  the user edits the file. `jumpStyle=arc` draws a small hop wherever two lines cross.
   *  opts: { dash, flow, stroke, label, rounded, style } (style = extra "k=v;" appended verbatim,
   *  e.g. force a port with "exitX=1;exitY=0.5;entryX=0;entryY=0.5;" for a special case). */
  _buildEdges() {
    if (this._edgesBuilt) return;
    this._edgesBuilt = true;
    for (const e of this.edgeSpecs) this._emitEdge(e);
  }

  _emitEdge({ src, tgt, label = "", opts = {} }) {
    const { dash = false, flow = false, rounded = false, stroke = THEME.edge.stroke, style = "" } = opts;
    let st = `edgeStyle=orthogonalEdgeStyle;html=1;rounded=${rounded ? 1 : 0};jettySize=auto;orthogonalLoop=1;jumpStyle=arc;jumpSize=8;fontSize=10;fontColor=${THEME.edge.fontColor};strokeColor=${stroke};strokeWidth=${THEME.edge.strokeWidth};`;
    if (dash) st += "dashed=1;";
    if (flow) st += "flowAnimation=1;";          // animated moving dashes in draw.io / SVG (not PNG)
    if (label) st += `labelBackgroundColor=${THEME.edge.labelBg};`;
    if (style) st += style.endsWith(";") ? style : style + ";";
    this.cells.push(`<mxCell id="ed${++this.eid}" value="${esc(label)}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
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
