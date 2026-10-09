import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Diagram } from "../src/builder.ts";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tiny = () => { const d = new Diagram("pipeline"); d.icon("a", "ec2", [0, 0]); return d; };

test("save: writes into a workspace OUTSIDE the kit", () => {
  const ws = mkdtempSync(join(tmpdir(), "drawio-ws-"));
  try {
    const p = tiny().save("diagram.drawio", ws);
    assert.ok(existsSync(p), "file must exist");
    assert.equal(p, join(ws, "diagram.drawio"));
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test("save: refuses the kit repo root and its subdirs", () => {
  assert.throws(() => tiny().save("oops.drawio", KIT_ROOT), /Refusing to save into the kit repo/);
  assert.throws(() => tiny().save("x.drawio", join(KIT_ROOT, "out")), /Refusing to save/);
  assert.throws(() => tiny().save("x.drawio", join(KIT_ROOT, "examples")), /Refusing to save/);
  assert.ok(!existsSync(join(KIT_ROOT, "oops.drawio")), "no file left behind");
});

test("save: blocks a '../' filename that escapes a safe dir back into the kit", () => {
  const ws = mkdtempSync(join(tmpdir(), "drawio-ws-"));
  try {
    // climbs out of ws, into <kit>/src — built from real paths (the guard resolves symlinks like macOS /var)
    const escape = join(relative(realpathSync(ws), realpathSync(KIT_ROOT)), "src", "sneaky.drawio");
    assert.throws(() => tiny().save(escape, ws), /Refusing to save/);
    assert.ok(!existsSync(join(KIT_ROOT, "src", "sneaky.drawio")), "no file left behind");
  } finally { rmSync(ws, { recursive: true, force: true }); }
});
