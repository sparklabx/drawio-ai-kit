# GCP architecture diagram preset

Icons: `drawio-ai search` with `gcp …` (e.g. `gcp compute engine`, `gcp bigquery`, `gcp cloud run`). GCP has **no group/container stencils** in the catalog — draw containers with the engine's `frame(id, label, …)`; the icons carry the identity.

## Containers — nest in the real order

```
Organization → Folder → Project → (resources)                 ← logical / billing / IAM
                                   VPC (GLOBAL) → Subnet (REGIONAL) → resources   ← network
```

- **Project is the primary isolation & billing boundary** (analogous to an AWS account). Draw the Project as the outer frame; Org/Folder above it when the diagram is about governance.
- **Shared VPC is the default enterprise pattern** (not a single project with one VPC): a **host project** owns the VPC, subnets and centralized firewall; **service projects** *attach* to it and deploy workloads **into the host's shared subnets**. Draw the host project as the frame containing the (global) VPC; draw service projects as **sibling frames** with a dashed **"attach"** edge to the host VPC.
- **A VPC network is GLOBAL** — the key difference from AWS. **One VPC spans all regions.** Draw the VPC as a **wide box wrapping multiple Region blocks**; do **NOT** nest the VPC inside a single region.
- **Subnets are REGIONAL** — one region, spanning that region's zones. Put subnets inside their Region block, inside the (global) VPC. Zonal resources (GCE VMs, GKE nodes) sit in the subnet; don't model a zone as a top container.
- **Cloud Router and Cloud NAT are REGIONAL — draw them INSIDE each Region** (one per region), not at the VPC edge. Cloud NAT gives private VMs/GKE nodes egress; Cloud Router carries dynamic routes for NAT and Interconnect/VPN.
- **Two firewall layers:** **hierarchical firewall policies** attach at the **Organization/Folder** frame (governance); **VPC firewall rules** (tag/SA-based) annotate the **VPC**. They are different layers.
- **Managed services** (BigQuery, Cloud SQL, GCS, Pub/Sub, Spanner) sit **outside** the VPC (regional/multi-regional), but are reached privately via **Private Google Access** (a subnet flag) or a **Private Service Connect endpoint that lives INSIDE the subnet** — draw the PSC endpoint in the subnet with a flow edge to the managed service.
- **VPC Service Controls perimeter** = an **org-level dashed boundary** wrapping projects + managed services to stop data exfiltration. Draw as a dashed frame around the managed-services band.
- **Global / edge services** (Cloud DNS, Cloud CDN, global HTTP(S) LB) sit **outside** the region blocks — a band at the top; the global LB front end is global (anycast/GFEs) but its **backends are regional** MIGs/NEGs (fan-out edges to them).

## Canonical layouts

- **Shared VPC landing zone:** Org → Folders (`production`/`non-production`/… with hierarchical firewall attached) → **host project** with one **global Shared VPC** → regional subnets (Private Google Access on) → **service projects attach** and deploy workloads. Redundant Interconnect → VLAN attachments → **regional Cloud Routers**; **Cloud NAT per region** for egress.
- **Hub-and-spoke (transit):** a **hub = routing/transit VPC** (Interconnect/VPN, shared services, sole on-prem path, optional NVA/NGFW) + **spoke = workload VPCs** (each its own Cloud NAT). Connect via **VPC Peering (non-transitive — spokes can't reach each other)**, **Network Connectivity Center** (star/mesh), or Cloud VPN.
- **Secure GKE baseline:** Project → VPC → regional **private** cluster in a subnet with **secondary alias-IP ranges for pods & services** (annotate the subnet). Control plane is **Google-managed, VPC-peered** (draw at the region edge, dashed peer); private nodes egress via **Cloud NAT**, ingress via **Cloud Load Balancing** (+ optional **Cloud Armor**), images from **Artifact Registry** over Private Google Access.
- **Data / analytics:** `Pub/Sub → Dataflow → BigQuery` (+ GCS staging) — managed/serverless, drawn at Project level (not in the VPC), connected with flow edges.

## Multi-region / HA

- The **VPC is global** → multi-region is natural: additional Region frames inside the *same* VPC box, subnets + Cloud Router/NAT per region. No peering needed between regions of one VPC.
- Cross-project/cross-VPC → **VPC Peering** (non-transitive) or **Shared VPC**. Cloud Spanner (multi-region) for a globally-consistent DB tier.

## Edges

- Solid = data/control flow; dashed = policy/replication/peering.
- Connect to a container's **border box**, not every replica inside it.
- Cloud Interconnect / Cloud VPN is a **node** between GCP and on-prem / other clouds — not just a labelled edge.

## Multi-cloud / hybrid composition

A diagram that mixes clouds or spans on-prem is **composed**, not forced into one preset (see `diagram-types.md` §Composing). Each cloud is its **own sibling top-level `frame`** following its own containment rules; connect them through a **neutral boundary node** — Internet, Cloud Interconnect/VPN, or a partner interconnect — never nest one cloud inside another. Read the other cloud's reference too (`references/<cloud>-architecture.md`).
