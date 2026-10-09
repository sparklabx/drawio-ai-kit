// Azure hub-spoke landing zone (CAF) — GENERIC template. THE canonical Azure topology. Exercises:
// Management Groups → Subscriptions → RG → VNet → reserved-name subnets; Firewall/Bastion/Gateway
// INSIDE the hub VNet (never loose in an RG); VNet peering; Private Endpoints for PaaS; on-prem via
// the gateway. Clean house style: white frames, identity via borders + icons.
// Run: node examples/azure/build_azure_hub_spoke_lz.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { frame, icon, box, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("network");
const AZ = "#0078D4", SUB = "#8AB4D8", MG = "#777777";

const subnet = (id, label, ico, name, icoLabel) =>
  frame(id, label, { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [icon(ico, name, icoLabel)]);

// Platform MG — Connectivity subscription holds the hub VNet (Bastion/Firewall/Gateway in reserved subnets).
const hub = frame("vnet_hub", "Hub VNet 10.0.0.0/16", { dir: "col", gap: 12, stroke: AZ, cornerIcon: "azure_virtual_networks" }, [
  subnet("sn_bas", "AzureBastionSubnet", "bas", "azure_bastions", "Azure Bastion"),
  subnet("sn_fw", "AzureFirewallSubnet", "fw", "azure_firewalls", "Azure Firewall"),
  subnet("sn_gw", "GatewaySubnet", "gw", "azure_virtual_network_gateways", "VPN / ExpressRoute GW"),
]);
const platform = frame("mg_platform", "MG: Platform", { dir: "row", gap: 26, align: "top", stroke: MG, cornerIcon: "azure_management_groups" }, [
  frame("sub_conn", "Subscription: Connectivity", { dir: "col", gap: 12, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [
    frame("rg_hub", "RG: rg-connectivity", { dir: "col", gap: 10, stroke: "#999999", cornerIcon: "azure_resource_groups" }, [hub]),
  ]),
  frame("sub_mgmt", "Subscription: Management", { dir: "col", gap: 12, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [
    frame("rg_mgmt", "RG: rg-management", { dir: "col", gap: 10, stroke: "#999999", cornerIcon: "azure_resource_groups" }, [
      icon("mon", "azure_monitor", "Monitor / Log Analytics"),
    ]),
  ]),
]);

// Landing zones MG — two application-landing-zone subscriptions (spokes).
const spokeCorp = frame("vnet_s1", "Spoke VNet (Corp) 10.1.0.0/16", { dir: "row", gap: 16, stroke: AZ, cornerIcon: "azure_virtual_networks" }, [
  frame("sn_web", "snet-web", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
    icon("agw", "azure_application_gateways", "App Gateway + WAF"),
    icon("vm", "azure_virtual_machine", "VM Scale Set"),
  ]),
  frame("sn_data", "snet-data", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [icon("sql", "azure_sql_database", "Azure SQL")]),
]);
const spokeOnline = frame("vnet_s2", "Spoke VNet (Online) 10.2.0.0/16", { dir: "row", gap: 16, stroke: AZ, cornerIcon: "azure_virtual_networks" }, [
  frame("sn_aks", "snet-aks", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [icon("aks", "azure_kubernetes_services", "AKS")]),
  subnet("sn_pe", "PrivateEndpointsSubnet", "pe", "azure_private_endpoints", "Private Endpoints"),
]);
const landingZones = frame("mg_lz", "MG: Landing zones", { dir: "row", gap: 26, align: "top", stroke: MG, cornerIcon: "azure_management_groups" }, [
  frame("sub_corp", "Subscription: Corp app LZ", { dir: "col", gap: 12, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [
    frame("rg_s1", "RG: rg-spoke-corp", { dir: "col", gap: 10, stroke: "#999999", cornerIcon: "azure_resource_groups" }, [spokeCorp]),
  ]),
  frame("sub_online", "Subscription: Online app LZ", { dir: "col", gap: 12, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [
    frame("rg_s2", "RG: rg-spoke-online", { dir: "col", gap: 10, stroke: "#999999", cornerIcon: "azure_resource_groups" }, [spokeOnline]),
  ]),
]);

const globals = frame("globals", "Global (not regional)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("aad", "azure_entra_connect", "Entra ID"),
  icon("dns", "azure_dns_zones", "Azure DNS (private zones)"),
]);
const paas = frame("paas", "PaaS (regional — reached via Private Link)", { dir: "row", gap: 20, stroke: "#999999" }, [
  icon("stg", "azure_storage_accounts", "Storage"),
  icon("kv", "azure_key_vaults", "Key Vault"),
]);

const azcol = phantom("azcol", "", { dir: "col", gap: 30, header: 0 }, [
  globals, platform, landingZones, paas,
]);
const onprem = box("onprem", "On-premises\n(ExpressRoute / VPN)", { w: 160, h: 70 });
const tree = phantom("root", "Azure landing zone — hub-spoke (Management Groups → Subscriptions → VNets)", { dir: "row", gap: 60, align: "top" }, [onprem, azcol]);
renderTree(d, tree, [40, 70]);

// on-prem enters through the gateway subnet
d.link("onprem", "gw", "ExpressRoute / VPN");
// hub <-> spoke VNet peering (dashed, to the VNet border)
d.link("vnet_hub", "vnet_s1", "VNet peering", { dash: true });
d.link("vnet_hub", "vnet_s2", "VNet peering", { dash: true });
// PaaS reached privately via the Private Endpoints subnet
d.link("pe", "stg", "Private Link");
d.link("pe", "kv", "Private Link");
// internal spoke flow
d.link("agw", "vm", "", { flow: true });
d.link("vm", "sql", "", { flow: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/azure_hub_spoke_lz_kit.drawio", import.meta.url), d.mxfile("Azure hub-spoke landing zone"));
