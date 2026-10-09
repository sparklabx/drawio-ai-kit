// Search characterization, split in two:
//   * "contract" tests — output shape + must-hit top results. These MUST survive a search rewrite.
//   * "ranking" snapshots — exact ranked lists from the current scorer. EXPECTED to change when
//     search is reimplemented (e.g. minisearch); review the diff, then UPDATE_SNAPSHOTS=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTmp, parseOut, runCli, snapshotFile } from "./_helpers.ts";

const match = snapshotFile("search-ranking");
const tmp = makeTmp("charac-search");
const search = (...args) => {
  const r = runCli(["search", ...args], { tmp });
  assert.equal(r.status, 0, r.stderr);
  return parseOut(r.stdout);
};
const COMPACT_KEYS = ["category", "color", "kind", "label", "name"];

test("search contract: single query → compact array, default limit 8", () => {
  const r = search("s3");
  assert.ok(Array.isArray(r));
  assert.ok(r.length > 0 && r.length <= 8);
  for (const x of r) assert.deepEqual(Object.keys(x).sort(), COMPACT_KEYS);
  assert.equal(r[0].name, "s3");
});

test("search contract: --full adds style/geometry, --limit caps, --kind filters, --category filters", () => {
  const [f] = search("s3", "--full", "--limit", "1");
  for (const k of [...COMPACT_KEYS, "fqn", "style", "width", "height"]) assert.ok(k in f, `--full has ${k}`);
  assert.equal(search("ec2", "--limit", "3").length <= 3, true);
  for (const x of search("vpc", "--kind", "group")) assert.equal(x.kind, "group");
  for (const x of search("lambda", "--category", "Compute")) assert.equal(x.category, "Compute");
});

test("search contract: comma batch → object keyed by trimmed queries; single query is not batched", () => {
  const r = search("s3, lambda ,nat gateway,");
  assert.ok(!Array.isArray(r));
  assert.deepEqual(Object.keys(r), ["s3", "lambda", "nat gateway"]);
  assert.equal(r.s3[0].name, "s3");
  assert.equal(r.lambda[0].name, "lambda");
  assert.ok(Array.isArray(search("s3,")), "one query after splitting → plain array");
});

test("search contract: exact names rank first", () => {
  for (const q of ["s3", "lambda", "ec2", "rds", "dynamodb", "kubernetes", "nat_gateway", "group_vpc"])
    assert.equal(search(q)[0]?.name, q, `top-1 for "${q}"`);
});

test("search contract: empty query exits 1; nonsense query → empty array", () => {
  assert.equal(runCli(["search"], { tmp }).status, 1);
  assert.deepEqual(search("zzqqxxyy"), []);
});

const RANKING = {
  single: ["s3", "lambda", "ec2", "vpc", "kubernetes", "nat gateway", "load balancer", "postgres", "kafka",
    "redis", "api gateway", "cloudfront", "bigquery", "cosmos db", "delta lake", "user task"],
  aliases: ["k8s", "pg", "es", "lb", "db", "mq", "cdn", "dns", "iam", "ml"],
  batch: ["k8s, pg, es", "s3, lambda, nat gateway", "alb, ecs, rds, elasticache"],
  flags: [["vpc", "--kind", "group"], ["lambda", "--category", "Compute"], ["storage", "--limit", "20"],
    ["s3", "--full", "--limit", "2"], ["subnet", "--kind", "icon"]],
};

test("search ranking (expected to change with a new search engine)", () => {
  const names = (r) => (Array.isArray(r) ? r.map((x) => x.name) : Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.map((x) => x.name)])));
  for (const q of RANKING.single) match(`single:${q}`, names(search(q)));
  for (const q of RANKING.aliases) match(`alias:${q}`, names(search(q)));
  for (const q of RANKING.batch) match(`batch:${q}`, names(search(q)));
  for (const a of RANKING.flags) match(`flags:${a.join(" ")}`, search(...a));
});
