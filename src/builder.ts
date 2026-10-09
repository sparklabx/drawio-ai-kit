// drawio-ai-kit — Diagram builder. Bundles all boilerplate: icon/box/group/panel/link
// + auto-routing by type + auto-size panel + validate + XML export. Goal: build
// a diagram with just a few lines of declaration (easy to use, easy to extend).
import { writeFileSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, styleForIcon, styleForGroup, validateDiagram } from "./core.ts";
import { centerInGapX, panelSize } from "./layout.ts";
import { typePreset } from "./types.ts";
import { THEME } from "./theme.ts";
import type { Rect, Vertex, Side, EdgeOptions, EdgeSpec, DiagramOptions, ContractName, IconOptions, BoxOptions, GroupOptions, ClusterOptions } from "./model.ts";

type Pt = { x: number; y: number };
type End = "s" | "t";
type Frac = { s: number; t: number };
type Face = { es: Side; en: Side; horiz: boolean };
type Card = Rect & { id: string };
type Seg = { i: number; o: "v" | "h"; a: Pt; b: Pt; pos: number; lo: number; hi: number; tie: number };
/** A routed edge: ports (es/en) + how the path between them bends. raw (opts.style) edges have no Route. */
type Route = { es: Side; en: Side; kind: "straight" | "Zx" | "Zy" | "Lhv" | "Lvh" | "poly"; lane?: number; pts?: Pt[]; freeze?: boolean };

// \n → &#10; so multi-line labels survive XML attribute-value normalization (a bare newline in an
// attribute is collapsed to a space by the XML spec; the char-ref renders as a real line break in draw.io).
const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");

// Kit repo root (parent of src/), real path so the symlinked-skill install resolves to the true repo.
const KIT_ROOT = (() => { const d = resolve(dirname(fileURLToPath(import.meta.url)), ".."); try { return realpathSync(d); } catch { return d; } })();
// True iff an output path lands inside the kit repo → the hard rule forbids writing there.
const insideKit = (dir: string, filename: string) => {
  let base: string; try { base = realpathSync(dir); } catch { base = resolve(dir); }   // dir may not exist yet → resolve without symlinks
  const rel = relative(KIT_ROOT, resolve(base, filename));                      // resolve filename too, so "../" escapes can't sneak back in
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

// Pure routing geometry (no diagram state) — hoisted out of _buildEdges so _emitEdge shares it.
const pt = (n: Rect, sd: Side, f: number): Pt => sd === "L" ? { x: n.x, y: Math.round(n.y + f * n.h) } : sd === "R" ? { x: n.x + n.w, y: Math.round(n.y + f * n.h) }
  : sd === "T" ? { x: Math.round(n.x + f * n.w), y: n.y } : { x: Math.round(n.x + f * n.w), y: n.y + n.h };
const geom = (a: Rect, b: Rect, r: Route, sf: number, tf: number) => {
  const sp = pt(a, r.es, sf), ep = pt(b, r.en, tf); let wp: Pt[] = [];
  if (r.kind === "Zx") wp = [{ x: r.lane!, y: sp.y }, { x: r.lane!, y: ep.y }];
  else if (r.kind === "Zy") wp = [{ x: sp.x, y: r.lane! }, { x: ep.x, y: r.lane! }];
  else if (r.kind === "Lhv") wp = [{ x: ep.x, y: sp.y }];
  else if (r.kind === "Lvh") wp = [{ x: sp.x, y: ep.y }];
  else if (r.kind === "poly") wp = r.pts!;
  return { sp, ep, wp };
};
const gapSweep = (lo: number, hi: number) => { const out: number[] = []; const mid = (lo + hi) / 2; out.push(Math.round(mid)); for (let k = 1; k <= 30; k++) { const u = mid + k * 10, d = mid - k * 10; if (d > lo + 2) out.push(Math.round(d)); if (u < hi - 2) out.push(Math.round(u)); } return out; };
const usedKey = (x1: number, y1: number, x2: number, y2: number) => (x1 < x2 || y1 < y2) ? `${x1},${y1}|${x2},${y2}` : `${x2},${y2}|${x1},${y1}`;
const encl = (c: Rect, n: Rect) => c.x <= n.x + 1 && c.y <= n.y + 1 && c.x + c.w >= n.x + n.w - 1 && c.y + c.h >= n.y + n.h - 1;

export class Diagram {
  c: ReturnType<typeof loadCatalog>;
  type: string;
  contract: ContractName;
  iconSize: number;
  preset: ReturnType<typeof typePreset>;
  page: [number, number];
  cells: string[];
  R: Record<string, Vertex>;
  phantoms: Set<string>;
  eid: number;
  edgeSpecs: EdgeSpec[];
  _edgesBuilt: boolean;
  _titleText: string;
  _titleFs: number;
  _cross = 0;      // residual edge/icon clips after routing (verification; see test/edges.test.ts)
  _overlaps = 0;   // residual parallel-overlap count

  /** type: pipeline|hierarchy|network|hubspoke|hybrid|mesh|sequence
   *  contract: "scaffold" (default — drag-resilient, no waypoints) | "bake" (frozen waypoints). */
  constructor(type = "pipeline", { title = "", page = [2000, 1200], contract = "scaffold", iconSize = 48 }: DiagramOptions = {}) {
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
    // Title is emitted in toXML(), NOT here — renderTree resizes this.page to the real content width, so
    // centring it now (over the initial page width) would leave it off-centre. Deferring centres it right.
    this._titleText = title || "";
    this._titleFs = 14;
  }
  _put(id: string, parent: string, x: number, y: number, w: number, h: number, style: string, label: string): Vertex {
    this.R[id] = { x, y, w, h };
    const p = this.R[parent]; const ox = p ? p.x : 0, oy = p ? p.y : 0;   // layer parents ("1"/"boundaries") → offset 0
    this.cells.push(`<mxCell id="${id}" value="${esc(label)}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x - ox}" y="${y - oy}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
    return this.R[id];
  }
  /** AWS icon by catalog name (verbatim style). [x,y] = top-left corner; size defaults to 48. */
  icon(id: string, name: string, [x, y]: [number, number], { parent = "1", label = "", size = 48, labelW = 0 }: IconOptions = {}): Vertex {
    const s = styleForIcon(this.c, name);
    if (!s) throw new Error(`Icon not found in catalog: "${name}" — run: drawio-ai search ${name}`);
    const r = this._put(id, parent, x, y, size, size, s.style, label); r.ob = true;
    // The label renders in a ~34px band BELOW the 48px glyph (verticalLabelPosition=bottom, outside the
    // cell). The router only sees the glyph rect, so lines cut straight through the caption. labelH tells
    // _buildEdges to add that band as a SEPARATE obstacle card (not part of the R rect → audits unaffected).
    // …and it grows with the line count, matching the space the layout reserves (layout-engine mIcon).
    r.labelH = label ? 34 + (String(label).split("\n").length - 1) * 16 : 0;
    // The caption is usually WIDER than the 48px glyph, so the band must span the TEXT, not the icon, or a
    // line passing beside the icon still slices through the words. Width is estimated from the longest
    // line (not the cell width, which has a 96px floor and would bloat the obstacle for short captions).
    const lines = String(label || "").split("\n");
    const textW = Math.max(...lines.map((l) => l.length)) * 6.6 + 8;
    r.labelW = label ? Math.min(labelW || textW, Math.max(size, textW)) : 0;
    return r;   // ob = leaf obstacle (router avoids)
  }
  /** Small catalog icon at a container's top-left corner (for Azure/GCP frames — mimics the corner
   *  icon baked into AWS group stencils). Decorative but still an obstacle (ob:true) — an edge
   *  slicing through the badge looks broken, and the geometry audit rightly flags it. */
  cornerIcon(id: string, name: string, [x, y]: [number, number], size = 22, parent = "1"): Vertex {
    const s = styleForIcon(this.c, name);
    if (!s) throw new Error(`cornerIcon not found in catalog: "${name}" — run: drawio-ai search ${name}`);
    const r = this._put(id, parent, x, y, size, size, s.style, ""); r.ob = true; return r;
  }
  // Default SQUARE CORNERS — AWS diagrams rarely use rounded frames. (round:true if needed.)
  // ob: true = a leaf card the edge-router must not cross; false = a container frame (edges pass through).
  box(id: string, [x, y]: [number, number], [w, h]: [number, number], label = "", { parent = "1", fill = "#FFFFFF", stroke = "#5A6B7B", va = "middle", bold = false, fs = 11, round = false, ob = true }: BoxOptions = {}): Vertex {
    const r = this._put(id, parent, x, y, w, h, `rounded=${round ? 1 : 0};whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontColor=#1A1A1A;fontSize=${fs};fontStyle=${bold ? 1 : 0};verticalAlign=${va};`, label); r.ob = ob; return r;
  }
  /** AWS group container (group_aws_cloud_alt, group_region, group_vpc, group_account, ...).
   *  fill/stroke (optional) override the stencil's colours by appending to the style. */
  group(id: string, gname: string, [x, y]: [number, number], [w, h]: [number, number], label = "", { parent = "1", fill = null, stroke = null }: GroupOptions = {}): Vertex {
    const s = styleForGroup(this.c, gname);
    if (!s) throw new Error(`Group not found: "${gname}"`);
    let style = s.style;
    // THEME always wins for group_subnet — never let a caller hardcode subnet fill.
    // (AI-generated code often copies stale fills; ignoring them keeps colors consistent.)
    if (gname === "group_subnet") {
      const priv = /private/i.test(label);
      fill = priv ? THEME.subnetPrivate : THEME.subnetPublic;
      stroke = stroke || (priv ? THEME.subnetPrivateStroke : THEME.subnetPublicStroke);
      // draw.io draws Public/Private subnet with the security-group glyph (the padlock), not the
      // generic subnet glyph. Swap the glyph for labelled subnets but stamp a stable `subnet=1`
      // marker so the validator still treats it as a subnet (level 4, DB-in-public-subnet audit)
      // — the marker is glyph-independent, so it survives the swap. draw.io ignores unknown keys.
      if (priv || /public/i.test(label))
        style = style.replace("grIcon=mxgraph.aws4.group_subnet", "grIcon=mxgraph.aws4.group_security_group");
      style += "subnet=1;";
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
  clusterBox(id: string, childIds: string[], label = "", { icon = null, stroke = "#ED7100", dashed = true, pad = 14, padTop = 34, iconSize = 20, strokeWidth = 1, fontColor = null }: ClusterOptions = {}): Vertex | null {
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
  title(label: string, { fs = 14 }: { fs?: number } = {}) { this._titleText = label; this._titleFs = fs; return this; }   // centred at toXML() over the final page width
  text(id: string, [x, y]: [number, number], w: number, label: string, { fs = 14, parent = "1" }: { fs?: number; parent?: string } = {}): void {
    const ox = parent === "1" ? 0 : this.R[parent].x, oy = parent === "1" ? 0 : this.R[parent].y;
    this.R[id] = { x, y, w, h: 30 };
    this.cells.push(`<mxCell id="${id}" value="${esc(label)}" style="text;html=1;align=center;fontStyle=1;fontSize=${fs};fontColor=light-dark(#232F3E,#E8E8E8);" vertex="1" parent="${parent}"><mxGeometry x="${x - ox}" y="${y - oy}" width="${w}" height="30" as="geometry"/></mxCell>`);
  }
  /**
   * Panel that AUTO-SIZES to the icon count: draws a snug box, icons centered in columns + evenly distributed.
   * items = [[iconName, label], ...]. Returns the panel's rect.
   */
  panel(id: string, [x, y]: [number, number], title: string, items: [string, string][], { parent = "1", cols = 1, fill = "#F5F5F5", stroke = "#999999", itemW = 130, itemH = 84 }: { parent?: string; cols?: number; fill?: string; stroke?: string; itemW?: number; itemH?: number } = {}): Vertex {
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
  link(src: string, tgt: string, label = "", opts: EdgeOptions = {}): this {
    for (const [id, role] of [[src, "source"], [tgt, "target"]] as const) {
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
  _buildEdges(): void {
    if (this._edgesBuilt) return;
    this._edgesBuilt = true;
    const specs = this.edgeSpecs, R = (id: string) => this.R[id];
    const cards: Card[] = [];
    for (const id in this.R) {
      const r = this.R[id];
      if (!r.ob) continue;
      cards.push({ id, x: r.x, y: r.y, w: r.w, h: r.h });
      // A labeled icon's text renders in a ~34px band BELOW the glyph (outside the cell). Add it as a
      // SEPARATE card with its own id so it is never in an edge's `ex` set — thus the glyph stays
      // connectable for the icon's own edges, but no edge (its own included) may route through the label
      // text. This is what kills "line straight through the caption" without forcing S-curves.
      // ponytail: band is glyph-width; a very wide wrapped caption can still overhang left/right — the band
      // pushes the route up to glyph level so it clears the text anyway, widen only if a case bites.
      if (r.labelH) {
        const lw = Math.max(r.labelW || r.w, r.w);
        cards.push({ id: `${id}__lbl`, x: Math.round(r.x + r.w / 2 - lw / 2), y: r.y + r.h, w: lw, h: r.labelH });
      }
    }
    // Obstacle-exclusion set for an edge: always its own endpoints, PLUS their caption bands when the two
    // nodes are x-aligned (a straight vertical drop between stacked neighbours — orders-svc→RDS — should
    // pass through a short caption rather than detour around it). Misaligned edges keep the bands blocking,
    // so an angled approach (files→stream) is still steered off the label instead of piercing it.
    const exOf = (e: EdgeSpec) => {
      const s = new Set([e.src, e.tgt]), a = R(e.src), b = R(e.tgt);
      if (a && b && Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 24) { s.add(`${e.src}__lbl`); s.add(`${e.tgt}__lbl`); }
      return s;
    };
    const M = 7;
    const segHit = (p: Pt, q: Pt, ex: Set<string>) => {
      for (const c of cards) {
        if (ex.has(c.id)) continue;
        const x0 = c.x - M, x1 = c.x + c.w + M, y0 = c.y - M, y1 = c.y + c.h + M;
        if (Math.abs(p.y - q.y) < 1) { if (p.y > y0 && p.y < y1 && Math.min(p.x, q.x) < x1 && Math.max(p.x, q.x) > x0) return true; }
        else if (Math.abs(p.x - q.x) < 1) { if (p.x > x0 && p.x < x1 && Math.min(p.y, q.y) < y1 && Math.max(p.y, q.y) > y0) return true; }
        else { if (Math.min(p.x, q.x) < x1 && Math.max(p.x, q.x) > x0 && Math.min(p.y, q.y) < y1 && Math.max(p.y, q.y) > y0) return true; } // diagonal (shouldn't happen) — be safe
      }
      return false;
    };
    const pathHit = (pp: Pt[], ex: Set<string>) => { for (let i = 0; i < pp.length - 1; i++) if (segHit(pp[i], pp[i + 1], ex)) return true; return false; };
    // container frames — edges may CROSS them, but should not run PARALLEL right next to a border
    const containers: Rect[] = []; for (const id in this.R) { const r = this.R[id]; if (r.ob === false) containers.push(r); }
    // smallest container that strictly encloses a node (its account/zone box) — used to keep the elbow OUTSIDE it
    const enclosing = (n: Rect, other: Rect | null = null): Rect | null => {
      let best: Rect | null = null;
      for (const c of containers) {
        if (c.x <= n.x + 1 && c.y <= n.y + 1 && c.x + c.w >= n.x + n.w - 1 && c.y + c.h >= n.y + n.h - 1 && c.w * c.h > n.w * n.h + 1) {
          if (other) {
            if (encl(c, other)) continue;
            if (!best || c.w * c.h > best.w * best.h) best = c;
          } else {
            if (!best || c.w * c.h < best.w * best.h) best = c;
          }
        }
      }
      return best;
    };
    const BM = 24;
    const along = (p: Pt, q: Pt, a: Rect | null = null, b: Rect | null = null): boolean => {
      if (Math.abs(p.x - q.x) < 1) { const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y); if (y1 - y0 < 28) return false;
        // Border-hugging is ugly from EITHER side: a long run 7px inside a frame edge looks glued to it just
        // as much as one 7px outside. The old guard skipped the check for interior segments, which let
        // lines slide along the inner edge of a frame while open space sat unused.
        for (const c of containers) {
          // Both ends inside this box = local routing: allowed closer than BM, but never sitting ON the
          // border — a wire drawn exactly along a frame edge reads as part of the frame.
          const m = a && b && encl(c, a) && encl(c, b) ? 10 : BM;
          for (const bx of [c.x, c.x + c.w]) if (Math.abs(p.x - bx) < m && Math.min(y1, c.y + c.h) - Math.max(y0, c.y) > 28) return true;
        }
        if (a && b) for (const c of containers) {
          if (p.x > c.x + 8 && p.x < c.x + c.w - 8 && Math.min(y1, c.y + c.h) - Math.max(y0, c.y) > 28) {
            if (encl(c, a) !== encl(c, b)) return true;
          }
        }
      }
      else { const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x); if (x1 - x0 < 28) return false;
        for (const c of containers) {
          const m = a && b && encl(c, a) && encl(c, b) ? 10 : BM;
          for (const by of [c.y, c.y + c.h]) if (Math.abs(p.y - by) < m && Math.min(x1, c.x + c.w) - Math.max(x0, c.x) > 28) return true;
        }
        if (a && b) for (const c of containers) {
          if (p.y > c.y + 8 && p.y < c.y + c.h - 8 && Math.min(x1, c.x + c.w) - Math.max(x0, c.x) > 28) {
            if (encl(c, a) !== encl(c, b)) return true;
          }
        }
      }
      return false;
    };
    const pathAlong = (pp: Pt[], a: Rect | null = null, b: Rect | null = null) => { for (let i = 0; i < pp.length - 1; i++) if (along(pp[i], pp[i + 1], a, b)) return true; return false; };
    const clearW = (a: Rect, b: Rect, r: Route, sf: number, tf: number, ex: Set<string>) => { const g = geom(a, b, r, sf, tf); return !pathHit([g.sp, ...g.wp, g.ep], ex); };

    // A. facing sides + axis per edge
    const face = specs.map((e): Face | null => {
      if (e.opts.style) return null;
      if (e.opts.route) return { es: e.opts.route.es, en: e.opts.route.en, horiz: e.opts.route.es === "L" || e.opts.route.es === "R" };
      const a = R(e.src), b = R(e.tgt);
      const fwdX = b.x + b.w / 2 >= a.x + a.w / 2, fwdY = b.y + b.h / 2 >= a.y + a.h / 2;
      const xOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const horiz = e.opts.dir ? e.opts.dir === "LR" : (yOv > 8 ? true : xOv > 8 ? false : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y));
      return horiz ? { es: fwdX ? "R" : "L", en: fwdX ? "L" : "R", horiz: true } : { es: fwdY ? "B" : "T", en: fwdY ? "T" : "B", horiz: false };
    });

    // de-collide helper (mutates frac): spread ports sharing one (node, side)
    const frac: Frac[] = specs.map(() => ({ s: 0.5, t: 0.5 }));
    const decollide = (idxs: number[], sideOf: (i: number, end: End) => Side) => {
      const grp: Record<string, { i: number; end: End }[]> = {};
      for (const i of idxs) for (const end of ["s", "t"] as const) { const sd = sideOf(i, end); if (!sd) continue; const node = end === "s" ? specs[i].src : specs[i].tgt; (grp[`${node}|${sd}`] ||= []).push({ i, end }); }
      const setF = (it: { i: number; end: End }, f: number) => { if (it.end === "s") frac[it.i].s = f; else frac[it.i].t = f; };
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
    decollide(all, (i, end) => (end === "s" ? face[i]!.es : face[i]!.en));

    // A* channel router (fallback): route through the gaps between cards → guaranteed clear of every icon
    const astar = (a: Rect, b: Rect, es: Side, en: Side, sf: number, tf: number, ex: Set<string>, used: Set<string>) => {
      const pp = (n: Rect, sd: Side, f: number) => sd === "L" ? { x: n.x, y: Math.round(n.y + f * n.h), dx: -1, dy: 0 } : sd === "R" ? { x: n.x + n.w, y: Math.round(n.y + f * n.h), dx: 1, dy: 0 }
        : sd === "T" ? { x: Math.round(n.x + f * n.w), y: n.y, dx: 0, dy: -1 } : { x: Math.round(n.x + f * n.w), y: n.y + n.h, dx: 0, dy: 1 };
      const sp = pp(a, es, sf), ep = pp(b, en, tf), off = 24;
      // put the elbow OUTSIDE the icon's own container (straight entry across the border), not 16px in front of the icon
      const pushOff = (port: Pt & { dx: number; dy: number }, n: Rect, other: Rect): Pt => {
        const c = enclosing(n, other), def = { x: port.x + port.dx * off, y: port.y + port.dy * off };
        if (!c) return def;
        const cand = port.dx < 0 ? { x: c.x - off, y: port.y } : port.dx > 0 ? { x: c.x + c.w + off, y: port.y }
          : port.dy < 0 ? { x: port.x, y: c.y - off } : { x: port.x, y: c.y + c.h + off };
        return segHit(port, cand, ex) ? def : cand;   // only if the straight run to the border clears other icons
      };
      const s0 = pushOff(sp, a, b), g0 = pushOff(ep, b, a);
      const xs = new Set([s0.x, g0.x, sp.x, ep.x]), ys = new Set([s0.y, g0.y, sp.y, ep.y]);
      for (const c of cards) { if (ex.has(c.id)) continue; xs.add(c.x - M); xs.add(c.x + c.w + M); ys.add(c.y - M); ys.add(c.y + c.h + M); }
      // Container lanes sit BM clear of the border, not M: M (7px) is the card-collision margin, and using
      // it here handed A* a lane 7px off every frame edge — exactly the "line glued to the frame" look,
      // chosen even when open space was available. BM matches the border-hugging penalty in along().
      for (const c of containers) { xs.add(c.x - BM); xs.add(c.x + c.w + BM); ys.add(c.y - BM); ys.add(c.y + c.h + BM); }
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
      // A* scores obstacles and crossings but never border proximity, so it would happily pick a lane a
      // few px off a frame edge with a clear one right there. Drop lanes that skim a container border
      // (either side) — but never the port/elbow coordinates, and only while a usable grid survives, so a
      // genuinely tight gap still gets routed instead of falling through to the dirty fallback.
      const keep = new Set([s0.x, g0.x, sp.x, ep.x, s0.y, g0.y, sp.y, ep.y]);
      const skims = (v: number, lo: number, hi: number) => Math.abs(v - lo) < BM || Math.abs(v - hi) < BM;
      const thin = (vals: number[], axis: "x" | "y") => {
        const out = vals.filter((v) => keep.has(v) || !containers.some((c) => skims(v, axis === "x" ? c.x : c.y, axis === "x" ? c.x + c.w : c.y + c.h)));
        return out.length >= 4 ? out : vals;
      };
      X = thin([...newX].sort((p, q) => p - q), "x"); Y = thin([...newY].sort((p, q) => p - q), "y");

      const xI = new Map(X.map((v, i) => [v, i])), yI = new Map(Y.map((v, i) => [v, i])), W = X.length;
      const idx = (i: number, j: number) => j * W + i, gi = xI.get(g0.x)!, gj = yI.get(g0.y)!;
      const start = idx(xI.get(s0.x)!, yI.get(s0.y)!), goal = idx(gi, gj);
      const segOK = (x1: number, y1: number, x2: number, y2: number) => !segHit({ x: x1, y: y1 }, { x: x2, y: y2 }, ex);
      const checkCrossing = (cx: number, cy: number, nx: number, ny: number) => {
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
      const heur = (n: number) => { const i = n % W, j = (n - i) / W; return Math.abs(X[i] - X[gi]) + Math.abs(Y[j] - Y[gj]); };
      // binary min-heap open set (lazy deletion) — the old linear-scan Map was O(V²) and burned
      // the guard budget on large pages, silently dropping edges to the dirty fallback.
      const gsc: Record<number, number> = {}, came: Record<number, number> = {}, cdir: Record<number, string> = {}, heap: [number, number][] = [[heur(start), start]]; gsc[start] = 0;
      const hpush = (f: number, n: number) => { heap.push([f, n]); for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
      const hpop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; for (let i = 0;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
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
      let path: Pt[] = [], c: number | undefined = goal; while (c !== undefined) { const i = c % W, j = (c - i) / W; path.push({ x: X[i], y: Y[j] }); c = came[c]; } path.reverse();
      const simp = [path[0]];
      for (let k = 1; k < path.length - 1; k++) { const p = simp[simp.length - 1], q = path[k], r = path[k + 1]; if ((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)) continue; simp.push(q); }
      simp.push(path[path.length - 1]);
      // NO side effects here: the caller compares candidate paths by cost and registers only the
      // winner's channels — registering every try would poison `used` for the losing candidates.
      return { es, en, kind: "poly" as const, pts: simp, cost: gsc[goal] };
    };

    // B. route each edge AT ITS FINAL FRAC: straight → facing-Z in gap → L → A* through the gaps
    const used = new Set<string>(), usedSegs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const reg = (g: { sp: Pt; wp: Pt[]; ep: Pt }) => { const pp = [g.sp, ...g.wp, g.ep]; for (let k = 0; k < pp.length - 1; k++) { used.add(usedKey(Math.round(pp[k].x), Math.round(pp[k].y), Math.round(pp[k + 1].x), Math.round(pp[k + 1].y))); usedSegs.push({ x1: pp[k].x, y1: pp[k].y, x2: pp[k + 1].x, y2: pp[k + 1].y }); } };
    const ov1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
    const overlapsUsed = (pp: Pt[]) => {
      for (let i = 0; i < pp.length - 1; i++) { const a = pp[i], b = pp[i + 1];
        for (const s of usedSegs) {
          if (Math.abs(a.x - b.x) < 1 && Math.abs(s.x1 - s.x2) < 1 && Math.abs(a.x - s.x1) < 6) { if (ov1(Math.min(a.y, b.y), Math.max(a.y, b.y), Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)) > 14) return true; }
          else if (Math.abs(a.y - b.y) < 1 && Math.abs(s.y1 - s.y2) < 1 && Math.abs(a.y - s.y1) < 6) { if (ov1(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)) > 14) return true; }
        }
      }
      return false;
    };
    const routes: (Route | null)[] = specs.map(() => null);   // null = raw (opts.style) edge: emitted with no ports/waypoints
    const heuristic = (e: EdgeSpec, i: number, strict: boolean) => {
      const a = R(e.src), b = R(e.tgt), ex = exOf(e), f = face[i]!, sf = frac[i].s, tf = frac[i].t;
      const tryR = (r: Route) => { if (!clearW(a, b, r, sf, tf, ex)) return null; const g = geom(a, b, r, sf, tf), pp = [g.sp, ...g.wp, g.ep]; if (pathAlong(pp, a, b)) return null; if (strict && overlapsUsed(pp)) return null; return r; };
      let r: Route | null = null;
      if (f.horiz) {
        if (Math.abs(a.y + sf * a.h - (b.y + tf * b.h)) < 2) r = tryR({ es: f.es, en: f.en, kind: "straight" });
        if (!r) { const lo = Math.min(a.x + a.w, b.x + b.w), hi = Math.max(a.x, b.x); for (const lx of gapSweep(lo, hi)) { r = tryR({ es: f.es, en: f.en, kind: "Zx", lane: lx }); if (r) break; } }
        if (!r) for (const cand of [{ es: f.es, en: b.y + b.h / 2 >= a.y + a.h / 2 ? "T" : "B", kind: "Lhv" }, { es: b.y + b.h / 2 >= a.y + a.h / 2 ? "B" : "T", en: f.en, kind: "Lvh" }] as Route[]) { r = tryR(cand); if (r) break; }
      } else {
        if (Math.abs(a.x + sf * a.w - (b.x + tf * b.w)) < 2) r = tryR({ es: f.es, en: f.en, kind: "straight" });
        if (!r) { const lo = Math.min(a.y + a.h, b.y + b.h), hi = Math.max(a.y, b.y); for (const ly of gapSweep(lo, hi)) { r = tryR({ es: f.es, en: f.en, kind: "Zy", lane: ly }); if (r) break; } }
        if (!r) for (const cand of [{ es: f.es, en: b.x + b.w / 2 >= a.x + a.w / 2 ? "L" : "R", kind: "Lvh" }, { es: b.x + b.w / 2 >= a.x + a.w / 2 ? "R" : "L", en: f.en, kind: "Lhv" }] as Route[]) { r = tryR(cand); if (r) break; }
      }
      return r;
    };
    // pass 1: heuristic (register the channels they occupy)
    const need: number[] = [];
    specs.forEach((e, i) => {
      if (e.opts.style) return;   // raw: routes[i] stays null
      if (e.opts.route) { routes[i] = { ...e.opts.route, kind: "straight" }; reg(geom(R(e.src), R(e.tgt), routes[i]!, frac[i].s, frac[i].t)); return; }
      // rail: route a long/cross-cutting edge along an explicit top/bottom gutter (nexcanvas rails) so it
      // does not cut through the dense middle. { rail:"top"|"bottom"|<Y>, lane:n } — lane offsets stacked rails.
      if (e.opts.rail != null) {
        const a = R(e.src), b = R(e.tgt), m = 30 + (e.opts.lane || 0) * 36;
        const top = e.opts.rail === "top";
        const railY = typeof e.opts.rail === "number" ? e.opts.rail : top ? Math.min(a.y, b.y) - m : Math.max(a.y + a.h, b.y + b.h) + m;
        const dfltSide = typeof e.opts.rail === "number" ? (railY <= (a.y + b.y) / 2 ? "T" : "B") : top ? "T" : "B";
        // exclude the endpoints AND their own caption bands — an edge may leave through its own node's
        // caption going to the rail (like any bottom-port edge); only ANOTHER card in the drop forces a jog.
        const ex = new Set([e.src, e.tgt, `${e.src}__lbl`, `${e.tgt}__lbl`]);
        // Drop from node n straight to railY at its centre-x; if that vertical run pierces another card
        // (node stacked under the source, common on a long feedback edge), jog out to the nearest column
        // gap and enter/leave from that side instead — so the rail bypasses the nodes rather than spearing
        // them. Falls back to the straight centre drop when neither gap is clear (no worse than before).
        const stub = (n: Rect): { es: Side; f: number; pts: Pt[] } => {
          const cx = Math.round(n.x + n.w / 2), edgeY = dfltSide === "T" ? n.y : n.y + n.h;
          if (!segHit({ x: cx, y: edgeY }, { x: cx, y: railY }, ex)) return { es: dfltSide, f: 0.5, pts: [{ x: cx, y: railY }] };
          const cy = Math.round(n.y + n.h / 2);
          for (const [sx, sd, px] of [[n.x - 22, "L", n.x], [n.x + n.w + 22, "R", n.x + n.w]] as [number, Side, number][])
            if (!segHit({ x: px, y: cy }, { x: sx, y: cy }, ex) && !segHit({ x: sx, y: cy }, { x: sx, y: railY }, ex))
              return { es: sd, f: (cy - n.y) / n.h, pts: [{ x: sx, y: cy }, { x: sx, y: railY }] };
          return { es: dfltSide, f: 0.5, pts: [{ x: cx, y: railY }] };
        };
        const sa = stub(a), sb = stub(b);
        frac[i] = { s: sa.f, t: sb.f };
        routes[i] = { es: sa.es, en: sb.es, kind: "poly", pts: [...sa.pts, ...sb.pts.slice().reverse()] };
        reg(geom(a, b, routes[i], frac[i].s, frac[i].t));
        return;
      }
      const r = heuristic(e, i, true) || heuristic(e, i, false);
      if (r) { routes[i] = r; reg(geom(R(e.src), R(e.tgt), r, frac[i].s, frac[i].t)); } else need.push(i);
    });
    // pass 2: A* for the rest — try EVERY side combo and keep the CHEAPEST path. First-found was
    // the root cause of page-wide detours: a bad approach side "won" just by being tried first.
    // Ports are re-de-collided per candidate side (the global de-collide pass only saw the facing
    // sides, so a switched side could stack several arrowheads on one spot).
    const portUsed: Record<string, number[]> = {};
    const takePort = (node: string, side: Side, fv: number) => (portUsed[`${node}|${side}`] ||= []).push(fv);
    specs.forEach((e, i) => { const r = routes[i]; if (!r) return; takePort(e.src, r.es, frac[i].s); takePort(e.tgt, r.en, frac[i].t); });
    const freePort = (node: string, side: Side, want: number) => {
      const taken = portUsed[`${node}|${side}`] || [];
      for (const fv of [want, 0.5, 0.3, 0.7, 0.2, 0.8]) if (taken.every((t) => Math.abs(t - fv) >= 0.12)) return fv;
      return want;
    };
    for (const i of need) {
      const e = specs[i], a = R(e.src), b = R(e.tgt), ex = exOf(e), f = face[i]!;
      const fwdY = b.y + b.h / 2 >= a.y + a.h / 2, fwdX = b.x + b.w / 2 >= a.x + a.w / 2;
      const tries: [Side, Side][] = f.horiz ? [[f.es, f.en], ["T", "T"], ["B", "B"], [fwdY ? "B" : "T", fwdX ? "L" : "R"]] : [[f.es, f.en], ["L", "L"], ["R", "R"], [fwdX ? "R" : "L", fwdY ? "T" : "B"]];
      let best: { r: NonNullable<ReturnType<typeof astar>>; sf: number; tf: number } | null = null;
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
        let r: Route | null = null;
        for (const lane of gapSweep(lo, hi)) {
          const cand: Route = { es: f.es, en: f.en, kind: f.horiz ? "Zx" : "Zy", lane };
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
      (!r || specs[i].opts.route) ? null
        : ((g) => [g.sp, ...g.wp.map((p) => ({ x: p.x, y: p.y })), g.ep])(geom(R(specs[i].src), R(specs[i].tgt), r, frac[i].s, frac[i].t)));
    // Iterate (max 3 passes): a nudge can push a segment to within SEP of a bundle it was NOT
    // grouped with — a single pass only counted those new conflicts, it never resolved them.
    const conflict = (s: Seg, t: Seg) => s.o === t.o && Math.abs(s.pos - t.pos) < SEP && Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 8;
    for (let pass = 0; pass < 3; pass++) {
      const nseg: Seg[] = [];   // interior (nudgeable) segments, holding refs to their shared corner points
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
      const bundles: Record<number, Seg[]> = {}; nseg.forEach((s, idx) => (bundles[comp[idx]] ||= []).push(s));
      let moved = 0;
      for (const key in bundles) {
        const g = bundles[key]; if (g.length < 2) continue;
        g.sort((A, B) => A.pos - B.pos || A.tie - B.tie);                 // order by track then topology → no new crossings
        const center = g.reduce((s, x) => s + x.pos, 0) / g.length;
        g.forEach((s, j) => {
          const target = Math.round(center + (j - (g.length - 1) / 2) * SEP);
          if (target === s.pos) return;
          const old = s.pos, P = paths[s.i]!, a = R(specs[s.i].src), b = R(specs[s.i].tgt), ex = exOf(specs[s.i]);
          const alongBefore = pathAlong(P, a, b);   // container entry inherent to this path is NOT the nudge's fault
          if (s.o === "v") { s.a.x = target; s.b.x = target; } else { s.a.y = target; s.b.y = target; }
          // revert only if the move makes it WORSE: a new icon hit, or border-hugging it didn't have before
          if (pathHit(P, ex) || (!alongBefore && pathAlong(P, a, b))) { if (s.o === "v") { s.a.x = old; s.b.x = old; } else { s.a.y = old; s.b.y = old; } }
          else { s.pos = target; moved++; }
        });
      }
      if (!moved) break;
    }
    // C2. UN-CROSS a fan-out bundle. Each edge picks its lane independently, and the nudge only separates
    // lanes that already conflict — so two edges leaving one node can end up with their tracks in the
    // OPPOSITE order to their ports and cross for no reason at all. Try swapping the two tracks and keep
    // the swap only when it genuinely removes crossings without clipping an icon.
    const cross2 = (p: Pt, q: Pt, r: Pt, s: Pt) => {   // proper intersection; touching/collinear does not count
      const d = (a: Pt, b: Pt, c: Pt) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      const d1 = d(p, q, r), d2 = d(p, q, s), d3 = d(r, s, p), d4 = d(r, s, q);
      return d1 !== d2 && d3 !== d4 && d1 && d2 && d3 && d4;
    };
    const pathCross = (P: Pt[], Q: Pt[]) => { let n = 0; for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < Q.length - 1; j++) if (cross2(P[i], P[i + 1], Q[j], Q[j + 1])) n++; return n; };
    const interior = (P: Pt[]) => { const out: { o: "v" | "h"; a: Pt; b: Pt }[] = [];
      for (let k = 1; k < P.length - 2; k++) { const p = P[k], q = P[k + 1];
        if (Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) >= 1) out.push({ o: "v", a: P[k], b: P[k + 1] });
        else if (Math.abs(p.y - q.y) < 1 && Math.abs(p.x - q.x) >= 1) out.push({ o: "h", a: P[k], b: P[k + 1] });
      } return out; };
    for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) {
      const P = paths[i], Q = paths[j];
      if (!P || !Q) continue;
      if (specs[i].src !== specs[j].src && specs[i].tgt !== specs[j].tgt) continue;   // only bundles sharing an end
      let before = pathCross(P, Q);
      if (!before) continue;
      const exI = exOf(specs[i]), exJ = exOf(specs[j]);
      // Swapping the TRACK alone often is not enough — the edge moved to the outer track then crosses the
      // inner one on its way out. The PORTS have to be exchanged with it (the farther target wants the
      // outer port AND the outer track). Moving a port is only safe if the waypoint feeding it moves on
      // the same axis, otherwise the terminal segment turns diagonal; applyPort does both.
      const sharedSrc = specs[i].src === specs[j].src && routes[i]!.es === routes[j]!.es;
      const sharedTgt = specs[i].tgt === specs[j].tgt && routes[i]!.en === routes[j]!.en;
      const applyPort = (idx: number, path: Pt[], which: End) => {
        const node = which === "s" ? R(specs[idx].src) : R(specs[idx].tgt);
        const side = which === "s" ? routes[idx]!.es : routes[idx]!.en;
        const p = pt(node, side, which === "s" ? frac[idx].s : frac[idx].t);
        const end = which === "s" ? path[0] : path[path.length - 1];
        end.x = p.x; end.y = p.y;
        if (path.length > 2) {   // keep the terminal segment orthogonal: its waypoint tracks the port
          const adj = which === "s" ? path[1] : path[path.length - 2];
          adj[side === "T" || side === "B" ? "x" : "y"] = side === "T" || side === "B" ? p.x : p.y;
        }
      };
      const snap = (X: Pt[]) => X.map((p) => ({ x: p.x, y: p.y }));
      const undo = (X: Pt[], S: Pt[]) => X.forEach((p, n) => { p.x = S[n].x; p.y = S[n].y; });
      const swapPorts = (which: End) => {
        if (which === "s") [frac[i].s, frac[j].s] = [frac[j].s, frac[i].s];
        else [frac[i].t, frac[j].t] = [frac[j].t, frac[i].t];
        applyPort(i, P, which); applyPort(j, Q, which);
      };
      let done = false;
      const As = interior(P), Bs = interior(Q);
      // variants, cheapest first: track only → ports only → both
      const variants: string[][] = [["track"], ["port"], ["track", "port"]];
      for (const v of variants) { if (done) break;
        for (const A of As) { if (done) break;
          for (const B of Bs) {
            if (A.o !== B.o) continue;
            const k = A.o === "v" ? "x" : "y";
            if (v.includes("track") && A.a[k] === B.a[k]) continue;
            const sP = snap(P), sQ = snap(Q), fi = { ...frac[i] }, fj = { ...frac[j] };
            if (v.includes("track")) { const pa = A.a[k], pb = B.a[k]; A.a[k] = A.b[k] = pb; B.a[k] = B.b[k] = pa; }
            if (v.includes("port")) { if (sharedSrc) swapPorts("s"); if (sharedTgt) swapPorts("t"); }
            if (!pathHit(P, exI) && !pathHit(Q, exJ) && pathCross(P, Q) < before) { done = true; break; }
            undo(P, sP); undo(Q, sQ); frac[i] = fi; frac[j] = fj;                     // no gain → put it all back
          }
        }
        if (!done && !v.includes("track") && !sharedSrc && !sharedTgt) break;         // nothing a port swap could do
      }
    }

    // C3. STRAIGHTEN micro-jogs. The nudge separates bundles by SEP, which can leave one edge with two
    // nearly-collinear runs joined by a stub a dozen px long — a kink that buys nothing. Pull the stub's
    // ends onto a single track (the dedup below then removes the leftover point); keep it only if the
    // straightened path still clears every icon and hugs no border.
    const ortho = (X: Pt[]) => { for (let n = 0; n < X.length - 1; n++) if (Math.abs(X[n].x - X[n + 1].x) > 1.5 && Math.abs(X[n].y - X[n + 1].y) > 1.5) return false; return true; };
    const JOG = 24;
    // A straightening must not park a run on top of ANOTHER edge: C3 only checked icon clipping, so it
    // would merge two runs onto one track — trading a small kink for two wires drawn over each other.
    const clash = (self: number) => { let n = 0;
      const segs = (X: Pt[]) => { const o: { h: number; pos: number; lo: number; hi: number }[] = []; for (let k = 0; k < X.length - 1; k++) { const p = X[k], q = X[k + 1];
        if (Math.abs(p.y - q.y) < 1) o.push({ h: 1, pos: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
        else if (Math.abs(p.x - q.x) < 1) o.push({ h: 0, pos: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) }); } return o; };
      const A = segs(paths[self]!);
      for (let j = 0; j < paths.length; j++) { if (j === self || !paths[j]) continue;
        for (const u of A) for (const v of segs(paths[j]!))
          if (u.h === v.h && Math.abs(u.pos - v.pos) < SEP && Math.min(u.hi, v.hi) - Math.max(u.lo, v.lo) > 24) n++; }
      return n; };
    paths.forEach((P, i) => {
      if (!P) return;
      const ex = exOf(specs[i]), a = R(specs[i].src), b = R(specs[i].tgt);
      // Judge RELATIVE to the path we started with: an edge crossing from one container into another is
      // already "along" by nature, so demanding a clean sheet would reject every straightening.
      const alongBefore = pathAlong(P, a, b), clashBefore = clash(i);
      for (let k = 1; k + 2 < P.length; k++) {
        const p = P[k], q = P[k + 1];
        const vert = Math.abs(p.x - q.x) < 1, horiz = Math.abs(p.y - q.y) < 1;
        if (vert === horiz) continue;                                  // zero-length or diagonal → skip
        const len = vert ? Math.abs(q.y - p.y) : Math.abs(q.x - p.x);
        if (len < 1 || len >= JOG) continue;                           // only a genuinely tiny stub
        // Collapsing the stub also drags the run on the far side of it: that neighbour shares the track
        // with the endpoint being moved, so moving one without the other would leave a diagonal.
        const prev = P[k - 1], next = P[k + 2];
        const ax = vert ? "y" : "x" as const;
        const save: number[] = [p.x, p.y, q.x, q.y, prev.x, prev.y, next.x, next.y];
        const restore = () => { [p.x, p.y, q.x, q.y, prev.x, prev.y, next.x, next.y] = save; };
        // The first/last points are PORTS, pinned by frac — geom recomputes them, so moving one here only
        // desynchronises the path from the emitted port and leaves a diagonal. Skip options that touch them.
        const prevIsPort = k - 1 === 0, nextIsPort = k + 2 === P.length - 1;
        for (const keep of ["p", "q"] as const) {
          if ((keep === "p" && nextIsPort) || (keep === "q" && prevIsPort)) continue;
          const t = keep === "p" ? p[ax] : q[ax];
          if (keep === "p") { q[ax] = t; next[ax] = t; } else { p[ax] = t; prev[ax] = t; }
          // Moving a neighbour can break ITS own neighbour further along the chain, leaving a diagonal —
          // so the whole path must still be axis-parallel for the straightening to count as an improvement.
          if (ortho(P) && !pathHit(P, ex) && (alongBefore || !pathAlong(P, a, b)) && clash(i) <= clashBefore) break;
          restore();                                                   // worse → put it back, try the other end
        }
      }
    });

    // re-emit nudged paths as explicit polylines (drop points the move made collinear/duplicate)
    paths.forEach((P, i) => { if (!P) return;
      const out = [P[0]];
      for (let k = 1; k < P.length - 1; k++) { const p = out[out.length - 1], q = P[k], n = P[k + 1];
        if ((Math.abs(p.x - q.x) < 1 && Math.abs(q.x - n.x) < 1) || (Math.abs(p.y - q.y) < 1 && Math.abs(q.y - n.y) < 1)) continue;   // collinear
        if (Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1) continue;                                                            // duplicate
        out.push(q);
      }
      out.push(P[P.length - 1]);
      const r0 = routes[i]!; routes[i] = { es: r0.es, en: r0.en, kind: "poly", pts: out.slice(1, -1) };
    });

    // Mark routes whose straight pin→pin line would clip an icon: scaffold must freeze their
    // waypoints too — with no <mxPoint>s, draw.io's re-route (and the geometry audit) can put the
    // path through the very node the router bent around.
    specs.forEach((e, i) => { const r = routes[i]; if (!r) return;
      const g = geom(R(e.src), R(e.tgt), r, frac[i].s, frac[i].t);
      if (g.wp.length && segHit(g.sp, g.ep, exOf(e))) r.freeze = true;
    });

    // D. report residual crossings + parallel overlaps (for verification)
    this._cross = 0;
    specs.forEach((e, i) => { const r = routes[i]; if (!r) return; const a = R(e.src), b = R(e.tgt), ex = exOf(e); if (!clearW(a, b, r, frac[i].s, frac[i].t, ex)) this._cross++; });
    const finSeg: { o: "v" | "h"; pos: number; lo: number; hi: number }[] = [];
    paths.forEach((P) => { if (!P) return;
      for (let k = 1; k < P.length - 2; k++) { const p = P[k], q = P[k + 1];
        if (Math.abs(p.x - q.x) < 1) finSeg.push({ o: "v", pos: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
        else if (Math.abs(p.y - q.y) < 1) finSeg.push({ o: "h", pos: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
      }
    });
    this._overlaps = 0;
    for (let x = 0; x < finSeg.length; x++) for (let y = x + 1; y < finSeg.length; y++) { const a = finSeg[x], b = finSeg[y]; if (a.o === b.o && Math.abs(a.pos - b.pos) < 6 && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 14) this._overlaps++; }

    specs.forEach((e, i) => this._emitEdge(e, routes[i], frac[i]));
  }

  _emitEdge({ src, tgt, label = "", opts = {} }: EdgeSpec, r: Route | null, fr: Frac): void {
    const { dash = false, flow = false, rounded = false, stroke = THEME.edge.stroke, style = "", step = null, badge = null, badgePos = null } = opts;
    // step:N → a plain "N. " number prefix on the edge label (the reference-diagram convention for a
    // numbered walkthrough) — a small text tag, NOT a big filled circle on the line.
    const lbl = step != null ? (label ? `${step}. ${label}` : `${step}.`) : label;
    let st = `edgeStyle=orthogonalEdgeStyle;html=1;rounded=${rounded ? 1 : 0};jettySize=auto;orthogonalLoop=1;fontSize=10;fontColor=${THEME.edge.fontColor};strokeColor=${stroke};strokeWidth=${THEME.edge.strokeWidth};`;
    if (dash) st += "dashed=1;";
    if (flow) st += "flowAnimation=1;";          // animated moving dashes in draw.io / SVG (not PNG)
    if (lbl) st += `labelBackgroundColor=${THEME.edge.labelBg};`;
    let wpXml = "";
    if (r) {
      const a = this.R[src], b = this.R[tgt], r3 = (v: number) => +(+v).toFixed(3);
      const g = geom(a, b, r, fr.s, fr.t);
      const port = (s: Side, f: number) => s === "L" ? { x: 0, y: f } : s === "R" ? { x: 1, y: f } : s === "T" ? { x: f, y: 0 } : { x: f, y: 1 };
      // Snap each port to the side its ADJACENT waypoint actually arrives from, so the terminal
      // segment meets the icon edge head-on instead of piercing through it to a far-side port
      // (the "arrow through the node" bug: cost search can pick a bottom entry while approaching
      // from above). Only for bent edges — a straight edge connects aligned ports and can't pierce.
      // 0.15/0.85, not 0.04/0.96: a port pinned 4% along a side sits visually ON the corner, and the
      // approach lane then runs flush with the icon's own edge ("the wire is glued to the icon").
      const clamp01 = (v: number) => Math.max(0.15, Math.min(0.85, v));
      const snap = (n: Rect, adj: Pt, fb: Pt): Pt => {
        // Inclusive bounds: a waypoint sitting EXACTLY on the icon's edge line (x === n.x) is still a
        // vertical approach. The old strict test called that ambiguous and kept the side port, which is
        // what produced the descent running flush down the icon's border.
        const inX = adj.x >= n.x - 1 && adj.x <= n.x + n.w + 1, inY = adj.y >= n.y - 1 && adj.y <= n.y + n.h + 1;
        if (inX === inY) return fb;                                  // corner / ambiguous → trust the router
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        return inX ? { x: clamp01((adj.x - n.x) / n.w), y: adj.y <= cy ? 0 : 1 }
                   : { x: adj.x <= cx ? 0 : 1, y: clamp01((adj.y - n.y) / n.h) };
      };
      // Work on a copy so the router's own route objects stay untouched, and FIRST drop any end waypoint
      // that merely repeats the port: it adds a pointless elbow, and it made snap() see a neighbour that
      // is "inside the node on both axes" → ambiguous → no snap at all, which is how an edge ended up
      // descending flush along the icon's border.
      const wp = g.wp.map((p) => ({ x: p.x, y: p.y }));
      const same = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1;
      while (wp.length && same(wp[0], g.sp)) wp.shift();
      while (wp.length && same(wp[wp.length - 1], g.ep)) wp.pop();
      const psR = port(r.es, fr.s), peR = port(r.en, fr.t);
      const ps = wp.length ? snap(a, wp[0], psR) : psR;
      const pe = wp.length ? snap(b, wp[wp.length - 1], peR) : peR;
      // Snapping moves the PORT; the waypoint feeding it has to follow on the perpendicular axis, or the
      // terminal segment stops being axis-parallel and draw.io inserts an elbow of its own.
      const align = (n: Rect, p: Pt, q: Pt | undefined) => {
        if (!q) return;
        if (p.y === 0 || p.y === 1) q.x = n.x + p.x * n.w;           // top/bottom port → vertical approach
        else if (p.x === 0 || p.x === 1) q.y = n.y + p.y * n.h;      // left/right port → horizontal approach
      };
      align(a, ps, wp[0]);
      align(b, pe, wp[wp.length - 1]);
      st += `exitX=${ps.x};exitY=${r3(ps.y)};exitDx=0;exitDy=0;entryX=${pe.x};entryY=${r3(pe.y)};entryDx=0;entryDy=0;`;
      // Contract fork: Scaffold omits waypoints (draw.io re-routes from pins on every edit);
      // Bake freezes the router's waypoints as absolute <mxPoint>s. Pins are emitted in BOTH.
      // Exceptions that freeze in scaffold too: (a) LABELED bent edges — the label sits at the path
      // midpoint, and only an explicit corridor waypoint keeps it centered on a straight segment;
      // (b) routes flagged r.freeze — a straight pin→pin re-route would clip a node the router
      // deliberately bent around. (The declarative API has no other way to satisfy the audits.)
      const freeze = this.contract === "bake" || lbl || r.freeze;
      wpXml = (!freeze || !wp.length) ? "" : `<Array as="points">${wp.map((q) => `<mxPoint x="${Math.round(q.x)}" y="${Math.round(q.y)}"/>`).join("")}</Array>`;
    }
    if (style) st += style.endsWith(";") ? style : style + ";";
    const eid = `ed${++this.eid}`;
    this.cells.push(`<mxCell id="${eid}" value="${esc(lbl)}" style="${st}" edge="1" parent="1" source="${src}" target="${tgt}"><mxGeometry relative="1" as="geometry">${wpXml}</mxGeometry></mxCell>`);
    // badge:"1a" → a green step-badge ATTACHED to the edge (a child label with relative geometry, so it
    // rides the line and moves with it). Default sits toward the source when the edge also has a text
    // label (so they don't overlap); badgePos (-1..1 along the edge) overrides. Lettered steps (1a/2b)
    // that step:N can't express.
    if (badge != null) {
      const bx = badgePos != null ? badgePos : (lbl ? -0.6 : 0);
      // offset -12,-12 = half the 24×24 box, so the badge is CENTRED on the line point (not hung below-right).
      this.cells.push(`<mxCell id="${eid}_b" value="${esc(String(badge))}" style="ellipse;whiteSpace=wrap;html=1;fillColor=#3F7D20;strokeColor=#FFFFFF;fontColor=#FFFFFF;fontSize=11;fontStyle=1;align=center;verticalAlign=middle;" vertex="1" connectable="0" parent="${eid}"><mxGeometry x="${bx}" y="0" width="24" height="24" relative="1" as="geometry"><mxPoint x="-12" y="-12" as="offset"/></mxGeometry></mxCell>`);
    }
  }

  // reusable layout helpers
  centerInGapX(a: Rect, b: Rect, w: number) { return centerInGapX(a, b, w); }
  rect(id: string): Vertex { return this.R[id]; }

  /**
   * Node that "spans vertically" (LB/bus/hub) across multiple rows — the kit computes the rect, no numbers/coords at the call site.
   *   spec: { icon, label, w, pad?, fill?, stroke? }
   *   at:   { lane }  (centered in a pre-reserved lane) OR { between:[idA,idB] } (in the gap between 2 nodes)
   *         + { from, to } (height from the top edge of `from` to the bottom edge of `to`)
   */
  spanV(id: string, { icon, label = "", w, pad = 16, fill = "#FFFFFF", stroke = "#5A6B7B" }: { icon?: string; label?: string; w: number; pad?: number; fill?: string; stroke?: string },
    { lane, between, from, to }: { lane?: string; between?: [string, string]; from: string; to?: string }): Vertex {
    const F = this.R[from], T = to ? this.R[to] : F;
    const x = lane ? Math.round(this.R[lane].x + (this.R[lane].w - w) / 2)
                   : centerInGapX(this.R[between![0]], this.R[between![1]], w);
    const y = Math.round(F.y - pad), h = Math.round(T.y + T.h - F.y + pad * 2);
    // Icon + label centred in the bar (not icon-at-top / label-at-bottom, which leaves a hollow middle
    // on a tall span). The centre is also where the fan-in / fan-out edges meet the bus, so it reads right.
    this.box(id, [x, y], [w, h], label, { fill, stroke, va: "middle", fs: 10 });
    if (icon) this.icon(`${id}_ic`, icon, [Math.round(x + (w - 48) / 2), Math.round(y + h / 2 - 70)]);
    return this.R[id];
  }

  toXML(): string {
    this._buildEdges();
    const cellsXml = this.cells.join("");
    // Title centred over the FINAL page width (renderTree has set it to the real content size by now).
    const titleXml = this._titleText
      ? `<mxCell id="__title" value="${esc(this._titleText)}" style="text;html=1;align=center;fontStyle=1;fontSize=${this._titleFs};fontColor=light-dark(#232F3E,#E8E8E8);" vertex="1" parent="1"><mxGeometry x="0" y="24" width="${this.page[0]}" height="30" as="geometry"/></mxCell>`
      : "";
    // emit a separate (locked) layer for the dashed boundary frames, so editing the content layer is easy.
    const boundsLayer = cellsXml.includes('parent="boundaries"') ? `<mxCell id="boundaries" value="Stack boundaries (locked)" parent="0" style="locked=1;"/>` : "";
    return `<mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.page[0]}" pageHeight="${this.page[1]}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boundsLayer}${titleXml}${cellsXml}</root></mxGraphModel>`;
  }
  validate(opts: { strict?: boolean } = { strict: true }) { return validateDiagram(this.c, this.toXML(), opts); }
  mxfile(name = "Diagram"): string { return `<mxfile host="app.diagrams.net"><diagram name="${esc(name)}" id="d">${this.toXML()}</diagram></mxfile>`; }
  // dir: pass the user's workspace explicitly. Default keeps Gemini CLI's env var,
  // then cwd — but any agent that knows its workspace should pass dir to honor the
  // hard rule (write to user's cwd, never the kit repo).
  save(filename: string, dir = process.env.GEMINI_CLI_IDE_WORKSPACE_PATH || process.cwd()): string {
    if (insideKit(dir, filename))   // refuse to pollute the read-only kit repo (see SKILL.md "Where to write")
      throw new Error(`Refusing to save into the kit repo: "${join(dir, filename)}". Pass the user's workspace explicitly, e.g. d.save("${filename}", "/path/to/project").`);
    const fullPath = join(dir, filename);
    writeFileSync(fullPath, this.mxfile(filename));
    process.stderr.write(`Saved diagram to: ${fullPath}\n`); // stdout is MCP's JSON-RPC channel
    return fullPath;
  }
}
