// Azure N-tier in a VNet — GENERIC template. Containment: Subscription → Resource Group → VNet → Subnet tiers.
// Azure has no group stencils in the catalog, so containers are plain frame()s (the icons carry identity).
// Each subnet lays its resources side-by-side (row) so the tier→tier flow combs cleanly (no label-crossing
// detours). Global services (Entra ID / DNS) sit OUTSIDE the RG. Run: node examples/azure/build_azure_vnet.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { frame, icon, box, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("network");
const BLUE = "#0078D4";

// tier = a subnet band; resources sit side-by-side so edges from the tier above fan in as a clean comb.
const tier = (id, label, kids) => frame(id, label, { dir: "row", gap: 24, stroke: "#8AB4D8", cornerIcon: "azure_subnet" }, kids);

const vnet = frame("vnet", "VNet  10.0.0.0/16", { dir: "col", gap: 22, align: "center", stroke: BLUE, cornerIcon: "azure_virtual_networks" }, [
  // Azure Firewall lives INSIDE the VNet in its reserved-name subnet — never loose in the RG.
  tier("sn_fw", "AzureFirewallSubnet  10.0.0.0/26", [icon("fw", "azure_firewalls", "Azure Firewall")]),
  tier("sn_web", "snet-appgw  10.0.1.0/24", [icon("agw", "azure_application_gateways", "App Gateway + WAF")]),
  tier("sn_app", "snet-app  10.0.2.0/24", [icon("vm", "azure_virtual_machine", "VM Scale Set"), icon("aks", "azure_kubernetes_services", "AKS")]),
  tier("sn_data", "snet-data  10.0.3.0/24", [icon("sql", "azure_sql_database", "Azure SQL")]),
]);

const rg = frame("rg", "Resource Group: rg-app-prod", { dir: "row", gap: 28, align: "top", cornerIcon: "azure_resource_groups" }, [
  vnet,
  // PaaS services ARE regional resources outside the VNet — reached privately via Private Endpoints.
  frame("rg_svc", "PaaS (not in VNet — via Private Link)", { dir: "col", gap: 16, stroke: "#999999" }, [
    icon("kv", "azure_key_vaults", "Key Vault"),
    icon("stg", "azure_storage_accounts", "Storage Account"),
  ]),
]);

const globals = frame("globals", "Global (not regional)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("aad", "azure_entra_connect", "Entra ID"),
  icon("dns", "azure_dns_zones", "Azure DNS"),
]);

const tree = frame("root", "Azure N-tier VNet (Subscription → Resource Group → VNet → Subnet)", { dir: "col", gap: 30 }, [
  globals,
  frame("sub", "Subscription: Production", { dir: "col", gap: 20, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [rg]),
]);
renderTree(d, tree, [40, 70]);

// clean vertical spine: gateway → app tier (fan-out), app → data (fan-in)
d.link("agw", "vm", "", { role: "fanout" });
d.link("agw", "aks", "", { role: "fanout" });
d.link("vm", "sql", "");
d.link("aks", "sql", "");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/azure_vnet_kit.drawio", import.meta.url), d.mxfile("Azure N-tier VNet"));
