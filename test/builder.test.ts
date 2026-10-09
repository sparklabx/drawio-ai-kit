import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagram } from "../src/builder.ts";

const cell = (xml: string, re: RegExp) => xml.split("<mxCell").find((c) => re.test(c)) ?? "";

function two() {
  const d = new Diagram("pipeline");
  d.box("a", [100, 100], [80, 60], "A");
  d.box("b", [400, 100], [80, 60], "B");
  d.box("c", [100, 300], [80, 60], "C");
  return d;
}

test("raw style edge: no ports, no waypoints, style appended with ';'", () => {
  const d = two(); d.link("a", "b", "", { style: "dashed=1" });
  const e = cell(d.toXML(), /source="a"/);
  assert.match(e, /dashed=1;"/);
  assert.doesNotMatch(e, /exitX|mxPoint/);
});

test("pinned route: ports follow opts.route, no obstacle routing", () => {
  const d = two(); d.link("a", "b", "", { route: { es: "B", en: "B" } });
  assert.match(cell(d.toXML(), /source="a"/), /exitY=1;.*entryY=1;/);
});

test("rail: edge is routed along a gutter above both nodes with waypoints", () => {
  const d = two(); d.link("a", "b", "x", { rail: "top" });
  const e = cell(d.toXML(), /source="a"/);
  assert.match(e, /exitY=0;/);
  assert.match(e, /<mxPoint x="\d+" y="70"\/>/);   // min(y)=100 minus 30px margin
});

test("step + badge: numbered label and attached badge cell", () => {
  const d = two(); d.link("a", "b", "go", { step: 2, badge: "2a" });
  const x = d.toXML();
  assert.match(x, /value="2\. go"/);
  assert.match(cell(x, /id="ed1_b"/), /parent="ed1".*x="-0.6"/);
});

test("link to unknown id and phantom id throw distinct errors", () => {
  const d = two(); d.phantoms.add("ph");
  assert.throws(() => d.link("a", "zz"), /target does not exist yet "zz"/);
  assert.throws(() => d.link("a", "ph"), /phantom frame "ph"/);
});

test("clusterBox spans children on the boundaries layer; null when no child exists", () => {
  const d = two();
  const r = d.clusterBox("cl", ["a", "c"], "Cluster")!;
  assert.deepEqual([r.x, r.y, r.w, r.h], [86, 66, 108, 308]);
  assert.equal(d.clusterBox("none", ["nope"]), null);
  assert.match(d.toXML(), /id="boundaries"/);
});

test("spanV centres between two nodes and spans from..to", () => {
  const d = two();
  const r = d.spanV("bus", { w: 20 }, { between: ["a", "b"], from: "a", to: "c" });
  assert.equal(r.w, 20);
  assert.equal(r.y, 84);                // from.y - pad
  assert.equal(r.h, 300 + 60 - 100 + 32);
  assert.ok(r.x > 180 && r.x + r.w < 400);
});

test("spanV: unknown `to` falls back to `from`", () => {
  const d = two();
  const r = d.spanV("bus", { w: 20 }, { between: ["a", "b"], from: "a", to: "nope" });
  assert.equal(r.y, 84);
  assert.equal(r.h, 92);
});

test("invalid contract throws", () => {
  assert.throws(() => new Diagram("pipeline", { contract: "nope" as never }), /Invalid contract/);
});
