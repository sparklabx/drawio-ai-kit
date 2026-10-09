import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagram } from "../src/builder.ts";
import { frame, grid, group, icon, renderTree } from "../src/layout-engine.ts";

const portOf = (xml, src, tgt) => {
  const e = xml.split("<mxCell").find((c) => new RegExp(`source="${src}"`).test(c) && new RegExp(`target="${tgt}"`).test(c));
  const g = (k) => (e.match(new RegExp(`${k}=([-\\d.]+)`)) || [])[1];
  return { exitX: g("exitX"), exitY: g("exitY"), entryX: g("entryX"), entryY: g("entryY"), pts: (e.match(/<mxPoint/g) || []).length };
};

// 5-way fan-out forces several edges to share the gap between hub and the target column → their
// trunk segments overlap unless the nudge pass separates them. Asserts the nudge invariant.
function fanOut(order) {
  const d = new Diagram("hubspoke");
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [
    icon("hub", "ec2", "Hub"),
    group("col", "group_account", "Targets", { dir: "col", gap: 40 },
      ["t1", "t2", "t3", "t4", "t5"].map((id) => icon(id, "s3", id))),
  ]));
  for (const t of order) d.link("hub", t);
  d.toXML(); // builds edges + runs the nudge pass
  return d;
}

test("nudge: parallel trunk segments do not overlap, no icons clipped", () => {
  const d = fanOut(["t1", "t2", "t3", "t4", "t5"]);
  assert.equal(d._overlaps, 0, "interior segments must not stack on one track");
  assert.equal(d._cross, 0, "no edge may clip an icon");
});

test("nudge: result is order-independent (deterministic global pass)", () => {
  const a = fanOut(["t1", "t2", "t3", "t4", "t5"]);
  const b = fanOut(["t5", "t4", "t3", "t2", "t1"]);
  assert.equal(a._overlaps, 0);
  assert.equal(b._overlaps, 0); // reversing link() order must not reintroduce overlaps
});

test("two parallel A→B links get distinct tracks (no perfect overlap)", () => {
  const d = new Diagram("pipeline");
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [icon("a", "ec2", "A"), icon("b", "s3", "B")]));
  d.link("a", "b", "read");
  d.link("a", "b", "write");
  d.toXML();
  assert.equal(d._overlaps, 0, "duplicate links must not share one track");
  assert.equal(d._cross, 0);
});

test("layout-only frames (stroke none) are invisible to the router", () => {
  const d = new Diagram("pipeline");
  renderTree(d, frame("root", "", { dir: "row", gap: 60, header: 0, fill: "none", stroke: "none" }, [
    icon("a", "ec2", "A"), icon("b", "s3", "B"),
  ]));
  assert.notEqual(d.R.root.ob, false, "stroke:none wrapper must NOT register as a container");
  assert.ok(!d.R.root.ob, "…and must not be an obstacle either");
  d.link("a", "b");
  d.toXML();
  assert.equal(d._cross, 0);
});

test("nudge: a straight A→B link stays straight (no spurious waypoints)", () => {
  const d = new Diagram("pipeline");
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [icon("a", "ec2", "A"), icon("b", "s3", "B")]));
  d.link("a", "b");
  const xml = d.toXML();
  const edge = xml.split("<mxCell").find((c) => /edge="1"/.test(c));
  assert.doesNotMatch(edge, /<mxPoint/, "an aligned straight link needs no waypoints");
  assert.equal(d._overlaps, 0);
});

test("caption: a MISALIGNED edge into a labeled icon enters via a side, not through its caption band", () => {
  // files sits below-left of stream (different columns) → a bottom entry into stream would run the
  // arrow straight up through the "Structured Streaming" caption. The label-band obstacle steers it
  // to a clean side entry instead.
  const d = new Diagram("pipeline");
  renderTree(d, group("r", null, "", { dir: "row", gap: 120 }, [
    grid("L", null, "L", { cols: 1, gap: 40 }, [icon("top", "s3", "Top"), icon("files", "s3", "Files / object store")]),
    grid("R", null, "R", { cols: 1, gap: 40 }, [icon("stream", "data_streaming", "Structured Streaming")]),
  ]), [40, 60]);
  d.link("files", "stream", "", { flow: true });
  const p = portOf(d.toXML(), "files", "stream");
  assert.ok(p.entryX === "0" || p.entryX === "1", `entry must be a side port (got entryX=${p.entryX}, entryY=${p.entryY})`);
});

test("caption: an x-ALIGNED stacked edge keeps its straight vertical drop through the short caption", () => {
  // orders-svc directly above RDS → the natural depiction is a straight drop through the short caption,
  // NOT a detour around it. exOf() lets the edge cross its OWN endpoints' bands when the nodes align.
  const d = new Diagram("pipeline");
  renderTree(d, grid("C", null, "C", { cols: 1, gap: 44 }, [icon("svc", "ec2", "orders-svc"), icon("db", "rds", "RDS (orders)")]), [40, 60]);
  d.link("svc", "db", "3. persist");
  const p = portOf(d.toXML(), "svc", "db");
  assert.equal(p.exitX, p.entryX, "aligned drop keeps one vertical track");
  assert.equal(p.exitY, "1", "exits the bottom (down toward the neighbour)");
  assert.equal(p.entryY, "0", "enters the top of the neighbour");
  assert.equal(p.pts, 0, "no detour waypoints");
});

test("rail: a stub that would spear nodes stacked under the source jogs out to a side port", () => {
  // top → far (bottom rail). A straight centre drop from `top` to the gutter would pierce `mid` and
  // `bot` beneath it; the stub must leave from a side port and drop in the column gap instead.
  const d = new Diagram("pipeline");
  renderTree(d, group("r", null, "", { dir: "row", gap: 200, header: 0 }, [
    grid("col", null, "C", { cols: 1, gap: 40 }, [icon("top", "ec2", "Top"), icon("mid", "s3", "Mid"), icon("bot", "rds", "Bot")]),
    icon("far", "athena", "Far"),
  ]), [40, 60]);
  d.link("top", "far", "feedback", { rail: "bottom" });
  const p = portOf(d.toXML(), "top", "far");
  assert.ok(p.exitX === "0" || p.exitX === "1", `source must jog to a side (got exitX=${p.exitX}, exitY=${p.exitY})`);
});

test("rail: a bottom-rail edge routes along one gutter Y below the node row", () => {
  const d = new Diagram("pipeline");
  renderTree(d, group("r", "group_region", "R", { dir: "row", gap: 80 }, [icon("a", "ec2", "A"), icon("b", "s3", "B"), icon("c", "athena", "C")]), [40, 60]);
  d.link("a", "b"); d.link("b", "c");
  d.link("c", "a", "feedback", { rail: "bottom", dash: true });
  const xml = d.toXML();
  const edge = xml.split("<mxCell").find((s) => /source="c"/.test(s) && /target="a"/.test(s));
  const ys = [...edge.matchAll(/<mxPoint x="[-\d.]+" y="([-\d.]+)"/g)].map((m) => +m[1]);
  assert.ok(ys.length >= 2, "rail edge carries waypoints");
  assert.equal(ys[0], ys[1], "the two rail waypoints share one gutter Y");
  assert.ok(ys[0] > d.R["a"].y + d.R["a"].h, "the rail sits below the node row");
});
