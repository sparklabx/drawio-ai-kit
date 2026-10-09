// 3-tier web application — type "network". Layout engine: NO hardcoded coords.
// Edge (Route 53 + CloudFront) → VPC with Web / App / Data tiers as subnets; RDS Multi-AZ.
import { writeFileSync } from "node:fs";
import { Diagram, group, frame, icon, box, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("network");

// cf first so it sits level with igw (straight labeled edge across); user adjacent below cf
// (straight HTTPS edge); r53 last — it has no edges, keep it out of both corridors
const edge = phantom("edgec", "", { dir: "col", gap: 26, header: 0 }, [
  icon("cf", "cloudfront", "CloudFront (CDN)"),
  box("user", "User", { w: 120, h: 50, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
  icon("r53", "route_53", "Route 53 (DNS)"),
]);

const cloud = group("cloud", "group_aws_cloud_alt", "AWS Cloud", { dir: "col", gap: 22 }, [
  group("region", "group_region", "Region", { dir: "col", gap: 20, align: "center" }, [
    icon("igw", "internet_gateway", "Internet Gateway"),
    group("vpc", "group_vpc", "VPC 10.0.0.0/16", { dir: "row", gap: 40, align: "top" }, [
      group("web", "group_subnet", "Public Subnet · Web tier", { dir: "col", gap: 12 }, [
        icon("alb", "application_load_balancer", "Application Load Balancer"),
        icon("web1", "ec2", "Web Server"),
      ]),
      group("app", "group_subnet", "Private Subnet · App tier", { dir: "col", gap: 12 }, [
        icon("app1", "ec2", "App Server"),
        icon("app2", "ec2", "App Server"),
      ]),
      group("data", "group_subnet", "Private Subnet · Data tier", { dir: "col", gap: 12 }, [
        icon("rds1", "rds", "RDS Primary"),
        icon("rds2", "rds", "RDS Standby"),
      ]),
    ]),
  ]),
]);

const tree = phantom("root", "", { dir: "row", gap: 70, align: "center", header: 0, pad: 10 }, [edge, cloud]);

renderTree(d, tree, [40, 80]);
d.title("3-tier web application — type: network (Edge → Web → App → Data)");

d.link("user", "cf", "HTTPS");
d.link("cf", "igw", "", { dir: "LR" });
d.link("igw", "alb");
d.link("alb", "app1", "", { role: "fanout" });
d.link("alb", "app2", "", { role: "fanout" });
d.link("app1", "rds1", "SQL");
d.link("app2", "rds1");
d.link("rds1", "rds2", "Multi-AZ replication", { dir: "TB", dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/web3tier_kit.drawio", import.meta.url), d.mxfile("3-tier web (network)"));
