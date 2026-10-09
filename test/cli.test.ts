import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  packageRoot,
  findDrawioCli,
  buildRenderArgs,
  workflowText,
  scaffoldSource,
} from "../src/cli-lib.ts";

// --- search (CLI-level: compact + batch contracts) ---
const runCli = (...args: string[]) =>
  execFileSync(process.execPath, [join(packageRoot(), "src", "cli.ts"), ...args], { encoding: "utf8" });

test("cli search: single query returns a compact array (no style)", () => {
  const r = JSON.parse(runCli("search", "s3"));
  assert.ok(Array.isArray(r) && r.some((x) => x.name === "s3"));
  assert.equal(r.find((x) => x.name === "s3").style, undefined);
});

test("cli search: comma-separated queries return a map keyed by query", () => {
  const r = JSON.parse(runCli("search", "s3, lambda"));
  assert.ok(!Array.isArray(r));
  assert.ok(r["s3"].some((x: any) => x.name === "s3"));
  assert.ok(r["lambda"].some((x: any) => x.name === "lambda"));
});

// --- packageRoot ---
test("packageRoot returns an absolute directory containing package.json and src/", () => {
  const root = packageRoot();
  assert.ok(root.startsWith("/"), `packageRoot must be absolute, got: ${root}`);
  assert.ok(existsSync(join(root, "package.json")), "package.json must exist in root");
  assert.ok(existsSync(join(root, "src")), "src/ must exist in root");
});

// --- findDrawioCli ---
test("findDrawioCli: env var wins if existsSync true", () => {
  const env = { DRAWIO_CLI: "/custom/drawio" };
  const deps = { existsSync: (p: string) => p === "/custom/drawio" };
  assert.equal(findDrawioCli(env, deps), "/custom/drawio");
});

test("findDrawioCli: env var skipped if existsSync false, falls to known locations", () => {
  const env = { DRAWIO_CLI: "/nope" };
  const deps = {
    existsSync: (p: string) => p === "/usr/local/bin/drawio",
    locateOnPath: () => "",
  };
  assert.equal(findDrawioCli(env, deps), "/usr/local/bin/drawio");
});

test("findDrawioCli: locateOnPath wins over known locations", () => {
  const env = {};
  const deps = {
    existsSync: () => false,
    locateOnPath: () => "/opt/special/drawio",
  };
  assert.equal(findDrawioCli(env, deps), "/opt/special/drawio");
});

test("findDrawioCli: first known location found wins", () => {
  const env = {};
  const deps = {
    existsSync: (p: string) => p === "/opt/homebrew/bin/drawio" || p === "/Applications/draw.io.app/Contents/MacOS/draw.io",
    locateOnPath: () => "",
  };
  // homebrew is first in the list
  assert.equal(findDrawioCli(env, deps), "/opt/homebrew/bin/drawio");
});

test("findDrawioCli: returns null when nothing found", () => {
  const env = {};
  const deps = { existsSync: () => false, locateOnPath: () => "" };
  assert.equal(findDrawioCli(env, deps), null);
});

// --- buildRenderArgs ---
// draw.io desktop numbers pages from 1 since v27.0.2 — passing -p 0 makes it bail with
// "Invalid page index", which killed every render (and so the whole vision self-check).
test("buildRenderArgs default scale=1 page=1 (pages are 1-based)", () => {
  const argv = buildRenderArgs({ file: "a.drawio", out: "b.png" });
  assert.deepEqual(argv, [
    "-x", "-f", "png", "-s", "1", "-p", "1",
    "--no-sandbox", "-o", "b.png", "a.drawio",
  ]);
});

test("buildRenderArgs custom scale and page", () => {
  const argv = buildRenderArgs({ file: "in.xml", out: "out.png", scale: 4, page: 2 });
  assert.deepEqual(argv, [
    "-x", "-f", "png", "-s", "4", "-p", "2",
    "--no-sandbox", "-o", "out.png", "in.xml",
  ]);
});

// --- workflowText ---
test("workflowText returns non-empty string", () => {
  const txt = workflowText();
  assert.ok(txt.length > 50, "workflow text should be substantial");
});

test("workflowText mentions validate, render, and write to absolute project path", () => {
  const txt = workflowText();
  assert.ok(/\bvalidate\b/.test(txt), "must mention validate");
  assert.ok(/\brender\b/.test(txt), "must mention render");
  assert.ok(/\babsolute\b/.test(txt), "must mention absolute");
  assert.ok(/\bproject\b/.test(txt), "must mention project");
});

test("workflowText mentions drawio-ai root for importing the engine", () => {
  const txt = workflowText();
  assert.ok(/drawio-ai root/.test(txt), "must mention drawio-ai root");
});

// Drift-proof: every name the workflow's import snippet tells an agent to import must actually
// be exported by that module. This is the bug class where the snippet said
// `import { group } from "core.ts"` while group lives in layout-engine.mjs — agents following
// the "source of truth" workflow then crash on line 1.
for (const [label, txt] of [
  ["workflow", workflowText()],
  ["references/api.md", readFileSync(join(packageRoot(), "skills/drawio/references/api.md"), "utf8")],
]) {
  test(`${label} import snippet names only real exports`, async () => {
    const imports = [...txt.matchAll(/import\s*\{([^}]+)\}\s*from\s*"<ROOT>\/dist\/kit\.mjs"/g)];
    assert.ok(imports.length >= 1, `${label} must show the engine import line`);
    const mod = await import(join(packageRoot(), "src", "kit.ts"));   // dist/kit.mjs is built from it
    for (const [, names] of imports)
      for (const raw of names.split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (name) assert.ok(name in mod, `${label} imports "${name}" from kit.mjs, which does not export it`);
      }
  });
}

// --- scaffoldSource ---
test("scaffoldSource rewrites kit imports to absolute and retargets output", () => {
  const src = `import { Diagram } from "../../src/builder.ts";\nwriteFileSync(new URL("../../out/x_kit.drawio", import.meta.url), d.mxfile("X"));\n`;
  const out = scaffoldSource(src, "/opt/kit");
  assert.match(out, /from "\/opt\/kit\/dist\/kit\.mjs"/);
  assert.match(out, /new URL\("\.\/x_kit\.drawio"/);
  assert.match(out, /render", __f, "--check"/, "self-check tail appended");
});

test("scaffoldSource --name renames the output in the write line AND the self-check tail", () => {
  const src = `writeFileSync(new URL("../../out/x_kit.drawio", import.meta.url), d.mxfile("X"));\n`;
  const out = scaffoldSource(src, "/opt/kit", "dist/kit.mjs", "shop.drawio");
  assert.doesNotMatch(out, /x_kit/);
  assert.equal(out.match(/"\.\/shop\.drawio"/g)!.length, 2);
});

test("scaffoldSource without a drawio write appends no self-check tail", () => {
  const out = scaffoldSource(`import { a } from "../../src/core.ts";\n`, "/opt/kit");
  assert.doesNotMatch(out, /--check/);
});

test("scaffoldSource adds a VALIDATE line only when the template prints none", () => {
  const w = `writeFileSync(new URL("../../out/x.drawio", import.meta.url), d.mxfile("X"));\n`;
  assert.match(scaffoldSource(w, "/opt/kit"), /\["validate", __f\]/);
  assert.doesNotMatch(scaffoldSource(`console.log("VALIDATE:", 1);\n` + w, "/opt/kit"), /\["validate", __f\]/);
});

test("skill: anything but `install` prints usage and exits 1 (never shells out)", () => {
  assert.throws(() => execFileSync(process.execPath, [join(packageRoot(), "src", "cli.ts"), "skill"], { encoding: "utf8", stdio: "pipe" }),
    (e: any) => e.status === 1 && /skill install/.test(e.stderr));
});

test("cli search: valueless --category is ignored, not passed as `true`", () => {
  const r = JSON.parse(runCli("search", "s3", "--category"));
  assert.ok(r.some((x: any) => x.name === "s3"));
});
