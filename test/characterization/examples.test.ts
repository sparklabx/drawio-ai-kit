// Golden output of every examples/**/build_*.mjs: scaffolded through the CLI into a temp dir,
// run with the current runtime, and the produced .drawio pinned by SHA-256 + cell counts.
// Output was verified deterministic across repeated runs (no timestamps / random ids).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, ROOT, makeTmp, normalize, runCli, sha256, snapshotFile } from "./_helpers.ts";

const match = snapshotFile("examples");
const tmp = makeTmp("charac-examples");
const exDir = join(ROOT, "examples");
const examples = readdirSync(exDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join(exDir, d.name)).filter((f) => /^build_.*\.mjs$/.test(f)).map((f) => `${d.name}/${f}`))
  .sort();

// PATH for the examples = only a `drawio-ai` shim onto THIS checkout's dist/cli.mjs (same runtime), so the
// scaffold's validate tail is real and nothing global (installed drawio-ai, draw.io desktop) leaks in.
const kitBin = join(tmp, "kitbin");
mkdirSync(kitBin);
writeFileSync(join(kitBin, "drawio-ai"), `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`);
chmodSync(join(kitBin, "drawio-ai"), 0o755);

const count = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;

test("examples: the template set itself", () => {
  match("_list", examples);
});

for (const rel of examples) {
  test(`example ${rel}`, () => {
    const dir = join(tmp, rel.replace(/\//g, "__").replace(/\.mjs$/, ""));
    const script = join(dir, rel.split("/").pop()!);
    const sc = runCli(["scaffold", rel, "-o", script], { tmp });
    assert.equal(sc.status, 0, sc.stderr);
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8", env: { HOME: process.env.HOME, PATH: kitBin } });
    assert.equal(r.status, 0, r.stderr);
    const outputs = readdirSync(dir).filter((f) => f.endsWith(".drawio")).sort();
    assert.ok(outputs.length > 0, "example produced no .drawio");
    const files: Record<string, unknown> = {};
    for (const f of outputs) {
      const xml = readFileSync(join(dir, f), "utf8");
      files[f] = {
        sha256: sha256(xml),
        bytes: Buffer.byteLength(xml),
        cells: count(xml, /<mxCell\b/g),
        vertices: count(xml, /\bvertex="1"/g),
        edges: count(xml, /\bedge="1"/g),
        pages: count(xml, /<diagram\b/g),
      };
    }
    // the template's own VALIDATE line (if it prints one) is part of its observable behavior
    const validate = normalize(r.stdout, tmp).split("\n").filter((l) => l.startsWith("VALIDATE:"));
    match(rel, { files, validate });
  });
}
