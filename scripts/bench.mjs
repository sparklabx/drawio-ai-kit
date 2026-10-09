#!/usr/bin/env node
// Performance baseline harness (black-box: dist/cli.mjs + dist/kit.mjs only, so it survives the src refactor).
//
//   node scripts/bench.mjs [--runtime node|bun|both] [--runs N] [--warmup N] [--out file]
//                          [--compare baseline.json] [--tolerance 0.10] [--min-abs-ms 2] [--min-abs-bytes 1048576]
//
// Runs on node and bun. Measures, per runtime: CLI cold start (wall + peak RSS), in-process
// loadCatalog / first search / warm search / 3 example builds, plus package size (runtime-independent).
// --compare exits 1 when any metric is worse than baseline by more than --tolerance (and the absolute floor).

import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir, cpus, totalmem, platform, arch, release } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "dist", "cli.mjs");
const KIT = join(ROOT, "dist", "kit.mjs");
const SELF = fileURLToPath(import.meta.url);

// Representative examples (aws, azure, bpmn). Their imports are rewritten to dist/kit.mjs at bench time.
const EXAMPLES = ["examples/aws/build_serverless.mjs", "examples/azure/build_azure_vnet.mjs", "examples/bpmn/build_bpmn.mjs"];
const CLI_CASES = { root: ["root"], search_lambda: ["search", "lambda"], search_multi: ["search", "k8s, pg, es"] };
const WARM_SEARCH_ITERS = 200;

function parseArgs(argv) {
  const o = { runtime: "both", runs: 15, warmup: 3, out: null, compare: null, tolerance: 0.1, minAbsMs: 2, minAbsBytes: 1 << 20, child: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === "--runtime") o.runtime = v();
    else if (a === "--runs") o.runs = +v();
    else if (a === "--warmup") o.warmup = +v();
    else if (a === "--out") o.out = v();
    else if (a === "--compare") o.compare = v();
    else if (a === "--tolerance") o.tolerance = +v();
    else if (a === "--min-abs-ms") o.minAbsMs = +v();
    else if (a === "--min-abs-bytes") o.minAbsBytes = +v();
    else if (a === "--child") o.child = v();
    else if (a === "-h" || a === "--help") { console.log(readFileSync(SELF, "utf8").split("\n").slice(1, 9).join("\n")); process.exit(0); }
    else throw new Error(`unknown arg: ${a}`);
  }
  return o;
}

const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { median: round(q(0.5)), p95: round(q(0.95)), n: s.length };
}
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms

// ---------- child mode: one fresh process, in-process measurements ----------
async function childInproc() {
  const t0 = now();
  const kit = await import(pathToFileURL(KIT).href);
  const tImport = now() - t0;
  // NB: dist/kit.mjs parses the default catalog at import (bpmn module), so import_ms carries the parse
  // and loadCatalog_ms is the memoized lookup. Both are kept so a refactor that moves the parse shows up.
  let t = now();
  const catalog = kit.loadCatalog();
  const tLoad = now() - t;
  t = now();
  kit.searchIcon(catalog, "lambda");
  const tFirst = now() - t;
  const warm = [];
  const queries = ["lambda", "k8s", "postgres", "s3 bucket", "api gateway"];
  for (let i = 0; i < WARM_SEARCH_ITERS; i++) {
    const t1 = now();
    kit.searchIcon(catalog, queries[i % queries.length]);
    warm.push(now() - t1);
  }
  const ws = [...warm].sort((a, b) => a - b);
  const examples = await buildExamples();
  process.stdout.write(JSON.stringify({ import_ms: tImport, loadCatalog_ms: tLoad, search_first_ms: tFirst, search_warm_ms: ws[Math.floor(ws.length / 2)], ...examples }));
}

// Copy each example into a scratch tree (so its "../../out/..." write lands there) with imports pointed at dist/kit.mjs.
// One copy per repetition: bun ignores "?query" cache-busting on file URLs, distinct files work everywhere.
const EXAMPLE_REPS = 6; // 1 first + 5 warm
function stageExamples(dir) {
  const kitUrl = pathToFileURL(KIT).href;
  mkdirSync(join(dir, "out"), { recursive: true });
  return EXAMPLES.map((rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8").replace(
      /from\s+["']((?:\.\.?\/)+src\/[^"']+|drawio-ai-kit(?:\/[^"']*)?|\/[^"']*\/(?:src|dist)\/[^"']+)["']/g,
      `from "${kitUrl}"`,
    );
    const dst = join(dir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    const urls = [];
    for (let i = 0; i < EXAMPLE_REPS; i++) {
      const f = dst.replace(/\.mjs$/, `.${i}.mjs`);
      writeFileSync(f, src);
      urls.push(pathToFileURL(f).href);
    }
    return [rel.split("/")[1], urls];
  });
}

async function buildExamples() {
  const dir = mkdtempSync(join(tmpdir(), "drawio-bench-"));
  const log = console.log;
  const out = {};
  try {
    console.log = () => {};
    for (const [domain, [first, ...rest]] of stageExamples(dir)) {
      let t = now();
      await import(first);
      out[`example_${domain}_first_ms`] = now() - t;
      const warm = [];
      for (const url of rest) {
        t = now();
        await import(url);
        warm.push(now() - t);
      }
      out[`example_${domain}_warm_ms`] = warm.sort((a, b) => a - b)[Math.floor(warm.length / 2)];
    }
  } finally {
    console.log = log;
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

// ---------- parent mode ----------
function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
}
function runtimeBin(rt) {
  if (rt === "node") return process.release?.name === "node" && !process.versions.bun ? process.execPath : which("node");
  return process.versions.bun ? process.execPath : which("bun");
}

// Peak RSS via /usr/bin/time (-l on macOS reports bytes, -v on GNU reports KB). null if unavailable.
const TIME = (() => {
  if (process.platform === "darwin") return { args: ["-l"], parse: (e) => +(/(\d+)\s+maximum resident set size/.exec(e)?.[1] ?? NaN) };
  if (process.platform === "linux") {
    const r = spawnSync("/usr/bin/time", ["-v", "true"], { encoding: "utf8" });
    if (r.status === 0) return { args: ["-v"], parse: (e) => +(/Maximum resident set size \(kbytes\): (\d+)/.exec(e)?.[1] ?? NaN) * 1024 };
  }
  return null;
})();

function coldStart(bin, args, { runs, warmup }) {
  const wall = [], rss = [];
  for (let i = 0; i < warmup + runs; i++) {
    const t = now();
    const r = TIME
      ? spawnSync("/usr/bin/time", [...TIME.args, bin, CLI, ...args], { encoding: "utf8", cwd: ROOT })
      : spawnSync(bin, [CLI, ...args], { encoding: "utf8", cwd: ROOT });
    const dt = now() - t;
    if (r.status !== 0) throw new Error(`${bin} cli ${args.join(" ")} failed: ${r.stderr}`);
    if (i < warmup) continue;
    wall.push(dt);
    if (TIME) { const b = TIME.parse(r.stderr); if (Number.isFinite(b)) rss.push(b / 1048576); }
  }
  return { wall_ms: stats(wall), peak_rss_mb: rss.length ? stats(rss) : null };
}

function inproc(bin, { runs, warmup }) {
  const samples = [];
  for (let i = 0; i < warmup + runs; i++) {
    const r = spawnSync(bin, [SELF, "--child", "inproc"], { encoding: "utf8", cwd: ROOT });
    if (r.status !== 0) throw new Error(`${bin} inproc child failed: ${r.stderr}`);
    if (i >= warmup) samples.push(JSON.parse(r.stdout));
  }
  const out = {};
  for (const k of Object.keys(samples[0])) out[k] = stats(samples.map((s) => s[k]));
  return out;
}

function dirBytes(d) {
  let n = 0;
  for (const f of readdirSync(d)) { const p = join(d, f), s = statSync(p); n += s.isDirectory() ? dirBytes(p) : s.size; }
  return n;
}
function packageSize() {
  const npm = which("npm");
  let pack = null;
  if (npm) {
    const j = JSON.parse(execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    pack = { size_bytes: j.size, unpacked_bytes: j.unpackedSize, files: j.entryCount };
  }
  return { npm_pack: pack, dist_bytes: dirBytes(join(ROOT, "dist")) };
}

function machine(bins) {
  const versions = {};
  for (const [rt, bin] of Object.entries(bins)) versions[rt] = spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout.trim();
  let commit = null;
  try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch {}
  return { platform: platform(), arch: arch(), os_release: release(), cpu: cpus()[0]?.model, cpus: cpus().length, mem_gb: round(totalmem() / 2 ** 30, 1), runtimes: versions, commit, date: new Date().toISOString() };
}

// Flatten to { "node.cli.root.wall_ms.median": 23.1, ... }; only medians (+ sizes) are gated, p95 is informational.
function flatten(o, pre = "", acc = {}) {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, acc);
    else if (typeof v === "number") acc[key] = v;
  }
  return acc;
}
const gated = (k) => (/\.median$/.test(k) || /_bytes$/.test(k)) && !/\.n$/.test(k);

function compare(cur, base, o) {
  const a = flatten(base.results), b = flatten(cur.results);
  const rows = [];
  let bad = 0;
  for (const k of Object.keys(a)) {
    if (!gated(k) || !(k in b)) continue;
    const delta = b[k] - a[k], pct = a[k] ? delta / a[k] : 0;
    const floor = /_bytes$/.test(k) ? o.minAbsBytes : /_mb\./.test(k) ? 1 : o.minAbsMs;
    const regress = pct > o.tolerance && delta > floor;
    if (regress) bad++;
    rows.push([k, a[k], b[k], `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`, regress ? "REGRESSED" : pct < -o.tolerance ? "improved" : "ok"]);
  }
  const w = [0, 1, 2, 3, 4].map((i) => Math.max(...[["metric", "baseline", "current", "delta", "status"], ...rows].map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ");
  console.log(line(["metric", "baseline", "current", "delta", "status"]));
  for (const r of rows) console.log(line(r));
  console.log(`\n${bad} regression(s) beyond ${(o.tolerance * 100).toFixed(0)}% (floors: ${o.minAbsMs} ms, 1 MB rss, ${o.minAbsBytes} bytes)`);
  return bad;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.child === "inproc") return childInproc();

  const rts = o.runtime === "both" ? ["node", "bun"] : [o.runtime];
  const bins = {};
  for (const rt of rts) {
    const b = runtimeBin(rt);
    if (!b) { console.error(`skip ${rt}: not on PATH`); continue; }
    bins[rt] = b;
  }
  const results = { package: packageSize() };
  for (const [rt, bin] of Object.entries(bins)) {
    console.error(`[bench] ${rt}: cli cold start ...`);
    const cli = {};
    for (const [name, args] of Object.entries(CLI_CASES)) cli[name] = coldStart(bin, args, o);
    console.error(`[bench] ${rt}: in-process ...`);
    results[rt] = { cli, inproc: inproc(bin, o) };
  }
  const report = { machine: machine(bins), config: { runs: o.runs, warmup: o.warmup, warm_search_iters: WARM_SEARCH_ITERS, examples: EXAMPLES, rss_source: TIME ? "/usr/bin/time" : null }, results };
  const json = JSON.stringify(report, null, 2);
  if (o.out) { writeFileSync(o.out, json + "\n"); console.error(`[bench] wrote ${relative(process.cwd(), o.out) || o.out}`); }
  else if (!o.compare) console.log(json);
  if (o.compare) {
    const bad = compare(report, JSON.parse(readFileSync(o.compare, "utf8")), o);
    process.exitCode = bad ? 1 : 0;
  }
}

await main();
