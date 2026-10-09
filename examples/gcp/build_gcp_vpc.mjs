// GCP global VPC across two regions — GENERIC template. KEY GCP fact: a VPC is GLOBAL, so it WRAPS
// multiple Region blocks; Subnets are REGIONAL (inside a region). Project = billing/isolation boundary.
// Global LB / DNS / CDN and managed data services sit OUTSIDE the region blocks. Containers = frame().
// Run: node examples/gcp/build_gcp_vpc.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { frame, icon, box, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("network");
const GBLUE = "#4285F4";

const region = (id, label, kids) =>
  frame(id, label, { dir: "col", gap: 12, stroke: "#8AB4F8" }, [
    frame(`${id}_sn`, "Subnet (regional)", { dir: "col", gap: 10, stroke: "#B0C7EE" }, kids),
  ]);

// The VPC is GLOBAL → a wide box containing regions side by side (do NOT nest VPC inside a region).
const vpc = frame("vpc", "VPC (global)  default", { dir: "row", gap: 40, align: "top", stroke: GBLUE, cornerIcon: "gcp_virtual_private_cloud" }, [
  region("us", "Region: us-central1", [icon("gke", "gcp_google_kubernetes_engine", "GKE"), icon("gce_us", "gcp_compute_engine", "Compute Engine")]),
  region("eu", "Region: europe-west1", [icon("run", "gcp_cloud_run", "Cloud Run"), icon("gce_eu", "gcp_compute_engine", "Compute Engine")]),
]);

const project = frame("proj", "Project: prod-proj", { dir: "col", gap: 20, stroke: "#555555", cornerIcon: "gcp_project" }, [
  vpc,
  frame("managed", "Managed data services (regional/multi-region — not in VPC)", { dir: "row", gap: 20, stroke: "#999999" }, [
    icon("sql", "gcp_cloud_sql", "Cloud SQL"),
    icon("bq", "gcp_bigquery", "BigQuery"),
    icon("gcs", "gcp_cloud_storage", "Cloud Storage"),
  ]),
]);

const globals = frame("globals", "Global (spans all regions)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("glb", "gcp_cloud_load_balancing", "Global HTTP(S) LB"),
  icon("cdn", "gcp_cloud_cdn", "Cloud CDN"),
  icon("dns", "gcp_cloud_dns", "Cloud DNS"),
]);

const tree = frame("root", "GCP global VPC, multi-region (Project → global VPC → regional Subnets)", { dir: "col", gap: 30 }, [globals, project]);
renderTree(d, tree, [40, 70]);

d.link("glb", "gke", "", { role: "fanout" });
d.link("glb", "run", "", { role: "fanout" });
d.link("gce_us", "sql", "", { flow: true });
d.link("run", "bq", "", { flow: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/gcp_vpc_kit.drawio", import.meta.url), d.mxfile("GCP global VPC multi-region"));
