// VPC Lattice multi-account service mesh — type "mesh".
// NO hardcoded coordinates: only declare the structure, the layout engine computes x/y/w/h.
import { writeFileSync } from "node:fs";
import { Diagram, group, frame, icon, box, renderTree } from "drawio-ai-kit";

const d = new Diagram("mesh");

// Dev/Test/Prod are PEER accounts running the SAME stack → draw ONE account as a stack of 3 cards
// (multiplicity), never nested. VPC → Private subnet → EC2 associates its VPC to the service network.
const workloads =
  group("acc_prod", "group_account", "Workload Accounts (Dev · Test · Prod)", { dir: "col", stack: 3 }, [
    group("prod_vpc", "group_vpc", "VPC", { dir: "col" }, [
      group("prod_sub", "group_subnet", "Private subnet", { dir: "col" }, [
        icon("prod_ec2", "ec2", "Amazon EC2"),
      ]),
    ]),
  ]);

const tree = group("region", "group_region", "AWS Region", { dir: "row", gap: 70, pad: 40 }, [
  // Generative AI Account: Bedrock → Proxy(VPC) → Service 1 (col so the box fills instead of a wide empty strip)
  group("genai", "group_account", "Generative AI Account", { dir: "col", gap: 30 }, [
    icon("bedrock", "bedrock", "Amazon Bedrock"),
    group("genai_vpc", "group_vpc", "VPC", { dir: "row" }, [box("proxy", "Proxy Layer", { w: 150, h: 64 })]),
    icon("svc1", "vpc_lattice", "VPC Lattice (Service 1)"),
  ]),
  // Service Network Account (hub)
  group("snet", "group_account", "Service Network Account", { dir: "col", gap: 28 }, [
    icon("ram", "resource_access_manager", "AWS RAM"),
    icon("r53", "route_53", "Amazon Route 53"),
    icon("snlat", "vpc_lattice", "VPC Lattice (Service network)"),
    box("snpol", "Service Network Policy", { w: 180, h: 50 }),
  ]),
  workloads,
]);

renderTree(d, tree);                  // engine computes the entire layout + sets the page
d.title("Multi-account service mesh — type: mesh (Amazon VPC Lattice + AWS RAM)");

// associations (mesh): connect by id, the router handles routing automatically
d.link("bedrock", "proxy");
d.link("proxy", "svc1");
d.link("svc1", "snlat", "service association");
d.link("snlat", "prod_vpc", "VPC association");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/mesh_kit.drawio", import.meta.url), d.mxfile("Service mesh (VPC Lattice)"));
