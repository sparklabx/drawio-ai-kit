---
name: drawio-aws
description: Use when the user asks for an AWS architecture diagram — VPC/networking, event-driven, landing zone, multi-AZ, serverless pipeline, or any diagram built with AWS service icons.
license: MIT
---

# Draw.io AWS

Produce correct AWS architecture diagrams in draw.io. This skill is a thin frontend; the deterministic engine, validator, and rules live in the `drawio-ai-kit` package, reached via the `drawio-ai` CLI.

## Setup

```bash
command -v drawio-ai >/dev/null 2>&1 || echo "Install the Kit first:  npm i -g github:sparklabx/drawio-ai-kit"
```

If `drawio-ai` is not on PATH, stop and tell the user to run `npm i -g github:sparklabx/drawio-ai-kit`. Do not run `npm i -g` yourself.

Before building, ask the source of truth for this diagram: the codebase, external research, or your description? Do not infer it; skip the question only when the user has already stated it explicitly.

## Workflow

Spawn autonomous subagents that run shell commands and read images, run the whole build loop in a subagent. If it can't (or the subagent can't read images), skip to **Inline path** below.

Resolve all the questions about diagram scope, output directory (absolute path under the user's project), and filename. Run the preflight above yourself before spawning subagens.

For a multi-diagram request, spawn one subagent per diagram in parallel with distinct filenames.

Using this for command for trigger bulding diagram pipeline:

```bash
drawio-ai workflow
```

This will Prints the build → validate → render → write-to-project-path loop every diagram follows. Read it as the source of truth for the process.

To get the AWS rules, shared principles, and catalog:

```bash
drawio-ai principles --mode aws
```

Using this combine with **Self-check** criteria below to making assessment. Make sure the diagram is aligned with all the principles, rules. Loop and fix until all satisfied.

Always read the PNG for a visual self-check. Always give feedback to the subagent to improve the diagram if its not aligned with your taste or **Self-check** criteria below.

Resolve the Kit's install dir, then `import` the engine by absolute path (the Shared Workflow shows the exact pattern):

```bash
ROOT="$(drawio-ai root)"     # absolute path to the installed Kit
```

Build with the declarative layout engine (NO hand-written coordinates), then: `drawio-ai validate <file>` → `drawio-ai render <file> -o <file>.png` (`Read` the PNG for the vision self-check).

## Domain notes

Diagram must contain container nesting group. Container nesting order: `AWS Cloud → Region → VPC → AZ → Subnet → SG`. If service inside the VPC, it must be placed within the appropriate subnet. Service does not nest inside VPC should not be placed inside the VPC. The order heirachy above does not strictly applied, but it is a good practice to follow. Some services might have multi-AZ but does not placed inside the VPC. Category colors from the catalog are authoritative; never recolor AWS icons.

## Self-check

- Run `validate_diagram`; clear ALL `errors`, `warnings`, and `audit.advice` before delivering.
- Render and look at it every round. `render` the PNG and `Read` it back. Make sure it should aligned with your taste, intuitive visualize, no cluster or line, no orphan service node.
- Measure using math and check manhattan rule to fix overlap, line appear from your view above. Pass: build with `contract: "bake"` and read per-edge bends and length vs the Manhattan minimum (`|dx| + |dy|`) out of the XML. Measure from the ports (`exitX`/`exitY`).
- Read the numbers as a hint about layout: small total excess over Manhattan but large individual minimums means the router is fine and the nodes are in the wrong place, the same message as `Long connector(s)` / `edge crossings`.
