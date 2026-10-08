# Adding a domain

There is ONE skill (`skills/drawio/`). A new domain (e.g. Kubernetes, OCI) is a new **reference
file** plus a routing row — not a new skill. Domain knowledge stays single-sourced in the skill folder.

## 1. Write the reference

Create `skills/drawio/references/<domain>-architecture.md` with the domain's hierarchy and shape rules.
Follow any existing file (`aws-architecture.md`, `azure-architecture.md`, `gcp-architecture.md`,
`databricks-architecture.md`, `bpmn.md`).

Write for small models (Haiku-class): short imperative sentences, one rule per bullet, exact
names (`drawio-ai search "<x>"`, `drawio-ai scaffold build_<x>.mjs`), no pointers to files outside
the skill folder.

## 2. Route to it from SKILL.md

Add one row to the **Step 2** table in `skills/drawio/SKILL.md`: domain → reference file → 1–4
template names. Add the domain words to the frontmatter `description` so the skill triggers on them.

## 3. (Optional) `drawio-ai principles --mode <domain>`

Only for hosts that can't read the skill folder. In `src/cli.mjs`, add the file to the `cloudMap`
in the `principles` case (cloud-like domains get `principles.md`, `diagram-types.md` and
`style-guide.md` appended), add the mode to `MODES`, then `npm run build`.

## 4. Add a template

Add `examples/<domain>/build_<name>.mjs` (copy `examples/aws/build_vpc.mjs`; first line = a one-line
description — `scaffold --list` prints it). Engine only, no hand-written coordinates.

## Checklist

- [ ] `references/<domain>-architecture.md` written in short, explicit steps.
- [ ] SKILL.md Step 2 row + `description` keywords added.
- [ ] `drawio-ai scaffold build_<name>.mjs -o /tmp/t/build.mjs && node /tmp/t/build.mjs` prints `"ok":true`.
- [ ] `npm test` passes; `npm run build` committed if `src/` changed.
