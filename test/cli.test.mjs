import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  packageRoot,
  findDrawioCli,
  buildRenderArgs,
  workflowText,
} from "../src/cli-lib.mjs";

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
  const deps = { existsSync: (p) => p === "/custom/drawio" };
  assert.equal(findDrawioCli(env, deps), "/custom/drawio");
});

test("findDrawioCli: env var skipped if existsSync false, falls to known locations", () => {
  const env = { DRAWIO_CLI: "/nope" };
  const deps = {
    existsSync: (p) => p === "/usr/local/bin/drawio",
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
    existsSync: (p) => p === "/opt/homebrew/bin/drawio" || p === "/Applications/draw.io.app/Contents/MacOS/draw.io",
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
test("buildRenderArgs default scale=2 page=0", () => {
  const argv = buildRenderArgs({ file: "a.drawio", out: "b.png" });
  assert.deepEqual(argv, [
    "-x", "-f", "png", "-s", "2", "-p", "0",
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
// `import { group } from "core.mjs"` while group lives in layout-engine.mjs — agents following
// the "source of truth" workflow then crash on line 1.
test("workflowText import snippet names only real exports", async () => {
  const txt = workflowText();
  const imports = [...txt.matchAll(/import\s*\{([^}]+)\}\s*from\s*"[^"]*\/src\/([a-z-]+\.mjs)"/g)];
  assert.ok(imports.length >= 2, "workflow must show engine import lines");
  for (const [, names, file] of imports) {
    const mod = await import(join(packageRoot(), "src", file));
    for (const raw of names.split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      assert.ok(name in mod, `workflow snippet imports "${name}" from ${file}, which does not export it`);
    }
  }
});
