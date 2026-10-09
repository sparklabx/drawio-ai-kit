import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, searchIcon } from "../src/core.ts";

const c = loadCatalog();
const names = (q: string, limit = 8) => searchIcon(c, q, { limit }).map((h) => h.name);

test("space-separated multi-keyword surfaces every service in top 8", () => {
  const top = names("k8s pg es");
  assert.ok(top.includes("kubernetes"), top.join());
  assert.ok(top.some((n) => /postgres/.test(n)), top.join());
  assert.ok(top.some((n) => /elasticsearch|opensearch/.test(n)), top.join());
});

test("each service of a multi-keyword query ranks in the top N (round-robin)", () => {
  const top = names("alb ec2 rds s3", 4);
  for (const n of ["application_load_balancer", "ec2", "rds", "s3"]) assert.ok(top.includes(n), `${n} in ${top.join()}`);
});

test("aliases expand instead of replace: the literal term still matches", () => {
  assert.equal(names("kubernetes")[0], "kubernetes");
  assert.ok(names("k8s", 3).includes("kubernetes"));
  assert.ok(names("ddb", 3).includes("dynamodb"));
  assert.ok(names("apigw", 3).includes("api_gateway"));
});

test("typos, synonyms and vendor scope", () => {
  assert.ok(names("kubernets", 3).includes("kubernetes"));
  assert.ok(names("object storage", 3).includes("s3"));
  assert.equal(names("gcp bigquery")[0], "gcp_bigquery");
  assert.ok(names("azure vm", 1)[0] === "azure_virtual_machine");
});

test("noise and stop words return nothing", () => {
  for (const q of ["a", "the", "x", "qzxwvplm", "  "]) assert.deepEqual(names(q), [], q);
});

test("exact names rank first, also when written with spaces or joined", () => {
  assert.equal(names("nat gateway")[0], "nat_gateway");
  assert.equal(names("Route53")[0], "route_53");
});
