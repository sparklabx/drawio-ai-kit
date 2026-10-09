// GCP Shared VPC landing zone (production) — GENERIC template. Google's default enterprise foundation.
// Exercises the conventions the simple VPC example omits: Folder + hierarchical firewall, a Shared VPC
// HOST project owning the global VPC, SERVICE projects that attach to it, REGIONAL Cloud Router + Cloud
// NAT inside each region, Interconnect → regional routers, Private Service Connect to managed services,
// and a VPC Service Controls perimeter. Clean house style: white frames, identity via borders + icons.
// Run: node examples/gcp/build_gcp_shared_vpc_landing_zone.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "drawio-ai-kit";
import { frame, icon, box, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("network");
const NET = "#4285F4", SUB = "#8AB4F8", GREY = "#999999";

// A region = its regional Cloud Router + Cloud NAT (both regional) + the workloads in its subnet.
const region = (id, label, kids) =>
  frame(id, label, { dir: "col", gap: 12, stroke: SUB }, [
    frame(`${id}_sn`, "Subnet (Private Google Access)", { dir: "col", gap: 10, stroke: "#B0C7EE" }, [
      icon(`${id}_cr`, "gcp_cloud_router", "Cloud Router"),
      icon(`${id}_nat`, "gcp_cloud_nat", "Cloud NAT"),
      ...kids,
    ]),
  ]);

// Global VPC (host project) wraps the regions side by side.
const vpc = frame("vpc", "Shared VPC (global): prod-vpc  ·  VPC firewall rules", { dir: "row", gap: 40, align: "top", stroke: NET, cornerIcon: "gcp_virtual_private_cloud" }, [
  region("us", "Region: us-central1", [
    icon("gce_us", "gcp_compute_engine", "App VMs (MIG)"),
    icon("gke_us", "gcp_google_kubernetes_engine", "GKE (private)"),
    icon("psc_us", "gcp_private_service_connect", "PSC endpoint"),
  ]),
  region("eu", "Region: europe-west1", [
    icon("gce_eu", "gcp_compute_engine", "App VMs (MIG)"),
  ]),
]);

const host = frame("host", "Host project: prod-net-host  (Shared VPC owner)", { dir: "col", gap: 16, stroke: "#555555", cornerIcon: "gcp_project" }, [
  vpc,
  icon("ic", "gcp_cloud_interconnect", "Dedicated Interconnect"),
  frame("svc", "Service projects (attach to Shared VPC)", { dir: "row", gap: 20, stroke: GREY }, [
    frame("svc_a", "Service project: prod-app-a", { dir: "col", gap: 8, stroke: GREY, cornerIcon: "gcp_project" }, [box("svc_a_n", "workloads in shared subnets", { w: 190, h: 44 })]),
    frame("svc_b", "Service project: prod-app-b", { dir: "col", gap: 8, stroke: GREY, cornerIcon: "gcp_project" }, [box("svc_b_n", "workloads in shared subnets", { w: 190, h: 44 })]),
  ]),
]);
const folder = frame("folder", "Folder: production  ·  hierarchical firewall policy", { dir: "col", gap: 18, stroke: "#777777" }, [host]);

const globals = frame("globals", "Global / edge (spans all regions)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("dns", "gcp_cloud_dns", "Cloud DNS"),
  icon("glb", "gcp_cloud_load_balancing", "Global HTTP(S) LB"),
]);
// VPC Service Controls = an org-level perimeter (purple) around projects + managed services.
const vpcsc = frame("vpcsc", "VPC Service Controls perimeter (org-level)", { dir: "col", gap: 12, stroke: "#8E24AA" }, [
  frame("managed", "Managed services (outside the VPC — reached via PSC / Private Google Access)", { dir: "row", gap: 20, stroke: GREY }, [
    icon("sql", "gcp_cloud_sql", "Cloud SQL"),
    icon("bq", "gcp_bigquery", "BigQuery"),
    icon("gcs", "gcp_cloud_storage", "Cloud Storage"),
  ]),
]);

const gcpcol = phantom("gcpcol", "", { dir: "col", gap: 30, header: 0 }, [globals, folder, vpcsc]);
const onprem = box("onprem", "On-premises\ndatacenter", { w: 150, h: 70 });
const tree = phantom("root", "GCP Shared VPC landing zone (production)", { dir: "row", gap: 60, align: "top" }, [onprem, gcpcol]);
renderTree(d, tree, [40, 70]);

// Minimal edge set — the containment carries the structure; only the load-bearing relationships are drawn
// (on-prem hybrid, Interconnect→regional router wiring, and private access to managed services). Service
// projects "attach" to the Shared VPC via the section label rather than long wrap-around edges; the
// global LB fronting regional backends is implied by the top global band.
d.link("onprem", "ic", "Interconnect / VPN", { dash: true });
d.link("ic", "us_cr", "VLAN attach", { dash: true });
d.link("psc_us", "sql", "Private Service Connect", { flow: true });
d.link("psc_us", "bq", "", { flow: true });
d.link("gce_us", "gcs", "", { flow: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/gcp_shared_vpc_landing_zone_kit.drawio", import.meta.url), d.mxfile("GCP Shared VPC landing zone"));
