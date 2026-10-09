# Workflow: build → validate → render → fix

Use this loop for every diagram. Run the commands exactly as written.

## 1. Look up every icon — one call

```bash
drawio-ai search "s3, lambda, api gateway, dynamodb"
```

- Comma-separated = one batch. Put **all** the diagram's services in one call.
- Use the returned `name` field in `icon(id, name, label)`. Never guess a name.
- Containers (VPC, subnet, region, account): add `--kind group`.
- No good hit? Try a shorter word (`"nat"` instead of `"nat gateway service"`), or draw a
  plain `box(id, label)` instead of an icon.

## 2. Copy the closest template

```bash
drawio-ai scaffold --list                                   # one line per template
drawio-ai scaffold build_vpc.mjs -o <out-dir>/build.mjs --name <name>.drawio
```

`-o` is the path of the **script**. The `.drawio` is always written **next to the script**, so pick the
folder the user wants the diagram in: for `./docs/webapp.drawio` use `-o ./docs/build.mjs --name webapp.drawio`.
The folder is created if needed. The JSON it prints has `drawio` — the exact path of the output file.
Keep `build.mjs`: it is the editable source of the diagram (it imports `drawio-ai-kit` by name; run it with
`drawio-ai run`, or with plain `node` inside a project that has `drawio-ai-kit` installed).

The copy is ready to run: it imports `drawio-ai-kit`, and it validates and renders itself.
**Always start from a template, even if none is close** — keep the `import` lines, the
`validate`/`writeFileSync` lines and the self-check block at the end; replace only the tree and the links.

## 3. Edit the tree

Change `build.mjs` with your file **edit** tool. Do not overwrite it with a shell `cat > file` heredoc —
some shells refuse (`noclobber`) and you silently run the old template.

The engine API is in `references/api.md`. The shape of every script:

```js
const d = new Diagram("network");                    // type: pipeline | network | hierarchy | hubspoke | hybrid | mesh | sequence | bpmn
const tree = group("cloud", "group_aws_cloud", "AWS Cloud", { dir: "row" }, [
  grid("data", null, "Data", { cols: 2 }, [
    icon("db", "rds", "Orders DB"),
    icon("cache", "elasticache", "Cache"),
  ]),
]);
renderTree(d, tree);                                 // the engine computes every x/y/w/h
d.link("app", "db", "SQL");                          // plain link first; the router picks sides
```

Rules:
- **No x/y numbers.** Nest containers instead. `[40, 80]` in `renderTree(d, tree, [40, 80])` is the only allowed position.
- **Pack services into `grid(...)` boxes, 3–8 icons each.** Never one frame per icon.
- **Plain `d.link(a, b)` first.** Add `dash`, `rail`, `dir` only after a render shows a problem.
- Link a far-away node to the **container** (frame id), not to one small icon inside it.

## 4. Run it

```bash
drawio-ai run <out-dir>/build.mjs
```

It prints:
- `VALIDATE: {"ok":…,"errors":[…],"warnings":[…],"advice":[…]}` — always.
- then the render result `{"ok":true,"path":"….png","issues":[…]}`,
  or `RENDER-SKIPPED: …` when the draw.io desktop app is not installed. That is fine: there is no PNG
  and no `issues` list — fix from the `VALIDATE` lists only, and skip step 7.

## 5. Fix — all issues in one edit

- Read **every** line in `errors`, `warnings`, `advice` and `issues`. Each line says what to change.
- Fix **all** of them in one edit, then run step 4 again.
- Stop when every list is empty. Max 5 runs. Still failing after 5? Stop and show the
  user the remaining issues.

## 6. Check the layout (once) — skip for BPMN

```bash
drawio-ai suggest-layout <out-dir>/<name>.drawio
```

Act on two things only: `recommended` is different from your `Diagram("<type>")`, or `warnings` is not
empty (e.g. "N frames hold a single icon" → pack icons into fewer `grid` boxes). Then fix and go back to
step 4. Ignore the `metrics` numbers — a subnet holding one icon is normal.

## 7. Look at the picture (once) — skip if there is no PNG

Open the PNG from step 4 (the image read tool). List **every** problem you see in one pass:
overlapping shapes, text on text, arrows crossing icons, empty boxes, ragged rows.
Fix them all in one edit, run step 4 again. Max 2 image reads in total.

## 8. Final files

```bash
drawio-ai validate <out-dir>/<name>.drawio                 # final gate: must print "ok":true
drawio-ai render <out-dir>/<name>.drawio -o <out-dir>/<name>.png   # only if the user wants a PNG
```

Add `--scale 2` only if the user asked for a high-resolution PNG.
Never write output into the kit folder (`drawio-ai root`). Write next to the user's project.

## Writing a script without a template (last resort)

Only if `scaffold` is blocked. Import by package name and run with `drawio-ai run`:

```js
import { writeFileSync } from "node:fs";
import { Diagram, group, frame, grid, icon, box, renderTree } from "drawio-ai-kit";
```

## Optional tools

- **draw.io desktop app** — needed for `drawio-ai render` (the PNG). Without it, skip steps 7–8's PNG
  and deliver the `.drawio`; tell the user they can open it in draw.io.
- **Graphviz** (`dot`) — optional. Without it the kit's built-in router is used as the fallback; output
  is still correct. `scaffold` works the same either way.
