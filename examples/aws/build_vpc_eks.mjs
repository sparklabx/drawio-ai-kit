// VPC with EKS / Bastion / NAT — type "network". Layout engine: NO hardcoded coords.
// Public subnet (Bastion + NAT) and Private subnet (K8s worker nodes) per AZ.
// The EKS cluster is a DASHED frame (like Region/AZ) with the EKS logo at the TOP-LEFT corner,
// SPANNING the private subnets across both AZs — drawn with d.clusterBox() AFTER renderTree.
import { writeFileSync } from "node:fs";
import { Diagram } from "drawio-ai-kit";
import { group, icon, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("network");

const az = (s) =>
  // gap 64 between Public & Private subnets → room for the EKS-cluster header strip (logo + label).
  group(`az_${s}`, "group_availability_zone", `Availability Zone ${s.toUpperCase()}`, { dir: "col", gap: 64, align: "center" }, [
    group(`pub_${s}`, "group_subnet", "Public Subnet", { dir: "row", gap: 16 }, [
      icon(`bast_${s}`, "ec2", "Bastion Host"),
      icon(`nat_${s}`, "nat_gateway", "NAT Gateway"),
    ]),
    group(`prv_${s}`, "group_subnet", "Private Subnet", { dir: "col", gap: 10 }, [icon(`node_${s}`, "ec2", "K8s Worker Nodes")]),
  ]);

const tree = group("region", "group_region", "Region (eu-west-1)", { dir: "col", gap: 22, align: "center" }, [
  group("vpc", "group_vpc", "VPC 10.0.0.0/16", { dir: "col", gap: 22 }, [
    icon("igw", "internet_gateway", "Internet Gateway"),
    phantom("body", "", { dir: "row", gap: 80, align: "top", header: 0 }, [az("a"), az("c")]),
  ]),
]);

renderTree(d, tree, [40, 80]);
d.title("VPC with EKS — type: network (Bastion · NAT · Multi-AZ · EKS cluster spanning private subnets)");

d.link("igw", "bast_a", "", { role: "fanout" });
d.link("igw", "bast_c", "", { role: "fanout" });
d.link("node_a", "nat_a", "egress", { dir: "TB", dash: true });
d.link("node_c", "nat_c", "egress", { dir: "TB", dash: true });

// EKS cluster: dashed orange frame + EKS logo top-left, spanning the private subnets of both AZs.
d.clusterBox("eks_cluster", ["prv_a", "prv_c"], "Amazon EKS cluster — Multi-AZ", { icon: "eks" });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/vpc_eks_kit.drawio", import.meta.url), d.mxfile("VPC EKS (network)"));
