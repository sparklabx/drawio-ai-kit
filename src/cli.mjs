#!/usr/bin/env node
// drawio-ai-kit CLI — runs immediately, no MCP SDK required.
//   drawio-ai search <query> [--category C] [--limit N] [--kind icon|group]
//   drawio-ai style <name>
//   drawio-ai validate <file.drawio|file.xml> [--strict]
//   drawio-ai render <file> [-o out.png] [--scale N] [--page N] [--bake]
//   drawio-ai root
//   drawio-ai workflow
//   drawio-ai categories
//   drawio-ai principles [--mode aws|azure|gcp|databricks|bpmn]

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadCatalog,
  searchIcon,
  getIcon,
  validateDiagram,
  auditAesthetics,
  listCategories,
} from "./core.mjs";
import { packageRoot, findDrawioCli, buildRenderArgs, workflowText } from "./cli-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

const [cmd, ...rest] = process.argv.slice(2);
const { flags, positional } = parseFlags(rest);
const catalog = loadCatalog(flags.catalog);

switch (cmd) {
  case "search": {
    const q = positional.join(" ");
    if (!q) { console.error("A query is required. Example: drawio-ai search s3"); process.exit(1); }
    out(searchIcon(catalog, q, {
      category: flags.category,
      limit: flags.limit ? Number(flags.limit) : 8,
      kind: flags.kind,
    }));
    break;
  }
  case "style": {
    const name = positional[0];
    const icon = name ? getIcon(catalog, name) : null;
    if (!icon) { console.error(`Stencil "${name}" not found in catalog.`); process.exit(1); }
    out(icon);
    break;
  }
  case "validate": {
    const f = positional[0];
    if (!f) { console.error("A file is required. Example: drawio-ai validate diagram.drawio"); process.exit(1); }
    const xml = readFileSync(f, "utf8");
    const res = validateDiagram(catalog, xml, { strict: !!flags.strict });
    out(res);
    process.exit(res.ok ? 0 : 2);
    break;
  }
  case "audit": {
    const f = positional[0];
    if (!f) { console.error("A file is required. Example: drawio-ai audit diagram.drawio"); process.exit(1); }
    out(auditAesthetics(readFileSync(f, "utf8")));
    break;
  }
  case "logo": {
    const q = positional.join(" ");
    if (!q) { console.error("A brand is required. Example: drawio-ai logo openai"); process.exit(1); }
    const script = join(__dirname, "..", "vendor", "aiicons.py");
    const argv = [script, q, "--json"];
    if (flags.embed) argv.push("--embed");
    if (flags.variant) argv.push("--variant", String(flags.variant));
    try { process.stdout.write(execFileSync("python3", argv, { encoding: "utf8" })); }
    catch (e) { console.error("python3 is required to run aiicons.py:", e.message); process.exit(1); }
    break;
  }
  case "categories":
    out(listCategories(catalog));
    break;
  case "principles": {
    const base = join(__dirname, "..", "rules");
    const read = (f) => readFileSync(join(base, f), "utf8");
    const cats = () => "\n\n## Icon groups available in the catalog\n" + JSON.stringify(listCategories(catalog), null, 2);
    const MODES = ["aws", "azure", "gcp", "databricks", "bpmn"];
    const mode = flags.mode || "aws";
    if (!MODES.includes(mode)) {
      // hard error — silently serving AWS rules for a typo'd mode hands an agent the wrong cloud's rules
      console.error(`Unknown --mode "${mode}". Valid modes: ${MODES.join(", ")}.`);
      process.exit(1);
    }
    if (mode === "bpmn") {
      process.stdout.write(read("bpmn.md") + "\n\n---\n\n## Shared layout principles (apply to BPMN too)\n" + read("principles.md") + "\n\n## Shape groups in the catalog\n" + JSON.stringify(listCategories(catalog), null, 2));
    } else {
      const cloudMap = { azure: "azure-architecture.md", gcp: "gcp-architecture.md", databricks: "databricks-architecture.md" };
      const cloudRule = cloudMap[mode];
      const sections = cloudRule
        ? [read(cloudRule), read("principles.md"), read("diagram-types.md"), read("style-guide.md")]
        : [read("principles.md"), read("aws-architecture.md"), read("diagram-types.md"), read("style-guide.md")];
      process.stdout.write(sections.join("\n\n---\n\n") + cats());
    }
    break;
  }
  case "root":
    process.stdout.write(packageRoot() + "\n");
    break;
  case "workflow":
    process.stdout.write(workflowText() + "\n");
    break;
  case "render": {
    // Handle -o (single-dash) since parseFlags only captures --flags
    let outFlag = flags.o ?? flags.out;
    const pos = [...positional];
    for (let i = 0; i < pos.length - 1; i++) {
      if (pos[i] === "-o") { outFlag = pos[i + 1]; pos.splice(i, 2); break; }
    }
    const file = pos[0];
    if (!file) { console.error("A file is required. Example: drawio-ai render diagram.drawio"); process.exit(1); }
    const outPath = outFlag ?? file.replace(/\.(drawio|xml)$/, ".png");
    const scale = Number(flags.scale) || 2;
    const page = Number(flags.page) || 0;
    const cli = findDrawioCli(process.env);
    if (!cli) {
      console.error("draw.io CLI not found. Set DRAWIO_CLI env var, install the draw.io desktop app, or use xvfb-run on headless Linux.");
      process.exit(1);
    }
    const argv = buildRenderArgs({ file, out: outPath, scale, page });
    try {
      execFileSync(cli, argv, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      console.error("Render failed: " + e.message);
      process.exit(1);
    }
    if (!existsSync(outPath)) {
      console.error("Render produced no output file.");
      process.exit(1);
    }
    out({ ok: true, path: outPath });
    process.exit(0);
  }
  case "types": {
    const { listTypes } = await import("./types.mjs");
    out(listTypes());
    break;
  }
  default:
    console.error(
`drawio-ai-kit CLI
  search <query> [--category C] [--limit N] [--kind icon|group]
  style <name>
  validate <file> [--strict]
  audit <file>
  logo <brand> [--embed] [--variant color|mono|text]
  categories
  types
  principles [--mode aws|azure|gcp|databricks|bpmn]
  root
  render <file> [-o out.png] [--scale N] [--page N]
  workflow
  [--catalog <path>]  override the default catalog (catalog/aws.json)`
    );
    process.exit(cmd ? 1 : 0);
}
