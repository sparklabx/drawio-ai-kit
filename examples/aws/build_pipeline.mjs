// Layered data analytics pipeline — type "pipeline". GENERIC template.
// Uses the THEME via themed creators (stage / band / endpoint): pale per-stage tints,
// neutral band, theme-aware (light-dark) colors — no hand-picked hex. Engine does the layout.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { group, frame, icon, stage, band, endpoint, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("pipeline");

// each stage takes the i-th theme tint automatically; spine = first item (same row → straight)
const ingest = stage("ing", 0, "Ingest", [
  icon("kds", "kinesis_data_streams", "Kinesis Data Streams"),
  icon("msk", "managed_streaming_for_kafka", "Amazon MSK"),
  icon("ds", "datasync", "AWS DataSync"),
]);
const process = stage("pr", 1, "Process", [
  icon("emr", "emr", "Amazon EMR / Spark"),
  icon("glue", "glue", "AWS Glue (ETL)"),
  icon("lambda", "lambda", "Lambda"),
]);
const store = stage("st", 2, "Store", [
  icon("s3", "s3", "S3 (data lake)"),
  icon("redshift", "redshift", "Redshift"),
  icon("ddb", "dynamodb", "DynamoDB"),
]);
const serve = stage("sv", 3, "Serve", [
  icon("athena", "athena", "Athena"),
  icon("os", "elasticsearch_service", "OpenSearch"),
  icon("qs", "quicksight", "QuickSight"),
]);

const xcut = band("band", "Governance · Security · Monitoring (cross-cutting)", [
  icon("iam", "identity_and_access_management", "IAM"),
  icon("kms", "key_management_service", "KMS"),
  icon("lf", "lake_formation", "Lake Formation"),
  icon("gdc", "glue_data_catalog", "Glue Data Catalog"),
  icon("cw", "cloudwatch_2", "CloudWatch"),
]);

const cloud = group("aws", "group_aws_cloud_alt", "AWS Cloud", { dir: "col", gap: 36 }, [
  phantom("pipe", "", { dir: "row", gap: 50, align: "top", header: 0 }, [ingest, process, store, serve]),
  xcut,
]);

const tree = phantom("root", "", { dir: "row", gap: 50, align: "center", header: 0, pad: 10 }, [
  endpoint("src", "DATA SOURCES\n\nDB · apps · files\n· event streams"),
  cloud,
  endpoint("cons", "CONSUMERS\n\nBI · ML · apps"),
]);

renderTree(d, tree, [40, 80]);
d.title("Layered data analytics pipeline — type: pipeline");

d.link("src", "kds", "stream", { role: "fanout" });
d.link("src", "msk", "events", { role: "fanout" });
d.link("src", "ds", "batch", { role: "fanout" });
d.link("kds", "emr", "ingest", { step: 1 });   // numbered main flow (spine)
d.link("emr", "s3", "process", { step: 2 });
d.link("s3", "athena", "query", { step: 3 });
d.link("athena", "cons", "results", { step: 4 });
d.link("s3", "os", "", { role: "fanout" });
d.link("os", "cons", "search");
d.link("qs", "cons", "dashboards");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/pipeline_kit.drawio", import.meta.url), d.mxfile("Data pipeline (pipeline)"));
