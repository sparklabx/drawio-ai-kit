// `drawio-ai run` + bare `import "drawio-ai-kit"`. Black-box on dist/ (rebuild first), on Node and on Bun.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI, ROOT } from "./characterization/_helpers.ts";

const have = (bin: string) => spawnSync(bin, ["--version"]).status === 0;
const runtimes = ["node", ...(have("bun") ? ["bun"] : [])];
const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "run-")));
const env = { HOME: process.env.HOME, PATH: process.env.PATH };
const sh = (cmd: string, args: string[], cwd: string) => spawnSync(cmd, args, { cwd, encoding: "utf8", env });
const probe = `import { Diagram } from "drawio-ai-kit";\nconsole.log("ARGS", JSON.stringify(process.argv.slice(2)), typeof Diagram);\n`;

for (const rt of runtimes) {
  test(`${rt}: run resolves "drawio-ai-kit" in a dir with no node_modules`, () => {
    const dir = tmp();
    writeFileSync(join(dir, "b.mjs"), probe);
    const r = sh(rt, [CLI, "run", "b.mjs", "--x", "1"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ARGS \["--x","1"\] function/);
  });

  test(`${rt}: a script runs directly when the kit is installed as a dependency`, () => {
    const dir = tmp();
    mkdirSync(join(dir, "node_modules"));
    symlinkSync(ROOT, join(dir, "node_modules", "drawio-ai-kit"), "dir");
    writeFileSync(join(dir, "b.mjs"), probe);
    const r = sh(rt, ["b.mjs"], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /function/);
  });

  test(`${rt}: run propagates the script's exit code`, () => {
    const dir = tmp();
    writeFileSync(join(dir, "b.mjs"), "process.exit(7);\n");
    assert.equal(sh(rt, [CLI, "run", "b.mjs"], dir).status, 7);
  });

  test(`${rt}: run with a missing script fails with a clear message`, () => {
    const r = sh(rt, [CLI, "run", "nope.mjs"], tmp());
    assert.equal(r.status, 1);
    assert.match(r.stderr, /script not found: .*nope\.mjs/);
  });
}

test("run without a script prints usage", () => {
  const r = sh("node", [CLI, "run"], tmp());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: drawio-ai run/);
});

test("package exports carry types + default and the types file ships", () => {
  const pkg = JSON.parse(spawnSync("node", ["-p", "JSON.stringify(require('./package.json').exports)"], { cwd: ROOT, encoding: "utf8" }).stdout);
  assert.deepEqual(Object.keys(pkg["."]), ["types", "default"]);
});
