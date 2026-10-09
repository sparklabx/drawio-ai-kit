import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = join(import.meta.dirname, "..", "install.sh");

type Opts = { tools?: string[]; node?: string; onPath?: boolean; env?: Record<string, string> };

// Runs install.sh with PATH = a dir of logging shims only (no real tools), so nothing real is touched.
function run(args: string[], { tools = ["bun", "node", "drawio-ai"], node = "v22.1.0", onPath = true, env = {} }: Opts = {}) {
  const root = mkdtempSync(join(tmpdir(), "install-"));
  const bin = join(root, "bin");
  const gbin = join(root, "gbin"); // bun global bin dir, on PATH only when onPath
  const nbin = join(root, "gprefix", "bin"); // npm global bin dir
  for (const d of [bin, gbin, nbin]) mkdirSync(d, { recursive: true });
  const log = join(root, "log");
  const shim = (dir: string, name: string, body: string) => {
    const p = join(dir, name);
    writeFileSync(p, `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
    chmodSync(p, 0o755);
  };
  for (const t of tools) {
    if (t === "drawio-ai") continue;
    const body =
      t === "node" ? `echo ${node}` :
      t === "bun" ? `[ "$1 $2 $3" = "pm bin -g" ] && echo "${gbin}"; exit 0` :
      `[ "$1 $2" = "prefix -g" ] && echo "${root}/gprefix"; exit 0`; // npm
    shim(bin, t, body);
  }
  if (tools.includes("drawio-ai")) {
    shim(onPath ? bin : gbin, "drawio-ai", "exit 0");
    shim(nbin, "drawio-ai", "exit 0");
  }
  const r = spawnSync("/bin/sh", [script, ...args], { encoding: "utf8", env: { PATH: bin, HOME: root, ...env } });
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  return { ...r, calls, out: r.stdout + r.stderr };
}

test("bun present (and preferred over npm): bun add -g, skill install, verify (exact commands)", () => {
  const r = run([], { tools: ["bun", "npm", "node", "drawio-ai"] });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls.filter((c) => !c.startsWith("bun pm")), [
    "bun add -g drawio-ai-kit",
    "drawio-ai skill install -g -y",
    "drawio-ai root",
  ]);
});

test("npm only: node checked, npm i -g", () => {
  const r = run([], { tools: ["npm", "node", "drawio-ai"] });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.calls.includes("node -v"));
  assert.ok(r.calls.includes("npm i -g drawio-ai-kit"));
  assert.ok(r.calls.includes("drawio-ai skill install -g -y"));
});

test("neither: clear error, nonzero exit, nothing run", () => {
  const r = run([], { tools: [] });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /bun\.sh/);
  assert.match(r.stderr, /Node >=20/);
  assert.deepEqual(r.calls, []);
});

test("old node on npm path: refuses, no install", () => {
  const r = run([], { tools: ["npm", "node"], node: "v18.19.0" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Node >=20/);
  assert.ok(!r.calls.some((c) => c.startsWith("npm i")));
});

test("old node does not block bun", () => {
  assert.equal(run([], { node: "v18.19.0" }).status, 0);
});

test("version pin via env and flag", () => {
  assert.ok(run([], { env: { DRAWIO_AI_VERSION: "2.1.0" } }).calls.includes("bun add -g drawio-ai-kit@2.1.0"));
  assert.ok(run(["--version", "2.0.0"], { tools: ["npm", "node", "drawio-ai"] }).calls.includes("npm i -g drawio-ai-kit@2.0.0"));
  assert.ok(run(["--version=2.0.0"]).calls.includes("bun add -g drawio-ai-kit@2.0.0"));
});

test("--runtime override and validation", () => {
  const r = run(["--runtime", "npm"], { tools: ["bun", "npm", "node", "drawio-ai"] });
  assert.ok(r.calls.includes("npm i -g drawio-ai-kit"));
  assert.notEqual(run(["--runtime", "npm"], { tools: ["bun", "drawio-ai"] }).status, 0);
  assert.notEqual(run(["--runtime", "yarn"]).status, 0);
});

test("--no-skill skips skill install", () => {
  const r = run(["--no-skill"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.calls.some((c) => c.includes("skill install")));
  assert.ok(r.calls.includes("drawio-ai root"));
});

test("--agent passes through (repeatable)", () => {
  const r = run(["--agent", "claude-code", "--agent=cursor"]);
  assert.ok(r.calls.includes("drawio-ai skill install -g -y --agent claude-code --agent cursor"));
});

test("--dry-run prints commands and runs nothing", () => {
  const r = run(["--dry-run", "--agent", "cursor"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.calls.some((c) => c.startsWith("bun add") || c.startsWith("drawio-ai")));
  assert.match(r.stdout, /\+ bun add -g drawio-ai-kit/);
  assert.match(r.stdout, /\+ drawio-ai skill install -g -y --agent cursor/);
});

test("PATH hint when global bin is not on PATH (bun)", () => {
  const r = run([], { onPath: false });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.out, /not on your PATH/);
  assert.match(r.out, /gbin/);
  assert.ok(r.calls.includes("drawio-ai root"));
});

test("PATH hint (npm)", () => {
  const r = run([], { tools: ["npm", "node", "drawio-ai"], onPath: false });
  assert.match(r.out, /gprefix\/bin/);
});

test("no PATH hint when on PATH", () => {
  assert.doesNotMatch(run([]).out, /PATH/);
});

test("install that yields no drawio-ai exits nonzero", () => {
  assert.notEqual(run([], { tools: ["bun", "node"] }).status, 0);
});

test("--help, unknown flag, missing value", () => {
  const h = run(["--help"], { tools: [] });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--dry-run/);
  assert.notEqual(run(["--bogus"]).status, 0);
  assert.notEqual(run(["--version"]).status, 0);
});
