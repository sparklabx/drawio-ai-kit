// ============================================================================
// MULTI-AZ AWS ARCHITECTURE — reusable TEMPLATE
// (generalised from a real banking data-platform deck — copy this file and edit the LAYERS block)
//
// Conventions baked in (the "house style" for a Multi-AZ deployment diagram):
//   • Nesting: AWS Cloud → Region → VPC → AZ → Private subnet.  Internal/bank style = PRIVATE
//     subnets only (no public subnet / NAT; ingress-egress assumed via Direct Connect + VPC endpoints).
//     Want a public tier? add a `group_subnet "Public subnet"` above the private one in azCol.
//   • 1 EC2 worker node per AZ holds the layer's Application pods (real catalog icons, stacked
//     vertically). The pods are MIRRORED across the AZs (same structure in each column).
//   • Each app pod = a dashed, transparent cross-AZ "stack" box (clusterBox) that spans that pod in
//     ALL AZs (colour-coded) → reads as "this pod is one Multi-AZ deployment".
//   • An outer dashed EKS node-group box spans the worker nodes; non-EKS stacks (e.g. a Kafka broker
//     cluster on dedicated EC2) get their OWN cross-AZ box via `extraStacks`.
//   • EDGE RULE: connect edges to the dashed BOX border — target the box id (`comp_<app>` /
//     `eksstack` / `<extra stack id>`), ONE tidy arrow — never one arrow per per-AZ child icon.
//     (cloudLayer draws the boxes BEFORE the links so the ids are valid edge targets.)
//   • Optional GitOps band (Terraform + ArgoCD) deploying into the cluster.
//
// Icons: always use real catalog names (search the kit: `bun src/cli.ts search <name>`).
//        spark · dagster · starburst · trino · openmetadata · mongodb · redis · kafka · airflow ·
//        prometheus · grafana · opensearch · mysql · s3 · redshift · datasync · eks · terraform · argocd …
//
// Run:  node examples/aws/build_multiaz_template.mjs   → writes out/multiaz_template.drawio
//
// CONFORMANCE CHECKLIST (check the render against this before delivering):
//   [ ] AZ are vertical columns; each AZ = a private subnet (bank/internal style = NO public subnet/NAT).
//   [ ] 1 EC2 worker node per AZ holds the app pods (real icons), mirrored across AZs.
//   [ ] Each app pod has its OWN dashed cross-AZ clusterBox (colour-coded); an outer EKS node-group box
//       spans the worker nodes; non-EKS stacks (Kafka…) get their own box.
//   [ ] EDGES connect to the dashed BOX border (comp_<app> / eksstack / stack id) — ONE arrow —
//       never to each per-AZ icon.
//   [ ] Managed AWS services sit OUTSIDE the VPC; optional GitOps band (Terraform + ArgoCD).
// ============================================================================
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { group, frame, icon, box, band, endpoint, ossBox, onpremFrame, phantom, renderTree } from "../../src/layout-engine.ts";

// ---- knobs ----------------------------------------------------------------
const REGION_CODE = "ap-southeast-1";                 // AZ labels become ap-southeast-1a/b/c
const REGION      = `AWS Region · ${REGION_CODE}`;
const ACCOUNT     = "AWS Cloud — account PRODUCTION";
const AZS         = ["a", "b", "c"];                  // 3 AZs (Multi-AZ ≥3). Add/remove to taste.
const EKS_ORANGE  = "#ED7100";
const COMP_COLORS = ["#ED7100", "#6666FF", "#16A34A", "#C2185B", "#0EA5E9", "#7C3AED"]; // per-app box colour
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oss = (id, label) => ossBox(id, label);
const src = (id, label) => endpoint(id, label);

// ---- building blocks (don't usually need to touch) ------------------------
// 1 EC2 worker node / AZ holding the app pods (vertical). Pods are real icons, ids suffixed `_${s}`.
const ec2Node = (s, appPods) =>
  group(`ec2_${s}`, "group_ec2_instance_contents", "EC2 — EKS worker node", { dir: "col", gap: 10, align: "center" }, appPods);
// a standalone (non-EKS) EC2 instance — e.g. a Kafka broker — to place in the private subnet too.
const ec2Box = (id, label, children) => group(id, "group_ec2_instance_contents", label, { dir: "col", gap: 10, align: "center" }, children);
// AZ column = private subnet (big top pad/gap → room for the cross-AZ box headers). extraPrvFn(s) adds
// more nodes to the private subnet after the EKS worker node (e.g. the Kafka EC2).
const azCol = (s, podsFn, extraPrvFn = null) =>
  group(`az_${s}`, "group_availability_zone", `AZ ${REGION_CODE}${s}`, { dir: "col", gap: 14, align: "center" }, [
    group(`prv_${s}`, "group_subnet", "Private subnet", { dir: "col", gap: 60, align: "center", pad: 30 }, [ec2Node(s, podsFn(s)), ...(extraPrvFn ? extraPrvFn(s) : [])]),
  ]);
const azRow = (podsFn, extraPrvFn) =>
  phantom("azrow", "", { dir: "row", gap: 40, align: "top", header: 0 },
    AZS.map((s) => azCol(s, podsFn, extraPrvFn)));

// cross-AZ stack box (dashed, transparent, logo+label top-left) spanning idbase_a/_b/_c. Call AFTER renderTree.
const stackBox = (d, id, idbase, label, icon, stroke = EKS_ORANGE) =>
  d.clusterBox(id, AZS.map((s) => `${idbase}_${s}`), label, { icon, stroke, padTop: 30, pad: 10 });
// per-app cross-AZ box (no label/logo, colour-coded).
const compBox = (d, idbase, stroke) =>
  d.clusterBox(`comp_${idbase}`, AZS.map((s) => `${idbase}_${s}`), "", { icon: null, stroke, padTop: 22, pad: 10 });

/* ============================================================================
   cloudLayer — the workhorse. Declare ONE Multi-AZ layer:
     comps       [{ idbase, icon | box:true, label }]  app pods (1 EC2/AZ holds all of them, mirrored)
     managed     [icon(...)]                            AWS managed services OUTSIDE the VPC (band on top)
     sources     [card(...)]  /  sinks [card(...)]      left / right of the cloud
     extraPrvFn  (s)=>[ec2Box(...)]                     extra non-EKS node per AZ (e.g. Kafka broker)
     extraStacks [{ id, idbase, label, icon, stroke }]  its own cross-AZ box (e.g. the Kafka cluster)
     links       [[src, tgt, label, opt]]               EDGE → target a BOX id (comp_<app>/eksstack/<id>)
     gitops      true                                   add the Terraform+ArgoCD deploy band
   ============================================================================ */
function cloudLayer({ title, sources = [], managed = [], comps, extraPrvFn, vpcLabel = "VPC 10.0.0.0/16 — Amazon EKS (Multi-AZ ≥3)", clusterLabel = "Amazon EKS — node group Multi-AZ (≥3)", extraStacks = [], gitops = true, sinks = [], external = [], links = [] }) {
  const d = new Diagram("network");
  const podsFn = (s) => comps.map((c) => (c.box ? oss(`${c.idbase}_${s}`, c.label) : icon(`${c.idbase}_${s}`, c.icon, c.label)));

  const vpc = group("vpc", "group_vpc", vpcLabel, { dir: "col", gap: 16, align: "center" }, [azRow(podsFn, extraPrvFn)]);
  const regionKids = [];
  if (managed.length) regionKids.push(band("mgd", "Managed AWS services (outside VPC)", managed));
  regionKids.push(vpc);
  if (gitops) regionKids.push(band("gitops", "GitOps deploy — Terraform (IaC) · ArgoCD (sync)", [icon("tf", "terraform", "Terraform (IaC)"), icon("argo", "argocd", "ArgoCD (GitOps)")]));
  const region = group("region", "group_region", REGION, { dir: "col", gap: 20, align: "center" }, regionKids);
  const cloud = group("aws", "group_aws_cloud_alt", ACCOUNT, { dir: "col", gap: 14 }, [region]);

  const row = [];
  if (sources.length) row.push(phantom("srcs", "", { dir: "col", gap: 18, header: 0 }, sources));
  row.push(cloud);
  if (sinks.length) row.push(phantom("sinks", "", { dir: "col", gap: 18, header: 0 }, sinks));
  row.push(...external);

  renderTree(d, phantom("root", "", { dir: "row", gap: 56, align: "center", header: 0, pad: 10 }, row), [40, 80]);
  d.title(title);
  // Boxes FIRST so edges can target the dashed border (the edge rule).
  stackBox(d, "eksstack", "ec2", clusterLabel, "eks");
  if (comps.length > 1) comps.forEach((c, i) => compBox(d, c.idbase, c.color || COMP_COLORS[i % COMP_COLORS.length]));
  for (const st of extraStacks) stackBox(d, st.id, st.idbase, st.label, st.icon, st.stroke);
  for (const [s, t, label, opt] of links) d.link(s, t, label || "", opt || {});
  if (gitops) d.link("argo", "eksstack", "declare + deploy (GitOps)", { dir: "TB", dash: true });
  return d;
}

// ============================================================================
// LAYERS — edit / add pages here. Each entry becomes a tab in the .drawio.
// ============================================================================
const pages = [];
const add = (name, d) => pages.push({ name, d });

// EXAMPLE — a processing layer: Spark + Dagster pods on EKS, a dedicated Kafka EC2 cluster, edges to boxes.
add("Example · Processing", cloudLayer({
  title: "Example — Multi-AZ processing layer",
  sources: [src("srcA", "SOURCE SYSTEMS\n(batch + stream)")],
  managed: [icon("s3raw", "s3", "S3 (raw)"), icon("s3cur", "s3", "S3 (curated)")],
  comps: [
    { idbase: "spark", icon: "spark", label: "Spark (batch + stream)" },
    { idbase: "dag", icon: "dagster", label: "Dagster (orchestration)" },
  ],
  // a non-EKS stack in the same private subnet → gets its OWN cross-AZ box via extraStacks below.
  extraPrvFn: (s) => [ec2Box(`kec2_${s}`, "EC2 — Kafka broker", [icon(`kafka_${s}`, "kafka", "Kafka broker")])],
  extraStacks: [{ id: "kafkastack", idbase: "kec2", label: "Kafka cluster — Multi-AZ (≥3 broker)", icon: "kafka", stroke: "#5A6B7B" }],
  vpcLabel: "VPC 10.0.0.0/16 — EKS (Spark · Dagster) + Kafka/EC2 (Multi-AZ ≥3)",
  clusterLabel: "Amazon EKS — node group Multi-AZ (Spark · Dagster)",
  sinks: [box("consumers", "CONSUMERS\nBI · apps · downstream", { w: 170, h: 96, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true })],
  links: [
    // EDGES TARGET THE BOXES (comp_<app> / <stack id>), one arrow each — never per-AZ icons.
    ["srcA", "comp_spark", "ingest"],
    ["srcA", "kafkastack", "event stream"],
    ["s3raw", "comp_spark", "read"],
    ["kafkastack", "comp_spark", "stream", { dash: true }],
    ["comp_spark", "s3cur", "write (Parquet)"],
    ["comp_spark", "consumers", "serve"],
  ],
}));

// add more layers by copying the block above…

// ============================================================================
// combine pages into ONE .drawio + validate
// ============================================================================
for (const { name, d } of pages) {
  const r = d.validate();
  console.log(`${r.ok ? "OK " : "ERR"} ${name}  err=${r.errors.length} warn=${r.warnings.length} advice=${r.audit.advice.length}` +
    (r.errors.length ? "\n   " + r.errors.join("\n   ") : ""));
}
const xml = `<mxfile host="app.diagrams.net">` +
  pages.map(({ name, d }, i) => `<diagram name="${esc(name)}" id="p${i}">${d.toXML()}</diagram>`).join("") +
  `</mxfile>`;
writeFileSync(new URL("../../out/multiaz_template.drawio", import.meta.url), xml);
console.log(`\nWrote out/multiaz_template.drawio (${pages.length} page(s)).`);
