import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, searchIcon, getIcon, styleForIcon, validateDiagram, auditAesthetics, auditGeometry, auditEdges, auditArchitecture } from "../src/core.mjs";

const catalog = loadCatalog();

// fixture helpers mirroring the engine's emitted style shapes
const _subnet = (id, label, parent = "1") =>
  `<mxCell id="${id}" value="${label}" style="grIcon=mxgraph.aws4.group_subnet;" parent="${parent}"><mxGeometry x="0" y="0" width="300" height="200" as="geometry"/></mxCell>`;
const _az = (id, parent = "1") =>
  `<mxCell id="${id}" value="AZ" style="grIcon=mxgraph.aws4.group_availability_zone;" parent="${parent}"><mxGeometry x="0" y="0" width="400" height="300" as="geometry"/></mxCell>`;
const _icon = (id, name, parent = "1") =>
  `<mxCell id="${id}" value="${name}" style="resIcon=mxgraph.aws4.${name};" parent="${parent}"><mxGeometry x="10" y="10" width="48" height="48" as="geometry"/></mxCell>`;

test("arch: flags a database in a public subnet", () => {
  const xml = `<root>${_subnet("pub", "Public subnet")}${_icon("db1", "rds", "pub")}</root>`;
  const a = auditArchitecture(xml);
  assert.ok(a.some((s) => /Database "db1".*PUBLIC subnet/.test(s)), a.join("\n"));
});

// A labelled subnet swaps its glyph to the security-group padlock but carries a `subnet=1` marker
// (builder.group). The audit must still recognise it as a subnet via the marker, not the glyph.
const _subnetPadlock = (id, label, parent = "1") =>
  `<mxCell id="${id}" value="${label}" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;subnet=1;" parent="${parent}"><mxGeometry x="0" y="0" width="300" height="200" as="geometry"/></mxCell>`;

test("arch: DB in a padlock-glyph public subnet (subnet=1 marker) is still flagged", () => {
  const xml = `<root>${_subnetPadlock("pub", "Public subnet")}${_icon("db1", "rds", "pub")}</root>`;
  assert.ok(auditArchitecture(xml).some((s) => /Database "db1".*PUBLIC subnet/.test(s)));
});

test("arch: a database in a private subnet is fine", () => {
  const xml = `<root>${_subnet("prv", "Private subnet")}${_icon("db1", "rds", "prv")}</root>`;
  assert.equal(auditArchitecture(xml).length, 0);
});

test("arch: flags a single NAT gateway across multiple AZs", () => {
  const xml = `<root>${_az("az1")}${_az("az2")}${_icon("nat", "nat_gateway", "az1")}</root>`;
  assert.ok(auditArchitecture(xml).some((s) => /single NAT gateway serves 2/i.test(s)));
});

test("arch: one NAT gateway per AZ is fine", () => {
  const xml = `<root>${_az("az1")}${_az("az2")}${_icon("n1", "nat_gateway", "az1")}${_icon("n2", "nat_gateway", "az2")}</root>`;
  assert.ok(!auditArchitecture(xml).some((s) => /NAT gateway/.test(s)));
});

test("arch: skips non-AWS diagrams (gate)", () => {
  const xml = `<root><mxCell id="a" value="Public subnet" style="shape=mxgraph.bpmn.task;"/></root>`;
  assert.equal(auditArchitecture(xml).length, 0);
});

const _v = (id, x, y) => `<mxCell id="${id}" vertex="1" style="rounded=0;"><mxGeometry x="${x}" y="${y}" width="80" height="50" as="geometry"/></mxCell>`;
const _e = (s, t) => `<mxCell edge="1" source="${s}" target="${t}" style=""/>`;

test("edges: flags long detour connectors to a far-away node", () => {
  // a shared node parked far at the bottom → 3 long edges (the "parked far" smell)
  const xml = `<root>${_v("a", 0, 0)}${_v("b", 400, 0)}${_v("c", 800, 0)}${_v("shared", 400, 1400)}${_e("a", "shared")}${_e("b", "shared")}${_e("c", "shared")}</root>`;
  assert.ok(auditEdges(xml).some((a) => /Long connector/.test(a)));
});

test("edges: a tidy short pipeline is not flagged", () => {
  const xml = `<root>${_v("a", 0, 0)}${_v("b", 200, 0)}${_v("c", 400, 0)}${_e("a", "b")}${_e("b", "c")}</root>`;
  assert.equal(auditEdges(xml).length, 0);
});

test("search finds the correct S3 by its real name 's3'", () => {
  const r = searchIcon(catalog, "s3");
  assert.ok(r.some((x) => x.name === "s3"), "must have an icon named 's3'");
  const s3 = r.find((x) => x.name === "s3");
  assert.equal(s3.style, undefined, "search results are compact — no style string");
  assert.ok(s3.color, "compact result keeps the category color");
});

test("search --full returns the style string", () => {
  const r = searchIcon(catalog, "s3", { full: true });
  const s3 = r.find((x) => x.name === "s3");
  assert.match(s3.style, /resIcon=mxgraph\.aws4\.s3;/);
});

test("search finds EKS by the keyword kubernetes", () => {
  const r = searchIcon(catalog, "kubernetes");
  assert.ok(r.some((x) => x.name === "eks"));
});

test("search expands shorthand aliases (k8s -> kubernetes, pg -> postgresql)", () => {
  assert.ok(searchIcon(catalog, "k8s").some((x) => x.name === "kubernetes"));
  assert.ok(searchIcon(catalog, "pg").some((x) => /postgres/.test(x.name)));
});

// Head-noun boost: a qualifier token ("gateway") must not outrank the exact head noun ("endpoint").
test("search head-noun: 'gateway vpc endpoint' ranks the endpoint first", () => {
  assert.equal(searchIcon(catalog, "gateway vpc endpoint")[0].name, "endpoint");
});
test("search head-noun does not regress 'nat gateway'", () => {
  assert.equal(searchIcon(catalog, "nat gateway")[0].name, "nat_gateway");
});

test("styleForIcon returns the style verbatim (S3 = green + points + aspect=fixed)", () => {
  const s = styleForIcon(catalog, "s3");
  assert.match(s.style, /fillColor=#7AA116/);
  assert.match(s.style, /aspect=fixed/);
  assert.match(s.style, /points=/);
});

test("validate detects fabricated stencil names", () => {
  const xml = `<mxCell style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.totally_made_up;" />`;
  const res = validateDiagram(catalog, xml);
  assert.ok(res.warnings.length + res.errors.length >= 1);
});

test("validate is clean with a valid stencil", () => {
  const s = styleForIcon(catalog, "ec2").style;
  const xml = `<mxCell id="a" style="${s}"/>`;
  const res = validateDiagram(catalog, xml, { strict: true });
  assert.equal(res.errors.length, 0);
});

test("validate warns about an edge pointing to a nonexistent id", () => {
  const xml = `<mxCell id="a"/><mxCell source="a" target="ghost" edge="1"/>`;
  const res = validateDiagram(catalog, xml);
  assert.ok(res.warnings.some((w) => w.includes("ghost")));
});

test("getIcon returns null for a name that does not exist", () => {
  assert.equal(getIcon(catalog, "nope_nope"), null);
});

test("audit catches huge font sizes and too many sizes (vertices only)", () => {
  const v = (s, id) => `<mxCell id="${id}" vertex="1" style="rounded=0;fontSize=${s};"/>`;
  // 5 distinct vertex sizes -> too many; two >=16 cells -> repeated oversizing.
  const xml = `<root>${v(10, "a")}${v(11, "b")}${v(12, "c")}${v(13, "d")}${v(18, "e")}${v(18, "f")}</root>`;
  const a = auditAesthetics(xml);
  assert.ok(a.advice.some((x) => /font sizes/i.test(x)));
  assert.ok(a.advice.some((x) => /too large/i.test(x)));
});

test("audit font budget ignores edge labels and allows one hero title", () => {
  const v = (s, id) => `<mxCell id="${id}" vertex="1" style="rounded=0;fontSize=${s};"/>`;
  // 4 vertex sizes + an edge-label size that must NOT count; a single 18 hero is fine.
  const xml = `<root>${v(11, "a")}${v(12, "b")}${v(14, "c")}${v(18, "d")}<mxCell id="e1" edge="1" style="fontSize=10;"/></root>`;
  const a = auditAesthetics(xml);
  assert.ok(!a.advice.some((x) => /font sizes/i.test(x)));
  assert.ok(!a.advice.some((x) => /too large/i.test(x)));
});

test("audit suggests fan-out: square corners + pin connection points", () => {
  const e = (s, t) => `<mxCell edge="1" source="${s}" target="${t}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;"/>`;
  const xml = `<root>${e("hub", "a")}${e("hub", "b")}${e("hub", "c")}</root>`;
  const a = auditAesthetics(xml);
  assert.ok(a.advice.some((x) => /rounded=0|sharp corners/.test(x)));
  assert.ok(a.advice.some((x) => /Pin connection points/.test(x)));
  assert.equal(a.metrics.fanOutSources, 1);
});

test("AWS: catches an icon recolored to the wrong category", () => {
  const xml = `<mxCell id="a" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;fillColor=#FF0000;aspect=fixed;"/>`;
  const res = validateDiagram(catalog, xml);
  assert.ok(res.audit.advice.some((x) => /recolored/.test(x)), "must warn that S3 was recolored");
});

test("AWS: catches groups nested in the wrong order (flat subnet despite a VPC)", () => {
  const xml = `<root>
    <mxCell id="vpc" parent="1" vertex="1" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;"/>
    <mxCell id="sn" parent="1" vertex="1" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;"/>
  </root>`;
  const res = validateDiagram(catalog, xml);
  assert.ok(res.audit.advice.some((x) => /nested inside a higher-level group/.test(x)));
});

test("AWS: the outermost group (top-level Region) is not warned about nesting", () => {
  const xml = `<root>
    <mxCell id="rg" parent="1" vertex="1" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_region;"/>
  </root>`;
  const res = validateDiagram(catalog, xml);
  assert.ok(!res.audit.advice.some((x) => /nested inside a higher-level group/.test(x)));
});

test("AWS: correctly nested groups (subnet inside VPC) are not warned about nesting", () => {
  const xml = `<root>
    <mxCell id="vpc" parent="1" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;"/>
    <mxCell id="sn" parent="vpc" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;"/>
  </root>`;
  const res = validateDiagram(catalog, xml);
  assert.ok(!res.audit.advice.some((x) => /group_subnet[\s\S]*nested inside/.test(x)));
});

test("audit catches a label sitting on a broken (L/Z) line missing a waypoint", () => {
  const v = (id, x, y) => `<mxCell id="${id}" vertex="1" style="rounded=1;"><mxGeometry x="${x}" y="${y}" width="100" height="50" as="geometry"/></mxCell>`;
  const e = (pts) => `<mxCell id="ed" edge="1" value="streaming" source="a" target="b" style="edgeStyle=orthogonalEdgeStyle;"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`;
  const noWp = `<root>${v("a", 0, 0)}${v("b", 400, 300)}${e("")}</root>`;
  assert.ok(validateDiagram(catalog, noWp).audit.advice.some((x) => /bent route/.test(x)));
  const withWp = `<root>${v("a", 0, 0)}${v("b", 400, 300)}${e('<Array as="points"><mxPoint x="200" y="150"/></Array>')}</root>`;
  assert.ok(!validateDiagram(catalog, withWp).audit.advice.some((x) => /bent route/.test(x)));
});

test("audit catches a sprawling palette", () => {
  const colors = ["#111", "#222", "#333", "#444", "#555", "#666", "#777", "#888", "#999"];
  const xml = colors.map((c) => `<mxCell style="rounded=1;fillColor=${c};"/>`).join("");
  const a = auditAesthetics(xml);
  assert.ok(a.advice.some((x) => /scattered/.test(x)));
});

test("AWS: flags a rounded frame but not a rounded edge", () => {
  const xml = `<root>
    <mxCell id="f" parent="1" vertex="1" style="rounded=1;whiteSpace=wrap;fillColor=#EEEEEE;"><mxGeometry width="200" height="100" as="geometry"/></mxCell>
    <mxCell id="e" parent="1" edge="1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;"/></root>`;
  const adv = validateDiagram(catalog, xml).audit.advice;
  assert.ok(adv.some((a) => /[Rr]ounded frame/.test(a)), "must flag the rounded frame");
  assert.ok(!/\be\b/.test(adv.filter((a) => /rounded/i.test(a)).join(" ")), "must not flag the rounded edge");
});

test("geometry: catches two overlapping sibling cells", () => {
  const xml = `<root><mxCell id="1" parent="0"/>
    <mxCell id="x" parent="1" vertex="1" style="rounded=0;"><mxGeometry x="100" y="100" width="80" height="60" as="geometry"/></mxCell>
    <mxCell id="y" parent="1" vertex="1" style="rounded=0;"><mxGeometry x="140" y="130" width="80" height="60" as="geometry"/></mxCell></root>`;
  assert.ok(auditGeometry(xml).some((a) => /overlap/.test(a)));
});

test("geometry: catches a child spilling outside its container", () => {
  const xml = `<root><mxCell id="1" parent="0"/>
    <mxCell id="frame" parent="1" vertex="1" style="container=1;"><mxGeometry x="0" y="0" width="100" height="100" as="geometry"/></mxCell>
    <mxCell id="kid" parent="frame" vertex="1" style="rounded=0;"><mxGeometry x="60" y="60" width="80" height="80" as="geometry"/></mxCell></root>`;
  assert.ok(auditGeometry(xml).some((a) => /spills outside/.test(a)));
});

test("geometry: a badge icon fully inside a box is NOT flagged (intentional layering)", () => {
  const xml = `<root><mxCell id="1" parent="0"/>
    <mxCell id="bus" parent="1" vertex="1" style="rounded=0;"><mxGeometry x="0" y="0" width="120" height="300" as="geometry"/></mxCell>
    <mxCell id="badge" parent="1" vertex="1" style="rounded=0;"><mxGeometry x="36" y="12" width="48" height="48" as="geometry"/></mxCell></root>`;
  assert.equal(auditGeometry(xml).filter((a) => /overlap/.test(a)).length, 0);
});

test("geometry: flags multiple edges entering one target at the same point", () => {
  const e = (s) => `<mxCell id="e_${s}" edge="1" source="${s}" target="hub" style="entryX=0;entryY=0.5;"/>`;
  const xml = `<root><mxCell id="1" parent="0"/>${e("a")}${e("b")}</root>`;
  assert.ok(auditGeometry(xml).some((a) => /same point/.test(a)));
});

import { routeLR, routeTB } from "../src/layout.mjs";

test("routeLR: same vertical band → straight line (no waypoints)", () => {
  const r = routeLR({ x: 0, y: 100, w: 100, h: 50 }, { x: 300, y: 110, w: 100, h: 50 });
  assert.equal(r.wp.length, 0);
  assert.match(r.pins, /exitX=1;.*entryX=0;/);
});

test("routeLR: offset bands → 2 waypoints in the same lane (vertical segment in the right slot)", () => {
  const r = routeLR({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 300, w: 100, h: 50 }, { laneX: 250 });
  assert.equal(r.wp.length, 2);
  assert.equal(r.wp[0].x, 250);
  assert.equal(r.wp[1].x, 250); // two points with the same X → straight vertical segment at the lane
});

test("routeTB: same horizontal band → straight vertical line", () => {
  const r = routeTB({ x: 0, y: 0, w: 200, h: 50 }, { x: 20, y: 300, w: 200, h: 50 });
  assert.equal(r.wp.length, 0);
  assert.match(r.pins, /exitY=1;.*entryY=0;/);
});

import { centerInGapX } from "../src/layout.mjs";
test("centerInGapX: aligns a node into the center of the gap between 2 rects", () => {
  // the gap between [0..100] and [300..400] has center 200; a node 40 wide → x=180
  assert.equal(centerInGapX({ x: 0, w: 100 }, { x: 300, w: 100 }, 40), 180);
});

import { Diagram } from "../src/builder.mjs";
import { group, icon, renderTree } from "../src/layout-engine.mjs";
test("layout-engine: parent frame automatically wraps its children tightly (no hardcoded coordinates)", () => {
  const d = new Diagram("network");
  const tree = group("reg", "group_region", "Region", { dir: "row" }, [
    group("acc", "group_account", "Account", { dir: "col" }, [
      icon("s3", "s3", "S3"), icon("ec2", "ec2", "EC2"),
    ]),
  ]);
  renderTree(d, tree, [40, 70]);
  const reg = d.rect("reg"), acc = d.rect("acc"), s3 = d.rect("s3");
  // parent fully wraps its children
  assert.ok(reg.x <= acc.x && reg.x + reg.w >= acc.x + acc.w, "region must wrap account");
  assert.ok(acc.y <= s3.y && acc.y + acc.h >= s3.y + s3.h, "account must wrap the icon");
  // page is computed automatically
  assert.ok(d.page[0] >= reg.x + reg.w);
});

test("validate: compressed .drawio (no mxCell) is rejected with a helpful error", () => {
  const compressed = `<mxfile><diagram name="A" id="1">jVPBcpswEP0aHZsBxxj7WNtpe0hnPHWmSY4yWkATSctIS4B8fSUQNsRJpjPWvN233nvCEttVzcJ</diagram></mxfile>`;
  const r = validateDiagram(catalog, compressed);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /COMPRESSED/.test(e)), "must hint at compression");
});

test("validate: empty file is rejected, not silently ok", () => {
  const r = validateDiagram(catalog, "<mxfile></mxfile>");
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /No <mxCell>/.test(e)));
});
