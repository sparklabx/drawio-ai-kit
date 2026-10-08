---
name: drawio
version: 2.0.0
description: Use when the user asks for any draw.io diagram — cloud architecture (AWS, Azure, GCP, Databricks, multi-cloud, hybrid/DR, landing zone, VPC/network, serverless, data pipeline) or a business process (BPMN, swimlane, workflow with roles). Builds with the drawio-ai layout engine using real stencils, validates, and runs a render self-check. Default output is a .drawio file; PNG/SVG only on request.
license: MIT
---

# draw.io diagrams

You build the diagram by writing a small Node script that uses the `drawio-ai` engine.
The engine places every box and routes every arrow. You only declare *what* is inside *what*.

Follow the steps in order. Do not skip a step. Each step names the exact file to read —
read only that file, nothing else in the kit.

## Step 0 — Check the CLI

```bash
command -v drawio-ai >/dev/null 2>&1 && drawio-ai root || echo "MISSING"
```

If it prints `MISSING`: stop. Tell the user to install it, then try again:

```bash
npm i -g github:sparklabx/drawio-ai-kit
```

Never run `npm i -g` yourself.

## Step 1 — Understand the request

You need these 4 facts. Take them from the user's message first.

| Fact | Example | If missing |
|---|---|---|
| **Domain** | AWS · Azure · GCP · Databricks · multi-cloud · BPMN | Ask. |
| **What to draw** | "3-tier web app in one VPC, 2 AZs" · "order approval process" | Ask. |
| **Output path** | `./docs/arch.drawio` | Use `<cwd>/<short-name>.drawio`. Do not ask. The build script goes in the same folder. |
| **Format** | `.drawio` (default) · also `.png` | Use `.drawio`. Do not ask. |

Rules for asking:
- Ask **one** short message with all missing questions together. Offer choices, e.g.
  "Which cloud: AWS, Azure, or GCP?"
- If the user said "just do it" or the request is already clear, do not ask. Pick the
  common choice and tell the user what you assumed at the end.
- The source is a Terraform/Terramate repo? Follow `workflows/from-iac.md` before Step 2.

## Step 2 — Pick the domain reference

Read **exactly one** row's files from this skill folder:

| Domain | Read | Template to start from (`drawio-ai scaffold --list` shows all) |
|---|---|---|
| AWS | `references/aws-architecture.md` | `build_vpc.mjs`, `build_serverless.mjs`, `build_pipeline.mjs`, `build_landingzone.mjs` |
| Azure | `references/azure-architecture.md` | `build_azure_vnet.mjs`, `build_azure_hub_spoke_lz.mjs` |
| GCP | `references/gcp-architecture.md` | `build_gcp_vpc.mjs`, `build_gcp_shared_vpc_landing_zone.mjs` |
| Databricks | `references/databricks-architecture.md` | `build_lakehouse.mjs`, `build_data_platform.mjs` |
| Multi-cloud / hybrid | the reference of each cloud involved | `build_multicloud.mjs`, `build_hybrid.mjs` |
| BPMN / swimlane | `references/bpmn.md` | `build_bpmn.mjs` |

Then also read:
- `references/api.md` — the whole engine API on one page (every domain). Never open engine source code.
- `references/principles.md` — layout rules: dense grids, flow direction, no overlaps (cloud domains; skip for BPMN).

Optional, only if you are unsure which layout fits: `references/diagram-types.md`.
Colors and creators: `references/style-guide.md`.

## Step 3 — Build, check, fix

Follow `workflows/build.md`. Short version:

1. `drawio-ai search "a, b, c"` — look up **all** icons in one call. Use only names it returns.
2. `drawio-ai scaffold <template>.mjs -o <out-dir>/build.mjs --name <name>.drawio` — copy the closest
   template. `<out-dir>` = the folder of the output path from Step 1; the `.drawio` lands there.
3. Edit the tree in `build.mjs`. No x/y numbers.
4. `node <out-dir>/build.mjs` — it builds, prints `VALIDATE: {…}`, and renders a PNG with an `issues` list.
5. Fix **all** errors/warnings/advice/issues in one edit. Run again. Repeat until all are empty (max 5 runs).
6. Look at the PNG once. Fix what you see. Done. (No draw.io desktop app → no PNG: skip this step.)

Can your harness run a subagent that has shell + image reading? You may hand Step 3
to it with `workflows/delegate.md`. Otherwise do Step 3 yourself.

## Step 4 — Deliver

Check every box before you answer:

- [ ] Built with the layout engine (`group`/`frame`/`grid` + `icon`/`box` + `renderTree`). No x/y numbers.
- [ ] Every icon name came from `drawio-ai search`. No icon recolored.
- [ ] `drawio-ai validate <file>.drawio` → `"ok":true` with empty `errors`, `warnings`, `advice`.
- [ ] You looked at the rendered PNG — or, if `RENDER-SKIPPED` was printed, you told the user no PNG was made.
- [ ] The file is in the user's project — never inside the kit folder (`drawio-ai root`).

Reply with: the `.drawio` path, the `.png` path (if any), one sentence on what the
diagram shows, and any assumptions you made.

## Never

- Never write files into the kit folder (`drawio-ai root`).
- Never invent icon names or style strings. Search for them.
- Never hand-write draw.io XML or x/y coordinates.
- Never read the engine's source (`dist/`, `src/`). `references/api.md` has everything.
