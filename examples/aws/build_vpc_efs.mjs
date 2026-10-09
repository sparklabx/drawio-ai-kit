// VPC with Amazon EFS — type "network". Layout engine: NO hardcoded coords.
// Each AZ has an EC2 + an EFS Mount Target in a private subnet; all mount targets attach to one EFS file system.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { group, icon, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("network");

const az = (s) =>
  group(`az_${s}`, "group_availability_zone", `Availability Zone ${s.toUpperCase()}`, { dir: "col", gap: 16 }, [
    group(`pub_${s}`, "group_subnet", "Public Subnet", { dir: "col", gap: 10 }, [icon(`nat_${s}`, "nat_gateway", "NAT Gateway")]),
    group(`prv_${s}`, "group_subnet", "Private Subnet", { dir: "row", gap: 16 }, [
      icon(`ec2_${s}`, "ec2", "EC2 instance"),
      icon(`mt_${s}`, "elastic_file_system", "EFS Mount Target"),
    ]),
  ]);

const tree = group("region", "group_region", "Region (eu-west-1)", { dir: "col", gap: 24, align: "center" }, [
  group("vpc", "group_vpc", "VPC 10.0.0.0/16", { dir: "col", gap: 22 }, [
    icon("igw", "internet_gateway", "Internet Gateway"),
    phantom("azs", "", { dir: "row", gap: 60, align: "top", header: 0 }, [az("a"), az("c")]),
  ]),
  icon("efs", "elastic_file_system", "Amazon EFS (file system)"),
]);

renderTree(d, tree, [40, 80]);
d.title("VPC with Amazon EFS — type: network (one shared file system, a mount target per AZ)");

d.link("ec2_a", "mt_a");
d.link("ec2_c", "mt_c");
d.link("mt_a", "efs", "NFS", { dir: "TB" });
d.link("mt_c", "efs", "NFS", { dir: "TB" });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/vpc_efs_kit.drawio", import.meta.url), d.mxfile("VPC EFS (network)"));
