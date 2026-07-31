// Data lake + analytics on AWS — type "pipeline". NO hardcoded coords.
// Ingest → medallion S3 (raw/curated) → catalog/ETL → query → BI, with a numbered flow.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("pipeline");

const tree = phantom("root", "", { dir: "row", gap: 46, align: "center", header: 0, pad: 10 }, [
  box("src", "Sources\n(apps · logs · DBs)", { w: 130, h: 70, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
  icon("fh", "kinesis_data_firehose", "Firehose"),
  frame("lake", "S3 data lake", { dir: "col", gap: 14, fill: "#FFFFFF", stroke: "#B0752A" }, [
    icon("raw", "s3", "Raw zone"),
    icon("cur", "s3", "Curated zone"),
  ]),
  frame("proc", "Catalog + ETL", { dir: "col", gap: 14, fill: "#FFFFFF", stroke: "#999999" }, [
    icon("glue", "glue", "Glue ETL"),
    icon("lf", "lake_formation", "Lake Formation"),
  ]),
  frame("query", "Query", { dir: "col", gap: 14, fill: "#FFFFFF", stroke: "#999999" }, [
    icon("athena", "athena", "Athena"),
    icon("rs", "redshift", "Redshift"),
  ]),
  icon("qs", "quicksight", "QuickSight"),
]);

renderTree(d, tree, [40, 90]);
d.title("Data lake + analytics — ingest → lake → ETL → query → BI");

d.link("src", "fh", "stream", { step: 1 });
d.link("fh", "raw", "land", { step: 2 });
d.link("raw", "glue", "clean", { step: 3 });
d.link("glue", "cur", "write", { step: 4 });
d.link("cur", "athena", "query", { step: 5 });
d.link("athena", "qs", "visualize", { step: 6 });
d.link("lf", "glue", "", { dash: true });          // governance, not a flow step
d.link("cur", "rs", "load", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/datalake_analytics_kit.drawio", import.meta.url), d.mxfile("Data lake + analytics"));
