import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/cli-lib.ts";

// Size budget: the catalog is most of the install. Icons draw at 48 px, so a big embedded image is waste —
// rebuild with scripts/build_pack.py (minified SVG, or a 96 px PNG when smaller). Raise only on purpose.
const DIR = join(packageRoot(), "catalog");
const MAX_ICON = 16 * 1024;
const MAX_TOTAL = 6 * 1024 * 1024;

test("catalog: every icon style ≤ 16 KB", () => {
  const big = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
    for (const i of JSON.parse(readFileSync(join(DIR, f), "utf8")).icons ?? []) {
      if ((i.style ?? "").length > MAX_ICON) big.push(`${f}:${i.name} ${i.style.length}`);
    }
  }
  assert.deepEqual(big, []);
});

test("catalog: total ≤ 6 MB", () => {
  const total = readdirSync(DIR).reduce((n, f) => n + statSync(join(DIR, f)).size, 0);
  assert.ok(total <= MAX_TOTAL, `catalog is ${total} bytes`);
});
