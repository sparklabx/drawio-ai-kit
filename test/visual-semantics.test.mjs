import assert from "node:assert/strict";
import test from "node:test";

import { auditVisualSemantics } from "../src/core.mjs";

const cell = (id, value, style, geometry) =>
  `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1"><mxGeometry ${geometry} as="geometry"/></mxCell>`;

const root = (cells) =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

test("flags prose-heavy boxes and orphan operational services", () => {
  const xml = root([
    cell("note", "This paragraph explains architecture that should use visual nodes and short connected edges instead", "rounded=0;", 'x="0" y="0" width="200" height="80"'),
    cell("db", "Metadata", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;aspect=fixed;", 'x="240" y="0" width="48" height="48"'),
    cell("iam", "IAM", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.identity_and_access_management;aspect=fixed;", 'x="320" y="0" width="48" height="48"'),
    cell("runtime__ci", "", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;aspect=fixed;", 'x="400" y="0" width="22" height="22"'),
  ].join(""));

  const advice = auditVisualSemantics(xml);

  assert.equal(advice.length, 2);
  assert.match(advice[0], /Prose-heavy architecture label/);
  assert.match(advice[1], /Orphan operational AWS service icon/);
  assert.match(advice[1], /db \(dynamodb\)/);
  assert.doesNotMatch(advice[1], /iam/);
  assert.doesNotMatch(advice[1], /runtime__ci/);
});

test("accepts short labels and connected operational services", () => {
  const xml = root([
    cell("fn", "Query", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;aspect=fixed;", 'x="0" y="0" width="48" height="48"'),
    cell("db", "Metadata", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;aspect=fixed;", 'x="120" y="0" width="48" height="48"'),
    '<mxCell id="e1" value="reads" edge="1" source="fn" target="db" parent="1" style="edgeStyle=orthogonalEdgeStyle;"><mxGeometry relative="1" as="geometry"/></mxCell>',
  ].join(""));

  assert.deepEqual(auditVisualSemantics(xml), []);
});

test("treats an unconnected serviceFrame as an orphan parent service", () => {
  const xml = root(cell(
    "pipeline",
    "Pipeline",
    "serviceFrame=1;serviceIcon=lambda;serviceBorder=solid;dashed=0;",
    'x="0" y="0" width="200" height="120"',
  ));

  assert.match(auditVisualSemantics(xml).join("\n"), /pipeline \(lambda\)/);
});

test("flags deployment variables and Regions in AWS service labels", () => {
  const xml = root([
    cell("bucket", "cheapkb-&lt;account&gt;-us-east-1", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;aspect=fixed;", 'x="0" y="0" width="48" height="48"'),
    cell("fn", "Query", "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;aspect=fixed;", 'x="120" y="0" width="48" height="48"'),
    '<mxCell id="e1" edge="1" source="fn" target="bucket" parent="1" style="edgeStyle=orthogonalEdgeStyle;"><mxGeometry relative="1" as="geometry"/></mxCell>',
  ].join(""));

  assert.match(auditVisualSemantics(xml).join("\n"), /bucket.*short human-readable service names/);
});
