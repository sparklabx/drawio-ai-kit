// drawio-ai-kit — "diagram type" registry.
// Each type declares a layout + a matching edge-routing strategy, so the generator/router
// picks the right corner & lane style per diagram type instead of forcing one approach on all.

export const DIAGRAM_TYPES = {
  pipeline: {
    label: "Layered pipeline (data / request flow)",
    orientation: "LR",          // flow left → right
    edgeCorner: "rounded",      // sequential flow uses rounded corners
    laneStrategy: "corridor",   // offset edges pass through the gap between columns
    grouping: "columns-by-tier",
    notes: "Spine on the same row → straight horizontal edges; offset edges use 2 waypoints through the middle of the gap.",
  },
  hierarchy: {
    label: "Hierarchy / org tree (Landing Zone, org structure)",
    orientation: "TB",          // parent on top → children below
    edgeCorner: "sharp",        // hierarchy tree uses sharp corners
    laneStrategy: "shared-bus", // children of the same parent share one lane (bus)
    grouping: "nested-ou",
    notes: "Fan from one parent through a shared lane right below the parent → looks like a branching bus.",
  },
  network: {
    label: "VPC network topology (Multi-AZ)",
    orientation: "LR",          // tiers left → right
    edgeCorner: "rounded",
    laneStrategy: "corridor",
    grouping: "nested-region-az-subnet", // Region → VPC → AZ(column) → Subnet → SG
    mirrorAZ: true,             // AZs are symmetric, placed SIDE BY SIDE as columns
    notes: "STANDARD VPC LAYOUT: each Availability Zone is a VERTICAL COLUMN, the AZs sit side by side, and the VPC is the horizontal box that wraps them (Region → VPC → AZ columns → subnets). Inside an AZ, subnets are tiers stacked top→bottom (e.g. Public, then Private/App, then Data); keep the SAME tier aligned horizontally across AZs (public-a level with public-b). A shared LB/NAT/bus spans HORIZONTALLY across the AZ columns; replication/DR between mirrored AZs uses dashed edges.",
  },
  hubspoke: {
    label: "Hub-and-spoke / event bus",
    orientation: "radial",
    edgeCorner: "rounded",
    laneStrategy: "hub-center", // hub in the center, spokes on both sides
    grouping: "center-hub",
    notes: "Place the hub (bus/TGW/EventBridge) at the middle of the row; spokes connect horizontally on both sides (exitX=1 / exitX=0) → no crossing.",
  },
  hybrid: {
    label: "Hybrid / DR (on-prem ↔ cloud)",
    orientation: "LR",
    edgeCorner: "rounded",
    laneStrategy: "site-link",  // connect the two sites through one link node
    grouping: "two-sites",
    notes: "Two sites as separate blocks; connect via a Direct Connect/VPN node; mirror the components on both sides; bidirectional link uses dashed edges.",
  },
  mesh: {
    label: "Multi-account connectivity / service mesh (VPC Lattice · TGW · peering · RAM)",
    orientation: "free",        // accounts are peer containers
    edgeCorner: "rounded",
    laneStrategy: "association", // association/sharing between accounts; prefer routing through the 'shared/network' account
    grouping: "peer-accounts",
    notes: "Accounts are peer containers; one shared/network account at the center, the other accounts 'associate' to it (service network / TGW / RAM share). Association/sharing edges are clearly labeled; prefer hub-and-spoke through the shared account over a many-to-many mesh (Well-Architected REL02-BP04).",
  },
  sequence: {
    label: "Sequence / interaction (numbered request walkthrough)",
    orientation: "steps",       // in step order
    edgeCorner: "rounded",
    laneStrategy: "numbered-steps",
    grouping: "components",
    notes: "Number the steps along the request flow (1→N) on the architecture diagram; each arrow carries a sequence number; read by number, edges need not all point the same way.",
  },
  bpmn: {
    label: "BPMN swimlane process (roles × phases)",
    orientation: "LR",            // flow left → right across horizontal lanes
    edgeCorner: "rounded",        // sequence flow uses rounded corners
    laneStrategy: "swimlane",     // edges route across lane bands; handoffs cross lane boundaries
    grouping: "pool-lane-phase",  // Pool → Lane (role row) × Phase (milestone column)
    notes: "Horizontal swimlanes: lanes = roles stacked vertically, phases = vertical milestone bands with a header row. Sequence flow stays within a pool (solid); message flow connects pools (dashed). One start event top-left, end events on the right; gateways where paths split/merge.",
  },
};

export function typePreset(name) {
  return DIAGRAM_TYPES[name] || DIAGRAM_TYPES.pipeline;
}

/**
 * rounded=0/1 for an edge based on type + role.
 * role: "tree"/"fanout" → always sharp corners; "flow"/default → follows the type's edgeCorner.
 */
export function edgeRounded(typeOrPreset, role) {
  const p = typeof typeOrPreset === "string" ? typePreset(typeOrPreset) : typeOrPreset;
  if (role === "tree" || role === "fanout") return 0;
  return p.edgeCorner === "sharp" ? 0 : 1;
}

export function listTypes() {
  return Object.entries(DIAGRAM_TYPES).map(([key, v]) => ({ key, ...v }));
}
