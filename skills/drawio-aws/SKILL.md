---
name: drawio-aws
version: 1.0.1
description: Use when the user asks for an AWS architecture diagram — VPC/networking, event-driven, landing zone, multi-AZ, serverless pipeline, or any diagram built with AWS service icons. Builds with the declarative layout engine using ground-truth mxgraph.aws4 stencils, validates (stencils/colors/nesting/geometry), runs a render-based vision self-check. Default output is .drawio; PNG/SVG only on request.
license: MIT
---

# Draw.io AWS

Produce correct AWS architecture diagrams in draw.io. This skill is a thin
frontend; the deterministic engine, validator, and rules live in the
`drawio-ai-kit` package, reached via the `drawio-ai` CLI.

## 0. Preflight — the CLI must be installed

```bash
command -v drawio-ai >/dev/null 2>&1 || echo "Install the Kit first:  npm i -g github:sparklabx/drawio-ai-kit"
```

If `drawio-ai` is **not** on PATH, stop and tell the user to run
`npm i -g github:sparklabx/drawio-ai-kit`. **Never run `npm i -g` yourself** — nothing mutates the
user's global environment without their say-so.

## 1. Delegate the build (preferred when your harness supports it)

If your harness can spawn autonomous subagents that run shell commands AND read
images (e.g. Claude Code's Task tool, a general-purpose agent), run the whole
build loop in a subagent — the rules, icon searches, and every render/fix
iteration then cost this conversation nothing. If it can't (or the subagent
can't read images), skip to **Inline path** below — same loop, same rules.

**Before spawning**, resolve what the subagent cannot ask about: diagram scope,
output directory (absolute path under the user's project), filename. Run the
preflight above yourself. For a multi-diagram request, spawn one subagent per
diagram in parallel with distinct filenames.


**Model routing** — if your harness lets you choose the subagent's model, route by
task weight: a **fast/cheap tier** (Claude Haiku-class — must support vision) when
the request matches a template from the rules' Templates table (reproduction is
mechanical; the validator's advice strings teach every fix), your **default strong
model** for free-hand or novel architectures. If a cheap subagent returns VALIDATE
not ok or ITERATIONS > 3, respawn ONCE on the strong model before taking over
inline. Multi-diagram requests: route each diagram independently.

Subagent prompt (fill every `<...>`):

```text
Build an AWS architecture .drawio diagram with the drawio-ai CLI.
Request: <user's request + clarifications, verbatim>
Output: <ABS_PROJECT_DIR>/<NAME>.drawio — never write inside the Kit, never into cwd.
Follow exactly:
1. Set ROOT="$(drawio-ai root)". Read $ROOT/docs/api-cheatsheet.md — the full layout-engine
   API in one file; never read library source.
2. Run `drawio-ai workflow` and `drawio-ai principles --mode aws` — the source of
   truth. (Fallback if a command is blocked: read $ROOT/rules/*.md directly.)
3. Look up every icon with ONE batched `drawio-ai search "a, b, c"`; never recolor icons.
4. Scaffold, don't write: `drawio-ai scaffold --list`, pick the closest template, then
   `drawio-ai scaffold <name>.mjs -o <dir>/build.mjs` — the script arrives runnable
   (absolute imports, self-validating, self-rendering with an issues list). Edit only the
   deltas. If no template is close AND you'd change more than half of it, Write a new
   script instead (keep the scaffold's self-check tail). Layout engine only
   (group/frame/grid/icon/box + renderTree), NO hand-written coordinates.
5. Each `node build.mjs` run prints validate JSON AND the render's machine-readable
   `issues` list. Fix from THAT checklist — all issues in one Edit round — then re-run.
   Loop until issues is empty.
6. Only when issues is empty: Read the PNG once as final visual confirmation (list any
   remaining visual problems, fix ALL in one round). Target <= 2 PNG reads total. Then
   render once WITHOUT --check for the final deliverable PNG.
Do NOT invoke any drawio skill — this prompt already contains the full procedure.
Do not ask questions — make the standard choice and record it under ASSUMPTIONS.
Return EXACTLY this block, nothing else:
DRAWIO: <absolute path to .drawio>
PNG: <absolute path to .png>
VALIDATE: <verbatim final validate JSON>
ICONS: <comma-separated icon names used>
ITERATIONS: <number of render/fix cycles>
SUMMARY: <one sentence describing the diagram>
ASSUMPTIONS: <choices made without asking, or "none">
```

Relay `DRAWIO`, `PNG` and `SUMMARY` to the user verbatim; do NOT re-read the
.drawio or PNG in this conversation — the subagent already ran the vision
self-check. If `VALIDATE` is not ok, take over via the Inline path (the build
.mjs and .drawio are on disk at the returned paths).

## Inline path (no subagent support)

### 1. Shared Workflow

```bash
drawio-ai workflow
```

Prints the build → validate → render → write-to-project-path loop every diagram
follows. Read it; it is the source of truth for the process.

### 2. Domain rules

```bash
drawio-ai principles --mode aws
```

Returns the AWS rules + shared principles + catalog categories.

### 3. Build with the engine, then validate + render

Resolve the Kit's install dir, then `import` the engine by absolute path (the
Shared Workflow shows the exact pattern):

```bash
ROOT="$(drawio-ai root)"     # absolute path to the installed Kit
```

Build with the declarative layout engine (NO hand-written coordinates), then:
`drawio-ai validate <file>` → `drawio-ai render <file> -o <file>.png` (`Read`
the PNG for the vision self-check) → write the `.drawio` to an **absolute path
under the user's project** (never the Kit, never `cwd`).

## Domain notes

Container nesting order: `AWS Cloud → Region → VPC → AZ → Subnet → SG`.
Managed/global services (CloudFront, Route 53, S3, DynamoDB, SQS/SNS)
sit **outside** the VPC — they are not subnet-resident. Category colors from the
catalog are authoritative; **never recolor AWS icons**.

## Self-check (before delivering)
- [ ] Built with the layout engine — no hand-written coordinates.
- [ ] `drawio-ai validate` → ok, no warnings, no advice.
- [ ] Every icon came from `drawio-ai search` (category colors intact).
- [ ] `drawio-ai render` vision self-check passed.
- [ ] Output written under the user's project, not the Kit.
- [ ] Counts are real: an icon standing for N resources says so, and the names match the deployed ones.
- [ ] Every arrow ends on an icon, not on the border of a frame holding several different things.
- [ ] No note box that the arrows already explain.

If the layout still reads badly after that, stop eyeballing and measure — build with
`contract: "bake"` and count bends and length-vs-Manhattan per edge from the XML
(`principles.md` §9). The numbers say whether to move a node or leave it alone.
