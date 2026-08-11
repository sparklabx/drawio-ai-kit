import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagram } from "../src/builder.mjs";
import { group, icon, renderTree } from "../src/layout-engine.mjs";

// 5-way fan-out (mirrors test/edges.test.mjs): several edges share the gap between hub and the
// target column, so the router must produce waypoints to route them cleanly. This is the shape
// that exercises the wpXml fork — a straight A→B link generates no waypoints in either contract.
function fanOut(contract) {
  const d = new Diagram("hubspoke", { contract });
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [
    icon("hub", "ec2", "Hub"),
    group("col", "group_account", "Targets", { dir: "col", gap: 40 },
      ["t1", "t2", "t3", "t4", "t5"].map((id) => icon(id, "s3", id))),
  ]));
  for (const t of ["t1", "t2", "t3", "t4", "t5"]) d.link("hub", t);
  return d.toXML();
}

// pull the edge <mxCell> chunks out of the model xml
function edgeCells(xml) {
  return xml.split("<mxCell").filter((c) => /edge="1"/.test(c));
}
const PIN_RE = /exitX=([0-9.]+);exitY=([0-9.]+);exitDx=0;exitDy=0;entryX=([0-9.]+);entryY=([0-9.]+)/;

test("scaffold (default): a straight edge carries zero <Array as=\"points\"> waypoints", () => {
  const d = new Diagram("pipeline", { contract: "scaffold" });
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [
    icon("a", "ec2", "A"),
    icon("b", "s3", "B"),
  ]));
  d.link("a", "b");
  const edges = edgeCells(d.toXML());
  assert.ok(edges.length === 1, "one edge expected");
  assert.doesNotMatch(edges[0], /<Array as="points">/, "a straight scaffold edge must NOT freeze waypoints");
});

test("scaffold: corridor edges whose straight pin line would clip a node DO freeze waypoints", () => {
  // the 5-way fan-out shares one corridor: a straight hub→t1 line would cut through t2..t4, so the
  // router's bend must be frozen even in scaffold — otherwise draw.io's pin-only re-route (and the
  // geometry audit) puts the path through the very node the router avoided.
  const xml = fanOut("scaffold");
  const withWp = edgeCells(xml).filter((e) => /<Array as="points">/.test(e));
  assert.ok(withWp.length > 0, "clip-risk scaffold edges must freeze their waypoints");
});

test("scaffold: a LABELED bent edge freezes its waypoints (label needs a straight mid-segment)", () => {
  const d = new Diagram("hubspoke", { contract: "scaffold" });
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [
    icon("hub", "ec2", "Hub"),
    group("col", "group_account", "Targets", { dir: "col", gap: 40 },
      ["t1", "t2", "t3"].map((id) => icon(id, "s3", id))),
  ]));
  d.link("hub", "t1", "labeled");
  const labeled = edgeCells(d.toXML()).find((e) => /value="labeled"/.test(e));
  assert.ok(labeled, "labeled edge expected");
  assert.match(labeled, /<Array as="points">/, "a labeled bent scaffold edge must freeze waypoints");
});

test("scaffold (default): every edge retains edgeStyle=orthogonalEdgeStyle", () => {
  const xml = fanOut("scaffold");
  for (const e of edgeCells(xml)) {
    assert.match(e, /edgeStyle=orthogonalEdgeStyle/, "scaffold edges keep the orthogonal style");
  }
});

test("scaffold (default): every edge retains exit/entry pin fractions", () => {
  const xml = fanOut("scaffold");
  for (const e of edgeCells(xml)) {
    assert.match(e, PIN_RE, "scaffold edges must carry exitX/exitY/entryX/entryY pins");
  }
});

test("bake: at least one edge contains <Array as=\"points\"> waypoints", () => {
  const xml = fanOut("bake");
  const edges = edgeCells(xml);
  const withWp = edges.filter((e) => /<Array as="points">/.test(e));
  assert.ok(withWp.length > 0, "bake must freeze waypoints for routed edges");
});

test("bake: pin fractions still emitted (pins survive in both contracts)", () => {
  const xml = fanOut("bake");
  for (const e of edgeCells(xml)) {
    assert.match(e, PIN_RE, "bake edges also carry the exit/entry pins");
  }
});

test("scaffold: pin-selection (face/decollide) survives — two hub edges same side carry different fractions", () => {
  // With waypoints absent, the ONLY routing info in scaffold is the pins. Distinct exit fractions
  // on the same side of the hub prove decollide() ran and its output survived into scaffold.
  const xml = fanOut("scaffold");
  const pins = edgeCells(xml).map((e) => e.match(PIN_RE)).filter(Boolean);
  // group exit fractions by side (exitX): 0 = left, 1 = right
  const bySide = {};
  for (const m of pins) {
    const side = m[1];
    (bySide[side] ||= []).push(m[2]);
  }
  const sides = Object.values(bySide);
  const distinctOnOneSide = sides.some((fracs) => new Set(fracs).size > 1);
  assert.ok(distinctOnOneSide, "at least one side of the hub must carry >1 distinct exit fraction");
});

test("contract default is scaffold when omitted", () => {
  const d = new Diagram("pipeline");
  assert.equal(d.contract, "scaffold");
});

test("contract: invalid value throws a clear error", () => {
  assert.throws(() => new Diagram("pipeline", { contract: "frozen" }), /Invalid contract/);
});

test("subnet: a labelled Private subnet renders the padlock glyph + subnet=1 marker", () => {
  // draw.io draws Public/Private subnet with the security-group (padlock) glyph, not the generic
  // subnet glyph. The builder swaps the glyph but stamps subnet=1 so the validator still knows it.
  const d = new Diagram("network");
  renderTree(d, group("vpc", "group_vpc", "VPC", { dir: "row", gap: 20 }, [
    group("prv", "group_subnet", "Private subnet", { dir: "col" }, [icon("ec2", "ec2", "EC2")]),
  ]));
  const prv = d.toXML().split("<mxCell").find((c) => /value="Private subnet"/.test(c));
  assert.match(prv, /grIcon=mxgraph\.aws4\.group_security_group/);   // padlock glyph
  assert.match(prv, /subnet=1/);                                     // stable subnet marker
});
