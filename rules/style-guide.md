# Style guide (the house design system)

The kit has ONE visual style, encoded as tokens in `src/theme.mjs` and applied through themed
creators. **Use the themed creators — don't hand-pick colors.**

## The look (what makes it good)
- **Pale, theme-aware tints** — frames barely tinted via `light-dark(…)` pairs so they read in BOTH
  light and dark mode; the strong color comes from the **icons**, not the frames.
- **Per-stage tint, not rainbow** (see `principles.md` §4 for the full nuance).
- **Clean 2px edges**, orthogonal. Main flow is **animated**; fan-out/in are sharp combs.
- **Square frames** (AWS convention); icons keep their category color.

## Themed creators (`src/layout-engine.mjs`) — pick by use, tokens are applied for you

| Creator | Use for |
| --- | --- |
| `stage(id, i, title, children)` | a pipeline layer/column (i = 0-based stage index; pale per-stage tint) |
| `band(id, title, children)` | a cross-cutting band (governance/security/ops) |
| `endpoint(id, label)` | source / consumer card (diagram entry/exit) |
| `ossBox(id, label)` | a plain OSS/component box |
| `onpremFrame(id, title, children)` | on-premise / external site frame |
| `serviceFrame(id, icon, name, opts, children)` | one service owning internal children; flush icon and category border; optional `opts.borderStyle` defaults to solid |
| `frame` / `group` (AWS stencil) | Region/VPC/AZ/Subnet/account containers |

Edges: `d.link(a, b, label)` applies the theme edge style. Add `{ flow: true }` for animated
main-flow edges, `{ dash: true }` for sync/DR/policy.

## Rules of thumb
1. Reach for a **themed creator** first; pass an explicit `fill` only for a deliberate one-off.
2. Let **icons** be the color; keep **frames pale**.
3. Animate only the **main flow** (a few spine edges), not every edge.
4. Keep service-frame names short and human-readable; never use deployment variables or placeholders.
5. Prefer visible icons, containers, and short edges over explanatory text boxes.
