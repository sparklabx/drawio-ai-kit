// Serverless web app with a numbered request walkthrough — type "sequence".
// Layout engine: NO hardcoded coords. Static path (S3+CloudFront) and dynamic path (API GW→Lambda→DynamoDB).
// Numbered step badges (opts.step) mark the request flow — the AWS reference-diagram convention.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("sequence");

const tree = phantom("root", "", { dir: "row", gap: 60, align: "center", header: 0, pad: 10 }, [
  box("browser", "Browser", { w: 120, h: 60, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
  phantom("paths", "", { dir: "col", gap: 44, header: 0 }, [
    frame("static", "Static content path", { dir: "row", gap: 34, fill: "#FFFFFF", stroke: "#999999" }, [
      icon("r53", "route_53", "Route 53"),
      icon("cf", "cloudfront", "CloudFront"),
      icon("s3", "s3", "S3 static assets"),
    ]),
    frame("dynamic", "Dynamic API path", { dir: "row", gap: 34, fill: "#FFFFFF", stroke: "#999999" }, [
      icon("apigw", "api_gateway", "API Gateway"),
      icon("lambda", "lambda", "Lambda"),
      icon("ddb", "dynamodb", "DynamoDB"),
    ]),
  ]),
  icon("acm", "certificate_manager", "ACM (TLS cert)"),
]);

renderTree(d, tree, [40, 80]);
d.title("Serverless web app — numbered request walkthrough");

d.link("browser", "r53", "resolve", { step: 1 });
d.link("r53", "cf", "route", { step: 2 });
d.link("cf", "s3", "fetch assets", { step: 3 });
d.link("browser", "apigw", "API call", { step: 4 });
d.link("apigw", "lambda", "invoke", { step: 5 });
d.link("lambda", "ddb", "read / write", { step: 6 });
d.link("cf", "acm", "", { dash: true });   // supporting relationship, not a numbered flow step

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/serverless_kit.drawio", import.meta.url), d.mxfile("Serverless web (sequence)"));
