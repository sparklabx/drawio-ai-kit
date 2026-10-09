// Icon search on minisearch: one lazily built index per catalog, curated aliases (data/aliases.json),
// vendor scoping, and per-keyword merging for queries that name several services.
import MiniSearch from "minisearch";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, CatalogEntry } from "./model.ts";

const ALIASES = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "aliases.json");
const STOP = new Set(["a", "an", "the", "of", "for", "to", "in", "on", "and", "or", "with"]);
const VENDOR: Record<string, string> = { aws: "aws", amazon: "aws", azure: "azure", gcp: "gcp", google: "gcp" };

const words = (s: unknown): string[] =>
  String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
// ponytail: strip a plural "s" at index and query time ("queues" = "queue"); a real stemmer if this ever misfires
const stem = (t: string) => (t.length > 3 && /[^s]s$/.test(t) ? t.slice(0, -1) : t);
const flat = (s: unknown) => words(s).join("");

interface Index { ms: MiniSearch; byFlat: Map<string, CatalogEntry[]>; curated: Map<string, CatalogEntry[]> }
// ponytail: runtime-built index (bench/RESULTS.md: prebuilt JSON costs more to parse than the build saves).
const INDEXES = new WeakMap<Catalog, Index>();

function indexOf(catalog: Catalog): Index {
  let ix = INDEXES.get(catalog);
  if (ix) return ix;
  const aliases: Record<string, string[]> = JSON.parse(readFileSync(ALIASES, "utf8"));
  const ms = new MiniSearch({
    fields: ["name", "label", "alias"],
    idField: "name",
    tokenize: words,
    processTerm: stem,
  });
  const byFlat = new Map<string, CatalogEntry[]>();
  const curated = new Map<string, CatalogEntry[]>(); // alias phrase → entries, in aliases.json order
  const push = (m: Map<string, CatalogEntry[]>, k: string, e: CatalogEntry) => m.set(k, [...(m.get(k) ?? []), e]);
  for (const [n, as] of Object.entries(aliases)) {
    const e = catalog.byName.get(n);
    if (e) for (const a of as) push(curated, words(a).map(stem).join(" "), e);
  }
  const docs = [];
  for (const e of catalog.byName.values()) {
    docs.push({
      name: e.name, label: e.label,
      alias: [...(aliases[e.name] ?? []), ...(e.aliases ?? []), ...(e.keywords ?? [])].join(" "),
    });
    push(byFlat, flat(e.name), e);
  }
  ms.addAll(docs);
  INDEXES.set(catalog, (ix = { ms, byFlat, curated }));
  return ix;
}

const OPTS = {
  boost: { name: 3, label: 2, alias: 4 },
    prefix: (t: string) => t.length > 2,
  // two edits (a transposition costs two) from 5 chars; shorter terms are exact (short tokens are mostly acronyms)
  fuzzy: (t: string) => (t.length >= 5 ? 2 : 0),
};

/** Ranked entries for a query. Exact names first; several unrelated keywords are merged round-robin. */
export function searchEntries(
  catalog: Catalog, query: string, limit: number,
  keep: (e: CatalogEntry) => boolean,
): CatalogEntry[] {
  const { ms, byFlat, curated } = indexOf(catalog);
  let toks = words(query);
  const vendor = toks.length > 1 ? toks.map((t) => VENDOR[t]).find(Boolean) : undefined;
  if (vendor) toks = toks.filter((t) => !VENDOR[t]);
  toks = toks.filter((t) => t.length > 1 && !STOP.has(t));
  if (!toks.length) return [];

  const run = (ts: string[], pred: (e: CatalogEntry) => boolean): CatalogEntry[] => {
    const q = ts.join(" ");
    const filter = (r: { id: string }) => pred(catalog.byName.get(r.id)!);
    let hits = ms.search(q, { ...OPTS, combineWith: "AND", filter });
    if (!hits.length && ts.length === 1) hits = ms.search(q, { ...OPTS, filter });
    const out = hits.map((h) => catalog.byName.get(h.id)!);
    // exact (joined) name, then curated alias, beat any score: "nat gateway" → nat_gateway, "aks" → AKS first
    const exact = [...new Set([...(byFlat.get(ts.join("")) ?? []), ...(curated.get(ts.map(stem).join(" ")) ?? [])])].filter(pred);
    return [...exact, ...out.filter((e) => !exact.includes(e))];
  };
  const pred = (e: CatalogEntry) => keep(e) && (!vendor || e.pack === vendor);
  const one = (ts: string[]): CatalogEntry[] => {
    const r = run(ts, pred);
    return r.length || !vendor ? r : run(ts, keep); // vendor has no such icon: fall back to every pack
  };

  // The head noun is last ("gateway vpc ENDPOINT"): try the whole query, then ever shorter tails.
  for (let i = 0; i < toks.length - 1; i++) {
    const tail = one(toks.slice(i));
    if (tail.length) return tail.slice(0, limit);
  }
  if (toks.length === 1) return one(toks).slice(0, limit);
  // No icon matches every keyword → they name different services. One search per keyword, interleaved.
  const lists = toks.map((t) => one([t])).reverse(); // head noun first
  const merged: CatalogEntry[] = [];
  for (let i = 0; merged.length < limit && lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length && !merged.includes(l[i]!)) merged.push(l[i]!);
  return merged.slice(0, limit);
}
