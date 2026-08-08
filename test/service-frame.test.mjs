import assert from "node:assert/strict";
import test from "node:test";

import { Diagram } from "../src/builder.mjs";
import { auditServiceFrames, loadCatalog } from "../src/core.mjs";
import { box, frame, renderTree, serviceFrame } from "../src/layout-engine.mjs";

test("serviceFrame defaults to a solid border and emits a flush badge with a normal title", () => {
  const d = new Diagram("pipeline", { contract: "bake" });
  const tree = frame("root", "", { dir: "row", stroke: "none" }, [
    serviceFrame("solid", "lambda", "Pipeline", [box("solid-child", "Dispatch")]),
    serviceFrame("dashed", "lambda", "Worker", { borderStyle: "dashed" }, [box("dashed-child", "Run")]),
    serviceFrame("dotted", "lambda", "Indexer", { borderStyle: "dotted" }, [box("dotted-child", "Index")]),
    serviceFrame("dash-dot", "lambda", "Policy", { borderStyle: "dash-dot" }, [box("dash-dot-child", "Check")]),
  ]);

  renderTree(d, tree);
  const xml = d.toXML();

  assert.deepEqual(auditServiceFrames(d.c, xml), []);
  assert.match(xml, /id="solid"[^>]*dashed=0[^>]*serviceBorder=solid[^>]*fontStyle=0/);
  assert.match(xml, /id="dashed"[^>]*dashPattern=8 4/);
  assert.match(xml, /id="dotted"[^>]*dashPattern=1 4/);
  assert.match(xml, /id="dash-dot"[^>]*dashPattern=8 4 1 4/);
  assert.match(xml, /id="solid__ci"[^>]*parent="solid"><mxGeometry x="0" y="0" width="22" height="22"/);
});

test("serviceFrame rejects unsupported border styles", () => {
  assert.throws(
    () => serviceFrame("bad", "lambda", "Worker", { borderStyle: "double" }, [box("child", "Run")]),
    /invalid borderStyle/,
  );
});

test("serviceFrame advisor flags bold, gapped, empty, and placeholder-named frames", () => {
  const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="runtime" value="cheapkb-&lt;account&gt;-${"${region}"}" style="serviceFrame=1;serviceIcon=lambda;serviceBorder=dashed;strokeColor=light-dark(#ED7100,#F5AE66);dashed=1;dashPattern=8 4;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="200" height="100" as="geometry"/></mxCell>
    <mxCell id="runtime__ci" value="" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;aspect=fixed;" vertex="1" parent="runtime"><mxGeometry x="8" y="7" width="22" height="22" as="geometry"/></mxCell>
  </root></mxGraphModel>`;

  const advice = auditServiceFrames(loadCatalog(), xml).join("\n");

  assert.match(advice, /bold or italic/);
  assert.match(advice, /not flush/);
  assert.match(advice, /no owned child nodes/);
  assert.match(advice, /deployment data, a variable, or a placeholder/);
});
