// Microservices on ECS/Fargate behind an ALB in a VPC — type "network". NO hardcoded coords.
// Edge → ALB → service tier (Fargate tasks) → data stores, with ECR + observability, numbered flow.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { group, frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("network");

const tree = phantom("root", "", { dir: "row", gap: 56, align: "center", header: 0, pad: 10 }, [
  box("client", "Clients", { w: 120, h: 60, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
  group("vpc", "group_vpc", "VPC  10.0.0.0/16", { dir: "col", gap: 22, align: "center" }, [
    icon("alb", "application_load_balancer", "ALB"),
    group("svc", "group_subnet", "Private Subnet — ECS/Fargate", { dir: "row", gap: 30 }, [
      icon("s1", "fargate", "orders-svc"),
      icon("s2", "fargate", "payments-svc"),
      icon("s3s", "fargate", "users-svc"),
    ]),
    group("data", "group_subnet", "Private Subnet — data", { dir: "row", gap: 30 }, [
      icon("rds", "rds", "RDS (orders)"),
      icon("ddb", "dynamodb", "DynamoDB (users)"),
      icon("cache", "elasticache", "ElastiCache"),
    ]),
  ]),
  frame("ops", "Platform", { dir: "col", gap: 16, fill: "#FFFFFF", stroke: "#999999" }, [
    icon("ecr", "ecr", "ECR"),
    icon("cw", "cloudwatch_2", "CloudWatch"),
    icon("xray", "xray", "X-Ray"),
  ]),
]);

renderTree(d, tree, [40, 90]);
d.title("Microservices on ECS/Fargate — ALB → services → data stores");

d.link("client", "alb", "HTTPS", { step: 1 });
d.link("alb", "s1", "route", { step: 2, role: "fanout" });
d.link("alb", "s2", "", { role: "fanout" });
d.link("alb", "s3s", "", { role: "fanout" });
d.link("s1", "rds", "persist", { step: 3 });
d.link("s3s", "ddb", "read/write", { step: 4 });
d.link("s2", "cache", "cache", { step: 5 });
d.link("ecr", "s1", "image pull", { dash: true });   // supporting, not a flow step

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/microservices_ecs_kit.drawio", import.meta.url), d.mxfile("Microservices on ECS"));
