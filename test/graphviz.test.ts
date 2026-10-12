import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findDot,
  selectRouter,
  workflowText,
} from "../src/cli-lib.ts";
import { Diagram } from "../src/builder.ts";
import { group, icon, renderTree } from "../src/layout-engine.ts";

// --- selectRouter (the pure decision function) ---
test("selectRouter: scaffold never consults graphviz, even when dot is present", () => {
  assert.equal(selectRouter("scaffold", true), "kit");
});

test("selectRouter: scaffold with dot absent stays kit", () => {
  assert.equal(selectRouter("scaffold", false), "kit");
});

test("selectRouter: bake + dot present → graphviz", () => {
  assert.equal(selectRouter("bake", true), "graphviz");
});

test("selectRouter: bake + dot absent → kit fallback (the zero-dependency path)", () => {
  assert.equal(selectRouter("bake", false), "kit");
});

test("selectRouter: unknown contract never routes via graphviz", () => {
  assert.equal(selectRouter("weird", true), "kit");
});

// --- findDot (the runtime probe, injectable deps) ---
test("findDot: DOT_CLI env var wins when existsSync true", () => {
  const env = { DOT_CLI: "/custom/bin/dot" };
  const deps = { existsSync: (p: string) => p === "/custom/bin/dot" };
  assert.equal(findDot(env, deps), "/custom/bin/dot");
});

test("findDot: DOT_CLI skipped when existsSync false → null", () => {
  const env = { DOT_CLI: "/nope/dot" };
  const deps = { existsSync: () => false, locateOnPath: () => "" };
  assert.equal(findDot(env, deps), null);
});

test("findDot: locateOnPath present → returns the path", () => {
  const env = {};
  const deps = { existsSync: () => false, locateOnPath: () => "/usr/local/bin/dot" };
  assert.equal(findDot(env, deps), "/usr/local/bin/dot");
});

test("findDot: nothing found → null (enhancement absent, never an error)", () => {
  const env = {};
  const deps = { existsSync: () => false, locateOnPath: () => "" };
  assert.equal(findDot(env, deps), null);
});

test("findDot: returns a truthy path when present", () => {
  const env = {};
  const deps = { existsSync: () => false, locateOnPath: () => "/opt/homebrew/bin/dot" };
  const found = findDot(env, deps);
  assert.ok(found, "present dot should be truthy");
  assert.equal(typeof found, "string");
});

// --- workflowText preflight note ---
test("workflowText notes Graphviz-or-fallback for bake, scaffold unaffected", () => {
  const txt = workflowText();
  assert.ok(/Graphviz/i.test(txt), "must mention Graphviz");
  assert.ok(/\bdot\b/.test(txt), "must mention the dot binary");
  assert.ok(/kit's built-in router|fallback|built-in .*router/i.test(txt), "must mention the kit fallback");
  assert.ok(/scaffold/i.test(txt), "must clarify scaffold is unaffected");
});

// --- builder integration: the kit router is always used today (graphviz shell-out is a
//     documented follow-up). bake WITHOUT a wired dot router must still emit waypoints; scaffold never. ---
test("builder: bake diagram routes via the kit router and emits waypoints (no error)", () => {
  const d = new Diagram("hubspoke", { contract: "bake" });
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [
    icon("hub", "ec2", "Hub"),
    group("col", "group_account", "Targets", { dir: "col", gap: 40 },
      ["t1", "t2", "t3"].map((id) => icon(id, "s3", id))),
  ]));
  for (const t of ["t1", "t2", "t3"]) d.link("hub", t);
  const xml = d.toXML();
  assert.match(xml, /edge="1"/);
  // kit router produces waypoints for a fan-out in bake contract
  assert.match(xml, /<Array as="points">/);
});

test("builder: scaffold never freezes waypoints, regardless of dot availability", () => {
  const d = new Diagram("hubspoke", { contract: "scaffold" });
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [
    icon("hub", "ec2", "Hub"),
    icon("t1", "s3", "T1"),
  ]));
  d.link("hub", "t1");
  const xml = d.toXML();
  assert.doesNotMatch(xml, /<Array as="points">/, "scaffold never freezes waypoints");
});
