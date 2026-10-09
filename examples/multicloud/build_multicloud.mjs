// Multi-cloud / hybrid — GENERIC template. THE composition rule: each cloud (and on-prem) is its OWN
// sibling top-level frame following its own containment; connect them through a NEUTRAL boundary node
// (Internet / interconnect) — never nest one cloud inside another. AWS uses its group stencils; Azure
// has none, so its containers are plain frame()s. Run: node examples/multicloud/build_multicloud.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { group, frame, icon, box, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("hybrid");

// On-prem — a separate site (uses the AWS corporate-DC group stencil as a neutral on-prem frame).
const onprem = group("onprem", "group_corporate_data_center", "On-Premise DC", { dir: "col", gap: 12 }, [
  box("srv", "App Servers", { w: 130, h: 60 }),
  icon("dx", "direct_connect", "Direct Connect"),
]);

// AWS block — its own containment (Region → VPC), AWS group stencils.
const aws = group("aws", null, "AWS", { dir: "col", gap: 14, stroke: "#ED7100" }, [
  group("aws_region", "group_region", "Region: ap-southeast-1", { dir: "col", gap: 12 }, [
    group("aws_vpc", "group_vpc", "VPC 10.0.0.0/16", { dir: "col", gap: 10 }, [
      icon("ec2", "ec2", "EC2"),
      icon("rds", "rds", "RDS"),
    ]),
  ]),
]);

// Azure block — its own containment (Subscription → RG → VNet), plain frames (no group stencils).
const azure = frame("azure", "Azure", { dir: "col", gap: 14, stroke: "#0078D4" }, [
  frame("az_sub", "Subscription: Prod", { dir: "col", gap: 12, stroke: "#555555" }, [
    frame("az_rg", "RG: rg-app", { dir: "col", gap: 10, stroke: "#999999" }, [
      frame("az_vnet", "VNet 10.1.0.0/16", { dir: "col", gap: 10, stroke: "#0078D4" }, [
        icon("az_vm", "azure_virtual_machine", "VM"),
        icon("az_sql", "azure_sql_database", "Azure SQL"),
      ]),
    ]),
  ]),
]);

// Neutral boundary — the only thing all three connect through.
const net = box("net", "Internet / Interconnect", { w: 180, h: 70, fill: "#FFFFFF", stroke: "#5A6B7B", bold: true });

const tree = frame("root", "Multi-cloud / hybrid — compose, connect through a neutral boundary", { dir: "col", gap: 40 }, [
  net,
  phantom("sites", "", { dir: "row", gap: 60, align: "top", header: 0 }, [onprem, aws, azure]),
]);
renderTree(d, tree, [40, 70]);

d.link("dx", "net", "VPN/DX", { dash: true });
d.link("net", "aws_vpc", "", { flow: true });
d.link("net", "az_vnet", "", { flow: true });
d.link("rds", "az_sql", "cross-cloud replication", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/multicloud_kit.drawio", import.meta.url), d.mxfile("Multi-cloud hybrid"));
