// Serverless event-driven — type "hubspoke". Layout engine: NO hardcoded coordinates.
// EventBridge hub spans vertically across rows positioned by the rect the ENGINE COMPUTES.
import { writeFileSync } from "node:fs";
import { Diagram } from "drawio-ai-kit";
import { group, icon, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("hubspoke");

// 3 columns (transparent labels, no frame): Producers | Consumers | Downstream
const col = (id, title, items) =>
  phantom(id, title, { dir: "col", gap: 40, align: "center" }, items);

const tree = phantom("root", "", { dir: "row", gap: 200, align: "top", header: 0, pad: 10 }, [
  col("producers", "PRODUCERS", [
    icon("p_api", "api_gateway", "API Gateway"),
    icon("p_sch", "eventbridge_scheduler", "EventBridge Scheduler"),
    icon("p_s3", "s3", "S3 (object events)"),
  ]),
  col("consumers", "CONSUMERS", [
    icon("c_lambda", "lambda", "Lambda (order processing)"),
    icon("c_sfn", "step_functions", "Step Functions"),
    icon("c_sqs", "sqs", "SQS (queue)"),
  ]),
  col("downstream", "DOWNSTREAM", [
    icon("d_ddb", "dynamodb", "DynamoDB"),
    icon("d_sns", "sns", "SNS (notifications)"),
  ]),
]);

renderTree(d, tree, [40, 90]);

// EventBridge hub spans vertically, placed IN THE GAP between Producers↔Consumers — the kit computes it
d.spanV("hub", { icon: "eventbridge", label: "Amazon EventBridge (event bus)", w: 140, pad: 0, stroke: "#E7157B" },
  { between: ["p_api", "c_lambda"], from: "p_api", to: "p_s3" });

d.title("Serverless event-driven — type: hubspoke (Amazon EventBridge as the hub)");

// producers → hub ; hub → consumers (fan-out: right angles) ; downstream
d.link("p_api", "hub", "PutEvents");
d.link("p_sch", "hub", "schedule");
d.link("p_s3", "hub", "events");
d.link("hub", "c_lambda", "rule", { role: "fanout" });
d.link("hub", "c_sfn", "rule", { role: "fanout" });
d.link("hub", "c_sqs", "rule", { role: "fanout" });
d.link("c_lambda", "d_ddb", "write");
d.link("c_sfn", "d_sns", "notify");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/eventdriven_kit.drawio", import.meta.url), d.mxfile("Event-driven (hubspoke)"));
