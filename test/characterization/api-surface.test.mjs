// Golden snapshot of the public library surface (dist/kit.mjs) + its data-only exports.
import { test } from "node:test";
import { KIT, normalize, sha256, snapshotFile } from "./_helpers.mjs";

const kit = await import(KIT);
const match = snapshotFile("api-surface");

test("api: sorted export names + typeof", () => {
  match("exports", Object.keys(kit).sort().map((k) => `${k}:${typeof kit[k]}`));
});

test("api: data constants (THEME, DIAGRAM_TYPES, BPMN, catalog paths)", () => {
  match("THEME", kit.THEME);
  match("DIAGRAM_TYPES", kit.DIAGRAM_TYPES);
  match("BPMN", kit.BPMN);
  match("paths", { CATALOG_INDEX: normalize(kit.CATALOG_INDEX), DEFAULT_CATALOG: normalize(kit.DEFAULT_CATALOG) });
});

test("api: loadCatalog / getIcon / listCategories / listTypes", () => {
  const c = kit.loadCatalog();
  match("catalog.keys", Object.keys(c).sort());
  match("getIcon.s3", kit.getIcon(c, "s3"));
  match("getIcon.group_vpc", kit.getIcon(c, "group_vpc"));
  match("getIcon.missing", kit.getIcon(c, "definitely_not_an_icon") ?? null);
  match("listCategories", kit.listCategories(c));
  match("listTypes", kit.listTypes());
});

test("api: programmatic Diagram build is byte-stable", () => {
  const d = new kit.Diagram("network");
  const root = kit.group("vpc", "group_vpc", "VPC", { dir: "row", gap: 40 }, [
    kit.icon("alb", "application_load_balancer", "ALB"),
    kit.icon("ec2", "ec2", "EC2"),
    kit.icon("rds", "rds", "RDS"),
  ]);
  kit.renderTree(d, root);
  d.link("alb", "ec2", "http");
  d.link("ec2", "rds", "sql");
  const xml = d.mxfile("API probe");
  const v = d.validate();
  match("diagram.probe", { sha256: sha256(xml), bytes: xml.length, ok: v.ok, errors: v.errors, warnings: v.warnings });
  match("graph.probe", kit.suggestLayout(kit.graphFromXml(xml)));
  match("audit.probe", kit.auditAesthetics(xml));
});
