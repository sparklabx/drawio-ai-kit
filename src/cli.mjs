#!/usr/bin/env node
// drawio-ai-kit CLI — runs immediately, no MCP SDK required.
//   drawio-ai search <query> [--category C] [--limit N] [--kind icon|group] [--full]
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
import { packageRoot, findDrawioCli, buildRenderArgs, pageIndexFor, workflowText, scaffoldSource } from "./cli-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      // "-" prefix ends a flag's value slot ("--check -o out.png" must not eat "-o" as check's value)
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function out(obj) {
  // ponytail: compact JSON — pretty-printing costs ~30-40% extra tokens on every machine-read output
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const [cmd, ...rest] = process.argv.slice(2);
const { flags, positional } = parseFlags(rest);
const catalog = loadCatalog(flags.catalog);

switch (cmd) {
  case "search": {
    const q = positional.join(" ");
    if (!q) { console.error('A query is required. Example: drawio-ai search s3  (batch: drawio-ai search "s3, lambda, nat gateway")'); process.exit(1); }
    const opts = {
      category: flags.category,
      limit: flags.limit ? Number(flags.limit) : 8,
      kind: flags.kind,
      full: !!flags.full,
    };
    // ponytail: comma = batch mode — one CLI call for a whole diagram's icon lookups instead of
    // one agent tool-call round-trip per icon. Same limit as single-query so ranking depth is identical.
    const queries = q.split(",").map((s) => s.trim()).filter(Boolean);
    out(queries.length > 1
      ? Object.fromEntries(queries.map((one) => [one, searchIcon(catalog, one, opts)]))
      : searchIcon(catalog, q, opts));
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
    // Multi-tab deck: each <diagram> tab legitimately has its own root cells ("0"/"1") — validating
    // the whole file at once false-positives on duplicate ids. Validate per tab and aggregate.
    const tabs = [...xml.matchAll(/<diagram[^>]*?name="([^"]*)"[^>]*>([\s\S]*?)<\/diagram>/g)];
    let res;
    if (tabs.length > 1) {
      res = { ok: true, errors: [], warnings: [], audit: { advice: [] } };
      for (const [, name, body] of tabs) {
        const r = validateDiagram(catalog, body, { strict: !!flags.strict });
        res.ok &&= r.ok;
        res.errors.push(...r.errors.map((e) => `[${name}] ${e}`));
        res.warnings.push(...(r.warnings ?? []).map((w) => `[${name}] ${w}`));
        res.audit.advice.push(...(r.audit?.advice ?? []).map((a) => `[${name}] ${a}`));
      }
    } else {
      res = validateDiagram(catalog, xml, { strict: !!flags.strict });
    }
    // ponytail: a clean pass needs no metrics — but keep the empty arrays so "all three are empty"
    // is visible, not inferred (an A/B agent flagged the bare {ok:true} as ambiguous)
    const clean = res.ok && !res.warnings?.length && !res.audit?.advice?.length;
    out(clean && !flags.verbose ? { ok: true, errors: [], warnings: [], advice: [] } : res);
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
    const MODES = ["aws", "azure", "gcp", "databricks", "bpmn"];
    // ponytail: one "Category: count" line beats 2.4KB of pretty JSON — agents search, they don't browse.
    // Vendor packs of OTHER domains are filtered out (AWS mode has no use for Intune/GCP categories);
    // neutral packs (cicd, database, network, …) stay in every mode.
    const cats = (mode) => {
      const excludePacks = new Set(MODES.filter((m) => m !== mode));
      return "\n\n## Icon groups available in the catalog\n" + listCategories(catalog, { excludePacks }).map((c) => `${c.category}: ${c.count}`).join(" · ");
    };
    const mode = flags.mode || "aws";
    if (!MODES.includes(mode)) {
      // hard error — silently serving AWS rules for a typo'd mode hands an agent the wrong cloud's rules
      console.error(`Unknown --mode "${mode}". Valid modes: ${MODES.join(", ")}.`);
      process.exit(1);
    }
    if (mode === "bpmn") {
      process.stdout.write(read("bpmn.md") + "\n\n---\n\n## Shared layout principles (apply to BPMN too)\n" + read("principles.md") + cats("bpmn"));
    } else {
      const cloudMap = { azure: "azure-architecture.md", gcp: "gcp-architecture.md", databricks: "databricks-architecture.md" };
      const cloudRule = cloudMap[mode];
      const sections = cloudRule
        ? [read(cloudRule), read("principles.md"), read("diagram-types.md"), read("style-guide.md")]
        : [read("principles.md"), read("aws-architecture.md"), read("diagram-types.md"), read("style-guide.md")];
      process.stdout.write(sections.join("\n\n---\n\n") + cats(mode));
    }
    break;
  }
  case "scaffold": {
    // drawio-ai scaffold <domain/build_x.mjs | build_x.mjs> [-o out.mjs] | --list
    const { readdirSync: rd } = await import("node:fs");
    const exDir = join(__dirname, "..", "examples");
    const domains = rd(exDir).filter((d) => !d.includes("."));
    if (flags.list || !positional[0]) {
      const rows = [];
      for (const dom of domains)
        for (const f of rd(join(exDir, dom)).filter((f) => f.endsWith(".mjs")))
          rows.push(`${dom}/${f} — ${readFileSync(join(exDir, dom, f), "utf8").split("\n")[0].replace(/^\/\/ ?/, "")}`);
      process.stdout.write(rows.join("\n") + "\n");
      break;
    }
    let rel = positional[0];
    if (!rel.includes("/")) {
      const dom = domains.find((d) => existsSync(join(exDir, d, rel)));
      if (!dom) { console.error(`Template "${rel}" not found. Run: drawio-ai scaffold --list`); process.exit(1); }
      rel = `${dom}/${rel}`;
    }
    const srcPath = join(exDir, rel);
    if (!existsSync(srcPath)) { console.error(`Template "${rel}" not found. Run: drawio-ai scaffold --list`); process.exit(1); }
    let outFlag2 = flags.o ?? flags.out;
    const pos2 = [...positional];
    for (let i = 0; i < pos2.length - 1; i++) if (pos2[i] === "-o") { outFlag2 = pos2[i + 1]; break; }
    const outMjs = outFlag2 ?? join(process.cwd(), rel.split("/").pop());
    const { writeFileSync: wf } = await import("node:fs");
    wf(outMjs, scaffoldSource(readFileSync(srcPath, "utf8"), packageRoot()));
    out({ ok: true, path: outMjs, run: `node ${outMjs}`, note: "script builds + validates + renders --check + prints issues in ONE run; .drawio/.png land next to it" });
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
    let scale = Number(flags.scale) || 1;
    // --check: self-check render — clamp the long edge to ~1100px. Layout inspection (overlaps,
    // misalignment, edge clipping) doesn't need full resolution; image tokens scale with pixels.
    if (flags.check && !flags.scale) {
      const m = readFileSync(file, "utf8").match(/pageWidth="(\d+)" pageHeight="(\d+)"/);
      if (m) scale = Math.min(1, Math.max(0.5, 1100 / Math.max(Number(m[1]), Number(m[2]))));
    }
    const page = Number(flags.page) || 0;
    const cli = findDrawioCli(process.env);
    if (!cli) {
      console.error("draw.io CLI not found. Set DRAWIO_CLI env var, install the draw.io desktop app, or use xvfb-run on headless Linux.");
      process.exit(1);
    }
    let version = null;
    try {
      version = execFileSync(cli, ["--version"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      version = null;   // unreadable → pageIndexFor() assumes a modern 1-based build
    }
    const argv = buildRenderArgs({ file, out: outPath, scale, page: pageIndexFor(version, page) });
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
    const result = { ok: true, path: outPath };
    // --check also reports the machine-readable issue list — fix from THIS checklist first;
    // read the PNG only to confirm, not to hunt problems one by one.
    if (flags.check) {
      const xml2 = readFileSync(file, "utf8");
      if (!/<\/diagram>[\s\S]*<diagram/.test(xml2)) {
        const v = validateDiagram(catalog, xml2, {});
        result.issues = [...v.errors, ...(v.warnings ?? []), ...(v.audit?.advice ?? [])];
      }
    }
    out(result);
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
  search <query>[, <query>…] [--category C] [--limit N] [--kind icon|group] [--full]
  style <name>
  validate <file> [--strict]
  audit <file>
  logo <brand> [--embed] [--variant color|mono|text]
  categories
  types
  principles [--mode aws|azure|gcp|databricks|bpmn]
  scaffold <template.mjs> [-o out.mjs] | --list   copy a template as a standalone build script
  root
  render <file> [-o out.png] [--scale N] [--page N] [--check]
  workflow
  [--catalog <path>]  override the default catalog (catalog/aws.json)`
    );
    process.exit(cmd ? 1 : 0);
}
