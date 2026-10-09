# Plan: make drawio-ai-kit small and fast to install

Date: 2026-10-09. Status: plan only, no code changed. Measurements were taken on macOS arm64 with a fast connection.
Related: [`fuzzy-rust-libs-bun.md`](fuzzy-rust-libs-bun.md), [`fuzzy-alias-search.md`](fuzzy-alias-search.md).

## 1. Where the bytes and the minutes go (measured)

| What | Size | Note |
|---|---|---|
| `catalog/*.json` | **19.9 MB** raw, 13.5 MB gzip | **94%** of it (18.9 MB) is base64 PNG inside `style` |
| └ `azure.json` | 13.5 MB | 626 icons. Each is a **256×256 PNG** (avg 16 KB) drawn at 48×48 |
| └ `gcp.json` | 2.0 MB | 216 PNG icons |
| └ OSS packs (database, bigdata, cicd, …) | 3.7 MB | PNG |
| `packs/` (source SVGs, tracked in git) | 4.3 MB | **`packs/azure`: 626 SVGs = 1.52 MB raw / 0.44 MB gzip** |
| `docs/` (screenshots) | 3.1 MB | not in npm `files`, but every git download includes it |
| `.git` history | 19.3 MB | only a full clone pays this |
| JS (`dist/`) | 76 KB | already minimal. **Not the problem.** |

**What a user downloads today. Both commands fetch the whole repo:**

| Step | What happens | Transfer |
|---|---|---|
| `npm i -g github:sparklabx/drawio-ai-kit` | Git dependency: npm resolves it through git and downloads the **whole repo tree** (docs, packs, tests, all of it), not just `files` | ~18 MB tarball. The cold npm cache grew by **31 MB**. **10.7 s on a fast link** |
| `npx skills add sparklabx/drawio-ai-kit` | Downloads the `skills` CLI, then **clones the whole repo** to find `skills/drawio/` (88 KB) | ~18 MB transfer, 46 MB on disk |
| **Total** | The same repo is downloaded **twice** | **~40–50 MB**. At 2–5 Mbps (corporate proxy, mobile, far from GitHub's CDN) that is **1–3+ minutes** |

The skill itself is 88 KB, and the user downloads about 500× that to get it.

## 2. The fix, ranked by impact divided by effort

### Phase 1: re-encode the catalog as SVG (biggest win, no new infrastructure)
- The SVG sources already exist in `packs/<pack>/assets/*.svg`. Rebuild the catalog styles as
  `image=data:image/svg+xml,<base64 of minified SVG>` instead of a 256 px rasterized PNG.
  - Azure: 13.4 MB → **~2.0 MB** (base64 SVG). gzip in the npm tarball: ~0.5 MB.
  - It is also *better quality*: vector icons at any zoom, where the PNG is a bitmap.
- Minify the SVGs at ingest (strip metadata/comments, round path decimals). This is a few lines of regex in
  `scripts/ingest_index.py`'s pack step, with no new tool.
- If a pack has no SVG source: downscale the PNG to 96 px (measured 16.1 → 5.2 KB/icon, 3×) and drop alpha
  metadata.
- **Option 1b (to evaluate, not the default):** draw.io already ships the Azure icons as `img/lib/azure2/**/*.svg`. 542 of 626
  matched by name on a crude first pass (87%). Referencing them costs **0 bytes**, but the icon then depends on the
  draw.io version and may not match the official set. Keep embedded SVG as the default, and use 1b only as a later
  "lite" mode.
- **Target: catalog 19.9 MB → ≤3 MB raw, ~1 MB gzip.**
- **Verify:**
  - Read the history of `scripts/ingest_index.py` to find *why* PNG was chosen (render bug? draw.io desktop CLI?).
  - Render one diagram per pack with draw.io desktop.
  - Check that `validate` still passes and that no "Color = Identity" assumption breaks.
  - Re-run `npm test`.

### Phase 2: one small download instead of two git clones
1. **Publish to the npm registry** (the name `drawio-ai-kit` is free; `npm view` → 404).
   - The registry tarball contains only `files`, and it is served from a CDN (Cloudflare-fronted).
   - That is the "CDN channel" for the package itself, with no infrastructure of our own.
   - Install becomes `npm i -g drawio-ai-kit` or `bun add -g drawio-ai-kit`: **~1–1.5 MB** after Phase 1.
   - Publish from CI on tag (`npm publish --provenance`) so the package is signed and traceable to the commit.
     This keeps the README "is it safe" story.
   - Keep `github:` install working as a fallback.
2. **Install the skill from the package already on disk; don't clone the repo again.**
   - Add `drawio-ai skill install`, which runs `npx skills add "$(drawio-ai root)/skills/drawio"`.
     The skills CLI keeps its job of detecting each agent and its skill dir.
   - **Verify** that the skills CLI accepts a local path. If not, copy into the detected skill dirs ourselves.
   - Result: the skill costs **0 extra bytes**.
3. One-line install becomes: `npm i -g drawio-ai-kit && drawio-ai skill install`.
4. For users who still run `npx skills add sparklabx/drawio-ai-kit`: make the repo clone cheap too. Move
   `packs/` (source assets, 4.3 MB) and the big `docs/` screenshots out of the default branch, into a `packs`
   branch or a separate `drawio-ai-kit-assets` repo. Ingest reads from there.
   - **Do not use Git LFS**: the skills CLI and `github:` installs don't fetch LFS objects, so files would silently be pointer stubs.

### Phase 3: faster at runtime (small, follows from Phase 1)
- **Load packs lazily:** `loadCatalog()` parses all 20 MB on every CLI call (~18 ms). Load only the pack(s)
  the request touches: `aws`/`bpmn` are tiny, and `azure` is read only for Azure names (the prefix is already in
  the name). With SVG, the remaining parse cost is small anyway.
- Optional: ship the packs as `catalog/*.json.gz`. `data/shape-index.json.gz` already uses this, through `node:zlib` with zero deps.
  It shrinks disk use about 3×, but **not** the download (the npm tarball is already gzip). Do it only if disk use matters.
- Rejected: a custom binary container (index + raw bytes). It saves the 33% base64 overhead, but SVG + gzip
  already wins and stays readable/diffable. Revisit only if the catalog grows past ~10 MB again.

### Phase 4: search quality inside a size budget (from the fuzzy research)
- First, the curated `data/search-aliases.json` + tiered ranking (`fuzzy-alias-search.md` §5): **~5 KB, 0 deps**.
  This fixes `k8s`/`es`/`pg`, which no library can fix.
- Fuzzy tier: the ~20-line OSA scan (0 bytes of deps, 1.2 ms/query, identical hits).
- **frizbee WASM (174 KB) only if the OSA tier proves insufficient.** If adopted, bundle it as a dev-dependency into
  `dist/` (users keep zero runtime deps), load it lazily (only when exact/alias/prefix miss), and fall back to
  OSA where Wasm SIMD is missing.
- Budget: Phase 4 may add at most **+200 KB** to the package.

### Phase 5 (only if needed): lazy packs from a CDN
- If packs grow a lot (more clouds, more OSS sets), ship `aws` + `bpmn` in the package and download others
  on first use from jsDelivr (`cdn.jsdelivr.net/npm/drawio-ai-kit@<version>/catalog/<pack>.json`, which is free and served
  from Cloudflare/Fastly). Cache them in `~/.cache/drawio-ai/`, pin the **sha256 in a manifest** shipped in the package, and let
  `drawio-ai fetch-packs` pre-warm them for offline or CI use.
- Costs:
  - The README promise "runs locally, one opt-in network call" changes.
  - Corporate proxies and offline use break unless the packs are pre-warmed.
- **After Phases 1 and 2 the whole package is ~1–1.5 MB, so this is probably never needed.**

### Rejected
- `bun build --compile` binaries: 62–106 MB per platform (measured earlier), and users still need Node to run `build.mjs`.
- Git LFS: breaks `github:` and skills-CLI installs (see Phase 2.4).
- Brotli/zstd custom packing: npm already gzips, and the extra decoder code or dependency isn't worth ~15%.

## 3. Guardrails (do these first, they keep it small)
- **CI size budget:** `npm pack --dry-run --json`, then fail if the packed size is over **2 MB** (start at 15 MB, lower it after Phase 1).
- **Install benchmark script** `scripts/bench-install.sh`: a cold-cache install into a temp prefix, timed. Run it in CI on
  release, and post the number in the release notes.
- Catalog ingest refuses any icon over 8 KB without an explicit override.

## 4. Expected result

| | Today | After Phase 1 | After Phases 1+2 |
|---|---|---|---|
| npm package (packed) | 13.6 MB | ~1.5 MB | ~1.5 MB |
| Bytes downloaded for CLI + skill | ~40–50 MB (two repo downloads) | ~15–20 MB (two repo downloads of ~8–10 MB each) | **~1.5 MB (one registry tarball)** |
| Cold install at 3 Mbps | ~2 min | ~1 min | **~5 s** |
| `loadCatalog()` per CLI call | ~18 ms | ~3 ms | ~1–3 ms (lazy) |

## 5. Order of work (each is one PR)
1. CI size budget + install benchmark (guardrails, numbers before and after).
2. Catalog SVG re-encode + render verification (Phase 1).
3. npm publish workflow with provenance + `drawio-ai skill install` + README install update (Phase 2.1–2.3).
4. Move `packs/` and heavy docs assets off the default branch (Phase 2.4).
5. Lazy pack loading (Phase 3).
6. Aliases + OSA fuzzy tier, frizbee only if needed (Phase 4).

**Needs a decision from the owner:** publishing to the public npm registry under `drawio-ai-kit` (an org scope like
`@sparklabx/drawio-ai-kit` is an alternative). Also, whether icon fidelity with embedded SVG is acceptable; spot-check in the render.
