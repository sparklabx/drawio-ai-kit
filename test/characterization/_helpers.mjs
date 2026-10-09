// Characterization (golden) test helpers. Black-box only: everything goes through dist/kit.mjs
// and dist/cli.mjs, so these snapshots keep proving behavior across a src/ refactor.
// Regenerate snapshots: UPDATE_SNAPSHOTS=1 node --test test/characterization/*.test.mjs   (dir arg fails on Node 22; use the glob)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
export const CLI = join(ROOT, "dist", "cli.mjs");
export const KIT = join(ROOT, "dist", "kit.mjs");
export const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";
const SNAP_DIR = join(dirname(fileURLToPath(import.meta.url)), "__snapshots__");

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** A fresh temp dir (realpath'd: macOS /var → /private/var) with node_modules/drawio-ai-kit → repo,
 *  so generated scripts resolve the kit whether they import an absolute path or the bare package name. */
export function makeTmp(label = "charac") {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), `${label}-`));
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  symlinkSync(ROOT, join(dir, "node_modules", "drawio-ai-kit"), "dir");
  mkdirSync(join(dir, "emptybin"));
  return dir;
}

/** Replace machine-specific absolute paths with stable tokens. */
export function normalize(text, tmp) {
  let s = String(text);
  const swap = (from, to) => { if (from) s = s.split(from).join(to); };
  if (tmp) { swap(tmp, "<TMP>"); swap(tmp.replace(/^\/private/, ""), "<TMP>"); }
  swap(ROOT, "<ROOT>");
  return s;
}

/** Normalize the kit import specifier so absolute-path and bare-package scaffolds compare equal. */
export const normalizeKitImport = (src) =>
  src.replace(/"(?:<ROOT>\/(?:dist|src)\/kit\.(?:mjs|js|ts)|drawio-ai-kit)"/g, '"<KIT>"');

/** Spawn the bundled CLI with the current runtime (node or bun). PATH is emptied unless overridden so
 *  nothing external (a globally installed drawio-ai, draw.io desktop) leaks into the result. */
export function runCli(args, { cwd, env = {}, tmp } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd ?? tmp ?? ROOT,
    encoding: "utf8",
    env: { HOME: process.env.HOME, PATH: tmp ? join(tmp, "emptybin") : "/nonexistent-bin", ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: r.status,
    stdout: normalize(r.stdout, tmp ?? cwd),
    stderr: normalize(r.stderr, tmp ?? cwd),
  };
}

/** Parse stdout as JSON when possible, else keep the text. */
export const parseOut = (s) => { try { return JSON.parse(s); } catch { return s; } };

/** Fake draw.io desktop binary: logs its argv and writes a stub PNG at the -o path. */
export function fakeDrawio(dir) {
  const bin = join(dir, "fake-drawio.sh");
  writeFileSync(bin, `#!/bin/sh
printf '%s\\n' "$@" > "${join(dir, "fake-drawio.argv")}"
while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then shift; printf 'PNG' > "$1"; fi; shift; done
`);
  chmodSync(bin, 0o755);
  return { bin, argvFile: join(dir, "fake-drawio.argv") };
}

/** Per-file JSON snapshot store. In UPDATE mode the file is rebuilt from scratch on first use. */
export function snapshotFile(name) {
  const path = join(SNAP_DIR, `${name}.json`);
  let data = UPDATE ? {} : existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return function match(key, value) {
    const v = JSON.parse(JSON.stringify(value));
    if (UPDATE) {
      data[key] = v;
      mkdirSync(SNAP_DIR, { recursive: true });
      const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
      writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
      return;
    }
    assert.ok(key in data, `missing snapshot "${key}" in ${name}.json — run with UPDATE_SNAPSHOTS=1`);
    assert.deepEqual(v, data[key], `snapshot mismatch: ${name}.json › ${key}`);
  };
}
