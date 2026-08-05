// Databricks Lakehouse (medallion) — GENERIC template, in the Databricks house style: a coral platform
// header band + a navy Unity Catalog governance band (both filled, white text), white stage frames
// (no gray fills), full-colour product icons, and the medallion drawn as the colored Bronze→Silver→Gold
// DB cylinders. Run: node examples/databricks/build_lakehouse.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("pipeline");
const CORAL = "#FF3621", NAVY = "#1B3139";

// filled band with white text (box() hardcodes dark text → raw style)
const band = (id, label, fill, w, h = 34, fs = 14) => box(id, label, { w, h,
  style: `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=none;fontColor=#FFFFFF;fontSize=${fs};fontStyle=1;verticalAlign=middle;align=center;` });
// stage = white frame, navy border, dark title, full-colour icons
const stage = (id, title, kids) => frame(id, title, { dir: "col", gap: 12, stroke: NAVY }, kids);

const sources = stage("src", "Sources", [
  icon("kafka", "kafka", "Kafka (events)"),
  icon("oltp", "mysql", "OLTP DB"),
  icon("files", "s3", "Files / object store"),
]);
const ingest = stage("ing", "Ingestion — Lakeflow", [
  icon("lfc", "lakeflow_connect", "Lakeflow Connect"),
  icon("stream", "data_streaming", "Structured Streaming"),
]);
// medallion — colored Bronze → Silver → Gold DB cylinders, left→right refinement
const medallion = stage("med", "Medallion — Delta Lake", [
  phantom("medrow", "", { dir: "row", gap: 22, header: 0 }, [
    icon("bronze", "medallion_bronze", "Bronze"),
    icon("silver", "medallion_silver", "Silver"),
    icon("gold", "medallion_gold", "Gold"),
  ]),
]);
const serve = stage("serve", "Serving", [
  icon("dbsql", "databricks_sql", "Databricks SQL"),
  icon("mosaic", "mosaic_ai", "Mosaic AI"),
  icon("nb", "notebooks", "Notebooks"),
]);
const consume = stage("consume", "Consumers", [
  icon("bi", "bi_dashboards", "BI Dashboards"),
  icon("tab", "tableau", "Tableau"),
  icon("pbi", "power_bi", "Power BI"),
]);

const stagesRow = phantom("stages", "", { dir: "row", gap: 40, align: "top", header: 0 },
  [sources, ingest, medallion, serve, consume]);
const BW = 1180;
// cross-cutting governance — a navy band + the Unity Catalog icon, dash-linked to the medallion
const gov = frame("govf", "", { dir: "col", gap: 8, stroke: NAVY, align: "center" }, [
  band("uc_h", "Unity Catalog — Governance · Lineage · Access", NAVY, BW, 30, 13),
  phantom("ucrow", "", { dir: "row", gap: 16, header: 0 }, [icon("unity", "unity_catalog", "Unity Catalog")]),
]);

const root = phantom("root", "", { dir: "col", gap: 20, header: 0, align: "center" }, [
  band("hdr", "≣   Databricks Lakehouse Platform   ≣", CORAL, BW, 46, 18),
  stagesRow,
  gov,
]);
renderTree(d, root, [40, 60]);

// sources fan into ingestion; the medallion → serve spine carries the numbered flow
d.link("kafka", "lfc", "", { role: "fanout" });
d.link("oltp", "lfc", "", { role: "fanout" });
d.link("files", "stream", "", { flow: true });
d.link("stream", "bronze", "", { flow: true });
d.link("lfc", "bronze", "ingest", { step: 1 });
d.link("bronze", "silver", "clean", { step: 2 });
d.link("silver", "gold", "curate", { step: 3 });
d.link("gold", "dbsql", "serve", { step: 4 });
d.link("gold", "mosaic", "", { role: "fanout" });   // AI branch off the gold layer
d.link("dbsql", "bi", "visualize", { step: 5 });
d.link("unity", "med", "governs", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/databricks_lakehouse_kit.drawio", import.meta.url), d.mxfile("Databricks Lakehouse (medallion)"));
