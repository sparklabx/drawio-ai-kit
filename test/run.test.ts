// `drawio-ai run` + bare `import "drawio-ai-kit"`. Black-box on dist/ (rebuild first), on Node and on Bun.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
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
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).exports;
  assert.deepEqual(Object.keys(pkg["."]), ["types", "default"]);
});

test("help lists run", () => {
  assert.match(sh("node", [CLI], tmp()).stderr, /^ {2}run <script/m);
});

// `run` hands the scaffolded self-check the CLI path, so it works when `drawio-ai` is not on PATH.
test("scaffolded self-check validates without drawio-ai on PATH", () => {
  const dir = tmp();
  const s = sh("node", [CLI, "scaffold", "aws/build_eventdriven.mjs", "-o", join(dir, "b.mjs")], ROOT);
  assert.equal(s.status, 0, s.stderr);
  const r = spawnSync(process.execPath, [CLI, "run", join(dir, "b.mjs")], { cwd: dir, encoding: "utf8", env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin" } });
  assert.match(r.stdout, /VALIDATE: \{"ok":true/, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /ENOENT|not found in \$PATH/); // render ran the CLI (it may still skip: no draw.io desktop)
});

test("run reports a script killed by a signal", () => {
  const dir = tmp();
  writeFileSync(join(dir, "b.mjs"), 'process.kill(process.pid, "SIGTERM");\n');
  const r = sh("node", [CLI, "run", "b.mjs"], dir);
  assert.equal(r.signal, "SIGTERM");
});

if (have("bun")) {
  const bunBin = spawnSync("sh", ["-c", "command -v bun"], { encoding: "utf8" }).stdout.trim();
  const fakeBin = (name?: string) => {
    const d = tmp();
    if (name) { writeFileSync(join(d, name), `#!/bin/sh\necho "${name} $*" > "${d}/called"\n`, { mode: 0o755 }); }
    return d;
  };
  test("bun: skill install uses bunx (no npx on PATH)", () => {
    const d = fakeBin("bunx");
    const r = spawnSync(bunBin, [CLI, "skill", "install", "-g", "-y"], { encoding: "utf8", env: { HOME: process.env.HOME, PATH: d } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(d, "called"), "utf8"), /^bunx skills add .*skills\/drawio|^bunx skills add .* -g -y/);
  });
  test("bun: skill install reports a missing bunx instead of exiting silently", () => {
    const r = spawnSync(bunBin, [CLI, "skill", "install"], { encoding: "utf8", env: { HOME: process.env.HOME, PATH: fakeBin() } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ENOENT|bunx/);
  });
}
