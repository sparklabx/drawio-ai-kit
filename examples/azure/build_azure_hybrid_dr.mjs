// Azure hybrid + DR (active-passive failover) — GENERIC template. On-prem connects via ExpressRoute into a
// PRIMARY region (ExpressRoute GW in the GatewaySubnet — never loose in an RG); a secondary (DR) region stays
// warm. Azure Site Recovery (Recovery Services vault) replicates the VMs; Azure SQL active geo-replication keeps
// the DR database in sync; Traffic Manager flips DNS on failover. White frames; identity via border + corner icon.
// Sibling regions are equal-height (engine-enforced). Run: node examples/azure/build_azure_hybrid_dr.mjs
import { writeFileSync } from "node:fs";
import { Diagram, frame, icon, box, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("network");
const AZ = "#0078D4", SUB = "#8AB4D8", RGN = "#777777";

// Primary region: ExpressRoute GW lives in its reserved GatewaySubnet, active workloads + primary SQL.
const primary = frame("rg_p", "Region: East US (primary)", { dir: "col", gap: 14, stroke: RGN }, [
  frame("vnet_p", "VNet 10.1.0.0/16", { dir: "col", gap: 12, stroke: AZ, cornerIcon: "azure_virtual_networks" }, [
    frame("gw_p", "GatewaySubnet", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
      icon("ergw", "azure_virtual_network_gateways", "ExpressRoute GW"),
    ]),
    frame("app_p", "snet-app", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
      icon("vm_p", "azure_virtual_machine", "VMSS (active)"),
    ]),
    frame("data_p", "snet-data", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
      icon("sql_p", "azure_sql_database", "Azure SQL — primary"),
    ]),
  ]),
]);

// DR region: warm-standby workloads + geo-replica SQL; Recovery Services vault is a regional resource (not in VNet).
const dr = frame("rg_d", "Region: West US (DR)", { dir: "col", gap: 14, stroke: RGN }, [
  frame("vnet_d", "VNet 10.2.0.0/16", { dir: "col", gap: 12, stroke: AZ, cornerIcon: "azure_virtual_networks" }, [
    frame("app_d", "snet-app", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
      icon("vm_d", "azure_virtual_machine", "VMSS (warm standby)"),
    ]),
    frame("data_d", "snet-data", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
      icon("sql_d", "azure_sql_database", "Azure SQL — geo-replica"),
    ]),
  ]),
  frame("asr_wrap", "Recovery Services (regional)", { dir: "col", gap: 8, stroke: "#999999" }, [
    icon("asr", "azure_recovery_services_vaults", "Site Recovery vault"),
  ]),
]);

const regions = phantom("regions", "", { dir: "row", gap: 40, align: "top", header: 0 }, [primary, dr]);

const globals = frame("globals", "Global (DNS failover)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("tm", "azure_traffic_manager_profiles", "Traffic Manager"),
]);

const sub = frame("sub", "Subscription: Production", { dir: "col", gap: 20, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [globals, regions]);
const onprem = box("onprem", "On-premises\ndatacenter", { w: 160, h: 70 });
const tree = phantom("root", "Azure hybrid + DR — ExpressRoute + active-passive failover (Site Recovery + SQL geo-replication)", { dir: "row", gap: 60, align: "top" }, [onprem, sub]);
renderTree(d, tree, [40, 70]);

d.link("onprem", "ergw", "ExpressRoute");
d.link("tm", "vm_p", "", { role: "fanout" });
d.link("tm", "vm_d", "failover", { dash: true });
d.link("vm_p", "sql_p", "");
d.link("sql_p", "sql_d", "Active geo-replication", { dash: true });
d.link("vm_p", "asr", "replicate to DR", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/azure_hybrid_dr_kit.drawio", import.meta.url), d.mxfile("Azure hybrid DR"));
