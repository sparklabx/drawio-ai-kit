// Pins layout-engine branches not covered elsewhere (vertical pool, corner icon, multi-line icon, row/col stretch, grid stack).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagram } from "../src/builder.ts";
import { box, frame, grid, group, icon, phantom, pool, renderTree } from "../src/layout-engine.ts";
import { centerInGapX, inset, route, routeLR, routeTB } from "../src/layout.ts";

test("icon: caption band grows 16px per extra label line", () => {
  const t = renderTree(new Diagram(), group("g", null, "G", {}, [icon("a", "s3", "one"), icon("b", "s3", "one\ntwo")]));
  const [a, b] = t.children as { h: number }[];
  assert.equal(b.h - a.h, 16);
});

test("row: shorter container stretches to the tallest sibling; col: group stretches to the widest", () => {
  const row = renderTree(new Diagram(), frame("r", "R", { dir: "row" }, [
    frame("tall", "T", { dir: "col" }, [box("x", "x", { h: 100 }), box("y", "y", { h: 100 })]),
    frame("short", "S", { dir: "col" }, [box("z", "z", { h: 44 })]),
  ]));
  const [tall, short] = row.children as { h: number }[];
  assert.equal(short.h, tall.h);
  const col = renderTree(new Diagram(), frame("c", "C", { dir: "col" }, [frame("wide", "W", {}, [box("p", "p", { w: 240 })]), frame("narrow", "N", {}, [box("q", "q", { w: 120 })])]));
  const [wide, narrow] = col.children as { w: number }[];
  assert.equal(narrow.w, wide.w);
});

test("vertical pool: lanes are columns, flow runs top to bottom", () => {
  const t = renderTree(new Diagram(), pool("p", "P", { orientation: "vertical", lanes: ["A", "B"] }, [
    { ...box("n0", "n0"), lane: 0, col: 0 }, { ...box("n1", "n1"), lane: 1, col: 1 },
  ]));
  const [n0, n1] = t.children as { x: number; y: number }[];
  assert.ok(n1.x > n0.x && n1.y > n0.y);
});

test("cornerIcon frame emits a corner icon cell; phantom emits none", () => {
  const d = new Diagram();
  renderTree(d, frame("f", "F", { cornerIcon: "s3" }, [phantom("ph", "", {}, [icon("i", "s3", "i")])]));
  const xml = d.toXML();
  assert.match(xml, /id="f__ci"/);
  assert.doesNotMatch(xml, /id="ph"/);
});

test("grid: cells share the largest size, rows wrap at cols", () => {
  const t = renderTree(new Diagram(), grid("g", null, "G", { cols: 2 }, [icon("a", "s3", "a"), icon("b", "s3", "b"), icon("c", "s3", "c")]));
  const [a, , c] = t.children as { x: number; y: number }[];
  assert.equal(a.x, c.x);
  assert.ok(c.y > a.y);
});

test("layout helpers: route picks the dominant axis; inset/centerInGapX math", () => {
  const s = { x: 0, y: 0, w: 40, h: 40 }, t = { x: 200, y: 100, w: 40, h: 40 };
  assert.deepEqual(route(s, t), routeLR(s, t));
  assert.deepEqual(route(s, { x: 0, y: 300, w: 40, h: 40 }), routeTB(s, { x: 0, y: 300, w: 40, h: 40 }));
  assert.deepEqual(inset({ x: 0, y: 0, w: 100, h: 100 }), { x: 18, y: 24, w: 64, h: 64 });
  assert.equal(centerInGapX(s, t, 20), 110);
});
