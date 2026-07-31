// VPC Multi-AZ 3-tier — type "network". Layout engine: NO hardcoded coords.
// STANDARD VPC LAYOUT: each AZ is a VERTICAL COLUMN, AZs sit side by side, the VPC is the
// horizontal box wrapping them; subnets are tiers stacked top→bottom, same tier aligned across AZs.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { group, frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("network");

// One AZ = a column of subnet tiers (Public → App → Data).
const az = (s, rdsLabel) =>
  group(`az_${s}`, "group_availability_zone", `Availability Zone ${s.toUpperCase()}`, { dir: "col", gap: 16 }, [
    group(`pub_${s}`, "group_subnet", "Public Subnet", { dir: "col", gap: 10 }, [icon(`nat_${s}`, "nat_gateway", "NAT Gateway")]),
    group(`app_${s}`, "group_subnet", "Private Subnet (App)", { dir: "col", gap: 10 }, [icon(`ec2_${s}`, "ec2", "EC2 / ECS")]),
    group(`db_${s}`, "group_subnet", "Private Subnet (Data)", { dir: "col", gap: 10 }, [icon(`rds_${s}`, "rds", rdsLabel)]),
  ]);

const region = group("region", "group_region", "Region (ap-southeast-1)", { dir: "row", gap: 60, align: "top" }, [
  group("vpc", "group_vpc", "VPC  10.0.0.0/16", { dir: "col", gap: 22, align: "center" }, [
    icon("igw", "internet_gateway", "Internet Gateway"),
    icon("alb", "application_load_balancer", "Application Load Balancer (Multi-AZ)"),
    phantom("azs", "", { dir: "row", gap: 50, align: "top", header: 0 }, [
      az("a", "RDS (Primary)"),
      az("b", "RDS (Standby)"),
    ]),
  ]),
  group("reg_svc", null, "Regional / Edge services", { dir: "col", gap: 22, fill: "#FFFFFF", stroke: "#999999" }, [
    icon("waf", "waf", "AWS WAF"),
    icon("cw", "cloudwatch_2", "CloudWatch"),
    icon("s3", "s3", "S3 (assets/logs)"),
  ]),
]);

const tree = phantom("root", "", { dir: "row", gap: 70, align: "center", header: 0, pad: 10 }, [
  box("users", "Users / Internet", { w: 130, h: 80, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
  region,
]);

renderTree(d, tree, [40, 90]);
d.title("VPC Multi-AZ 3-tier — type: network (AZ = columns; VPC wraps them; subnets are tiers)");

d.link("users", "igw", "HTTPS", { step: 1 });
d.link("igw", "alb", "forward", { step: 2 });
d.link("alb", "ec2_a", "route", { step: 3, role: "fanout" });
d.link("alb", "ec2_b", "", { role: "fanout" });
d.link("ec2_a", "rds_a", "query", { step: 4 });
d.link("ec2_b", "rds_b");
d.link("rds_a", "rds_b", "Multi-AZ replication", { dash: true }); // AZs side by side → horizontal dashed link

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/vpc_multiaz_kit.drawio", import.meta.url), d.mxfile("VPC Multi-AZ 3-tier"));
