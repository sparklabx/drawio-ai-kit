// Azure multi-region HA (active-active) — GENERIC template. THE canonical Azure HA topology:
// Azure Front Door (global anycast) load-balances across TWO paired regions; each region runs the SAME
// N-tier stack spread across Availability Zones (HA within a region); Azure SQL uses active geo-replication
// (primary → readable secondary) for cross-region data HA. White frames; identity via border + corner icon.
// Sibling regions are equal-height (engine-enforced). Run: node examples/azure/build_azure_multiregion_ha.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "drawio-ai-kit";
import { frame, icon, phantom, renderTree } from "drawio-ai-kit";

const d = new Diagram("network");
const AZ = "#0078D4", SUB = "#8AB4D8", RGN = "#777777";

// zone = an Availability Zone slice inside the app subnet (HA within a region).
const zone = (id, label, node) => frame(id, label, { dir: "col", gap: 8, stroke: "#B0C7EE" }, [node]);

// region = a VNet (corner icon) with web / app (zone-spread) / data subnets.
const region = (rid, rname, cidr, sqlLabel) =>
  frame(`rg_${rid}`, rname, { dir: "col", gap: 14, stroke: RGN }, [
    frame(`vnet_${rid}`, `VNet ${cidr}`, { dir: "col", gap: 12, stroke: AZ, cornerIcon: "azure_virtual_networks" }, [
      frame(`web_${rid}`, "snet-web", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
        icon(`agw_${rid}`, "azure_application_gateways", "App Gateway + WAF"),
      ]),
      frame(`app_${rid}`, "snet-app (zone-redundant)", { dir: "row", gap: 16, stroke: SUB, cornerIcon: "azure_subnet" }, [
        zone(`z1_${rid}`, "Zone 1", icon(`vm1_${rid}`, "azure_virtual_machine", "VMSS")),
        zone(`z2_${rid}`, "Zone 2", icon(`vm2_${rid}`, "azure_virtual_machine", "VMSS")),
      ]),
      frame(`data_${rid}`, "snet-data", { dir: "col", gap: 8, stroke: SUB, cornerIcon: "azure_subnet" }, [
        icon(`sql_${rid}`, "azure_sql_database", sqlLabel),
      ]),
    ]),
  ]);

const regions = phantom("regions", "", { dir: "row", gap: 40, align: "top", header: 0 }, [
  region("e", "Region: East US (primary)", "10.1.0.0/16", "Azure SQL — primary"),
  region("w", "Region: West US (secondary)", "10.2.0.0/16", "Azure SQL — readable geo-replica"),
]);

const globals = frame("globals", "Global (anycast)", { dir: "row", gap: 24, stroke: "#B0B0B0" }, [
  icon("fd", "azure_front_door_and_cdn_profiles", "Front Door + WAF"),
  icon("dns", "azure_dns_zones", "Azure DNS"),
]);

const tree = frame("root", "Azure multi-region HA — active-active (Front Door → 2 regions, zone-redundant tiers, SQL geo-replication)", { dir: "col", gap: 30 }, [
  globals,
  frame("sub", "Subscription: Production", { dir: "col", gap: 20, stroke: "#555555", cornerIcon: "azure_subscriptions" }, [regions]),
]);
renderTree(d, tree, [40, 70]);

// Front Door fans out to both regional gateways
d.link("fd", "agw_e", "", { role: "fanout" });
d.link("fd", "agw_w", "", { role: "fanout" });
// in-region flow: gateway → zone VMs → SQL
d.link("agw_e", "vm1_e", "", { role: "fanout" });
d.link("agw_e", "vm2_e", "", { role: "fanout" });
d.link("agw_w", "vm1_w", "", { role: "fanout" });
d.link("agw_w", "vm2_w", "", { role: "fanout" });
d.link("vm1_e", "sql_e", "");
d.link("vm1_w", "sql_w", "");
// cross-region data HA
d.link("sql_e", "sql_w", "Active geo-replication", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/azure_multiregion_ha_kit.drawio", import.meta.url), d.mxfile("Azure multi-region HA"));
