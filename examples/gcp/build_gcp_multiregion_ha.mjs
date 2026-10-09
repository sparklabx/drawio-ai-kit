// GCP multi-region HA (active-active) — GENERIC template. A GLOBAL HTTP(S) Load Balancer (single anycast IP)
// fans traffic to regional Managed Instance Groups spread across ZONES in TWO regions (HA within + across
// regions); Cloud Spanner (multi-region) is the globally-consistent HA database, outside the VPC. The VPC is
// GLOBAL; regions/zones are labelled frames (GCP ships no region/zone stencil — only VPC/Project carry an icon).
// Sibling regions are equal-height (engine-enforced). Run: node examples/gcp/build_gcp_multiregion_ha.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { frame, icon, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("network");
const GBLUE = "#4285F4";

const zone = (id, label, node) => frame(id, label, { dir: "col", gap: 8, stroke: "#B0C7EE" }, [node]);

const region = (rid, rname) =>
  frame(`rg_${rid}`, rname, { dir: "col", gap: 12, stroke: "#8AB4F8" }, [
    frame(`sn_${rid}`, "Subnet (regional) · MIG across zones", { dir: "row", gap: 16, stroke: "#B0C7EE" }, [
      zone(`z1_${rid}`, "Zone -a", icon(`vm1_${rid}`, "gcp_compute_engine", "MIG")),
      zone(`z2_${rid}`, "Zone -b", icon(`vm2_${rid}`, "gcp_compute_engine", "MIG")),
    ]),
  ]);

// The VPC is GLOBAL → a wide box wrapping regions side by side (do NOT nest VPC inside a region).
const vpc = frame("vpc", "VPC (global)  prod-vpc", { dir: "row", gap: 40, align: "top", stroke: GBLUE, cornerIcon: "gcp_virtual_private_cloud" }, [
  region("us", "Region: us-central1"),
  region("eu", "Region: europe-west1"),
]);

const project = frame("proj", "Project: prod-proj", { dir: "col", gap: 20, stroke: "#555555", cornerIcon: "gcp_project" }, [
  vpc,
  frame("managed", "Managed data (multi-region — not in VPC)", { dir: "row", gap: 20, stroke: "#999999" }, [
    icon("spanner", "gcp_cloud_spanner", "Cloud Spanner (multi-region)"),
  ]),
]);

const globals = frame("globals", "Global (anycast)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("glb", "gcp_cloud_load_balancing", "Global HTTP(S) LB"),
  icon("dns", "gcp_cloud_dns", "Cloud DNS"),
]);

const tree = frame("root", "GCP multi-region HA — active-active (Global LB → zonal MIGs in 2 regions, Cloud Spanner)", { dir: "col", gap: 30 }, [globals, project]);
renderTree(d, tree, [40, 70]);

// Global LB targets a REGIONAL backend service (the zonal MIG), not individual VMs → 2 clean edges.
d.link("glb", "sn_us", "", { role: "fanout" });
d.link("glb", "sn_eu", "", { role: "fanout" });
d.link("vm1_us", "spanner", "", { flow: true });
d.link("vm1_eu", "spanner", "", { flow: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/gcp_multiregion_ha_kit.drawio", import.meta.url), d.mxfile("GCP multi-region HA"));
