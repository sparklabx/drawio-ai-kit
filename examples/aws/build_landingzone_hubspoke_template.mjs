// ============================================================================
// AWS SOLUTION-ARCHITECTURE DECK — multi-account Landing Zone — TEMPLATE (multi-tab)
// Generic & reusable. NO company / system / product names — placeholders only.
//
// Mirrors a real enterprise SA deck: one .drawio with several tabs, each a standard section.
// Tabs:  As-Is · To-Be (hub-and-spoke) · Networking · Security · Backup & DR · Logging & Monitoring · CI/CD
//
// House conventions:
//   • Multi-account: NETWORK account (hub) + WORKLOAD accounts (spokes) + SECURITY/shared-services.
//   • Centralized networking: Ingress (WAF+ALB) / Inspection (NGFW) / Egress (NAT) VPCs wired through a
//     central TRANSIT GATEWAY; workload VPCs attach as spokes; on-prem via Direct Connect + VPN.
//   • Edges follow hub-and-spoke — connect to the Transit Gateway / to a box border, not node-to-node spaghetti.
//   • Real catalog icons only (search: `bun src/cli.ts search <name>`).
//
// Run:  node examples/aws/build_landingzone_hubspoke_template.mjs  → out/sa_landingzone_template.drawio
//
// CONFORMANCE CHECKLIST (check the render against this before delivering):
//   [ ] Accounts separated via group_account: Network (hub) + Workload (spokes) + Security / shared-services.
//   [ ] Transit Gateway is the hub; Ingress (WAF/ALB) · Inspection (NGFW) · Egress (NAT) VPCs live in the
//       Network account.
//   [ ] Workload VPCs attach to the TGW (spokes); on-prem reaches the TGW via Direct Connect + Site-to-Site VPN.
//   [ ] Governance baseline present: CloudTrail · Config · GuardDuty · Security Hub · KMS.
//   [ ] Edges go to the Transit Gateway (hub-and-spoke), not node-to-node spaghetti.
// ============================================================================
import { writeFileSync } from "node:fs";
import { Diagram } from "drawio-ai-kit";
import { group, frame, icon, box, band, endpoint, onpremFrame, phantom, renderTree } from "drawio-ai-kit";

const REGION = "AWS Region · <primary>";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pages = [];
const add = (name, d) => pages.push({ name, d });

// ---- shared building blocks ----------------------------------------------
const acct = (id, label, children, opts = {}) => group(id, "group_account", label, { dir: "col", gap: 16, align: "center", ...opts }, children);
const vpc  = (id, label, children, opts = {}) => group(id, "group_vpc2", label, { dir: "col", gap: 14, align: "center", ...opts }, children);
const priv = (id, label, children) => group(id, "group_subnet", label || "Private subnet", { dir: "col", gap: 10, align: "center" }, children);
const greybox = (id, label, w = 160, h = 60) => box(id, label, { w, h, fill: "#F0F0F0", stroke: "#666666" });
const cloudOf = (label, kids) => group("aws", "group_aws_cloud_alt", label, { dir: "col", gap: 14 }, [group("region", "group_region", REGION, { dir: "col", gap: 24, align: "center" }, kids)]);

/* =========================== TAB 1 — As-Is (on-premise) =================== */
{
  const d = new Diagram("pipeline");
  const dc = onpremFrame("dc", "Corporate Data Center — AS-IS (on-premise)", [
    phantom("tiers", "", { dir: "col", gap: 16, header: 0 }, [
      greybox("web", "Web tier (VMs)", 180, 56),
      greybox("app", "App tier — monolith / services", 220, 56),
      greybox("db", "Database (RDBMS, on SAN)", 220, 56),
    ]),
    phantom("side", "", { dir: "col", gap: 16, header: 0 }, [
      greybox("integ", "Legacy integrations\n(file / API / message)", 180, 64),
      greybox("net", "On-prem network\n(firewall · LB · DNS)", 180, 64),
      greybox("bk", "Tape / local backup", 180, 56),
    ]),
  ], { dir: "row", gap: 40 });
  renderTree(d, dc, [40, 80]);
  d.title("AS-IS — current on-premise architecture (TEMPLATE)");
  d.link("web", "app", "");
  d.link("app", "db", "");
  d.link("app", "integ", "", { dash: true });
  add("As-Is", d);
}

/* =========================== TAB 2 — To-Be (hub-and-spoke) ================ */
{
  const d = new Diagram("mesh");
  const edgeVpcs = phantom("edgevpcs", "", { dir: "row", gap: 26, align: "top", header: 0 }, [
    vpc("ingress", "Ingress VPC", [priv("in_sub", "Public edge", [icon("waf", "waf", "AWS WAF"), icon("alb", "application_load_balancer", "Public ALB")])]),
    vpc("inspect", "Inspection VPC", [priv("insp_sub", "Inspection", [icon("ngfw", "network_firewall", "NGFW")])]),
    vpc("egress", "Egress VPC", [priv("eg_sub", "Egress", [icon("nat", "nat_gateway", "NAT Gateway")])]),
  ]);
  const networkAcct = acct("net_acct", "Network Account (hub)", [edgeVpcs, icon("tgw", "transit_gateway", "Transit Gateway")]);
  const workloadA = acct("wl_a", "Workload Account A", [vpc("vpc_a", "Workload VPC 10.1.0.0/16", [priv("a_sub", "Private subnet (Multi-AZ)", [icon("eks_a", "eks", "EKS workload"), icon("ialb_a", "application_load_balancer", "Internal ALB")])])]);
  const workloadB = acct("wl_b", "Workload Account B", [vpc("vpc_b", "Workload VPC 10.2.0.0/16", [priv("b_sub", "Private subnet (Multi-AZ)", [icon("ec2_b", "ec2", "EC2 workload"), icon("rds_b", "rds", "Database")])])]);
  const security = acct("sec_acct", "Security / Shared-Services Account", [band("gov", "Governance baseline (org-wide)", [
    icon("ct", "cloudtrail", "CloudTrail"), icon("cfg", "config", "Config"), icon("gd", "guardduty", "GuardDuty"),
    icon("sh", "security_hub", "Security Hub"), icon("kms", "key_management_service", "KMS"), icon("logs", "s3", "S3 (central logs)")])]);
  const cloud = cloudOf("AWS Cloud — Organizations / Landing Zone (multi-account)", [networkAcct, phantom("spokes", "", { dir: "row", gap: 40, align: "top", header: 0 }, [workloadA, workloadB]), security]);
  const onprem = onpremFrame("onprem", "Corporate Data Center (On-Premise)", [greybox("dc_wl", "On-prem workloads\n& network", 170, 80)]);
  const channel = phantom("chn", "", { dir: "col", gap: 40, header: 0 }, [icon("dx", "direct_connect", "Direct Connect"), icon("vpn", "site_to_site_vpn", "Site-to-Site VPN")]);
  renderTree(d, phantom("root", "", { dir: "row", gap: 56, align: "center", header: 0, pad: 10 }, [onprem, channel, cloud]), [40, 80]);
  d.title("TO-BE — multi-account Landing Zone, hub-and-spoke (Transit Gateway) (TEMPLATE)");
  d.link("dc_wl", "dx", ""); d.link("dc_wl", "vpn", "", { dash: true });
  d.link("dx", "tgw", "Direct Connect"); d.link("vpn", "tgw", "VPN (backup)", { dash: true });
  d.link("tgw", "ingress", "", { role: "fanout" }); d.link("tgw", "inspect", "", { role: "fanout" }); d.link("tgw", "egress", "", { role: "fanout" });
  d.link("vpc_a", "tgw", "TGW attachment", { role: "fanin" }); d.link("vpc_b", "tgw", "TGW attachment", { role: "fanin" });
  add("To-Be", d);
}

/* =========================== TAB 3 — Networking =========================== */
{
  const d = new Diagram("mesh");
  const inet = endpoint("inet", "Internet\n(users / public)");
  const edge = phantom("edge", "", { dir: "col", gap: 16, align: "center", header: 0 }, [
    vpc("ingress", "Ingress VPC", [priv("in_sub", "Public subnet", [icon("igw", "internet_gateway", "IGW"), icon("waf", "waf", "WAF"), icon("alb", "application_load_balancer", "ALB")])]),
    vpc("inspect", "Inspection VPC", [priv("insp_sub", "Firewall subnet", [icon("ngfw", "network_firewall", "NGFW")])]),
    vpc("egress", "Egress VPC", [priv("eg_sub", "Public subnet", [icon("nat", "nat_gateway", "NAT GW")])]),
  ]);
  const net = acct("net_acct", "Network Account — centralized inspection", [edge, icon("tgw", "transit_gateway", "Transit Gateway\n(route tables / attachments)")]);
  const spokes = phantom("spokes", "", { dir: "col", gap: 18, align: "center", header: 0 }, [
    vpc("vpc_a", "Workload VPC A (spoke)", [icon("att_a", "transit_gateway_attachment", "TGW attachment")]),
    vpc("vpc_b", "Workload VPC B (spoke)", [icon("att_b", "transit_gateway_attachment", "TGW attachment")]),
    vpc("vpc_3p", "3rd-party / partner VPC", [icon("att_3p", "transit_gateway_attachment", "TGW attachment")]),
  ]);
  const cloud = cloudOf("AWS Cloud — centralized networking", [net, spokes]);
  const onprem = onpremFrame("onprem", "On-Premise / Data Center", [greybox("router", "Edge router\n& on-prem network", 160, 70)]);
  const chn = phantom("chn", "", { dir: "col", gap: 40, header: 0 }, [icon("dx", "direct_connect", "Direct Connect"), icon("vpn", "site_to_site_vpn", "Site-to-Site VPN")]);
  renderTree(d, phantom("root", "", { dir: "row", gap: 50, align: "center", header: 0, pad: 10 }, [inet, onprem, chn, cloud]), [40, 80]);
  d.title("NETWORKING — Transit Gateway hub-and-spoke + central inspection (TEMPLATE)");
  d.link("inet", "waf", "ingress"); d.link("waf", "alb", "");
  d.link("router", "dx", ""); d.link("router", "vpn", "", { dash: true });
  d.link("dx", "tgw", ""); d.link("vpn", "tgw", "", { dash: true });
  d.link("tgw", "att_a", "", { role: "fanout" }); d.link("tgw", "att_b", "", { role: "fanout" }); d.link("tgw", "att_3p", "", { role: "fanout" });
  d.link("ngfw", "nat", "inspected egress", { dash: true });
  add("Networking", d);
}

/* =========================== TAB 4 — Security ============================= */
{
  const d = new Diagram("pipeline");
  const cloud = cloudOf("AWS Cloud — security & governance (org-wide)", [
    band("perim", "Perimeter & network security", [icon("shield", "shield", "Shield"), icon("waf", "waf", "WAF"), icon("ngfw", "network_firewall", "NGFW"), greybox("sg", "Security Groups\n& NACLs", 150, 56)]),
    band("ident", "Identity & access", [icon("iam", "identity_and_access_management", "IAM / SSO"), icon("kms", "key_management_service", "KMS"), icon("sec", "secrets_manager", "Secrets Manager")]),
    band("detect", "Detection & response", [icon("gd", "guardduty", "GuardDuty"), icon("sh", "security_hub", "Security Hub"), icon("cfg", "config", "Config"), icon("ct", "cloudtrail", "CloudTrail")]),
  ]);
  renderTree(d, cloud, [40, 80]);
  d.title("SECURITY — defense-in-depth & governance baseline (TEMPLATE)");
  d.link("waf", "iam", "", { dash: true }); d.link("iam", "gd", "", { dash: true });
  add("Security", d);
}

/* =========================== TAB 5 — Backup & DR ========================== */
{
  const d = new Diagram("pipeline");
  const primary = group("reg1", "group_region", "AWS Region · <primary>", { dir: "col", gap: 16, align: "center" }, [
    band("src", "Workload data", [icon("vol", "volume", "EBS volumes"), icon("rds", "rds", "RDS"), icon("s3p", "s3", "S3 buckets")]),
    icon("backup", "backup", "AWS Backup vault"),
  ]);
  const drreg = group("reg2", "group_region", "AWS Region · <DR>", { dir: "col", gap: 16, align: "center" }, [
    icon("backup2", "backup", "Backup vault (copy)"), icon("s3dr", "s3", "S3 (replicated)"),
  ]);
  const cloud = group("aws", "group_aws_cloud_alt", "AWS Cloud — Backup & Disaster Recovery", { dir: "row", gap: 60, align: "top" }, [primary, drreg]);
  renderTree(d, cloud, [40, 80]);
  d.title("BACKUP & DR — vault, snapshots, cross-region copy (TEMPLATE)");
  d.link("vol", "backup", "", { role: "fanin" }); d.link("rds", "backup", "", { role: "fanin" }); d.link("s3p", "backup", "snapshot/policy", { role: "fanin" });
  d.link("backup", "backup2", "cross-region copy", { dash: true });
  d.link("s3p", "s3dr", "cross-region replication", { dash: true });
  add("Backup & DR", d);
}

/* =========================== TAB 6 — Logging & Monitoring ================= */
{
  const d = new Diagram("pipeline");
  const sources = band("src", "Sources", [icon("eks", "eks", "EKS"), icon("ec2", "ec2", "EC2"), greybox("flow", "VPC Flow Logs", 130, 50)]);
  const collect = band("col", "Collect & store", [icon("cw", "cloudwatch_2", "CloudWatch\n(metrics/logs)"), icon("ct", "cloudtrail", "CloudTrail"), icon("s3", "s3", "S3 (Log Archive account)")]);
  const consume = band("con", "Observe & alert", [icon("os", "opensearch", "OpenSearch\n(dashboards)"), icon("sns", "sns", "SNS → email / chat / ticket")]);
  const cloud = cloudOf("AWS Cloud — centralized logging & monitoring", [sources, collect, consume]);
  renderTree(d, cloud, [40, 80]);
  d.title("LOGGING & MONITORING — central log archive + observability (TEMPLATE)");
  d.link("eks", "cw", "metrics/logs"); d.link("ct", "s3", "trail → archive");
  d.link("cw", "os", "index"); d.link("cw", "sns", "alarms", { dash: true });
  add("Logging & Monitoring", d);
}

/* =========================== TAB 7 — CI/CD ================================ */
{
  const d = new Diagram("pipeline");
  const pipe = group("pipe", null, "CI/CD pipeline (GitOps)", { dir: "row", gap: 34, fill: "#F5F5F5", stroke: "#999999" }, [
    greybox("git", "Git repo\n(source)", 120, 56),
    icon("ci", "jenkins", "CI — build / test"),
    icon("scan", "sonarqube", "SAST / DAST"),
    icon("ecr", "ecr", "Container registry"),
    icon("cd", "argocd", "CD — GitOps deploy"),
  ]);
  const envs = group("aws", "group_aws_cloud_alt", "AWS Cloud — deploy targets (per-env accounts)", { dir: "row", gap: 30 }, [
    acct("dev", "DEV account", [icon("eks_d", "eks", "EKS")]),
    acct("uat", "UAT account", [icon("eks_u", "eks", "EKS")]),
    acct("prd", "PROD account", [icon("eks_p", "eks", "EKS")]),
  ]);
  renderTree(d, phantom("root", "", { dir: "col", gap: 40, header: 0 }, [pipe, envs]), [40, 80]);
  d.title("CI/CD — pipeline → registry → GitOps deploy per environment (TEMPLATE)");
  d.link("git", "ci", ""); d.link("ci", "scan", ""); d.link("scan", "ecr", ""); d.link("ecr", "cd", "");
  d.link("cd", "eks_d", "", { role: "fanout" }); d.link("cd", "eks_u", "", { role: "fanout" }); d.link("cd", "eks_p", "", { role: "fanout" });
  add("CI/CD", d);
}

/* =========================== combine into one .drawio ===================== */
let allOk = true;
for (const { name, d } of pages) {
  const r = d.validate();
  if (!r.ok) allOk = false;
  console.log(`${r.ok ? "OK " : "ERR"} ${name}  err=${r.errors.length} warn=${r.warnings.length} advice=${r.audit.advice.length}` + (r.errors.length ? "\n   " + r.errors.join("\n   ") : ""));
}
const xml = `<mxfile host="app.diagrams.net">` + pages.map(({ name, d }, i) => `<diagram name="${esc(name)}" id="p${i}">${d.toXML()}</diagram>`).join("") + `</mxfile>`;
writeFileSync(new URL("../../out/sa_landingzone_template.drawio", import.meta.url), xml);
console.log(`\nWrote out/sa_landingzone_template.drawio (${pages.length} tabs). allValid=${allOk}`);
