// GCP hybrid + DR (active-passive) — GENERIC template. On-prem reaches GCP via Dedicated Interconnect + a
// Cloud Router (BGP), with Cloud VPN as the backup path; a PRIMARY region runs active workloads on a regional-HA
// Cloud SQL, a DR region keeps a cross-region read replica warm; Cloud DNS flips traffic on failover. The VPC is
// GLOBAL; regions are labelled frames (GCP ships no region stencil — only VPC/Project carry an icon).
// Sibling regions are equal-height (engine-enforced). Run: node examples/gcp/build_gcp_hybrid_dr.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("network");
const GBLUE = "#4285F4";

const region = (rid, rname, vmLabel, sqlLabel) =>
  frame(`rg_${rid}`, rname, { dir: "col", gap: 12, stroke: "#8AB4F8" }, [
    frame(`sn_${rid}`, "Subnet (regional)", { dir: "row", gap: 16, stroke: "#B0C7EE" }, [
      icon(`vm_${rid}`, "gcp_compute_engine", vmLabel),
      icon(`sql_${rid}`, "gcp_cloud_sql", sqlLabel),
    ]),
  ]);

const vpc = frame("vpc", "VPC (global)  prod-vpc", { dir: "row", gap: 40, align: "top", stroke: GBLUE, cornerIcon: "gcp_virtual_private_cloud" }, [
  region("p", "Region: us-central1 (primary)", "Compute Engine (active)", "Cloud SQL — regional-HA primary"),
  region("d", "Region: us-east1 (DR)", "Compute Engine (standby)", "Cloud SQL — cross-region replica"),
]);

const edge = frame("edge", "Hybrid connectivity", { dir: "row", gap: 20, stroke: "#999999" }, [
  icon("ic", "gcp_cloud_interconnect", "Dedicated Interconnect"),
  icon("cr", "gcp_cloud_router", "Cloud Router (BGP)"),
  icon("vpn", "gcp_cloud_vpn", "Cloud VPN (backup)"),
]);

const project = frame("proj", "Project: prod-proj", { dir: "col", gap: 20, stroke: "#555555", cornerIcon: "gcp_project" }, [edge, vpc]);

const globals = frame("globals", "Global (DNS failover)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("dns", "gcp_cloud_dns", "Cloud DNS"),
]);

const onprem = box("onprem", "On-premises\ndatacenter", { w: 160, h: 70 });
const gcol = phantom("gcol", "", { dir: "col", gap: 30, header: 0 }, [globals, project]);
const tree = phantom("root", "GCP hybrid + DR — Interconnect + active-passive failover (cross-region Cloud SQL replica)", { dir: "row", gap: 60, align: "top" }, [onprem, gcol]);
renderTree(d, tree, [40, 70]);

d.link("onprem", "ic", "Dedicated Interconnect");
d.link("ic", "cr", "", { flow: true });
d.link("cr", "vm_p", "");
d.link("dns", "vm_p", "", { role: "fanout" });
d.link("dns", "vm_d", "failover", { dash: true });
d.link("vm_p", "sql_p", "");
d.link("sql_p", "sql_d", "cross-region replica", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/gcp_hybrid_dr_kit.drawio", import.meta.url), d.mxfile("GCP hybrid DR"));
