# AWS architecture diagram preset

Conventions specific to AWS architecture diagrams. Layer these on top of the general `principles.md`.

## Containers — nest in the real order

Use the official AWS group shapes (`search_icon "<name>" --kind group`) and **nest them by parent-child**, not by stacking:

```text
AWS Cloud (group_aws_cloud_alt)
└─ Region (group_region, dashed)
   └─ VPC (group_vpc)
      └─ Availability Zone (group_availability_zone, dashed)
         └─ Subnet (group_subnet — color auto-set by label: "Public"→blue, "Private"→green; NEVER pass fill manually)
            └─ Security Group (group_security_group, dashed)
               └─ service icons
```

- Don't put a Subnet directly under AWS Cloud, or a Security Group outside a Subnet — the validator flags broken nesting.
- Managed/global services (S3, IAM, KMS, CloudWatch, Route 53, Organizations) live **outside the VPC** — place them in the AWS Cloud band, not inside a subnet.

## Icon color = identity — never recolor

Each AWS icon ships with its official category color; the catalog style already carries the correct `fillColor`. **Do not override it** — a recolored S3 icon is a recognizability bug, and the validator flags it.

Category colors: Compute/Containers `#ED7100` · Storage `#7AA116` · Database `#C925D1` · Networking & Analytics `#8C4FFF` · Security `#DD344C` · Management & App-Integration `#E7157B` · Migration/ML `#01A88D`.

## Canonical layouts

- **Data pipeline (left → right):** Sources → Ingestion → Processing → Storage → Integration/Serving → Consumers; cross-cutting layers as a band below (see `principles.md` §8).
- **VPC / network diagram:** Each **Availability Zone is a vertical COLUMN**, the AZs sit **side by side**, and the **VPC is the horizontal box** wrapping them (Region → VPC → AZ columns → subnets). Inside an AZ, subnets are **tiers stacked top→bottom** (Public → App → Data); keep the **same tier aligned horizontally across AZs** (public-a level with public-b). Users/Internet sit outside the VPC; a shared ALB/NAT/bus spans **horizontally across the AZ columns**.
- **Event-driven / bus:** see the `hubspoke` preset in `diagram-types.md` (bus in the centre, producers one side, consumers the other).
- **Hybrid / DR:** on-prem is a SEPARATE block OUTSIDE the AWS Region/Cloud container — never nested. See the `hybrid` preset in `diagram-types.md` and `examples/aws/build_hybrid.mjs`.

## Multi-AZ

- For HA, draw **≥2 Availability Zone columns side by side** inside the VPC and mirror the stateful tier in each; label AZ-a / AZ-b.
- Stateless services scale horizontally inside each AZ; managed data services (RDS Multi-AZ, etc.) span AZs — show one icon at the VPC level with a note, or one per AZ with a sync link.

## Edges in AWS diagrams

- **Connect to the bounding box, not each replica.** When a multi-AZ stack is wrapped in a dashed `clusterBox` (the per-app / node-group / cluster frame that spans the AZs), point edges at the BOX's id — **one tidy arrow to the border** — instead of drawing a separate arrow to the same component's icon in every AZ. The frame already says "this is N replicas across the AZs", so a single edge to it reads cleanly; N arrows to N child icons just clutter. Create the `clusterBox`es **before** `d.link(...)` so the box ids exist as edge targets. (A genuine fan-out to *distinct* services still combs as usual — this rule is only about the per-AZ replicas of one stack.)

## Placement — keep edges short (avoid the "long detour" smell)

The layout engine places by declared nesting; it does **not** move nodes to shorten edges. Put a node **next to what it talks to most**: shared resources (ECR, S3, CloudWatch, KMS) go in a **band immediately next to their consumers**, not a far-away bottom row. When validate flags **"Long connector(s)"** or **"edge crossings"**, both mean *reposition nodes*, not *reroute edges*.
