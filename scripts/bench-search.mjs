#!/usr/bin/env node
// Search-quality + latency benchmark for icon search (black-box: dist/kit.mjs + dist/cli.mjs).
//
//   node scripts/bench-search.mjs                       # human report
//   node scripts/bench-search.mjs --json --out bench/search/baseline.json
//   node scripts/bench-search.mjs --compare bench/search/baseline.json   # exit 1 if quality drops
//
// Flags: --queries <file> (default bench/search/queries.json), --iters <n> (latency samples per query, default 20),
//        --cold-runs <n> (fresh-process index build samples, default 5), --no-cli (skip CLI spawns),
//        --tolerance <x> (allowed metric drop for --compare, default 0), --max-latency-ratio <r> (optional latency gate).
// Runs on Node >=18 and Bun. Metric definitions live in bench/search/queries.json "notes".

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(ROOT, "dist", "kit.mjs");
const CLI = join(ROOT, "dist", "cli.mjs");
const DEPTH = 20; // ranks are measured to this depth so MRR sees near-misses
const DEFAULT_LIMIT = 8; // CLI default; maxResults is judged at this limit

function parseArgs(argv) {
  const f = { json: false, cli: true, iters: 20, coldRuns: 5, tolerance: 0, queries: join(ROOT, "bench/search/queries.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === "--json") f.json = true;
    else if (a === "--out") f.out = v();
    else if (a === "--compare") f.compare = v();
    else if (a === "--queries") f.queries = v();
    else if (a === "--iters") f.iters = Number(v());
    else if (a === "--cold-runs") f.coldRuns = Number(v());
    else if (a === "--no-cli") f.cli = false;
    else if (a === "--tolerance") f.tolerance = Number(v());
    else if (a === "--max-latency-ratio") f.maxLatencyRatio = Number(v());
    else { console.error(`unknown flag: ${a}`); process.exit(2); }
  }
  return f;
}

const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] ?? s[0];
};
const median = (xs) => quantile(xs, 0.5);
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

// Comma = CLI batch contract (split, one search per part); otherwise one call.
const parts = (q) => (q.includes(",") ? q.split(",").map((s) => s.trim()).filter(Boolean) : [q]);

function runLib(searchIcon, catalog, q, limit) {
  return parts(q).map((p) => searchIcon(catalog, p, { limit }).map((r) => r.name));
}

function runCli(q, limit) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [CLI, "search", q, "--limit", String(limit)], { encoding: "utf8" });
  const ms = performance.now() - t0;
  if (r.status !== 0) return { error: (r.stderr || "").trim() || `exit ${r.status}`, ms };
  const out = JSON.parse(r.stdout);
  const lists = Array.isArray(out) ? [out] : parts(q).map((p) => out[p] ?? []);
  return { lists: lists.map((l) => l.map((x) => x.name)), ms };
}

function scoreQuery(q, lists) {
  const rankOf = (names) => {
    let best = Infinity;
    for (const l of lists) for (const n of names) { const i = l.indexOf(n); if (i >= 0 && i + 1 < best) best = i + 1; }
    return best;
  };
  const groups = q.expect.map((names) => ({ names, rank: rankOf(names) }));
  const G = groups.length;
  const topK = lists.flatMap((l) => l.slice(0, q.k));
  const count = Math.max(...lists.map((l) => Math.min(l.length, DEFAULT_LIMIT)), 0);
  const forbidden = (q.forbid ?? []).filter((n) => topK.includes(n));
  const hitK = groups.filter((g) => g.rank <= q.k).length;
  const hit1 = groups.filter((g) => g.rank <= Math.max(1, G)).length;
  const reasons = [];
  for (const g of groups) if (g.rank > q.k) reasons.push(`missing ${g.names[0]}${g.names.length > 1 ? "|…" : ""} (rank ${g.rank === Infinity ? `>${DEPTH}` : g.rank}, k=${q.k})`);
  if (q.maxResults != null && count > q.maxResults) reasons.push(`${count} results > maxResults ${q.maxResults}`);
  for (const n of forbidden) reasons.push(`forbidden ${n} in top ${q.k}`);
  return {
    id: q.id, scenario: q.scenario, query: q.query, k: q.k,
    pass: reasons.length === 0, reasons,
    groups: G, hitK, hit1, rr: groups.reduce((s, g) => s + (g.rank === Infinity ? 0 : 1 / g.rank), 0),
    ranks: groups.map((g) => (g.rank === Infinity ? null : g.rank)),
    top: lists.map((l) => l.slice(0, 5)),
  };
}

function aggregate(rows) {
  const g = rows.reduce((s, r) => s + r.groups, 0);
  return {
    queries: rows.length,
    passRate: round(rows.filter((r) => r.pass).length / rows.length),
    recallAt1: g ? round(rows.reduce((s, r) => s + r.hit1, 0) / g) : null,
    recallAtK: g ? round(rows.reduce((s, r) => s + r.hitK, 0) / g) : null,
    mrr: g ? round(rows.reduce((s, r) => s + r.rr, 0) / g) : null,
  };
}

function coldBuild(runs) {
  // Fresh process each time: import + loadCatalog + first search (covers lazily built indexes).
  const code = `
    const { performance } = await import("node:perf_hooks");
    const t0 = performance.now();
    const kit = await import(${JSON.stringify(pathToFileURL(KIT).href)});
    const t1 = performance.now();
    const c = kit.loadCatalog();
    const t2 = performance.now();
    kit.searchIcon(c, "kubernetes");
    const t3 = performance.now();
    console.log(JSON.stringify({ importMs: t1 - t0, loadMs: t2 - t1, firstSearchMs: t3 - t2, totalMs: t3 - t0 }));`;
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`cold build failed: ${r.stderr}`);
    samples.push(JSON.parse(r.stdout.trim().split("\n").pop()));
  }
  const pick = (k) => round(median(samples.map((s) => s[k])), 2);
  return { runs, importMs: pick("importMs"), loadCatalogMs: pick("loadMs"), firstSearchMs: pick("firstSearchMs"), totalMs: pick("totalMs") };
}

async function main() {
  const f = parseArgs(process.argv.slice(2));
  const { loadCatalog, searchIcon } = await import(pathToFileURL(KIT).href);
  const catalog = loadCatalog();
  const { queries } = JSON.parse(readFileSync(f.queries, "utf8"));

  // Guard the labels: every expected/forbidden name must exist, or the set itself is wrong.
  const unknown = queries.flatMap((q) => [...q.expect.flat(), ...(q.forbid ?? [])].filter((n) => !catalog.byName.has(n)).map((n) => `${q.id}: ${n}`));
  if (unknown.length) { console.error(`unknown icon names in query set:\n  ${unknown.join("\n  ")}`); process.exit(2); }
  const dupes = queries.map((q) => q.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupes.length) { console.error(`duplicate query ids: ${dupes.join(", ")}`); process.exit(2); }

  const rows = [];
  const perQueryMedian = [];
  const allSamples = [];
  const cliMismatch = [];
  const cliMs = [];
  for (const q of queries) {
    const limit = Math.max(DEPTH, q.k);
    const lists = runLib(searchIcon, catalog, q.query, limit);
    const row = scoreQuery(q, lists);
    for (let i = 0; i < 3; i++) runLib(searchIcon, catalog, q.query, DEFAULT_LIMIT); // warmup
    const s = [];
    for (let i = 0; i < f.iters; i++) {
      const t0 = performance.now();
      runLib(searchIcon, catalog, q.query, DEFAULT_LIMIT);
      s.push(performance.now() - t0);
    }
    row.medianMs = round(median(s), 3);
    perQueryMedian.push(row.medianMs);
    allSamples.push(...s);
    if (f.cli && q.cli) {
      const c = runCli(q.query, limit);
      cliMs.push(c.ms);
      const same = !c.error && JSON.stringify(c.lists) === JSON.stringify(lists);
      row.cliAgrees = same;
      if (!same) cliMismatch.push({ id: q.id, error: c.error ?? null, cli: c.lists?.map((l) => l.slice(0, 5)) ?? null, lib: lists.map((l) => l.slice(0, 5)) });
    }
    rows.push(row);
  }

  const scenarios = {};
  for (const name of [...new Set(rows.map((r) => r.scenario))]) scenarios[name] = aggregate(rows.filter((r) => r.scenario === name));
  const report = {
    tool: "bench-search", version: 1, date: new Date().toISOString(),
    runtime: typeof Bun !== "undefined" ? `bun ${Bun.version}` : `node ${process.version}`,
    catalogSize: catalog.byName.size,
    overall: aggregate(rows),
    scenarios,
    latency: {
      itersPerQuery: f.iters,
      perQueryMedianMs: { median: round(median(perQueryMedian), 3), p95: round(quantile(perQueryMedian, 0.95), 3), max: round(Math.max(...perQueryMedian), 3) },
      perCallMs: { median: round(median(allSamples), 3), p95: round(quantile(allSamples, 0.95), 3) },
      coldIndexBuild: f.coldRuns > 0 ? coldBuild(f.coldRuns) : null,
      cliSpawnMs: cliMs.length ? { n: cliMs.length, median: round(median(cliMs), 1), p95: round(quantile(cliMs, 0.95), 1) } : null,
    },
    cli: f.cli ? { checked: rows.filter((r) => r.cliAgrees != null).length, mismatches: cliMismatch } : null,
    failures: rows.filter((r) => !r.pass).map((r) => ({ id: r.id, query: r.query, reasons: r.reasons, top: r.top })),
    queries: rows,
  };

  let exit = 0;
  let cmp = null;
  if (f.compare) {
    cmp = compare(JSON.parse(readFileSync(f.compare, "utf8")), report, f);
    report.compare = cmp;
    if (!cmp.ok) exit = 1;
  }
  if (cliMismatch.length) exit = 1; // CLI must agree with the library

  const json = JSON.stringify(report, null, 2) + "\n";
  if (f.out) { mkdirSync(dirname(resolve(f.out)), { recursive: true }); writeFileSync(f.out, json); }
  if (f.json) process.stdout.write(json);
  else printHuman(report, cmp);
  process.exitCode = exit; // not process.exit(): it can truncate piped stdout on macOS
}

function compare(base, cur, f) {
  const tol = f.tolerance;
  const drops = [];
  const check = (label, b, c) => { if (b != null && c != null && c < b - tol) drops.push(`${label}: ${b} -> ${c}`); };
  for (const m of ["passRate", "recallAt1", "recallAtK", "mrr"]) check(`overall.${m}`, base.overall[m], cur.overall[m]);
  for (const [s, b] of Object.entries(base.scenarios)) {
    const c = cur.scenarios[s];
    if (!c) { drops.push(`scenario ${s} missing`); continue; }
    for (const m of ["passRate", "recallAtK", "mrr"]) check(`${s}.${m}`, b[m], c[m]);
  }
  const curById = new Map(cur.queries.map((q) => [q.id, q]));
  const regressions = base.queries.filter((b) => b.pass && curById.get(b.id) && !curById.get(b.id).pass)
    .map((b) => ({ id: b.id, query: b.query, reasons: curById.get(b.id).reasons }));
  const fixed = base.queries.filter((b) => !b.pass && curById.get(b.id)?.pass).map((b) => b.id);
  const bl = base.latency?.perQueryMedianMs?.median, cl = cur.latency.perQueryMedianMs.median;
  const latencyRatio = bl ? round(cl / bl, 3) : null;
  const latencyFail = f.maxLatencyRatio != null && latencyRatio != null && latencyRatio > f.maxLatencyRatio;
  return { ok: !drops.length && !regressions.length && !latencyFail, drops, regressions, fixed, latencyRatio, latencyFail };
}

function printHuman(r, cmp) {
  const pct = (x) => (x == null ? "   -  " : `${(x * 100).toFixed(1).padStart(5)}%`);
  console.log(`bench-search  ${r.runtime}  catalog=${r.catalogSize} icons  queries=${r.overall.queries}`);
  console.log(`\n${"scenario".padEnd(15)} ${"n".padStart(3)}  pass    R@1     R@K     MRR`);
  for (const [s, a] of [...Object.entries(r.scenarios), ["OVERALL", r.overall]])
    console.log(`${s.padEnd(15)} ${String(a.queries).padStart(3)}  ${pct(a.passRate)} ${pct(a.recallAt1)} ${pct(a.recallAtK)}  ${a.mrr == null ? "  -" : a.mrr.toFixed(3)}`);
  const L = r.latency;
  console.log(`\nlatency  per-query median ${L.perQueryMedianMs.median}ms  p95 ${L.perQueryMedianMs.p95}ms  max ${L.perQueryMedianMs.max}ms  (per-call p95 ${L.perCallMs.p95}ms)`);
  if (L.coldIndexBuild) console.log(`cold     import ${L.coldIndexBuild.importMs}ms + loadCatalog ${L.coldIndexBuild.loadCatalogMs}ms + first search ${L.coldIndexBuild.firstSearchMs}ms = ${L.coldIndexBuild.totalMs}ms (median of ${L.coldIndexBuild.runs})`);
  if (L.cliSpawnMs) console.log(`cli      search spawn median ${L.cliSpawnMs.median}ms  p95 ${L.cliSpawnMs.p95}ms  (n=${L.cliSpawnMs.n})`);
  if (r.cli) console.log(`cli      agreement ${r.cli.checked - r.cli.mismatches.length}/${r.cli.checked}${r.cli.mismatches.length ? `  MISMATCH: ${r.cli.mismatches.map((m) => m.id).join(", ")}` : ""}`);
  console.log(`\nfailures (${r.failures.length}):`);
  for (const x of r.failures) console.log(`  ${x.id.padEnd(26)} ${JSON.stringify(x.query).padEnd(30)} ${x.reasons.join("; ")}  top=${x.top.map((l) => l.slice(0, 3).join(",")).join(" | ")}`);
  if (cmp) {
    console.log(`\ncompare: ${cmp.ok ? "OK" : "FAIL"}  latency ratio ${cmp.latencyRatio ?? "-"}${cmp.latencyFail ? " (over limit)" : ""}`);
    for (const d of cmp.drops) console.log(`  drop       ${d}`);
    for (const g of cmp.regressions) console.log(`  regression ${g.id}: ${g.reasons.join("; ")}`);
    if (cmp.fixed.length) console.log(`  fixed      ${cmp.fixed.join(", ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
