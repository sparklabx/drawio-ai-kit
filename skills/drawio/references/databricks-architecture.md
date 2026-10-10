# Databricks / Lakehouse architecture preset

Icons: `drawio-ai search "databricks …"`. Databricks has **no group/container stencils** — draw containers with `frame`/`stage`/`band`; the icons carry identity. Accent red `#FF3621` on **borders only**, never as a fill (clean house style).

**Pick the view first — the two Databricks diagrams have different containment:**

## A. Data Intelligence Platform / lakehouse reference (default — "lakehouse / data platform / pipeline")

The canonical Databricks reference. **Copy `drawio-ai scaffold build_data_intelligence_platform.mjs`** and adapt.

**Signature look — do these, they're what makes a diagram read as Databricks:**
- **Coral platform header band** (fill `#FF3621`, WHITE bold text) titling the platform, plus a **navy `Orchestration` band** (fill `#1B3139`, WHITE text) just inside it. `box()` hardcodes dark text, so draw these bands with a **raw style**: `rounded=0;whiteSpace=wrap;html=1;fillColor=<coral|navy>;strokeColor=none;fontColor=#FFFFFF;fontStyle=1;verticalAlign=middle;align=center;`. Give the bands an explicit width so the column hugs them.
- **Side zones (Data Sources · Ingestion · Consumers)** = WHITE frames with a **navy border** — **never a gray or tinted fill**. Fill them with the concept line-icons.
- **Medallion = the database icon recolored per Delta layer, in a row: Landing (green) → Bronze → Silver → Gold** (`dbx_landing`, `dbx_bronze`, `dbx_silver`, `dbx_gold`).
- **Foundation** = a coral band "Unified, Open, Scalable Lakehouse Architecture" over **two EQUAL-width cards** — **Governance** (`unity_catalog`) and **Open Storage** (`delta`, `parquet`, `iceberg`) — each with its own navy sub-header band. Give both cards the **same width** so they align (they sit side by side).
- **Unity Catalog is cross-cutting governance** — dash-link (`governs`) to storage AND serving/ML; never a node inside the flow.
- The only tint used is the **light-coral foundation** (`#FDECEA`); everything else is white + colored bands. No gray anywhere.

**Icon vocabulary (all merged into the `databricks` pack — `drawio-ai search "databricks …"`):**
- Concept line-icons (navy): `dbx_data_warehouse` · `dbx_external` (on-prem) · `dbx_apps_line` · `dbx_logs` · `dbx_events` · `dbx_cloud_database` · `dbx_ingestion` · `dbx_streaming` · `dbx_pipeline` · `dbx_data_engineering` · `dbx_ai_ml` · `dbx_query` · `dbx_dashboards_line` · `dbx_data_sharing` · `dbx_business_users` · `dbx_orchestration` · `dbx_catalog_line` · `dbx_notebook_line` · `dbx_cluster` · `dbx_table` · `dbx_lineage` · `dbx_security`.
- Medallion layers (recolored DB icons, in the **Big Data** pack): `medallion_landing` (green) · `medallion_bronze` · `medallion_silver` · `medallion_gold`.
- Products/logos: `unity_catalog` · `databricks_sql` · `mosaic_ai` · `bi_genie` · `lakeflow_connect` / `lakeflow_declarative_pipelines` / `lakeflow_jobs` · `delta` / `parquet` / `iceberg` (Big Data pack) · `tableau` · `power_bi`.

**Alternative flavour** — some references use compute **lanes** (Source → Ingest → Transform → Serve → Analysis) over a horizontal **Storage band** holding the medallion, with a Unity Catalog band under everything. Same principles; pick whichever the request implies.

## B. Platform deployment topology ("control plane / data plane / serverless / VPC / on a cloud")

The plane split is an **account-ownership boundary, NOT a network tier**:

- **Control plane = frame "Databricks account (control plane)"** (red border) — workspace/web app (`databricks`), `notebooks`, `lakeflow_jobs` (jobs UI), `databricks_sql` (query UI), `unity_catalog` (metastore + governance). Databricks-managed.
- **Classic compute plane = a dashed customer-cloud VPC frame** (`clusterBox`) in the **customer cloud account**, holding the Spark/`photon` clusters. **Serverless compute plane** = a separate frame on the Databricks-account side.
- **Storage lives in the customer cloud account** — `s3`/ADLS/GCS bucket(s) for workspace storage + the data lake (medallion). Object storage is **not** in the VPC — draw beside the classic compute VPC.
- Edges: control plane ↔ compute = **secure cluster connectivity** (solid); compute → storage = read/write (flow); UC → storage & compute = `governs` (dashed). Composing with a cloud follows `diagram-types.md` §Composing — the cloud is a sibling frame; only the classic compute VPC genuinely nests in the customer account.

## C. MLOps across workspaces ("MLOps / CI/CD / dev-staging-prod / promote model")

The "Big Book of MLOps" layout — copy `drawio-ai scaffold build_mlops.mjs`.

- **Git provider** band on top (dev → main → release repos, `github`; CI/CD boxes) → **three workspace zones** side by side: **Development · Staging · Production** → **Unity Catalog** band with per-env catalogs (each = Tables + Models) → **Lakehouse** band at the bottom.
- Each workspace holds an MLflow Tracking Server + its stage's work (dev: EDA + train/validate/deploy/monitor; staging: integration tests; prod: model train-deploy Workflow + Batch Inference + Monitoring) and a **Model Serving Endpoint** (coral).
- **Refined tones (match the reference):** each zone is a **muted** header band **flush to the top edge** (white text, **left-aligned**, with the **Databricks logo** at the left) over a **WHITE body** — muted steel-blue (Dev), dusty maroon (Staging), sage green (Prod), gray (Git), coral (Unity Catalog), navy (Lakehouse). Only the header is colored; bodies stay white. Catalog cards are white with a navy sub-header. The logo is a rasterized white mark in a `shape=label;image=…;imageAlign=left` band (embed a PNG data-URI — draw.io's PNG export does not rasterize embedded SVG).
- Edges carry the flow: `Pull request to main`, `Merge to release`, `CI trigger`, `Continuous Deployment`, `Logging`, `Register · promote model`.

## Governance hierarchy (when the diagram is about Unity Catalog)

`Account → Metastore (one per cloud region per account) → Catalog → Schema → Table | View | Volume | Function | Model`. Storage credentials, external locations, connections and shares sit under the metastore. Tables/volumes are **managed** (UC owns storage) or **external** (UC governs only). Draw as a nested `frame` tree (3-level namespace `catalog.schema.object`), not a flow.

## Edges

Solid = data/control flow; dashed = governance/lineage/sharing. Medallion Bronze→Silver→Gold = flow. Connect to a band's border, not each child. `flow:true` on the main ingest→medallion→serve spine.
