# Workflow: hand the build to a subagent

Use this only if your harness can start a subagent that can run shell commands **and**
read images. The subagent does the build loop; your conversation stays small.

## Before you start the subagent

1. Finish `SKILL.md` Step 0 (CLI check) and Step 1 (questions). The subagent cannot ask the user.
2. Decide the absolute output path, e.g. `/home/me/project/docs/vpc.drawio`.
3. Several diagrams? Start one subagent per diagram, in parallel, each with its own file name.

## Which model

- The request matches a template in `drawio-ai scaffold --list` → a small fast model
  (Haiku-class, must read images) is enough.
- New or unusual architecture → your default strong model.
- The small model returns `VALIDATE` not ok, or `ITERATIONS` > 5 → run it once more on the
  strong model before you take over yourself.

## Prompt (fill every `<...>`)

```text
Build a draw.io diagram with the drawio-ai CLI.
Request: <the user's request + their answers, word for word>
Domain: <AWS | Azure | GCP | Databricks | multi-cloud | BPMN>
Output: <ABSOLUTE_PATH>.drawio — never write inside the folder printed by `drawio-ai root`.
Skill folder: <ABSOLUTE path of this skill folder>
Do this:
1. Read <skill folder>/references/<domain reference>.md, <skill folder>/references/api.md,
   and <skill folder>/references/principles.md. Do not open any other kit file.
2. Follow <skill folder>/workflows/build.md steps 1–8 exactly.
3. Do not ask questions. Make the common choice and list it under ASSUMPTIONS.
Return exactly this block and nothing else:
DRAWIO: <absolute path to .drawio>
PNG: <absolute path to .png, or "none">
VALIDATE: <final `drawio-ai validate` JSON, verbatim>
ICONS: <comma-separated icon names used>
ITERATIONS: <number of build runs>
SUMMARY: <one sentence describing the diagram>
ASSUMPTIONS: <choices made without asking, or "none">
```

## After it returns

- Tell the user `DRAWIO`, `PNG`, `SUMMARY` and `ASSUMPTIONS`. Do not re-read the files —
  the subagent already checked them.
- `VALIDATE` not ok? Take over: the `build.mjs` next to the `.drawio` is ready to edit —
  continue `workflows/build.md` from step 4.
