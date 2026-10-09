import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync as fsExistsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { FindDeps, RenderArgs, RouterName } from "./model.ts";

const KNOWN_LOCATIONS = [
  "/opt/homebrew/bin/drawio",
  "/usr/local/bin/drawio",
  "/usr/bin/drawio",
  "/Applications/draw.io.app/Contents/MacOS/draw.io",
];

// Graphviz (`dot`) probe — same `command -v` pattern, parameterised by binary name.
const locateBin = (bin: string) => () => {
  try {
    return execFileSync("/bin/sh", ["-c", `command -v ${bin}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
};
const defaultLocateOnPath = locateBin("drawio");
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
export function findDrawioCli(env: NodeJS.ProcessEnv, deps: FindDeps = {}) {
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
export function findDot(env: NodeJS.ProcessEnv, deps: FindDeps = {}) {
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
export function selectRouter(contract: string, dotAvailable: boolean): RouterName {
  if (contract !== "bake") return "kit";      // scaffold never consults any external router
  return dotAvailable ? "graphviz" : "kit";   // bake: graphviz when present, else kit fallback
}

/**
 * Builds the draw.io desktop CLI argv array for PNG rendering.
 */
// ponytail: scale 1 — the vision API downscales anything wider than ~1568px anyway,
// so scale 2 only buys ~600 extra image tokens per self-check read. Deliverable PNGs pass --scale 2.
// page is 1-BASED: draw.io desktop numbers pages from 1 since v27.0.2 (it rejects -p 0 outright).
export function buildRenderArgs({ file, out, scale = 1, page = 1 }: RenderArgs) {
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
export function scaffoldSource(src: string, root: string, lib = "dist/kit.mjs", name?: string) {
  // every engine module is re-exported by the one library entry, so all kit imports collapse onto it
  let s = src.replace(/"\.\.\/\.\.\/src\/[a-z-]+\.(?:mjs|ts)"/g, `"${root}/${lib}"`);
  s = s.replace(/new URL\("\.\.\/\.\.\/out\//g, 'new URL("./');
  let m = s.match(/new URL\("\.\/([^"]+\.drawio)"/);
  // --name renames the output once here, so the write line and the self-check tail can't disagree
  if (m && name) { s = s.replaceAll(`"./${m[1]}"`, `"./${name}"`); m = [m[0], name]; }
  if (m) {
    // templates that don't print their own VALIDATE line get one from the CLI (exit 2 = not ok, still JSON)
    const validate = /VALIDATE:/.test(s) ? "" : `
try { console.log("VALIDATE:", __exec("drawio-ai", ["validate", __f], { encoding: "utf8" }).trim()); }
catch (e) { console.log("VALIDATE:", String(e.stdout ?? e.message).trim()); }`;
    s += `
// Self-check tail (added by \`drawio-ai scaffold\`): one run = build + validate + render + issues.
import { execFileSync as __exec } from "node:child_process";
const __f = new URL("./${m[1]}", import.meta.url).pathname;${validate}
try {
  console.log(__exec("drawio-ai", ["render", __f, "--check", "-o", __f + ".png"], { encoding: "utf8" }).trim());
} catch (e) { console.error("RENDER-SKIPPED:", String(e.message).split("\\n")[0]); }
`;
  }
  return s;
}

/** The single skill's folder — SKILL.md, references/, workflows/. The CLI serves its docs from here. */
export const skillDir = () => join(packageRoot(), "skills", "drawio");

/**
 * Returns the Shared Workflow text — agent instructions for build→validate→render→write.
 * Source of truth is the skill's workflows/build.md, so the CLI and the skill never drift.
 */
export function workflowText() {
  return readFileSync(join(skillDir(), "workflows", "build.md"), "utf8");
}
