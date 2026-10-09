// BPMN swimlane process — type "bpmn". GENERIC template.
// Order management: roles (Customer / Sales / Warehouse) × phases (Intake / Review / Fulfill).
// Canonical mxgraph.bpmn shapes (monochrome; red accent on the rejection end event). Engine lays
// the pool out; sequence flow is solid + rounded, inter-lane handoffs cross lane bands.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { renderTree } from "../../src/layout-engine.ts";
import { pool, start, end, gateway, userTask, serviceTask } from "../../src/bpmn.ts";

const d = new Diagram("bpmn");

const proc = pool("order", "Order Management", {
  lanes: ["Customer", "Sales", "Warehouse"],
  phases: ["Intake", "Review", "Fulfill"],
}, [
  start("s1", { lane: 0, col: 0, label: "Order received" }),
  userTask("t1", { lane: 0, col: 1, label: "Place order" }),
  userTask("t2", { lane: 1, col: 2, label: "Review order" }),
  gateway("g1", { lane: 1, col: 3, label: "Approved?" }),
  serviceTask("t3", { lane: 1, col: 4, label: "Charge card" }),
  end("e2", { lane: 1, col: 5, label: "Rejected", type: "error" }),
  serviceTask("t4", { lane: 2, col: 5, label: "Ship order" }),
  end("e1", { lane: 2, col: 6, label: "Delivered" }),
]);

renderTree(d, proc, [40, 80]);
d.title("Order management — BPMN swimlane (type: bpmn)");

// sequence flow (solid, rounded) — BPMN convention. Handoffs cross lane bands (Customer→Sales, Sales→Warehouse).
d.link("s1", "t1", "submit", { flow: true, rounded: true });
d.link("t1", "t2", "placed", { flow: true, rounded: true });
d.link("t2", "g1", "", { flow: true, rounded: true });
d.link("g1", "t3", "yes", { flow: true, rounded: true });
d.link("g1", "e2", "no", { rounded: true });
d.link("t3", "t4", "fulfill", { flow: true, rounded: true });
d.link("t4", "e1", "", { flow: true, rounded: true });
writeFileSync(new URL("../../out/bpmn_kit.drawio", import.meta.url), d.mxfile("Order management (BPMN)"));
