# BPMN swimlane diagram rules (Tier-1)

Conventions for BPMN 2.0 swimlane process diagrams. Layer these on top of `principles.md`.

## When to draw BPMN

- BPMN = a **business process**: "who does what, in what order, with what decisions?" (roles, handoffs, decision gates across participants).
- "What services connect to what?" → the **architecture** preset; data transformation stages with no role separation → a **pipeline** diagram.

## Element vocabulary (Tier-1)

| Kind | Element | Shape / meaning |
| --- | --- | --- |
| Event (circle) | Start | thin single-line circle; one per pool, placed top-left |
| Event | End | thick bold circle; right edge of the flow |
| Event | Intermediate | double-line circle (inner ring); attached to an activity or between steps |
| Activity (rounded rect) | Task | single-line rounded rect |
| Activity | User task | person icon marker |
| Activity | Service task | gear icon marker |
| Activity | Sub-process | small square marker on the bottom-centre border (Tier-1: treat as a collapsed box with a label) |
| Gateway (diamond) | Exclusive (XOR) | `X` marker; only one outgoing path taken |
| Gateway | Parallel (AND) | `+` marker; all outgoing paths taken concurrently |
| Gateway | Inclusive (OR) | `O` marker; one or more outgoing paths taken |
| Gateway | Event-based | pentagon/circle inside; path chosen by which event occurs first |
| Flow | Sequence flow | solid arrow; stays **within** one pool; connects flow objects in execution order |
| Flow | Message flow | dashed arrow; connects **between pools** (across organizational boundaries) |
| Container | Pool | outer rectangle for a participant (company, role, system); contains lanes and all flow objects |
| Container | Lane | horizontal band inside a pool for a role/responsibility |
| Container | Phase | optional vertical milestone band (temporal/logical stages) |

Event markers (inside the circle): **None** (empty, default) · **Message** (envelope) · **Timer** (clock) · **Error** (lightning bolt, fill **red**) · **Terminate** (bold X/stop, fill **red**) · **Link** (arrow-in/out) · **Cancel** (bold X, fill **red**) · **Signal** (triangle).

## Layout

- **Orientation:** horizontal by default — flow runs left → right, lanes stack top → bottom.
- **One start event per pool** at the top-left of its first active lane. End events on the right.
- **Main flow on a horizontal spine:** keep the happy path roughly level across lanes; avoid zigzagging up and down.
- **Lane handoffs:** place the receiving activity vertically aligned with (or close to) the sender so the crossing sequence flow is short and mostly vertical.
- **Gateways** sit where paths split (diverging) or rejoin (converging). Place the merge gateway directly below the split gateway if the flow recombines after a parallel section.
- **Phase bands:** optional vertical columns with a header row at the top. Label each phase (e.g. "Intake", "Review", "Fulfill"). Flow objects sit inside the lane×phase intersection.
- **Pool placement:** side by side when showing collaboration between participants. The initiating pool (with the start event) is on the left.

## Color & style

- **Canonical monochrome:** activities, events, and gateways use white fill (`#FFFFFF`), neutral dark stroke (`#000000`), black labels/markers — **thick stroke on end events**, **double stroke on intermediate**. Sequence flow: dark solid line; message flow: dark dashed line.
- **Red accent only** for error, cancel, and terminate events (fill `#f8cecc` or stroke `#b85450`). Do not color normal activities or gateways red.
- **Lane bands:** faint tint or no-fill with a left-border stripe — just enough to distinguish lanes without competing with the flow. One neutral colour for all lanes; do not rainbow-colour lanes.
- **Phase headers:** subtle tinted band across the top; label in small bold text.
- **No per-element colouring by mood, status, or "importance".** Colour carries BPMN semantics only (red = error/terminate).

## Validation contract

The validator enforces these — build to pass on the first run:

- **Sequence flow stays inside its pool.** Crossing a pool boundary → error. Use message flow instead.
- **Gateways need ≥2 outgoing flows** (or a single outgoing flow with a label if the other path is a non-BPMN annotation). A gateway with one unlabeled outgoing edge is a structural error.
- **Each pool has ≥1 start event and ≥1 end event.** Empty pools or dead-end flows are errors.
- **Every flow object (event, activity, gateway) lives inside a lane, inside a pool.** Orphan nodes outside a lane are errors.
- **No self-loops** on a single flow object (a sequence flow from a node back to itself is not valid BPMN).
- **Message flow connects pools only.** Message flow inside a single pool is an error.

## Common mistakes

- **Sequence flow between pools** — always use message flow for inter-pool communication.
- **Orphan nodes** outside a lane — every element must sit in a lane.
- **Gateway with one outgoing edge** — if only one path follows, the gateway is unnecessary; remove it.
- **Colouring tasks by "importance" or "status"** — colour is semantic (red = error/terminate), not decorative.
- **Forcing cloud-architecture nested containers** (VPC→Subnet→SG) onto a process flow — BPMN uses Pool→Lane→Phase, not infrastructure nesting.
- **Backward-pointing arrows everywhere** — if most of the flow goes right→left, reconsider the layout order. Occasional backward arrows for loops/exceptions are fine; a dominant reverse flow means the layout should be reordered.
- **Cramming too many nodes into one lane** — split into more lanes or widen the phase columns. Crowded lanes make sequence flows unreadable.
