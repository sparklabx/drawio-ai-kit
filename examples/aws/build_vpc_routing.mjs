// VPC subnet & routing detail — type "network". Layout engine: NO hardcoded coords.
// Public/Private subnets across 2 AZ, IGW + NAT, route tables, and a VPC Endpoint (Gateway) to S3.
import { writeFileSync } from "node:fs";
import { Diagram } from "drawio-ai-kit";
import { group, frame, icon, box, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("network");
const rt = (id, title, rows) => box(id, `${title}\n${rows}`, { w: 210, h: 70, fill: "#FFFFFF", stroke: "#5A6B7B", va: "top", fs: 10 });

const az = (s, cidrPub, cidrPriv) =>
  group(`az_${s}`, "group_availability_zone", `Availability Zone ${s.toUpperCase()} (ap-southeast-1${s})`, { dir: "col", gap: 18 }, [
    group(`pub_${s}`, "group_subnet", `Public Subnet ${cidrPub}`, { dir: "col", gap: 10 }, [icon(`nat_${s}`, "nat_gateway", "NAT Gateway")]),
    group(`prv_${s}`, "group_subnet", `Private Subnet ${cidrPriv}`, { dir: "col", gap: 10 }, [icon(`ec2_${s}`, "ec2", "EC2 instance")]),
  ]);

const tree = group("region", "group_region", "Region (ap-southeast-1)", { dir: "row", gap: 60, align: "center" }, [
  group("vpc", "group_vpc", "VPC 10.0.0.0/16", { dir: "col", gap: 24 }, [
    icon("igw", "internet_gateway", "Internet Gateway"),
    phantom("azs", "", { dir: "row", gap: 40, header: 0 }, [az("a", "10.0.1.0/24", "10.0.3.0/24"), az("b", "10.0.2.0/24", "10.0.4.0/24")]),
    group("rts", null, "Route tables", { dir: "row", gap: 30, fill: "#FFFFFF", stroke: "#999999" }, [
      rt("rt_pub", "Route Table · Public", "10.0.0.0/16 → local\n0.0.0.0/0 → igw"),
      rt("rt_prv", "Route Table · Private", "10.0.0.0/16 → local\npl-S3 → vpce"),
    ]),
  ]),
  group("edge", null, "Regional services", { dir: "col", gap: 28, fill: "#FFFFFF", stroke: "#999999" }, [
    icon("vpce", "endpoint", "VPC Endpoint (Gateway)"),
    icon("s3", "s3", "Amazon S3"),
  ]),
]);

renderTree(d, tree, [40, 80]);
d.title("VPC subnet & routing — type: network (subnets · route tables · VPC endpoint → S3)");

d.link("igw", "nat_a", "", { role: "fanout" });
d.link("igw", "nat_b", "", { role: "fanout" });
d.link("nat_a", "ec2_a");
d.link("nat_b", "ec2_b");
d.link("ec2_a", "vpce", "via Private RT");
d.link("ec2_b", "vpce", "via Private RT");
d.link("vpce", "s3", "Gateway Endpoint (no NAT)");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/vpc_routing_kit.drawio", import.meta.url), d.mxfile("VPC routing (network)"));
