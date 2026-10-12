// AWS Landing Zone — type "hierarchy". Layout engine: NO hardcoded coordinates.
import { writeFileSync } from "node:fs";
import { Diagram, group, frame, icon, stage, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("hierarchy");

// account = group_account frame (square) containing a row of service icons
const acct = (id, title, items) =>
  group(id, "group_account", title, { dir: "row", gap: 18 }, items.map(([n, l], i) => icon(`${id}_${i}`, n, l)));

// OU = themed frame (pale per-index tint, not garish) containing the accounts
const ou = (id, i, title, accts) => stage(id, i, title, accts, { gap: 22 });

const mgmt = group("mgmt", "group_account", "Management Account (Organization Root)", { dir: "row", gap: 30 }, [
  icon("m_org", "organizations", "AWS Organizations"),
  icon("m_ct", "control_tower", "Control Tower"),
  icon("m_sso", "single_sign_on", "IAM Identity Center"),
]);

const ous = phantom("ous", "", { dir: "row", gap: 46, align: "top", header: 0 }, [
  ou("ou_sec", 0, "Security OU", [
    acct("a_log", "Log Archive Account", [["s3", "S3 (logs)"], ["cloudtrail", "CloudTrail"], ["config", "Config"]]),
    acct("a_aud", "Audit Account (Security Tooling)", [["guardduty", "GuardDuty"], ["security_hub", "Security Hub"], ["detective", "Detective"]]),
  ]),
  ou("ou_inf", 1, "Infrastructure OU", [
    acct("a_shr", "Shared Services Account", [["directory_service", "Directory Service"], ["resource_access_manager", "RAM"]]),
    acct("a_net", "Network Account (DX + VPN)", [["transit_gateway", "Transit Gateway"], ["direct_connect", "Direct Connect"], ["site_to_site_vpn", "Site-to-Site VPN"], ["vpc", "Shared VPC"]]),
  ]),
  ou("ou_wl", 2, "Workloads OU", [
    acct("a_prod", "Production (Workloads_Prod)", [["vpc", "VPC"], ["eks", "EKS"], ["ec2", "EC2"]]),
    acct("a_np", "Non-Production (Workloads_Test)", [["vpc", "VPC"], ["ec2", "EC2"]]),
  ]),
  ou("ou_sbx", 3, "Sandbox OU", [
    acct("a_sbx", "Sandbox Account", [["vpc", "VPC"], ["ec2", "EC2"]]),
  ]),
]);

const tree = phantom("lz", "", { dir: "col", gap: 70, align: "center", header: 0, pad: 10 },
  [mgmt, ous]);

renderTree(d, tree, [40, 80]);

// On-prem sits OUTSIDE AWS, aligned directly under the Network Account (now the bottom account of
// the Infrastructure OU) so Direct Connect + VPN drop straight down — no crossing the Shared Services
// account above it. Placed by the rect the engine computed.
const net = d.rect("a_net"), ousBottom = Math.max(...["ou_sec", "ou_inf", "ou_wl", "ou_sbx"].map(id => d.rect(id).y + d.rect(id).h));
const opW = 250, opH = 90;
const opx = Math.round(net.x + net.w / 2 - opW / 2), opy = Math.round(ousBottom + 80);
// on-prem as the AWS corporate-data-center group stencil → corner icon like the cloud zones
d.group("onprem", "group_corporate_data_center", [opx, opy], [opW, opH], "ON-PREMISES (Corporate DC · Vietnam) — Core banking · Active Directory", { fill: "#FFFFFF", stroke: "#666666" });
d.page = [Math.max(d.page[0], opx + opW + 40), opy + opH + 50];
d.title("AWS Landing Zone — type: hierarchy (AWS Organizations · Control Tower)");

// hierarchy tree: Management → the OUs (right angles, shared bus)
d.link("mgmt", "ou_sec", "", { dir: "TB", role: "tree" });
d.link("mgmt", "ou_inf", "", { dir: "TB", role: "tree" });
d.link("mgmt", "ou_wl", "", { dir: "TB", role: "tree" });
d.link("mgmt", "ou_sbx", "", { dir: "TB", role: "tree" });
// hybrid connectivity: Direct Connect (primary) + Site-to-Site VPN (backup) straight down to on-prem
d.link("a_net_1", "onprem", "Direct Connect", { dir: "TB" });
d.link("a_net_2", "onprem", "Site-to-Site VPN (backup)", { dir: "TB", dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/landingzone_kit.drawio", import.meta.url), d.mxfile("AWS Landing Zone"));
