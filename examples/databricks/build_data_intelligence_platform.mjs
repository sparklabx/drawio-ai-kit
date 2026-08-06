// Databricks Data Intelligence Platform — reproduction of the official reference diagram.
// The signature Databricks look: a CORAL platform header band + a NAVY "Orchestration" band (both
// FILLED with white text), a Landing→Bronze→Silver→Gold medallion (the DB icon recolored per layer),
// white side-zones with navy borders (NO gray fills), and a coral foundation band with two EQUAL-width
// cards (Governance · Open Storage). Concept line-icons + logos come from the merged databricks pack
// (+ delta/parquet/iceberg reused from the Big Data pack). Run: node examples/databricks/build_data_intelligence_platform.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.mjs";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.mjs";

const d = new Diagram("pipeline");
const CORAL = "#FF3621", NAVY = "#1B3139", CORAL_TINT = "#FDECEA";

// box() hardcodes dark text; the Databricks signature bands are FILLED with WHITE text → raw style.
const band = (id, label, fill, w, h = 34, fs = 14) => box(id, label, { w, h,
  style: `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=none;fontColor=#FFFFFF;fontSize=${fs};fontStyle=1;verticalAlign=middle;align=center;` });
const BW = 900;      // platform band width — the column hugs this
const CARD = 430;    // foundation card width — Governance & Open Storage share it so they're EQUAL

// side zones — WHITE, navy border (never a gray fill); concept line-icons
const sources = frame("src", "Data Sources", { dir: "col", gap: 12, stroke: NAVY }, [
  icon("s_dw", "dbx_data_warehouse", "Data Warehouses"),
  icon("s_op", "dbx_external", "On-Premises"),
  icon("s_saas", "dbx_apps_line", "SaaS Applications"),
  icon("s_log", "dbx_logs", "Machine & App Logs"),
  icon("s_evt", "dbx_events", "Application Events"),
  icon("s_iot", "dbx_cloud_database", "Mobile & IoT Data"),
]);
const ingest = frame("ing", "Ingestion", { dir: "col", gap: 12, stroke: NAVY }, [
  icon("i_batch", "dbx_ingestion", "Batch"),
  icon("i_cdc", "dbx_pipeline", "CDC"),
  icon("i_stream", "dbx_streaming", "Streaming"),
]);
const outputs = frame("out", "Consumers", { dir: "col", gap: 12, stroke: NAVY }, [
  icon("o_ext", "dbx_apps_line", "External Apps"),
  icon("o_db", "dbx_cloud_database", "Operational DBs"),
  icon("o_share", "dbx_data_sharing", "Data Sharing"),
  icon("o_users", "dbx_business_users", "Business Users"),
  icon("o_tab", "tableau", "Tableau"),
  icon("o_pbi", "power_bi", "Power BI"),
]);

// medallion — the recolored DB icon per Delta layer: Landing (green) → Bronze → Silver → Gold
const medallion = frame("med", "Medallion — Delta Lake", { dir: "row", gap: 34, stroke: "#B0B0B0" }, [
  icon("landing", "medallion_landing", "Landing"),
  icon("bronze", "medallion_bronze", "Bronze"),
  icon("silver", "medallion_silver", "Silver"),
  icon("gold", "medallion_gold", "Gold"),
]);

const platform = frame("dip", "", { dir: "col", gap: 16, stroke: CORAL, align: "center" }, [
  band("dip_hdr", "≣   Data Intelligence Platform   ≣", CORAL, BW, 46, 18),
  band("orch", "Orchestration", NAVY, BW - 36, 34, 14),
  phantom("engrow", "", { dir: "row", gap: 40, header: 0, align: "top" }, [
    icon("de", "dbx_data_engineering", "Data Engineering"),
    icon("ml", "dbx_ai_ml", "AI / ML"),
    icon("serve", "dbx_apps_line", "Serve"),
    icon("genie", "bi_genie", "Genie (NL Query)"),
  ]),
  medallion,
  phantom("consumerow", "", { dir: "row", gap: 40, header: 0 }, [
    icon("query", "dbx_query", "Query"),
    icon("dash", "dbx_dashboards_line", "Dashboards"),
  ]),
  // foundation — coral band title over two EQUAL-width white cards, each with a navy sub-header
  frame("found", "", { dir: "col", gap: 10, stroke: CORAL, fill: CORAL_TINT, align: "center" }, [
    band("found_hdr", "Unified, Open, Scalable Lakehouse Architecture", CORAL, BW - 30, 32, 14),
    phantom("foundrow", "", { dir: "row", gap: 24, header: 0, align: "top" }, [
      // both cards share structure (header band + a row-frame of icons) so they end up the SAME HEIGHT
      frame("gov", "", { dir: "col", gap: 8, stroke: "#CCCCCC", fill: "#FFFFFF", align: "center" }, [
        band("gov_h", "Governance", NAVY, CARD, 28, 12),
        phantom("govrow", "", { dir: "row", gap: 16, header: 0 }, [
          icon("uc", "unity_catalog", "Unity Catalog")]),
      ]),
      frame("store", "", { dir: "col", gap: 8, stroke: "#CCCCCC", fill: "#FFFFFF", align: "center" }, [
        band("store_h", "Open Storage", NAVY, CARD, 28, 12),
        phantom("storerow", "", { dir: "row", gap: 16, header: 0 }, [
          icon("delta", "delta", "Delta Lake"), icon("parq", "parquet", "Parquet"), icon("ice", "iceberg", "Iceberg")]),
      ]),
    ]),
  ]),
]);

const root = phantom("root", "Databricks Data Intelligence Platform", { dir: "row", gap: 40, align: "top" }, [sources, ingest, platform, outputs]);
renderTree(d, root, [40, 70]);

// numbered spine: sources → ingestion → medallion refinement; gold then fans to serving
d.link("src", "ing", "ingest", { step: 1 });
d.link("ing", "landing", "land", { step: 2 });
d.link("landing", "bronze", "", { step: 3 });
d.link("bronze", "silver", "", { step: 4 });
d.link("silver", "gold", "", { step: 5 });
d.link("gold", "query", "", { role: "fanout" });
d.link("gold", "dash", "", { role: "fanout" });
d.link("serve", "out", "serve", { flow: true });
d.link("dash", "out", "", { flow: true });

const r = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings, advice: r.audit.advice }));
writeFileSync(new URL("../../out/databricks_dip_kit.drawio", import.meta.url), d.mxfile("Databricks Data Intelligence Platform"));
