// Bun runs every test file in one process, so compare against the packs already loaded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, searchIcon, styleForIcon, _loadedPacks } from "../src/core.ts";

test("packs are parsed only when one of their styles is read", () => {
  const c = loadCatalog();
  const before = _loadedPacks();
  assert.ok(searchIcon(c, "lambda", { limit: 3 }).length);
  assert.ok(searchIcon(c, "azure virtual machine", { limit: 3 }).length); // lean search: no images needed
  assert.deepEqual(_loadedPacks(), before);
  const e = c.icons.find((x) => x.lazy && !before.includes(x.pack));
  if (!e) return; // every pack already loaded by an earlier file in this process
  assert.match(styleForIcon(c, e.name).style, /image=data:image\//);
  assert.deepEqual(_loadedPacks(), [...before, e.pack]);
});
