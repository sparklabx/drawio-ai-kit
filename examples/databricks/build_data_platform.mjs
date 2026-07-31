// Enterprise data platform — a dense, grid-packed lakehouse platform in the "reference-diagram" style:
// an outer platform boundary, labelled section boxes (Storage / Governance / Analytics & Serving), and
// each functional box packs its services into a GRID (not a sprawling row) so the layout stays compact
// and hugs its content. Layout engine: NO hardcoded coords. Run: node examples/databricks/build_data_platform.mjs
import { writeFileSync } from "node:fs";
import { frame, grid, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";
import { Diagram } from "../../src/builder.mjs";

const d = new Diagram("hierarchy");
const GREEN = { fill: "#E9F3DE", stroke: "#7AC143" };
const ib = (id, label) => box(id, label, { w: 128, h: 46 });        // uniform service tile
// A functional box = a labelled GRID of tiles/icons — the compact packing that keeps boxes tight.
const packed = (id, label, kids, cols = 3) => grid(id, null, label, { cols, gap: 14, pad: 14 }, kids);

const gov = packed("gov", "Governance", [
  icon("uc", "unity_catalog", "Unity Catalog"),
  icon("wx", "databricks", "Catalog Intelligence"),
], 2);

const storage = frame("storage", "Storage", { dir: "col" }, [
  frame("datalayer", "Data Layer", { dir: "col", gap: 12, ...GREEN }, [
    icon("bronze", "delta", "Bronze"), icon("silver", "delta", "Silver"),
    icon("gold", "delta", "Gold"), icon("s3", "s3", "Object Storage"),
  ]),
]);

const hub = frame("hub", "Analytics & Serving", { dir: "col", gap: 22 }, [
  phantom("hr1", "", { dir: "row", gap: 26, header: 0, align: "top" }, [
    frame("compute", "Compute", { dir: "col" }, [ib("nb", "Notebook")]),
    packed("serving", "Serving Layer", [
      icon("ddb", "dynamodb", "Key-Value Store"), icon("lb", "lakebase", "Lakebase"), ib("sqlw", "SQL Warehouse"),
      ib("vs", "Vector Search"), ib("ms", "Model Serving"),
    ]),
    packed("pres", "Presentation Layer", [icon("genie", "bi_genie", "Genie"), ib("aibi", "AI/BI Dashboards")], 2),
  ]),
  phantom("hr2", "", { dir: "row", gap: 26, header: 0, align: "top" }, [
    frame("semantic", "Semantic", { dir: "col" }, [ib("sem", "Semantic Layer")]),
    packed("aiml", "AI/ML Enablement", [
      icon("mlf", "mlflow", "MLflow"), ib("fs", "Feature Store"), ib("exp", "Experiment"),
      ib("agent", "Agents / Apps"), ib("mr", "Model Registry"), ib("dab", "Asset Bundles"),
    ]),
    packed("integ", "Integration / Data Sharing", [
      icon("ds", "delta_sharing", "Delta Sharing"), icon("apigw", "api_gateway", "API Gateway"), ib("fm", "Foundation Model APIs"),
    ]),
  ]),
]);

const platform = frame("platform", "Enterprise Data Platform", { dir: "col", gap: 22, ...GREEN }, [
  gov, phantom("body", "", { dir: "row", gap: 30, header: 0, align: "top" }, [storage, hub]),
]);

const users = frame("users", "Users", { dir: "col", gap: 12 }, [ib("dsu", "Data Science"), ib("da", "Data Analysts"), ib("bu", "Business Units")]);
const downstream = frame("downstream", "Downstream", { dir: "col", gap: 14 }, [
  frame("rep", "Reporting & Analytics", { dir: "col", gap: 10 }, [ib("mis", "MIS"), ib("pbi", "Power BI")]),
  frame("ops", "Operational Systems", { dir: "col", gap: 10 }, [ib("crm", "CRM / Mobile"), ib("apps", "Growth Apps")]),
]);
const right = frame("right", "", { dir: "col", gap: 24, header: 0, stroke: "none", fill: "none" }, [users, downstream]);

renderTree(d, phantom("all", "", { dir: "row", gap: 34, header: 0, align: "top" }, [platform, right]), [40, 70]);
d.link("gov", "storage", "", { dash: true });        // governance reaches the data layer
d.link("gov", "hub", "", { dash: true });            // governance reaches the analytics hub
d.link("storage", "hub", "data", { step: 1 });       // curated data flows into the hub
d.link("serving", "aiml", "features", { step: 2 });  // serving feeds AI/ML
d.link("hub", "users", "", {});                      // hub serves users
d.link("integ", "downstream", "share", {});          // integration pushes to downstream
d.title("Enterprise data platform — grid-packed reference layout");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/data_platform_kit.drawio", import.meta.url), d.mxfile("Enterprise Data Platform"));
