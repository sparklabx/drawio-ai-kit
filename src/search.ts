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

interface Index {
  ms: () => MiniSearch; byFlat: Map<string, CatalogEntry[]>; curated: Map<string, CatalogEntry[]>;
  vocab: () => Map<string, number>; // known term → entry count, for typo correction
}
// ponytail: runtime-built index (bench/RESULTS.md: prebuilt JSON costs more to parse than the build saves).
// MiniSearch itself is built on first use: exact-name and curated-alias hits never need it (one-shot CLI speed).
const INDEXES = new WeakMap<Catalog, Index>();

function indexOf(catalog: Catalog): Index {
  let ix = INDEXES.get(catalog);
  if (ix) return ix;
  const aliases: Record<string, string[]> = JSON.parse(readFileSync(ALIASES, "utf8"));
  const byFlat = new Map<string, CatalogEntry[]>();
  const curated = new Map<string, CatalogEntry[]>(); // alias phrase → entries, in aliases.json order
  const push = (m: Map<string, CatalogEntry[]>, k: string, e: CatalogEntry) => m.set(k, [...(m.get(k) ?? []), e]);
  for (const [n, as] of Object.entries(aliases)) {
    const e = catalog.byName.get(n);
    if (e) for (const a of as) push(curated, words(a).map(stem).join(" "), e);
  }
  for (const e of catalog.byName.values()) push(byFlat, flat(e.name), e);
  let ms: MiniSearch | undefined;
  const build = () => {
    if (ms) return ms;
    ms = new MiniSearch({ fields: ["name", "label", "alias"], idField: "name", tokenize: words, processTerm: stem });
    ms.addAll([...catalog.byName.values()].map((e) => ({
      name: e.name, label: e.label,
      alias: [...(aliases[e.name] ?? []), ...(e.aliases ?? []), ...(e.keywords ?? [])].join(" "),
    })));
    return ms;
  };
  let vocab: Map<string, number> | undefined;
  const buildVocab = () => {
    if (vocab) return vocab;
    vocab = new Map();
    for (const e of catalog.byName.values()) {
      const text = [e.name, e.label, ...(aliases[e.name] ?? []), ...(e.aliases ?? []), ...(e.keywords ?? [])];
      for (const t of new Set([...words(text.join(" ")), flat(e.name), ...text.map(flat)]))
        vocab.set(t, (vocab.get(t) ?? 0) + 1);
    }
    return vocab;
  };
  INDEXES.set(catalog, (ix = { ms: build, byFlat, curated, vocab: buildVocab }));
  return ix;
}

// Optimal string alignment distance (an adjacent swap costs 1), or max+1 once it is certainly above max.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let pp: number[] = [], p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(p[j]! + 1, c[j - 1]! + 1, p[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, pp[j - 2]! + 1);
      c.push(d);
      low = Math.min(low, d);
    }
    if (low > max) return max + 1;
    [pp, p] = [p, c];
  }
  return p[b.length]!;
}

// Did-you-mean: replace a word no icon uses (and no icon word starts with) by the closest known word.
// One edit for 4-letter words, two from 5. Ties go to a word that is itself an icon name or alias, then to
// a word the typo dropped a letter from ("rdis" → redis, not rds), then to the word more icons use. Shorter words stay as typed (mostly acronyms: "rds", "sns").
// ponytail: linear scan of the vocabulary per unknown word (~1 ms); a BK-tree if queries ever batch in bulk.
function correct(toks: string[], ix: Index): string[] {
  const vocab = ix.vocab();
  return toks.map((t) => {
    const st = stem(t);
    if (t.length < 4 || vocab.has(st) || vocab.has(t)) return t;
    for (const v of vocab.keys()) if (v.startsWith(t)) return t; // a prefix being typed, not a typo
    const max = t.length >= 5 ? 2 : 1;
    let best = t, bestKey = [max + 1, 0, 0];
    for (const [v, n] of vocab) {
      const d = editDistance(t, v, max);
      if (d > max) continue;
      const key = [d, ix.byFlat.has(v) || ix.curated.has(stem(v)) ? 0 : 1, v.length < t.length ? 1 : 0, -n];
      if (less(key, bestKey)) [best, bestKey] = [v, key];
    }
    return best;
  });
}
const less = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!; return false; };

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
  const ix = indexOf(catalog);
  const { ms: getMs, byFlat, curated } = ix;
  let toks = words(query);
  const vendor = toks.length > 1 ? toks.map((t) => VENDOR[t]).find(Boolean) : undefined;
  if (vendor) toks = toks.filter((t) => !VENDOR[t]);
  toks = toks.filter((t) => t.length > 1 && !STOP.has(t));
  if (!toks.length) return [];

  // exact (joined) name, then curated alias, beat any score: "nat gateway" → nat_gateway, "aks" → AKS first
  const exactOf = (ts: string[], pred: (e: CatalogEntry) => boolean) =>
    [...new Set([...(byFlat.get(ts.join("")) ?? []), ...(curated.get(ts.map(stem).join(" ")) ?? []),
      ...(curated.get(stem(ts.join(""))) ?? [])])].filter(pred); // "cloud watch" = alias "cloudwatch"
  const run = (ts: string[], pred: (e: CatalogEntry) => boolean): CatalogEntry[] => {
    const filter = (r: { id: string }) => pred(catalog.byName.get(r.id)!);
    const hits = getMs().search(ts.join(" "), { ...OPTS, combineWith: "AND", filter });
    const exact = exactOf(ts, pred);
    return [...exact, ...hits.map((h) => catalog.byName.get(h.id)!).filter((e) => !exact.includes(e))];
  };
  const pred = (e: CatalogEntry) => keep(e) && (!vendor || e.pack === vendor);
  const one = (ts: string[]): CatalogEntry[] => {
    const r = run(ts, pred);
    return r.length || !vendor ? r : run(ts, keep); // vendor has no such icon: fall back to every pack
  };

  // Whole query names one icon or alias: answer without building the index.
  let fast = exactOf(toks, pred);
  if (!fast.length) { toks = correct(toks, ix); fast = exactOf(toks, pred); } // "kubernets" → kubernetes first
  if (fast.length) {
    // ...then pad with its family ("rds" → rds_instance, rds_multi_az): a name prefix scan, still no index.
    const prefixes = [flat(toks.join(" ")) + "_", ...fast.map((e) => e.name + "_")];
    for (const e of catalog.byName.values())
      if (fast.length >= limit) break;
      else if (prefixes.some((p) => e.name.startsWith(p)) && pred(e) && !fast.includes(e)) fast.push(e);
    // A single keyword with a short family stops here; a phrase ("api gateway") still searches for neighbours.
    if (fast.length >= limit || toks.length === 1) return fast.slice(0, limit);
    return [...new Set([...fast, ...general()])].slice(0, limit);
  }
  return general();

  function general(): CatalogEntry[] {
    if (toks.length === 1) return one(toks).slice(0, limit);
    // The head noun is last ("gateway vpc ENDPOINT"): the whole query, then ever shorter tails, is the first list...
    let lead: CatalogEntry[] = [];
    for (let i = 0; i < toks.length - 1 && !lead.length; i++) lead = one(toks.slice(i));
    // ...but a compound icon ("s3_object_lambda") must not hide the other keywords: interleave it with one
    // search per keyword, head noun first.
    const lists = [lead, ...toks.map((t) => one([t])).reverse()];
    const merged: CatalogEntry[] = [];
    for (let i = 0; merged.length < limit && lists.some((l) => i < l.length); i++)
      for (const l of lists) if (i < l.length && !merged.includes(l[i]!)) merged.push(l[i]!);
    return merged.slice(0, limit);
  }
}
