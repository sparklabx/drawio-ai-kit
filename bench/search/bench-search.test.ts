// Guards the search benchmark: the labeled set is valid and search quality never drops below baseline.
// Black-box: dist/kit.mjs + scripts/bench-search.mjs (which spawns dist/cli.mjs). Runs on node --test and bun test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../../dist/kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BENCH = join(ROOT, "scripts/bench-search.mjs");
const BASELINE = join(ROOT, "bench/search/baseline.json");
const { queries } = JSON.parse(readFileSync(join(ROOT, "bench/search/queries.json"), "utf8"));
const runBench = (...args) => spawnSync("node", [BENCH, "--iters", "1", "--cold-runs", "0", ...args], { cwd: ROOT, encoding: "utf8" });

test("query set: >= 60 unique queries covering every scenario", () => {
  assert.ok(queries.length >= 60);
  assert.equal(new Set(queries.map((q) => q.id)).size, queries.length);
  const scenarios = new Set(queries.map((q) => q.scenario));
  for (const s of ["abbreviation", "multi-keyword", "typo", "synonym", "vendor-scoped", "exact", "negative", "case-punct"]) assert.ok(scenarios.has(s), s);
  for (const q of queries) assert.ok(Number.isInteger(q.k) && q.k >= 1, `${q.id}: k`);
});

test("query set: every expected/forbidden name exists in the catalog", () => {
  const { byName } = loadCatalog();
  const missing = queries.flatMap((q) => [...q.expect.flat(), ...(q.forbid ?? [])].filter((n) => !byName.has(n)).map((n) => `${q.id}:${n}`));
  assert.deepEqual(missing, []);
});

test("search quality does not drop below bench/search/baseline.json (and CLI agrees with the library)", () => {
  const r = runBench("--compare", BASELINE, "--json");
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.compare.drops, []);
  assert.deepEqual(report.compare.regressions, []);
  assert.deepEqual(report.cli.mismatches, []);
  assert.equal(r.status, 0, r.stderr);
});

test("--compare fails when a baseline-passing query regresses", () => {
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const failing = base.queries.find((q) => !q.pass);
  failing.pass = true; // pretend it used to pass
  base.overall.passRate = 1;
  const file = join(mkdtempSync(join(tmpdir(), "bench-search-")), "baseline.json");
  writeFileSync(file, JSON.stringify(base));
  const r = runBench("--compare", file, "--json", "--no-cli");
  assert.equal(r.status, 1);
  const { compare } = JSON.parse(r.stdout);
  assert.ok(compare.regressions.some((g) => g.id === failing.id));
  assert.ok(compare.drops.some((d) => d.startsWith("overall.passRate")));
});
