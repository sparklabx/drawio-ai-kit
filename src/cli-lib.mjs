import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { existsSync as fsExistsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const KNOWN_LOCATIONS = [
  "/opt/homebrew/bin/drawio",
  "/usr/local/bin/drawio",
  "/usr/bin/drawio",
  "/Applications/draw.io.app/Contents/MacOS/draw.io",
];

function defaultLocateOnPath() {
  try {
    return execFileSync("/bin/sh", ["-c", "command -v drawio"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

// Graphviz (`dot`) probe — same `command -v` pattern, parameterised by binary name.
const locateBin = (bin) => () => {
  try {
    return execFileSync("/bin/sh", ["-c", `command -v ${bin}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
};
const defaultLocateOnPathDot = locateBin("dot");

/**
 * Returns the absolute directory containing package.json and src/.
 */
export function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Locates the draw.io desktop CLI by priority order.
 * Injectable env + deps for testing without real binaries.
 */
export function findDrawioCli(env, deps = {}) {
  const existsSync = deps.existsSync ?? fsExistsSync;
  const locateOnPath = deps.locateOnPath ?? defaultLocateOnPath;

  // (1) DRAWIO_CLI env var
  if (env.DRAWIO_CLI && existsSync(env.DRAWIO_CLI)) return env.DRAWIO_CLI;

  // (2) locate on PATH
  const onPath = locateOnPath(env);
  if (onPath) return onPath;

  // (3) known locations
  for (const loc of KNOWN_LOCATIONS) {
    if (existsSync(loc)) return loc;
  }

  // (4) nothing found
  return null;
}

/**
 * Locates the Graphviz `dot` binary. Injectable env + deps for testing without
 * the real binary (mirrors findDrawioCli). Resolution order: DOT_CLI env var →
 * `command -v dot` on PATH → null. Returns null when absent (enhancement-only).
 */
export function findDot(env, deps = {}) {
  const existsSync = deps.existsSync ?? fsExistsSync;
  const locateOnPath = deps.locateOnPath ?? defaultLocateOnPathDot;

  // (1) DOT_CLI env var override (existsSync-checked, like DRAWIO_CLI)
  if (env.DOT_CLI && existsSync(env.DOT_CLI)) return env.DOT_CLI;

  // (2) locate on PATH
  const onPath = locateOnPath(env);
  if (onPath) return onPath;

  // (3) nothing found
  return null;
}

/**
 * PURE decision function: given a contract and whether `dot` is available, which
 * router should own edge routing? Returns "graphviz" | "kit".
 *   - scaffold NEVER consults an external router (drag-time routing is draw.io-native)
 *   - bake uses graphviz when dot is present, else the kit A-star/nudge router (zero-dep path)
 * This is the unit-testable seam. The actual `dot` shell-out + geometry mapping
 * (kit-rect ↔ dot ↔ mxPoint) is a documented follow-up (see ADR-0004); until it
 * lands, bake always routes via the kit router regardless of this decision.
 */
export function selectRouter(contract, dotAvailable) {
  if (contract !== "bake") return "kit";      // scaffold never consults any external router
  return dotAvailable ? "graphviz" : "kit";   // bake: graphviz when present, else kit fallback
}

/**
 * Builds the draw.io desktop CLI argv array for PNG rendering.
 */
// ponytail: scale 1 — the vision API downscales anything wider than ~1568px anyway,
// so scale 2 only buys ~600 extra image tokens per self-check read. Deliverable PNGs pass --scale 2.
export function buildRenderArgs({ file, out, scale = 1, page = 0 }) {
  return [
    "-x", "-f", "png",
    "-s", String(scale),
    "-p", String(page),
    "--no-sandbox",
    "-o", out,
    file,
  ];
}

/**
 * Rewrites an example script into a standalone scaffold: absolute kit imports (runs from any cwd),
 * .drawio written next to the script, and a self-check tail that renders --check and prints the
 * machine-readable issue list — so one `node` run = build + validate + render + issues.
 */
export function scaffoldSource(src, root) {
  let s = src.replaceAll('"../../src/', `"${root}/src/`);
  s = s.replace(/new URL\("\.\.\/\.\.\/out\//g, 'new URL("./');
  const m = s.match(/new URL\("\.\/([^"]+\.drawio)"/);
  if (m) {
    s += `
// Self-check tail (added by \`drawio-ai scaffold\`): one run = build + validate + render + issues.
import { execFileSync as __exec } from "node:child_process";
try {
  const __f = new URL("./${m[1]}", import.meta.url).pathname;
  console.log(__exec("drawio-ai", ["render", __f, "--check", "-o", __f + ".png"], { encoding: "utf8" }).trim());
} catch (e) { console.error("RENDER-SKIPPED:", String(e.message).split("\\n")[0]); }
`;
  }
  return s;
}

/**
 * Returns the Shared Workflow text — agent instructions for build→validate→render→write.
 */
export function workflowText() {
  return `# Shared Workflow: drawio-ai diagram generation

## 1. Import the engine
Resolve the Kit's install dir once (shell), then import by that absolute path:
\`\`\`bash
ROOT="$(drawio-ai root)"   # absolute path to the installed Kit
\`\`\`
\`\`\`js
import { Diagram } from "<ROOT>/src/builder.mjs";
import { group, frame, grid, icon, box, serviceFrame, renderTree } from "<ROOT>/src/layout-engine.mjs";
import { loadCatalog, searchIcon } from "<ROOT>/src/core.mjs";   // optional: in-process icon lookup
\`\`\`
(Replace \`<ROOT>\` with the path \`drawio-ai root\` printed — shell substitution does not run inside JS strings.)

## 1b. Source is an IaC repo (terraform/terramate)? Inventory first, never read .tf raw
Raw HCL floods context with boilerplate and the model starts guessing resources that don't exist.
Extract a machine-made inventory instead, then diagram ONLY from it:
\`\`\`bash
terraform graph                                        # real dependency edges (if init'd)
grep -rn '^resource\\|^module' --include='*.tf' .       # zero-noise resource/module list
terramate list --run-order                             # real stack order (terramate repos)
\`\`\`
Anything not in the inventory does not go in the diagram.

## 2. Build the diagram
Declare the nested structure with \`group\`/\`frame\`/\`grid\` + \`icon\`/\`box\`. Use \`serviceFrame(id, icon, name, opts, children)\` only when one AWS service owns every child; \`opts.borderStyle\` is optional and defaults to \`solid\`. Then \`renderTree(d, tree)\` computes every x/y/w/h — never hand-write coordinates. Add edges with \`d.link(source, target, label)\`.

Edge API cheat-sheet (so you never have to read builder.mjs):
\`\`\`js
d.link(srcId, tgtId, label = "", opts = {})
// opts: { role: "fanout"|"tree",  // sharp corners, bundled lanes
//         dir: "LR"|"TB",         // force horizontal-first / vertical-first exit
//         dash: true,             // dashed (governance/replication semantics)
//         flow: true,             // animated flow (draw.io/SVG only)
//         rounded: true,          // rounded corners (flow edges)
//         stroke: "#hex" }        // override color
// Router handles obstacle avoidance, port de-collision, waypoints — do not add coordinates.
// Containers (frames/groups) are valid link targets — prefer linking a cluster frame over
// each replica inside it.
\`\`\`

## 3. Validate
If your build script already prints its \`d.validate()\` result (the examples all do), read that during
iteration — do NOT also run \`drawio-ai validate\` on every loop; it re-prints the same report.
Run \`drawio-ai validate <file>\` ONCE as the final gate before delivering.

## 4. Render
Run \`drawio-ai render <file> --check -o <output.png>\` for the vision self-check — \`--check\` clamps
the long edge to ~1100px (layout inspection needs geometry, not full resolution; image tokens scale
with pixels). After the layout looks right, render ONCE more without \`--check\` for the final PNG.
Only pass \`--scale 2\` when the user asked for a high-res PNG deliverable.

## Vision self-check discipline
Reading the PNG: list EVERY layout problem you can see (overlaps, misaligned rows, edges cutting
through nodes, label collisions, cramped spacing) in ONE pass, fix them ALL in one edit round, then
re-render. Target ≤ 2 render/fix cycles — one fix per cycle is the expensive anti-pattern (each
extra cycle re-reads the whole context plus another image).

## 5. Write output to an absolute path under the user's project
Never write into the kit itself. Always write the .drawio (and rendered .png) to the user's project directory, using an absolute path they specify.

## Preflight: Graphviz (optional)
Bake-route quality is best with Graphviz (\`dot\`) installed; if absent, the kit's built-in A*/nudge router is used (zero-dependency, works everywhere). Scaffold is unaffected either way — drag-time routing is always draw.io-native.

## Loop
If the visual check reveals layout issues, go back to step 2 (rebuild), then re-validate and re-render. Do not skip validation.`;
}
