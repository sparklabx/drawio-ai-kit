// Databricks platform DEPLOYMENT topology — GENERIC template, in the Databricks house style (coral/navy
// filled bands with white text). Canonical control-plane vs data-plane split (an account-ownership
// boundary, not a network tier): the Databricks account holds the control plane; the customer cloud
// account holds classic compute (in a VPC), serverless compute, and the object storage. Unity Catalog
// governs across the boundary. Full-colour icons; medallion as colored cylinders.
// Run: node examples/databricks/build_platform.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("hybrid");
const CORAL = "#FF3621", NAVY = "#1B3139", VPC = "#8C4FFF", STORE = "#B0752A";

const band = (id, label, fill, w, h = 30, fs = 12) => box(id, label, { w, h,
  style: `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=none;fontColor=#FFFFFF;fontSize=${fs};fontStyle=1;verticalAlign=middle;align=center;` });
const row = (id, kids) => phantom(id, "", { dir: "row", gap: 22, header: 0 }, kids);

// control plane — Databricks account (coral header + border)
const cp = frame("cp", "", { dir: "col", gap: 10, stroke: CORAL, align: "center" }, [
  band("cp_h", "Databricks account — Control Plane", CORAL, 250, 34, 13),
  icon("ws", "databricks", "Workspace / web app"),
  icon("jobs", "lakeflow_jobs", "Jobs & pipelines UI"),
  icon("uc", "unity_catalog", "Unity Catalog"),
  icon("nb", "notebooks", "Notebooks & SQL editor"),
]);

// customer cloud account — navy header; three sub-cards with navy sub-headers + identity borders
const srv = frame("srv", "", { dir: "col", gap: 8, stroke: CORAL, align: "center" }, [
  band("srv_h", "Serverless compute plane (Databricks-managed)", NAVY, 500),
  row("srvrow", [icon("mos", "mosaic_ai", "Model / agent serving"), icon("sql", "databricks_sql", "Serverless SQL")]),
]);
const cc = frame("cc", "", { dir: "col", gap: 8, stroke: VPC, align: "center" }, [
  band("cc_h", "Classic compute plane — customer VPC", NAVY, 500),
  row("ccrow", [icon("clus", "photon", "Spark + Photon clusters"), icon("strm", "data_streaming", "Structured Streaming")]),
]);
const store = frame("store", "", { dir: "col", gap: 8, stroke: STORE, align: "center" }, [
  band("store_h", "Cloud object storage (customer-owned)", NAVY, 500),
  row("storerow", [icon("bronze", "medallion_bronze", "Bronze"), icon("silver", "medallion_silver", "Silver"),
    icon("gold", "medallion_gold", "Gold"), icon("wsb", "dbx_object_storage", "Workspace storage")]),
]);
const cloud = frame("cloud", "", { dir: "col", gap: 16, stroke: NAVY, align: "center" }, [
  band("cloud_h", "Customer cloud account (AWS / Azure / GCP)", NAVY, 540, 34, 13),
  srv, cc, store,
]);

const root = phantom("root", "", { dir: "col", gap: 20, header: 0, align: "center" }, [
  band("hdr", "≣   Databricks Platform Deployment   ≣", CORAL, 860, 46, 18),
  phantom("planes", "", { dir: "row", gap: 70, align: "top", header: 0 }, [cp, cloud]),
]);
renderTree(d, root, [40, 60]);

// secure cluster connectivity: control plane <-> both compute planes (solid control edges)
d.link("ws", "cc", "secure cluster connectivity");
d.link("ws", "srv", "secure cluster connectivity");
d.link("jobs", "cc", "", { role: "fanout" });
// compute reads/writes the data lake (data-plane flow)
d.link("clus", "bronze", "read / write", { flow: true });
d.link("strm", "bronze", "", { flow: true });
d.link("sql", "gold", "query", { flow: true });
// Unity Catalog governs the whole customer side — compute planes AND storage (cross-boundary,
// dashed). One edge into the account container: three per-plane edges cross the control edges.
d.link("uc", "store", "governs (all planes + storage)", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/databricks_platform_kit.drawio", import.meta.url), d.mxfile("Databricks platform deployment"));
