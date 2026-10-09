#!/usr/bin/env bun
// Maintainer build: bundles src/cli.mjs + src/kit.mjs into the shipped dist/.
// Runs on Bun only (Bun.build). The OUTPUT is plain Node >=18 ESM — users never need Bun.
//
//   bun run build            rebuild dist/ + data/catalog-index.json and print a size report
//   bun run build:check      rebuild into a temp dir; fail if dist/ differs (stale or non-deterministic)
//   bun run build:analyze    also write a module-graph report (metafile JSON + markdown) to $TMPDIR
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { buildCatalogIndex, CATALOG_INDEX } from "../src/core.mjs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const analyze = args.has("--analyze");

async function bundle(outdir) {
  rmSync(outdir, { recursive: true, force: true });
  const r = await Bun.build({
    entrypoints: [join(ROOT, "src/cli.mjs"), join(ROOT, "src/kit.mjs")],
    outdir,
    target: "node",
    format: "esm",
    splitting: true,
    sourcemap: "none",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    naming: { entry: "[name].mjs", chunk: "[name]-[hash].mjs" },
  });
  if (!r.success) {
    for (const log of r.logs) console.error(log);
    process.exit(1);
  }
}

const files = (dir) => readdirSync(dir).sort();
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// Slim catalog index (pack metadata without embedded images) so the CLI loads a pack's images only on use.
const index = JSON.stringify(buildCatalogIndex());

if (check) {
  if (readFileSync(CATALOG_INDEX, "utf8") !== index) {
    console.error("data/catalog-index.json is stale — run 'bun run build' and commit it");
    process.exit(1);
  }
  const tmp = mkdtempSync(join(tmpdir(), "drawio-dist-"));
  await bundle(tmp);
  const want = files(tmp);
  const have = files(DIST);
  const stale = [...new Set([...want, ...have])].filter(
    (f) => !want.includes(f) || !have.includes(f) || !readFileSync(join(tmp, f)).equals(readFileSync(join(DIST, f))),
  );
  rmSync(tmp, { recursive: true, force: true });
  if (stale.length) {
    console.error(`dist/ is stale (${stale.join(", ")}) — run 'bun run build' and commit it`);
    process.exit(1);
  }
  console.log(`dist/ is up to date (${have.length} files)`);
  process.exit(0);
}

writeFileSync(CATALOG_INDEX, index);
await bundle(DIST);
let raw = 0;
let gz = 0;
for (const f of files(DIST)) {
  const buf = readFileSync(join(DIST, f));
  const g = Bun.gzipSync(buf).length;
  raw += buf.length;
  gz += g;
  console.log(`${f.padEnd(24)} ${kb(buf.length).padStart(9)}  gzip ${kb(g).padStart(8)}`);
}
console.log(`${"total".padEnd(24)} ${kb(raw).padStart(9)}  gzip ${kb(gz).padStart(8)}`);

if (analyze) {
  // Same flags as bundle(), via the CLI, which can also emit the LLM-friendly markdown graph.
  const out = mkdtempSync(join(tmpdir(), "drawio-analyze-"));
  const json = join(out, "metafile.json");
  const md = join(out, "bundle.md");
  await Bun.$`bun build src/cli.mjs src/kit.mjs --target=node --format=esm --production --splitting --sourcemap=none --outdir=${join(out, "dist")} --metafile=${json} --metafile-md=${md}`
    .cwd(ROOT)
    .quiet();
  console.log(`\nmetafile: ${json}\nreport:   ${md}`);
}
