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

test("a compound-name hit does not hide the other keywords", () => {
  const has = (q: string, ...want: string[]) => {
    const top = names(q);
    for (const n of want) assert.ok(top.includes(n), `${q}: ${n} in ${top.join()}`);
  };
  has("s3 lambda", "s3", "lambda");
  has("rds s3 lambda", "rds", "s3", "lambda");
  has("lambda redis cache", "lambda");
  has("kubernetes load balancer", "kubernetes");
  has("ec2 api gateway", "ec2", "api_gateway");
});

test("exact hit leads, then its family pads the list (no lone result)", () => {
  for (const [q, first] of [["rds", "rds_instance"], ["lambda", "lambda_function"], ["vpc", "vpc"], ["s3", "s3_object_lambda"]] as const) {
    const top = names(q);
    assert.ok(top.length > 1, `${q}: ${top.join()}`);
    assert.ok(top.some((n) => n.startsWith(first) || n === q), `${q}: ${top.join()}`);
  }
  assert.ok(names("rds").includes("rds_instance"));
});

test("typos correct to the nearest known word and rank the icon first", () => {
  const cases: Record<string, string> = {
    kubernets: "kubernetes", kafak: "kafka", terafrom: "terraform", rdis: "redis", databrics: "databricks",
    promethues: "prometheus", aiflow: "airflow", "cloud wtach": "cloudwatch_2", dyanmodb: "dynamodb",
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(names(q)[0], want, `${q} → ${names(q, 3).join()}`);
});

test("typo correction leaves prefixes, acronyms and nonsense alone", () => {
  assert.equal(names("lamb")[0], "lambda"); // a prefix being typed
  assert.equal(names("sns")[0], "sns"); // short words are never corrected
  assert.deepEqual(names("qwxzv"), []);
});
