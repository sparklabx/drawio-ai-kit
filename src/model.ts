// Shared domain types: the ONE place for types used by more than one src/ module.
// Types only (`export type` / `export interface`), so this module erases to nothing at runtime
// and never reaches dist/*.mjs. A type used by a single module stays in that module.
// Import with `import type { ... } from "./model.ts";` (verbatimModuleSyntax requires `import type`).
//
// Ownership (who adds/edits each section; others import, and ask the owner before changing a shape):
//   core.ts           Catalog, CatalogEntry (icon/group), CatalogPack/CatalogIndex, SearchOptions/SearchHit,
//                     ValidationResult ({ ok, errors, warnings, audit, stats }) + audit issue shapes, Graph (graphFromXml)
//   layout-engine.ts  the layout Node tree: LayoutNode = IconNode | BoxNode | GroupNode | GridNode | PoolNode | PhantomNode
//                     (union on `kind`; frame() is a GroupNode with a null gname), option bags, measured size / placement
//   builder.ts        Diagram-facing shapes: Rect ({ x, y, w, h }) for `this.R`, EdgeSpec / LinkOptions, cell ids
//   layout.ts         Point / route waypoints (pure math; may reuse Rect from here)
//   types.ts          DiagramTypeName, DiagramTypePreset (DIAGRAM_TYPES entries), EdgeRole
//   theme.ts          Theme (shape of THEME) only if another module needs it; else keep it local
//   bpmn.ts, cli.ts, cli-lib.ts  consume; add here only if a type crosses modules
//
// The public API (src/kit.ts → dist/types/) should re-export these with `export type * from "./model.ts";`
// once they exist.

export {};
