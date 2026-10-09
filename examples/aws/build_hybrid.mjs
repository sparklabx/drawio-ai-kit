// Hybrid / DR (on-prem ↔ cloud) — type "hybrid". Built with the layout engine: NO hardcoded coords.
// Two sites as separate blocks, linked through Direct Connect (+ VPN backup); components are
// mirrored on both sides and DR replication uses dashed edges.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { group, frame, icon, box, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("hybrid");
const onp = (id, label) => box(id, label, { w: 200, h: 50, fill: "#FFFFFF", stroke: "#666666" });

// ---- left: on-premises data center (non-AWS components as plain boxes) ----
const onprem = group("onprem", "group_corporate_data_center", "On-Premises Data Center (Corporate DC · Vietnam)", { dir: "col", gap: 18 }, [
  onp("op_core", "Core Banking System"),
  onp("op_db", "Oracle / DB2 (system of record)"),
  onp("op_ad", "Active Directory / LDAP"),
  icon("op_cgw", "customer_gateway", "Customer Gateway"),
]);

// ---- middle: connectivity (transparent column) ----
const link = phantom("conn", "", { dir: "col", gap: 60, header: 0 }, [
  icon("dx", "direct_connect", "AWS Direct Connect"),
  icon("vpn", "site_to_site_vpn", "Site-to-Site VPN (backup)"),
]);

// ---- right: AWS Cloud — Region → VPC, mirroring the on-prem components ----
const cloud = group("cloud", "group_aws_cloud_alt", "AWS Cloud", { dir: "col", gap: 24 }, [
  group("region", "group_region", "Region (ap-southeast-1)", { dir: "col", gap: 20 }, [
    group("vpc", "group_vpc", "VPC 10.0.0.0/16", { dir: "col", gap: 18 }, [
      icon("vgw", "vpn_gateway", "Virtual Private Gateway"),
      icon("eks", "eks", "App tier on EKS"),
      icon("rds", "rds", "Amazon RDS (Multi-AZ)"),
      icon("ds", "directory_service", "AWS Managed Microsoft AD"),
    ]),
  ]),
]);

const tree = phantom("root", "", { dir: "row", gap: 90, align: "center", header: 0, pad: 10 },
  [onprem, link, cloud]);

renderTree(d, tree, [40, 80]);
d.title("Hybrid / DR — type: hybrid (on-premises ↔ AWS via Direct Connect + VPN)");

// connectivity: customer gateway → DX (primary) + VPN (backup) → virtual private gateway
d.link("op_cgw", "dx", "Direct Connect");
d.link("op_cgw", "vpn", "VPN (backup)", { dash: true });
d.link("dx", "vgw", "private VIF");
d.link("vpn", "vgw", "IPsec", { dash: true });
// mirrored components — DR replication / trust (dashed, bidirectional intent)
d.link("op_db", "rds", "DB replication → DR", { dash: true });
d.link("op_ad", "ds", "AD trust / sync", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/hybrid_kit.drawio", import.meta.url), d.mxfile("Hybrid DR (hybrid)"));
