// Databricks MLOps reference — GENERIC template (the "Big Book of MLOps" layout): a Git provider band,
// three workspace zones (Development · Staging · Production) each with MLflow + train/deploy workflow,
// a Unity Catalog band holding per-env catalogs (Tables + Models), over the Lakehouse. Databricks house
// style with the reference's refined tones: muted zone header bands (white text) FLUSH to the top edge,
// LEFT-aligned with the Databricks logo at the left, over WHITE bodies; full-colour icons.
// Run: node examples/databricks/build_mlops.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("pipeline");
// refined (desaturated) header colors matching the reference; bodies are WHITE
const GIT = "#8A9199", DEV = "#5C7E93", STG = "#9C5563", PROD = "#5EA888", UC = "#E8663D";
const NAVY = "#1B3139", CORAL = "#E8663D";
const DBX = "data:image/png,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";  // white Databricks logo, TRANSPARENT bg (renders directly on colored bands)

// header band: Databricks logo at the left + LEFT-aligned white title (shape=label renders a left image)
const hband = (id, label, fill, w, h = 36, fs = 13) => box(id, label, { w, h,
  style: `shape=label;html=1;whiteSpace=wrap;fillColor=${fill};strokeColor=none;fontColor=#FFFFFF;fontSize=${fs};fontStyle=1;align=left;verticalAlign=middle;spacingLeft=40;image=${DBX};imageWidth=22;imageHeight=22;imageAlign=left;imageVerticalAlign=middle;` });
// plain left-aligned band (catalog sub-headers), no logo
const band = (id, label, fill, w, h = 28, fs = 12) => box(id, label, { w, h,
  style: `rounded=0;html=1;whiteSpace=wrap;fillColor=${fill};strokeColor=none;fontColor=#FFFFFF;fontSize=${fs};fontStyle=1;align=left;verticalAlign=middle;spacingLeft=12;` });
// zone: colored header band FLUSH to the top edge (outer pad:0), over a padded WHITE body.
const zone = (id, title, hColor, kids, w) => frame(id, "", { dir: "col", gap: 0, pad: 0, header: 0, stroke: hColor, align: "center" }, [
  hband(`${id}_h`, title, hColor, w, 36, 13),
  phantom(`${id}_b`, "", { dir: "col", gap: 12, pad: 16, header: 0, align: "center" }, kids),
]);
const rowf = (id, kids, gap = 26) => phantom(id, "", { dir: "row", gap, header: 0, align: "top" }, kids);
const serving = (id) => box(id, "Model Serving\nEndpoint", { w: 130, h: 54, style: `rounded=0;whiteSpace=wrap;html=1;fillColor=${CORAL};strokeColor=none;fontColor=#FFFFFF;fontSize=11;fontStyle=1;verticalAlign=middle;align=center;` });
const card = (id, label, w, h = 46) => box(id, label, { w, h, fill: "#FFFFFF", stroke: "#9AA0A6" });

const WSW = 520, WS_GAP = 30, FULL = WSW * 3 + WS_GAP * 2;  // full-width bands == the 3-workspace row width, so nothing sticks out

const git = zone("git", "Git provider", GIT, [
  rowf("repos", [
    icon("r_dev", "github", "ML Project Repo (dev)"),
    icon("r_main", "github", "ML Project Repo (main)"),
    icon("r_rel", "github", "ML Project Repo (release)"),
  ], 120),
  rowf("ci", [card("unit", "Unit tests (CI)", 150), card("cd", "Continuous Deployment", 190)]),
], FULL);

const dev = zone("dev", "Development workspace", DEV, [
  rowf("dev_top", [icon("mlf_d", "mlflow", "Tracking Server"), icon("eda", "notebooks", "Exploratory analysis")]),
  card("dev_ml", "Model training · validation · deployment · monitoring", 400, 48),
  serving("dev_serve"),
], WSW);
const stg = zone("stg", "Staging workspace", STG, [
  icon("mlf_s", "mlflow", "Tracking Server"),
  card("integ", "Integration tests (CI)", 220),
  serving("stg_serve"),
], WSW);
const prod = zone("prod", "Production workspace", PROD, [
  icon("mlf_p", "mlflow", "Tracking Server"),
  frame("wf", "Model train-deploy Workflow", { dir: "row", gap: 14, stroke: "#9AA0A6", fill: "#FFFFFF" }, [
    card("m_train", "Model training", 110, 40), card("m_val", "Model validation", 110, 40), card("m_dep", "Model deployment", 120, 40),
  ]),
  rowf("prod_out", [icon("batch", "dbx_ai_ml", "Batch Inference"), icon("mon", "monitoring", "Monitoring"), serving("prod_serve")]),
], WSW);
const workspaces = rowf("ws", [dev, stg, prod], WS_GAP);

// per-env catalogs — white cards with a flush navy sub-header, holding Tables + Models
const catalog = (id, name) => frame(id, "", { dir: "col", gap: 0, pad: 0, header: 0, stroke: "#9AA0A6", align: "center" }, [
  band(`${id}_h`, name, NAVY, 260, 28, 12),
  phantom(`${id}_b`, "", { dir: "col", gap: 8, pad: 12, header: 0, align: "center" }, [
    rowf(`${id}_r`, [icon(`${id}_t`, "dbx_table", "Tables"), icon(`${id}_m`, "dbx_model", "Models")], 20)]),
]);
const uc = zone("uc", "Unity Catalog", UC, [
  rowf("cats", [catalog("prodcat", "Prod Catalog"), catalog("devcat", "Dev Catalog"), catalog("stgcat", "Staging Catalog")], 34),
], FULL);

const lake = hband("lake", "Lakehouse", NAVY, FULL, 34, 14);

const root = phantom("root", "Databricks MLOps — Dev · Staging · Production (MLflow + Unity Catalog)", { dir: "col", gap: 22, align: "center" },
  [git, workspaces, uc, lake]);
renderTree(d, root, [40, 70]);

// numbered dev → prod promotion tour; CI / logging / governance stay dashed & unnumbered
d.link("r_dev", "r_main", "Pull request to main", { step: 1 });
d.link("r_main", "r_rel", "Merge to release", { step: 2 });
d.link("r_main", "unit", "CI trigger", { dash: true });
d.link("git", "dev", "", { flow: true });
d.link("cd", "prod", "Continuous Deployment", { step: 3 });
d.link("dev", "devcat", "Logging", { dash: true });
d.link("stg", "stgcat", "Logging", { dash: true });
d.link("m_dep", "prodcat", "Register · promote model", { step: 4 });
d.link("prodcat", "lake", "", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, advice: res.audit.advice }));
writeFileSync(new URL("../../out/databricks_mlops_kit.drawio", import.meta.url), d.mxfile("Databricks MLOps"));
