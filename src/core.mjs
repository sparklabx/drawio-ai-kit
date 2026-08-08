// drawio-ai-kit — core engine (zero-dependency, Node >=18, target Node 26)
// Provides: loadCatalog, searchIcon, styleForIcon, styleForGroup, validateDiagram.
// No external libraries so the CLI always runs, even when the MCP SDK is not installed.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOG = join(__dirname, "..", "catalog", "aws.json");

const FAMILY = "mxgraph.aws4";

/** Read the catalog JSON and build a lookup index. */
export function loadCatalog(path = DEFAULT_CATALOG) {
  const file = isAbsolute(path) ? path : join(process.cwd(), path);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  // Each entry carries its pack name (catalog filename) so callers can filter per domain mode.
  const tag = (arr, pack) => arr.map((e) => ({ ...e, pack }));
  const basePack = basename(file, ".json");
  const icons = tag(raw.icons ?? [], basePack);
  const groups = tag(raw.groups ?? [], basePack);
  const categoryColors = { ...(raw.categoryColors ?? {}) };
  // Merge any sibling catalog/*.json icon packs (e.g. bigdata.json, databricks.json) so their
  // icons are searchable alongside AWS. Each pack contributes icons/groups/categoryColors.
  try {
    for (const f of readdirSync(dirname(file))) {
      if (!f.endsWith(".json") || join(dirname(file), f) === file) continue;
      const pack = JSON.parse(readFileSync(join(dirname(file), f), "utf8"));
      const packName = basename(f, ".json");
      if (Array.isArray(pack.icons)) icons.push(...tag(pack.icons, packName));
      if (Array.isArray(pack.groups)) groups.push(...tag(pack.groups, packName));
      // nosemgrep: insecure-object-assign -- merges the kit's own bundled catalog JSON, not user/request input
      Object.assign(categoryColors, pack.categoryColors ?? {});
    }
  } catch { /* no extra packs */ }
  const byName = new Map();
  for (const it of icons) byName.set(it.name, { ...it, kind: "icon" });
  for (const g of groups) byName.set(g.name, { ...g, kind: "group" });
  return { meta: raw.meta ?? {}, categoryColors, icons, groups, byName, validNames: new Set(byName.keys()) };
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Simple match score between the query and an entry. */
function scoreEntry(entry, qTokens, qRaw) {
  const name = norm(entry.name);
  const haystack = norm(
    [entry.name, entry.label, entry.category, entry.tags, ...(entry.aliases ?? []), ...(entry.keywords ?? [])].join(" ")
  );
  let score = 0;
  if (name === qRaw) score += 100; // exact name match
  if (name.replace(/ /g, "") === qRaw.replace(/ /g, "")) score += 60;
  for (const t of qTokens) {
    if (!t) continue;
    if (name.split(" ").includes(t)) score += 25;
    else if (name.includes(t)) score += 12;
    if (haystack.includes(t)) score += 6;
  }
  return score;
}

// ponytail: catalog entries carry zero aliases, so common shorthand returns [] and the agent
// falls back to a plain box. Whole-token expansion here beats editing 12 catalog JSONs.
const QUERY_ALIASES = {
  k8s: "kubernetes", psql: "postgresql", pg: "postgresql", es: "elasticsearch",
  mongo: "mongodb", rabbit: "rabbitmq", "hashicorp": "hashicorp vault",
};

/** Search for an icon/group by keyword. */
export function searchIcon(catalog, query, { category, limit = 8, kind, full = false } = {}) {
  const qTokens = norm(query).split(" ").filter(Boolean).map((t) => QUERY_ALIASES[t] ?? t);
  const qRaw = qTokens.join(" ");
  const cat = category ? norm(category) : null;
  const pool = [...catalog.byName.values()].filter((e) => {
    if (kind && e.kind !== kind) return false;
    if (cat && norm(e.category) !== cat && !norm(e.category).includes(cat)) return false;
    return true;
  });
  const ranked = pool
    .map((e) => ({ entry: e, score: scoreEntry(e, qTokens, qRaw) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => decorate(catalog, r.entry, r.score, { lean: true, compact: !full }));
  return ranked;
}

function colorFor(catalog, entry) {
  return entry.color || catalog.categoryColors[entry.category] || "#232F3E";
}

function decorate(catalog, entry, score, { lean = false, compact = false } = {}) {
  // ponytail: compact = search-result shape. The agent builds with icon("<name>") and the engine
  // resolves the style server-side, so the ~600-char style string (plus fqn/aliases/score) is
  // pure context burn in search output. `drawio-ai style <name>` returns the full entry.
  if (compact) {
    return {
      name: entry.name,
      label: entry.label ?? entry.name,
      category: entry.category ?? null,
      kind: entry.kind,
      color: colorFor(catalog, entry),
    };
  }
  const styleObj = entry.kind === "group" ? styleForGroup(catalog, entry.name) : styleForIcon(catalog, entry.name);
  // ponytail: OSS icons embed a base64 PNG (~15-25KB) in the style. In search results (lean) don't
  // dump it into context — the model only needs the name; builder.icon(name) resolves the style
  // server-side, and get_icon_style(name) (not lean) returns it verbatim if raw XML is needed.
  const style = lean && /image=data:/.test(styleObj.style || "")
    ? `embedded-image; build with icon("${entry.name}") or fetch via get_icon_style`
    : styleObj.style;
  return {
    name: entry.name,
    fqn: `${FAMILY}.${entry.name}`,
    label: entry.label ?? entry.name,
    category: entry.category ?? null,
    kind: entry.kind,
    color: colorFor(catalog, entry),
    aliases: entry.aliases ?? [],
    style,
    ...(styleObj.width ? { width: styleObj.width, height: styleObj.height } : {}),
    ...(score != null ? { score } : {}),
  };
}

/** Full draw.io style for an AWS resource icon (verbatim from the index if available). */
export function styleForIcon(catalog, name, { width, height } = {}) {
  const entry = catalog.byName.get(name);
  if (!entry) return null;
  if (entry.style) return { style: entry.style, width: width ?? entry.w ?? 48, height: height ?? entry.h ?? 48 };
  // hand-built fallback (when the catalog is in the old seed form)
  const color = colorFor(catalog, entry);
  const style =
    `sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=${color};` +
    `strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;` +
    `html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=${FAMILY}.resourceIcon;resIcon=${FAMILY}.${name};`;
  return { style, width: width ?? 48, height: height ?? 48 };
}

/** Style for a group container (AWS Cloud / Region / VPC / AZ ...) — verbatim from the index if available. */
export function styleForGroup(catalog, name) {
  const entry = catalog.byName.get(name);
  if (entry?.style) return { style: entry.style, width: entry.w, height: entry.h };
  const stroke = entry?.stroke || "#232F3E";
  const fill = entry?.fill || "none";
  const style =
    `sketch=0;outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;` +
    `container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=${FAMILY}.group;` +
    `grIcon=${FAMILY}.${name};strokeColor=${stroke};fillColor=${fill};verticalAlign=top;align=left;` +
    `spacingLeft=30;fontColor=${stroke};dashed=${entry?.dashed ? 1 : 0};`;
  return { style };
}

const RE_RESICON = /resIcon=mxgraph\.aws4\.([a-z0-9_]+)/g;
const RE_GRICON = /grIcon=mxgraph\.aws4\.([a-z0-9_]+)/g;
const RE_SHAPE = /shape=mxgraph\.aws4\.([a-zA-Z0-9_]+)/g;
const RE_ID = /\bid="([^"]+)"/g;
const RE_SRC = /\bsource="([^"]+)"/g;
const RE_TGT = /\btarget="([^"]+)"/g;

function collect(re, xml) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * Validate a draw.io XML string:
 *  - whether every resIcon / grIcon exists in the catalog (guards against the AI inventing names)
 *  - whether edges reference existing ids
 *  - a few basic lint checks on icon styles
 * Returns { ok, errors, warnings, stats }.
 */
export function validateDiagram(catalog, xml, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const knownShapeWords = new Set(["resourceIcon", "resourceIcon2", "group", "groupCenter", "productIcon"]);

  // Guard: no <mxCell> at all means there is nothing to validate — most often a COMPRESSED .drawio
  // (draw.io desktop's default save format base64-deflates the <diagram> body). Without this guard
  // the file silently passes as "ok" with zero checks run.
  if (!/<mxCell[\s>]/.test(xml)) {
    const looksCompressed =
      /<diagram[^>]*>[^<\s][A-Za-z0-9+/=\s]{40,}<\/diagram>/.test(xml) || // whole file
      /^[A-Za-z0-9+/=\s]{40,}$/.test(xml.trim());                          // bare tab body (per-tab path)
    errors.push(
      looksCompressed
        ? "No cells found — this .drawio appears to be COMPRESSED (draw.io's default save). Re-export uncompressed: File → Properties → uncheck Compressed, or Extras → Edit Diagram to copy plain XML."
        : "No <mxCell> elements found — nothing to validate (empty or unrecognized file).",
    );
    return { ok: false, errors, warnings, audit: { advice: [] } };
  }

  const resIcons = collect(RE_RESICON, xml);
  const grIcons = collect(RE_GRICON, xml);
  const shapes = collect(RE_SHAPE, xml).filter((s) => !knownShapeWords.has(s));

  const checkRef = (name, where) => {
    if (catalog.validNames.has(name)) return;
    const msg = `Stencil not found in catalog: mxgraph.aws4.${name} (at ${where})`;
    const suggestions = searchIcon(catalog, name.replace(/_/g, " "), { limit: 3 }).map((s) => s.name);
    const full = suggestions.length ? `${msg} — suggestions: ${suggestions.join(", ")}` : msg;
    if (strict || !catalog.meta.incomplete) errors.push(full);
    else warnings.push(full + " (catalog is in seed form and may be incomplete — run the generator to verify)");
  };

  for (const n of resIcons) checkRef(n, "resIcon");
  for (const n of grIcons) checkRef(n, "grIcon");
  for (const n of shapes) checkRef(n, "shape");

  // duplicate id check
  const allIds = collect(RE_ID, xml);
  const ids = new Set(allIds);
  if (allIds.length !== ids.size) {
    const seen = new Set();
    for (const id of allIds) {
      if (seen.has(id)) errors.push(`Duplicate cell id: "${id}" — draw.io silently drops one of the cells, causing missing icons or broken edges.`);
      seen.add(id);
    }
  }

  // edge references
  const dangling = [];
  for (const re of [RE_SRC, RE_TGT]) {
    for (const ref of collect(re, xml)) {
      if (!ids.has(ref)) dangling.push(ref);
    }
  }
  for (const d of [...new Set(dangling)]) {
    warnings.push(`Edge references a non-existent id: "${d}"`);
  }

  // lint: every style containing resourceIcon should have aspect=fixed
  const iconStyles = xml.match(/style="[^"]*mxgraph\.aws4\.resourceIcon[^"]*"/g) ?? [];
  for (const c of iconStyles) {
    if (!/aspect=fixed/.test(c)) {
      warnings.push("resourceIcon missing 'aspect=fixed' → icon may become distorted when resized.");
      break;
    }
  }

  const audit = auditAesthetics(xml);
  audit.advice.push(...auditAwsConventions(catalog, xml));
  warnings.push(...validateAwsHierarchy(xml));
  audit.advice.push(...auditServiceFrames(catalog, xml));
  audit.advice.push(...auditVisualSemantics(xml));
  audit.advice.push(...auditEdgeLabels(xml));
  audit.advice.push(...auditGeometry(xml));
  audit.advice.push(...auditEdges(xml));
  audit.advice.push(...auditBpmn(xml));
  audit.advice.push(...auditArchitecture(xml));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    audit,
    stats: {
      resIcons: resIcons.length,
      grIcons: grIcons.length,
      shapes: shapes.length,
      uniqueStencils: new Set([...resIcons, ...grIcons, ...shapes]).size,
      cellIds: ids.size,
    },
  };
}

const RE_OPENCELL = /<mxCell\b[^>]*?>/g;
function attr(tag, name) {
  // nosemgrep: detect-non-literal-regexp -- `name` is an internal attribute name (fixed set), not external input; pattern is linear
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}
/** Read a numeric style key (exitX=0.5 …) from a style string. */
// nosemgrep: detect-non-literal-regexp -- `k` is an internal style-key name (fixed set), not external input; pattern is linear
const num = (style, k) => { const m = style.match(new RegExp(`(?:^|;)${k}=([\\d.]+)`)); return m ? +m[1] : null; };

/**
 * Aesthetics check derived from comparing the AI-drawn version against the human-corrected one.
 * Only considers edge routing / layout / visual consistency. Returns advisories (not hard errors).
 */
export function auditAesthetics(xml) {
  const advice = [];

  // 1) Font sizes: limit to 3–4 VERTEX sizes (edge-label size is an engine
  //    constant, not a design choice — don't count it against the budget).
  const fontSizes = [];
  let bigCells = 0;
  for (const tag of xml.match(RE_OPENCELL) ?? []) {
    if (/\bedge="1"/.test(tag)) continue;
    const s = num(attr(tag, "style") || "", "fontSize");
    if (s == null) continue;
    fontSizes.push(s);
    if (s >= 16) bigCells++;
  }
  const uniqFonts = [...new Set(fontSizes)].sort((a, b) => a - b);
  if (uniqFonts.length > 4)
    advice.push(`Too many font sizes (${uniqFonts.length}): [${uniqFonts.join(", ")}] — limit to 3–4 sizes for consistency.`);
  // One hero title/band per page may be large; flag repeated oversizing or extremes.
  const big = uniqFonts.filter((s) => s >= 16);
  if (bigCells > 1 || big.some((s) => s > 20))
    advice.push(`Font sizes too large [${big.join(", ")}] on ${bigCells} cells — use ≤ 14 for labels; at most one hero title per page.`);

  // 2) Palette: only count BACKGROUND/BOX colors — ignore AWS icon/group colors (mandated by category).
  const fills = [];
  for (const tag of xml.match(RE_OPENCELL) ?? []) {
    const st = attr(tag, "style") || "";
    if (/mxgraph\.aws4\.(resourceIcon|group)/.test(st)) continue; // icon/group colors are canonical
    const fm = st.match(/fillColor=([^;"}]+)/);
    if (fm) fills.push(fm[1].trim().toLowerCase());
  }
  const uniqFills = [...new Set(fills.filter((c) => c && c !== "none" && c !== "default"))];
  if (uniqFills.length > 8)
    advice.push(`Palette too scattered (${uniqFills.length} background colors) — use a limited palette, reserve strong colors for accents/notes.`);
  if (uniqFills.length && !/light-dark\(/.test(xml))
    advice.push("Consider light-dark(...) color tokens for backgrounds/accents so the diagram looks good in both light & dark mode.");

  // 3) Edges: collect source/target/style of every edge.
  const edges = [];
  for (const tag of xml.match(RE_OPENCELL) ?? []) {
    if (attr(tag, "edge") !== "1") continue;
    edges.push({ source: attr(tag, "source"), target: attr(tag, "target"), style: attr(tag, "style") || "" });
  }
  const bySource = new Map();
  for (const e of edges) {
    if (!e.source) continue;
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source).push(e);
  }
  // fan-out (1 source → ≥3 targets): should use sharp corners + pinned connection points so the parallel edges align.
  for (const [src, list] of bySource) {
    if (list.length < 3) continue;
    if (list.every((e) => /rounded=1/.test(e.style)))
      advice.push(`Fan-out branch from "${src}" (${list.length} edges) should use rounded=0 (sharp corners) instead of rounded.`);
    if (list.every((e) => !/(exitX|entryX)=/.test(e.style)))
      advice.push(`Pin connection points (exitX/exitY, entryX/entryY) for the fan-out branch from "${src}" so the parallel edges align.`);
  }

  // 4) Consistent icon sizes.
  const iconW = [
    ...xml.matchAll(/<mxCell\b[^>]*resourceIcon[^>]*>\s*<mxGeometry\b[^>]*\bwidth="([\d.]+)"/g),
  ].map((m) => Number(m[1]));
  const uniqW = [...new Set(iconW)];
  if (uniqW.length > 2)
    advice.push(`Inconsistent icon sizes [${uniqW.sort((a, b) => a - b).join(", ")}] — should use a single size (e.g. 48 or 78).`);

  return {
    advice,
    metrics: { fontSizes: uniqFonts, fillColors: uniqFills.length, edges: edges.length, fanOutSources: [...bySource.values()].filter((l) => l.length >= 3).length },
  };
}

/**
 * Check conventions specific to AWS architecture:
 *  - icons recolored away from their standard category color (loss of recognizability).
 * Returns advisories.
 */
export function auditAwsConventions(catalog, xml) {
  const advice = [];
  const cells = (xml.match(RE_OPENCELL) ?? []).map((tag) => ({
    id: attr(tag, "id"),
    parent: attr(tag, "parent"),
    edge: attr(tag, "edge"),
    style: attr(tag, "style") || "",
  }));
  // 1) Icon recolored relative to its own standard color.
  for (const c of cells) {
    const m = c.style.match(/resIcon=mxgraph\.aws4\.([a-zA-Z0-9_]+)/);
    if (!m) continue;
    const entry = catalog.byName.get(m[1]);
    if (!entry?.color) continue;
    const fm = c.style.match(/fillColor=([^;]+)/);
    if (!fm) continue;
    const used = fm[1].trim().toLowerCase();
    if (used.startsWith("light-dark")) continue;
    if (used !== String(entry.color).trim().toLowerCase())
      advice.push(`Icon "${m[1]}" has been recolored (fillColor=${fm[1].trim()} ≠ standard color ${entry.color}) — keep the category color for easy recognition.`);
  }

  // 2) Rounded frames — AWS architecture diagrams use SQUARE corners for boxes/frames.
  //    (Skip edges: rounded on an edge smooths its corners, unrelated. Skip AWS stencils & text.)
  const roundedFrames = cells
    .filter((c) => c.edge !== "1" && /(?:^|;)rounded=1/.test(c.style) && !/mxgraph\.aws4\./.test(c.style) && !/(?:^|;)text;/.test(c.style))
    .map((c) => c.id || "?");
  if (roundedFrames.length)
    advice.push(`Rounded frame(s) found (${roundedFrames.length}: ${roundedFrames.slice(0, 6).join(", ")}${roundedFrames.length > 6 ? "…" : ""}) — AWS diagrams use SQUARE corners; set rounded=0 on these boxes/frames.`);

  return advice;
}

const AWS_CLOUD_GROUP = "group_aws_cloud_alt";
const AWS_GROUP_CHAIN = {
  group_account: ["cloud"],
  group_region: ["group_account", "cloud"],
  group_vpc: ["group_region", "group_account", "cloud"],
  group_vpc2: ["group_region", "group_account", "cloud"],
  group_availability_zone: ["group_vpc", "group_region", "group_account", "cloud"],
  group_subnet: ["group_availability_zone", "group_vpc", "group_region", "group_account", "cloud"],
  group_security_group: ["group_subnet", "group_availability_zone", "group_vpc", "group_region", "group_account", "cloud"],
};

/** Enforce the structural AWS parent chain used by diagrams with official AWS services. */
export function validateAwsHierarchy(xml) {
  if (!/mxgraph\.aws4\./.test(xml)) return [];
  const warnings = [];
  const cells = parseCells(xml);
  const byId = new Map(cells.filter((c) => c.id).map((c) => [c.id, c]));
  const groupName = (c) => (c?.style.match(/grIcon=mxgraph\.aws4\.([a-zA-Z0-9_]+)/) || [])[1] || null;
  const serviceName = (c) => {
    const resource = (c.style.match(/resIcon=mxgraph\.aws4\.([a-zA-Z0-9_]+)/) || [])[1];
    if (resource) return resource;
    const shape = (c.style.match(/shape=mxgraph\.aws4\.([a-zA-Z0-9_]+)/) || [])[1];
    if (!shape || ["group", "groupCenter", "productIcon", "resourceIcon", "resourceIcon2"].includes(shape)) return null;
    return shape;
  };
  const ancestors = (c) => {
    const out = [];
    let parent = byId.get(c.parent);
    let guard = 0;
    while (parent && guard++ < 50) {
      const group = groupName(parent);
      if (group) out.push(group === AWS_CLOUD_GROUP ? "cloud" : group === "group_vpc2" ? "group_vpc" : group);
      parent = byId.get(parent.parent);
    }
    return out;
  };
  const follows = (actual, required) => {
    let cursor = 0;
    for (const token of actual) if (token === required[cursor]) cursor++;
    return cursor === required.length;
  };
  const label = (required) => [...required].reverse().map((name) => name === "cloud" ? "AWS Cloud" : ({
    group_account: "AWS Account",
    group_region: "AWS Region",
    group_vpc: "VPC",
    group_availability_zone: "Availability Zone",
    group_subnet: "Subnet",
  }[name] || name)).join(" → ");

  for (const c of cells) {
    if (!c.id || c.edge === "1") continue;
    const group = groupName(c);
    if (group === "group_aws_cloud")
      warnings.push(`AWS container "${c.id}" uses group_aws_cloud — use the black AWS Cloud container group_aws_cloud_alt.`);
    const required = group ? AWS_GROUP_CHAIN[group] : null;
    if (required && !follows(ancestors(c), required))
      warnings.push(`AWS container "${c.id}" (${group}) requires parent chain ${label(required)}.`);

    const service = serviceName(c);
    const serviceFrame = /(?:^|;)serviceFrame=1(?:;|$)/.test(c.style);
    const decorativeBadge = /__ci$/.test(c.id) || (c.geo && c.geo.w < 32 && c.geo.h < 32);
    if ((service || serviceFrame) && !decorativeBadge) {
      const requiredServiceChain = ["group_region", "group_account", "cloud"];
      if (!follows(ancestors(c), requiredServiceChain))
        warnings.push(`AWS service "${c.id}"${service ? ` (${service})` : ""} requires parent chain ${label(requiredServiceChain)}.`);
    }
  }

  return warnings;
}

const IMPLICIT_CROSS_CUTTING_RE = /(?:^|_)(?:identity_and_access_management|iam|cloudformation|cloudwatch(?:_logs)?|cloudtrail|config|audit_manager|security_hub|guardduty|inspector|x_ray|organizations|control_tower|trusted_advisor)(?:_|$)/;

/** Flag prose-heavy cells and operational AWS services with no incident relationship. */
export function auditVisualSemantics(xml) {
  const advice = [];
  if (!/mxgraph\.aws4\.|serviceFrame=1(?:;|")/.test(xml)) return advice;
  const cells = parseCells(xml);
  const hasChildren = new Set(cells.map((c) => c.parent).filter(Boolean));
  const incident = new Set();
  for (const c of cells) {
    if (c.edge !== "1") continue;
    if (c.source) incident.add(c.source);
    if (c.target) incident.add(c.target);
  }
  const serviceName = (c) => {
    const resource = (c.style.match(/resIcon=mxgraph\.aws4\.([a-zA-Z0-9_]+)/) || [])[1];
    if (resource) return resource;
    const shape = (c.style.match(/shape=mxgraph\.aws4\.([a-zA-Z0-9_]+)/) || [])[1];
    if (!shape || ["group", "groupCenter", "productIcon", "resourceIcon", "resourceIcon2"].includes(shape)) return null;
    return shape;
  };
  const words = (value) => {
    const text = String(value || "")
      .replace(/&lt;br\s*\/?&gt;/gi, " ")
      .replace(/&[a-zA-Z0-9#]+;/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/[^\p{L}\p{N}+#/.:-]+/gu, " ")
      .trim();
    return text ? text.split(/\s+/).length : 0;
  };
  const isText = (c) => /(?:^|;)text;/.test(c.style) || c.id === "__title";
  const isContainer = (c) => hasChildren.has(c.id) || /container=1|shape=mxgraph\.aws4\.group|grIcon=/.test(c.style);
  const verbose = [];
  const deploymentNames = [];
  for (const c of cells) {
    if (c.edge === "1" || !c.id || isText(c)) continue;
    const count = words(c.value);
    if (!count) continue;
    const service = serviceName(c);
    const limit = service ? 4 : isContainer(c) ? 5 : 8;
    if (count > limit) verbose.push(`${c.id} (${count} words; cap ${limit})`);
    if (service && /&lt;|&gt;|[<>{}$]|(?:account|region)[_-]?id|\b\d{12}\b|\b(?:us|af|ap|ca|eu|il|me|mx|sa)-(?:gov-)?[a-z]+-\d\b/i.test(c.value || ""))
      deploymentNames.push(c.id);
  }
  if (verbose.length)
    advice.push(`Prose-heavy architecture label(s): ${verbose.slice(0, 5).join(", ")}${verbose.length > 5 ? "…" : ""} — replace explanatory text with icons, containers, and short edge labels; move details to the surrounding document.`);
  if (deploymentNames.length)
    advice.push(`AWS service label(s) contain deployment data, variables, or placeholders: ${deploymentNames.slice(0, 6).join(", ")}${deploymentNames.length > 6 ? "…" : ""} — use short human-readable service names.`);

  const orphans = [];
  for (const c of cells) {
    if (c.edge === "1" || !c.id || incident.has(c.id)) continue;
    const frameIcon = (c.style.match(/(?:^|;)serviceIcon=([^;]+)/) || [])[1];
    const name = serviceName(c) || (/(?:^|;)serviceFrame=1(?:;|$)/.test(c.style) ? frameIcon : null);
    if (!name || IMPLICIT_CROSS_CUTTING_RE.test(name)) continue;
    const geometry = c.absGeo || c.geo;
    if (!geometry || geometry.w < 32 || geometry.h < 32 || /__ci$/.test(c.id)) continue;
    orphans.push(`${c.id} (${name})`);
  }
  if (orphans.length)
    advice.push(`Orphan operational AWS service icon(s): ${orphans.slice(0, 6).join(", ")}${orphans.length > 6 ? "…" : ""} — add a direct producer, consumer, dependency, or data-flow edge. Decorative badges and cross-cutting governance, observability, or provisioning services may remain unwired.`);
  return advice;
}

/** Validate the reusable serviceFrame visual contract emitted by the layout engine. */
export function auditServiceFrames(catalog, xml) {
  const advice = [];
  const cells = parseCells(xml);
  const byId = new Map(cells.filter((c) => c.id).map((c) => [c.id, c]));
  const frames = cells.filter((c) => /(?:^|;)serviceFrame=1(?:;|$)/.test(c.style));
  const borderPatterns = {
    solid: /(?:^|;)dashed=0(?:;|$)/,
    dashed: /(?:^|;)dashPattern=8 4(?:;|$)/,
    dotted: /(?:^|;)dashPattern=1 4(?:;|$)/,
    "dash-dot": /(?:^|;)dashPattern=8 4 1 4(?:;|$)/,
  };
  for (const frame of frames) {
    const iconName = (frame.style.match(/(?:^|;)serviceIcon=([^;]+)/) || [])[1];
    const borderStyle = (frame.style.match(/(?:^|;)serviceBorder=([^;]+)/) || [])[1];
    const fontStyle = Number((frame.style.match(/(?:^|;)fontStyle=(\d+)/) || [])[1] || 0);
    const badge = byId.get(`${frame.id}__ci`);
    const entry = iconName ? catalog.byName.get(iconName) : null;
    const stroke = (frame.style.match(/(?:^|;)strokeColor=([^;]+)/) || [])[1] || "";
    const children = cells.filter((c) => c.parent === frame.id && c.id !== `${frame.id}__ci`);
    if (!iconName || !entry)
      advice.push(`Service frame "${frame.id}" has an unknown or missing serviceIcon — create it with serviceFrame(id, icon, name, opts, children).`);
    if (fontStyle !== 0)
      advice.push(`Service frame "${frame.id}" title is bold or italic — use normal fontStyle=0.`);
    if (!badge || badge.parent !== frame.id || !badge.geo || Math.abs(badge.geo.x) > 0.1 || Math.abs(badge.geo.y) > 0.1)
      advice.push(`Service frame "${frame.id}" corner icon is not flush with the top-left border — place its badge at relative x=0, y=0.`);
    if (!borderPatterns[borderStyle]?.test(frame.style))
      advice.push(`Service frame "${frame.id}" has an invalid border style — use solid, dashed, dotted, or dash-dot.`);
    if (entry?.color && (!stroke.startsWith("light-dark(") || !stroke.toLowerCase().includes(String(entry.color).toLowerCase())))
      advice.push(`Service frame "${frame.id}" border does not follow the ${iconName} category colour in light/dark mode.`);
    if (!children.length)
      advice.push(`Service frame "${frame.id}" has no owned child nodes — use a normal service icon instead.`);
    if (/[<>{}$]|(?:account|region)[_-]?id|\b\d{12}\b|\b(?:us|af|ap|ca|eu|il|me|mx|sa)-(?:gov-)?[a-z]+-\d\b/i.test(frame.value || ""))
      advice.push(`Service frame "${frame.id}" name contains deployment data, a variable, or a placeholder — use a short human-readable service name.`);
    let parent = byId.get(frame.parent);
    let depth = 1;
    while (parent) {
      if (/(?:^|;)serviceFrame=1(?:;|$)/.test(parent.style)) depth++;
      parent = byId.get(parent.parent);
    }
    if (depth > 2)
      advice.push(`Service frame "${frame.id}" is nested ${depth} service boundaries deep — flatten the diagram or use an edge.`);
  }
  return advice;
}

/** Parse every mxCell (with geometry & waypoint flag) for coordinate-based checks. */
function parseCells(xml) {
  const out = [];
  for (const ch of xml.split(/<mxCell\b/).slice(1)) {
    const end = ch.indexOf(">");
    const head = ch.slice(0, end + 1);
    const body = ch.slice(end + 1);
    // nosemgrep: detect-non-literal-regexp -- `n` is an internal attribute name (fixed set), not external input; pattern is linear
    const a = (n) => { const m = head.match(new RegExp(`\\b${n}="([^"]*)"`)); return m ? m[1] : null; };
    let geo = null;
    const g = body.match(/<mxGeometry\b[^>]*?(?:\/>|>)/);
    if (g) {
      const t = g[0];
      const gx = t.match(/\bx="(-?[\d.]+)"/), gy = t.match(/\by="(-?[\d.]+)"/);
      const gw = t.match(/\bwidth="([\d.]+)"/), gh = t.match(/\bheight="([\d.]+)"/);
      if (gx && gy && gw && gh) geo = { x: +gx[1], y: +gy[1], w: +gw[1], h: +gh[1] };
    }
    const wp = [...body.matchAll(/<mxPoint\s+x="(-?[\d.]+)"\s+y="(-?[\d.]+)"\s*\/>/g)].map((m) => ({ x: +m[1], y: +m[2] }));
    out.push({ id: a("id"), parent: a("parent"), source: a("source"), target: a("target"), edge: a("edge"), value: a("value"), style: a("style") || "", hasPoints: /as="points"/.test(body), wp, geo });
  }
  // resolve ABSOLUTE coordinates for nested cells (geometry in the XML is relative to the parent)
  const byId = new Map(out.filter((c) => c.id).map((c) => [c.id, c]));
  for (const c of out) {
    if (!c.geo) continue;
    let ax = c.geo.x, ay = c.geo.y, p = byId.get(c.parent), guard = 0;
    while (p && p.geo && guard++ < 50) { ax += p.geo.x; ay += p.geo.y; p = byId.get(p.parent); }
    c.absGeo = { x: ax, y: ay, w: c.geo.w, h: c.geo.h };
  }
  return out;
}

/**
 * Edge labels on bent routes (L/Z): when source & target are offset in both X and Y but the edge
 * has no waypoint, the label (by default at the midpoint of the arc) tends to fall on the bend / box
 * edge → it looks misaligned.
 * Recommendation: add one waypoint in the middle of the corridor so the label sits centered on a straight segment.
 */
export function auditEdgeLabels(xml) {
  const advice = [];
  const bentLabels = [];
  const cells = parseCells(xml);
  const geoOf = new Map();
  for (const c of cells) if (c.geo && c.id) geoOf.set(c.id, c.absGeo || c.geo);
  // absolute connection point: prefer pinned exit/entry, otherwise use the node center
  const point = (g, fx, fy) => ({ x: g.x + (fx != null ? fx : 0.5) * g.w, y: g.y + (fy != null ? fy : 0.5) * g.h });
  for (const c of cells) {
    if (c.edge !== "1") continue;
    const label = (c.value || "").trim();
    if (!label || c.hasPoints) continue;
    const sg = geoOf.get(c.source), tg = geoOf.get(c.target);
    if (!sg || !tg) continue;
    const ep = point(sg, num(c.style, "exitX"), num(c.style, "exitY"));
    const np = point(tg, num(c.style, "entryX"), num(c.style, "entryY"));
    const straight = Math.abs(ep.y - np.y) <= 8 || Math.abs(ep.x - np.x) <= 8; // horizontally or vertically straight
    if (!straight) bentLabels.push(`"${label}"`);
  }
  // ponytail: one aggregated line — the per-label sentence repeated N times cost ~170 B per finding
  // in every validate pass of every fix iteration
  if (bentLabels.length)
    advice.push(`Edge label(s) ${bentLabels.join(", ")} sit on a bent route (L/Z) — add one waypoint in the middle of each corridor so the label sits centered on a straight segment.`);
  return advice;
}

/**
 * Geometric audit — catches the visual bugs that name/color/nesting checks miss, WITHOUT a render:
 *  1. a child cell spilling outside its parent container ("box exceeds its frame"),
 *  2. two sibling leaf cells whose boxes PARTIALLY overlap (a real collision, not intentional layering),
 *  3. multiple edges entering one target at the same point (stacked arrowheads).
 * Works off absolute geometry resolved through the parent chain. Tuned to avoid false positives on
 * intentional layering (a badge icon fully inside a box, a bus spanning across a container).
 */
export function auditGeometry(xml) {
  const advice = [];
  const cells = parseCells(xml);
  const byId = new Map(cells.filter((c) => c.id).map((c) => [c.id, c]));
  const hasChildren = new Set(cells.map((c) => c.parent).filter(Boolean));
  const TOL = 3;
  const box = (c) => c.absGeo || c.geo;
  const isText = (c) => /(?:^|;)text;/.test(c.style) || c.id === "__title";
  const isContainer = (c) => /container=1|shape=mxgraph\.aws4\.group|grIcon=/.test(c.style) || hasChildren.has(c.id);
  const isVertex = (c) => c.edge !== "1" && c.geo && c.id && !isText(c);
  const contains = (a, b) => b.x >= a.x - TOL && b.y >= a.y - TOL && b.x + b.w <= a.x + a.w + TOL && b.y + b.h <= a.y + a.h + TOL;

  // 1) child spilling outside its parent container
  for (const c of cells) {
    if (!isVertex(c)) continue;
    const p = byId.get(c.parent);
    if (!p || !p.geo) continue;                 // parent must be a real container box (not root layer "1")
    const cb = box(c), pb = box(p);
    if (cb.x < pb.x - TOL || cb.y < pb.y - TOL || cb.x + cb.w > pb.x + pb.w + TOL || cb.y + cb.h > pb.y + pb.h + TOL)
      advice.push(`Cell "${c.id}" spills outside its container "${c.parent}" — enlarge the frame or shrink/reposition the child.`);
  }

  // 2) overlapping sibling LEAF cells (same parent, neither a container, partial overlap only)
  const sibsOf = new Map();
  for (const c of cells) {
    if (!isVertex(c) || isContainer(c)) continue;
    (sibsOf.get(c.parent) ?? sibsOf.set(c.parent, []).get(c.parent)).push(c);
  }
  const seen = new Set();
  for (const [, sibs] of sibsOf) {
    for (let i = 0; i < sibs.length; i++) for (let j = i + 1; j < sibs.length; j++) {
      const a = box(sibs[i]), b = box(sibs[j]);
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix <= TOL || iy <= TOL) continue;                       // not overlapping
      if (contains(a, b) || contains(b, a)) continue;             // intentional layering (badge in box)
      const minArea = Math.min(a.w * a.h, b.w * b.h);
      if (ix * iy < minArea * 0.2) continue;                      // ignore slight touches
      const key = [sibs[i].id, sibs[j].id].sort().join("|");
      if (seen.has(key)) continue; seen.add(key);
      advice.push(`Cells "${sibs[i].id}" and "${sibs[j].id}" overlap — space them apart (the layout engine keeps siblings from colliding).`);
    }
  }

  // 3) stacked arrowheads: ≥2 edges into the same target at the same entry point
  const entryCount = new Map();
  for (const c of cells) {
    if (c.edge !== "1" || !c.target) continue;
    const ex = (c.style.match(/entryX=([\d.]+)/) ?? [, "c"])[1];
    const ey = (c.style.match(/entryY=([\d.]+)/) ?? [, "c"])[1];
    const k = `${c.target}@${ex},${ey}`;
    entryCount.set(k, (entryCount.get(k) ?? 0) + 1);
  }
  for (const [k, n] of entryCount) if (n > 1)
    advice.push(`${n} edges enter "${k.split("@")[0]}" at the same point — spread their entry points so the arrowheads don't stack (fan-in).`);

  return advice;
}

// Databases are detected by name (the catalog "Database" category is noisy — it also tags cloud9,
// application_composer, cdk…). This list covers the data stores that must not sit in a public subnet.
const DB_NAME_RE = /^(rds|aurora|dynamodb|documentdb|docdb|redshift|elasticache|memorydb|neptune|timestream|database|memcached|opensearch|elasticsearch)/;

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
export function auditArchitecture(xml) {
  const advice = [];
  if (!/mxgraph\.aws4\./.test(xml)) return advice;   // gate: only AWS diagrams
  const cells = parseCells(xml);
  const byId = new Map(cells.filter((c) => c.id).map((c) => [c.id, c]));
  const iconName = (c) => (c.style.match(/resIcon=mxgraph\.aws4\.([a-z0-9_]+)/) ?? [])[1] ?? null;
  const isSubnet = (c) => /grIcon=mxgraph\.aws4\.group_subnet\b/.test(c.style);
  const isAZ = (c) => /grIcon=mxgraph\.aws4\.group_availability_zone\b/.test(c.style);
  const ancestors = (c) => { const o = []; let p = byId.get(c.parent), g = 0; while (p && g++ < 50) { o.push(p); p = byId.get(p.parent); } return o; };

  const icons = cells.map((c) => ({ c, name: iconName(c) })).filter((x) => x.name);
  const natCount = icons.filter((x) => /^nat_gateway/.test(x.name)).length;
  const azCount = cells.filter(isAZ).length;

  // Rule 1 — database in a PUBLIC subnet (Security)
  for (const { c, name } of icons) {
    if (!DB_NAME_RE.test(name)) continue;
    const sub = ancestors(c).find(isSubnet);
    if (sub && /public/i.test(sub.value || "")) {
      advice.push(`[well-arch] Database "${c.id}" (${name}) sits in a PUBLIC subnet ("${(sub.value || "").trim()}") — risk: the data store is directly reachable from the internet. Fix: move it to a private subnet and reach it via the app tier or a VPC endpoint. (Well-Architected: Security)`);
    }
  }

  // Rule 2 — single NAT gateway across multiple AZs (Reliability SPOF)
  if (azCount >= 2 && natCount === 1) {
    advice.push(`[well-arch] A single NAT gateway serves ${azCount} availability zones — risk: it is a single point of failure; if that AZ fails, every private subnet loses outbound internet. Fix: deploy one NAT gateway per AZ. (Well-Architected: Reliability)`);
  }

  return advice;
}

// Do two segments (p1-p2, p3-p4) properly cross? (orientation test, excludes shared endpoints)
function segsIntersect(p1, p2, p3, p4) {
  const o = (a, b, c) => Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
  const o1 = o(p1, p2, p3), o2 = o(p1, p2, p4), o3 = o(p3, p4, p1), o4 = o(p3, p4, p2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/**
 * Edge orchestration audit — catches the "ugly lines" the static checks miss, WITHOUT a render:
 *  1. very long connectors that span most of the diagram (a sign a node is parked far from its
 *     consumers — e.g. shared ECR/S3/CloudWatch dumped in a far row → long detour edges);
 *  2. an excessive number of edge crossings (the flow is tangled).
 * Both are PLACEMENT smells: the fix is to move nodes closer / group fan-out-fan-in, not to reroute.
 */
export function auditEdges(xml) {
  const advice = [];
  const cells = parseCells(xml);
  const boxOf = (c) => c.absGeo || c.geo;
  const geoOf = new Map();
  for (const c of cells) if (c.edge !== "1" && (c.absGeo || c.geo) && c.id) geoOf.set(c.id, boxOf(c));
  if (geoOf.size === 0) return advice;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of geoOf.values()) { minX = Math.min(minX, g.x); minY = Math.min(minY, g.y); maxX = Math.max(maxX, g.x + g.w); maxY = Math.max(maxY, g.y + g.h); }
  const W = Math.max(1, maxX - minX), H = Math.max(1, maxY - minY);
  const center = (g) => ({ x: g.x + g.w / 2, y: g.y + g.h / 2 });

  const segs = [];
  for (const c of cells) {
    if (c.edge !== "1" || !c.source || !c.target) continue;
    const s = geoOf.get(c.source), t = geoOf.get(c.target);
    if (!s || !t) continue;
    segs.push({ a: center(s), b: center(t), src: c.source, tgt: c.target, dashed: /dashed=1/.test(c.style) });
  }
  if (segs.length === 0) return advice;

  // 1) long detour connectors: edges spanning most of the diagram. A few are normal (a DR link,
  //    a cross-account trust); but ≥3 is the signature of a node parked far from its consumers
  //    (e.g. shared ECR/S3/CloudWatch dumped in a far row) — every reference becomes a long line.
  // absolute floor: in a tiny diagram (a handful of nodes) EVERY edge spans "most of the diagram" —
  // proportional-only thresholds misfire there. Long means proportionally AND absolutely long.
  const longs = segs.filter((e) =>
    (Math.abs(e.a.y - e.b.y) > 0.45 * H && Math.abs(e.a.y - e.b.y) > 500) ||
    (Math.abs(e.a.x - e.b.x) > 0.55 * W && Math.abs(e.a.x - e.b.x) > 700));
  if (longs.length >= 3) {
    const names = longs.slice(0, 4).map((e) => `${e.src}→${e.tgt}`);
    advice.push(`Long connector(s) spanning most of the diagram (${longs.length}: ${names.join(", ")}${longs.length > 4 ? "…" : ""}) — place these nodes closer; keep shared resources (ECR/S3/CloudWatch/registries) in a band NEXT TO their consumers instead of a far-away row, to avoid long detour edges.`);
  }

  // 2) tangled flow (too many crossings)
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const e = segs[i], f = segs[j];
    if (e.src === f.src || e.src === f.tgt || e.tgt === f.src || e.tgt === f.tgt) continue; // share an endpoint
    if (segsIntersect(e.a, e.b, f.a, f.b)) crossings++;
  }
  if (crossings > Math.max(4, Math.round(segs.length * 0.3)))
    advice.push(`${crossings} edge crossings — the flow looks tangled. Align the main flow on one row (spine), group fan-out/fan-in through a shared lane, and place shared nodes near their consumers.`);

  // 3) clearance: an edge's ACTUAL routed path (exit → waypoints → entry) must not run through a
  //    node it isn't connected to. Walls/containers (nodes holding an endpoint) are skipped.
  const onEdge = (g, fx, fy) => ({ x: g.x + (fx ?? 0.5) * g.w, y: g.y + (fy ?? 0.5) * g.h });
  const holds = (p, q) => q.x >= p.x - 2 && q.y >= p.y - 2 && q.x + q.w <= p.x + p.w + 2 && q.y + q.h <= p.y + p.h + 2;
  const segHitsRect = (a, b, r) => {                // segment passes through the node's CORE (not grazing its edge)
    const ix = Math.min(r.w, r.h) * 0.3;
    return Math.max(a.x, b.x) > r.x + ix && Math.min(a.x, b.x) < r.x + r.w - ix &&
           Math.max(a.y, b.y) > r.y + ix && Math.min(a.y, b.y) < r.y + r.h - ix;
  };
  const hasChildren = new Set(cells.map((c) => c.parent).filter(Boolean));
  const isContainer = (c) => hasChildren.has(c.id) || /container=1|shape=mxgraph\.aws4\.group|grIcon=/.test(c.style) || /fillColor=none/.test(c.style);
  const vts = cells
    .filter((c) => c.edge !== "1" && c.id && (c.absGeo || c.geo) && !isContainer(c) && !/(?:^|;)text;/.test(c.style))
    .map((c) => ({ id: c.id, r: boxOf(c) }))
    .filter((v) => v.r.w > 2 && v.r.h > 2);
  const hit = new Set();
  for (const c of cells) {
    if (c.edge !== "1" || !c.source || !c.target) continue;
    const sg = geoOf.get(c.source), tg = geoOf.get(c.target);
    if (!sg || !tg) continue;
    const poly = [onEdge(sg, num(c.style, "exitX"), num(c.style, "exitY")), ...(c.wp || []), onEdge(tg, num(c.style, "entryX"), num(c.style, "entryY"))];
    for (const v of vts) {
      if (v.id === c.source || v.id === c.target) continue;
      if (holds(v.r, sg) || holds(v.r, tg)) continue;   // a container of an endpoint
      for (let i = 0; i < poly.length - 1; i++) {
        if (segHitsRect(poly[i], poly[i + 1], v.r)) { hit.add(`${c.source}→${c.target} ⟂ ${v.id}`); break; }
      }
    }
  }
  if (hit.size)
    advice.push(`Edge(s) run THROUGH a node they don't connect to (${[...hit].slice(0, 4).join(", ")}${hit.size > 4 ? "…" : ""}) — reroute so the connector bends around the node instead of passing through it.`);

  // 4) floating arrowheads: edges anchored to a transparent leaf (not a real container)
  // hasChildren guards out AWS Cloud/Region/AZ/VPC group frames — those use fillColor=none legitimately.
  const isEmptyLeaf = (x) => {
    if (x.edge === "1" || hasChildren.has(x.id)) return false;
    // clusterBox boundary frames (kit puts them on the "boundaries" layer) are LEGITIMATE edge
    // anchors — the rules explicitly say to link the cluster, not each replica inside it.
    if (x.parent === "boundaries") return false;
    const style = x.style || "";
    if (/(?:^|;)text;/.test(style) || x.id === "__title") return false;
    return /fillColor=none/.test(style) && !/grIcon=/.test(style);
  };
  const emptyLeaves = new Set(cells.filter(isEmptyLeaf).map((x) => x.id));
  const floaters = [];
  for (const c of cells) {
    if (c.edge !== "1") continue;
    if (c.target && emptyLeaves.has(c.target)) floaters.push(`${c.source}→${c.target}`);
    if (c.source && emptyLeaves.has(c.source)) floaters.push(`${c.source}→${c.target} (source)`);
  }
  if (floaters.length) {
    advice.push(`Edge(s) connect to an invisible leaf node (${[...new Set(floaters)].slice(0, 4).join(", ")}${floaters.length > 4 ? "…" : ""}) — anchor to a solid icon card instead of a transparent placeholder.`);
  }

  return advice;
}
/** BPMN semantic checks (gated: only runs when mxgraph.bpmn shapes are present).
 *  - gateway must split (≥2 outgoing) or merge (≥2 incoming) sequence flow
 *  - start event has no incoming; end event has no outgoing
 *  - no orphan flow object (a node connected to no sequence flow)
 *  ponytail: shape-name whitelist dropped — bpmn.mjs creators throw at build time on unknown names
 *  (engine path can't emit an invalid stencil), and draw.io's BPMN stencil vastly exceeds our Tier-1
 *  set so strict whitelisting would false-flag legitimate shapes. Cross-pool sequence-flow check
 *  deferred (needs pool-membership resolution from coordinates; single-pool is the Tier-1 norm). */
export function auditBpmn(xml) {
  const cells = parseCells(xml);
  const shape = (style) => (style.match(/shape=mxgraph\.bpmn\.([^;]+)/) || [])[1] || "";
  const flow = cells.filter((c) => c.style && /shape=mxgraph\.bpmn\./.test(c.style));
  if (flow.length === 0) return [];              // not a BPMN diagram
  const outDeg = new Map(), inDeg = new Map();
  for (const c of cells) {
    if (c.edge !== "1" || !c.source || !c.target) continue;
    outDeg.set(c.source, (outDeg.get(c.source) || 0) + 1);
    inDeg.set(c.target, (inDeg.get(c.target) || 0) + 1);
  }
  const deg = (id, m) => m.get(id) || 0;
  const advice = [];
  for (const c of flow) {
    const sh = shape(c.style), outl = (c.style.match(/outline=([^;]+)/) || [])[1] || "", out = deg(c.id, outDeg), ins = deg(c.id, inDeg);
    const isGateway = /^gateway/.test(sh);
    const isStart = /^event/.test(sh) && outl === "standard";   // parametric: outline=standard → start event
    const isEnd = /^event/.test(sh) && outl === "end";           // parametric: outline=end → end event
    if (isGateway && out < 2 && ins < 2)
      advice.push(`BPMN gateway "${c.id}" neither splits (≥2 outgoing) nor merges (≥2 incoming) — a gateway should branch or join paths.`);
    if (isStart && ins > 0)
      advice.push(`BPMN start event "${c.id}" has an incoming sequence flow — a start event initiates the flow and should have no incoming edges.`);
    if (isEnd && out > 0)
      advice.push(`BPMN end event "${c.id}" has an outgoing sequence flow — an end event terminates the flow and should have no outgoing edges.`);
    if (out === 0 && ins === 0)
      advice.push(`BPMN flow object "${c.id}" (${sh}) is not connected to any sequence flow — orphan node.`);
  }
  return advice;
}

export function listCategories(catalog, { excludePacks } = {}) {
  const counts = new Map();
  for (const e of catalog.byName.values()) {
    if (excludePacks?.has(e.pack)) continue;
    const c = e.category ?? "(none)";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([category, count]) => ({ category, count }));
}

export function getIcon(catalog, name) {
  const e = catalog.byName.get(name);
  return e ? decorate(catalog, e) : null;
}
