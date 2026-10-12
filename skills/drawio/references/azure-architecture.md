# Azure architecture diagram preset

Icons: `drawio-ai search` with `azure …` (e.g. `azure kubernetes`, `azure sql`, `azure functions`). Azure has **no group/container stencils** in the catalog — draw containers with the engine's `frame(id, label, …)` (a plain labelled box); the icons carry the identity.

## Containers — nest in the real order

Azure's hierarchy is **logical first, network second** — different from AWS, and starts **above** the subscription (Cloud Adoption Framework):

```
Management Group  →  Subscription  →  Resource Group  →  (resources)     ← governance / logical / billing
                                       VNet (regional)  →  Subnet  →  NIC/NSG    ← network
```

- **Management Group** is the governance root. Canonical CAF layout: a **Platform** MG holding the **Identity**, **Management**, and **Connectivity** subscriptions, and a **Landing zones** MG holding **Corp** and **Online** application-landing-zone subscriptions. Keep the MG tree flat (3–4 levels); don't model prod/test/dev or regions as MGs — those are subscriptions.
- **Resource Group is the primary container** and has **no AWS equivalent** — every resource lives in exactly one RG. It is a *grouping*, **not** a network boundary.
- **VNet is regional** (one region); **Subnet** sits inside the VNet. An **NSG** attaches to a subnet or NIC — draw it as a label on the subnet, not a wrapping box.
- **Firewall / Bastion / Gateway live INSIDE the VNet, each in its own reserved-name subnet** — never loose in an RG. The names are fixed exact strings: `AzureFirewallSubnet` (Azure Firewall), `AzureBastionSubnet` (Bastion), `GatewaySubnet` (VPN/ExpressRoute gateway). `AzureFirewallSubnet`/`GatewaySubnet` **cannot** carry an NSG.
- **Private Endpoint / Private Link** (the dominant modern pattern): a PaaS service (Azure SQL, Storage, Key Vault, ACR) is a regional resource drawn **outside** the VNet, but reached privately through a **Private Endpoint (a NIC) in a dedicated `PrivateEndpointsSubnet`**; a linked **Private DNS zone** maps the FQDN. Draw subnet → private-endpoint → PaaS (solid).
- **Availability Zones** are *within* a region — annotate PaaS as "zone-redundant (≥3 instances across zones)" rather than drawing AZ boxes; don't model AZ as a top container.
- **Global services** (Entra ID, Azure DNS, Front Door, Traffic Manager, Azure Monitor) are **not regional** — place them in a band outside the RG / region, never inside a subnet.

## Canonical layouts

- **Hub-spoke landing zone (THE canonical CAF topology):** a **hub VNet in the Connectivity subscription** holding Bastion / Firewall / Gateway (each in its reserved subnet) + private DNS, drawn in the **center**; **spoke VNets** (each a separate application-landing-zone subscription under Corp/Online) radiate around it. Hub↔spoke = **VNet peering (dashed, bidirectional)** to the VNet border; on-prem enters via the gateway subnet; Azure Monitor to the side with dashed "Diagnostics".
- **N-tier VNet:** VNet is the box; subnets are **tiers stacked top→bottom** (Gateway/Web → App → Data). App Gateway + WAF in the perimeter/gateway subnet is the public entry.
- **AKS baseline:** spoke subnets `snet-appgw` (App Gateway+WAF) → `snet-ingress` (internal LB) → `snet-clusternodes` (node pools) → `PrivateEndpointsSubnet` (private links to ACR/Key Vault). Managed control plane (API server) drawn Azure-managed at the edge; egress via UDR → hub Firewall.

## Multi-region / HA

- One **VNet per region**; connect regions with **VNet peering** (solid) or a Virtual WAN hub. Never stretch one VNet across regions.
- Zone-redundant services (Zone-Redundant Storage, zonal VMSS) — one icon at the region level with a "zone-redundant" note, or one per zone with a sync link.

## Edges

- Solid = data/control flow; dashed = policy/identity/replication/peering.
- Connect to a container's **border box** (the `frame` id), not to every replica inside it.
- ExpressRoute / VPN Gateway is a **node** between Azure and on-prem — not just a labelled edge.

## Multi-cloud / hybrid composition

A diagram that mixes clouds or spans on-prem is **composed**, not forced into one preset (see `diagram-types.md` §Composing). Each cloud is its **own sibling top-level `frame`** following its own containment rules; connect them through a **neutral boundary node** — Internet, ExpressRoute/VPN, or a partner interconnect — never nest one cloud inside another. Read the other cloud's reference too (`references/<cloud>-architecture.md`).
