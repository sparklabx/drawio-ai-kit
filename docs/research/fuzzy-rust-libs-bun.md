# Research: Rust-backed fuzzy matching libraries for a Bun-built kit

Date: 2026-10-09. Status: research only. No code changed.
Companion to [`fuzzy-alias-search.md`](fuzzy-alias-search.md). That report maps today's search
(`src/core.mjs:51-100`), the failures (`k8s`, `es`, `pg`, `apigw`, `kubenetes`), and the plan: a curated
alias file plus tiered ranking.

**New requirement:** the fuzzy part should be a library written in Rust with a JS/TS interface, and it must
work with the Bun toolchain. The user found `rapidfuzz-js` and asked for more options.

**Short version**
- `rapidfuzz-js` is **not** Rust. It is a pure TypeScript port of RapidFuzz's algorithms.
- The kit ships `dist/` as a plain **Node ≥18 ESM bundle** made by `Bun.build({ target: "node" })` and
  committed to git (`scripts/build.mjs:20-30`, `package.json` `bin`). It does **not** ship a
  `bun build --compile` binary. So **WASM beats napi**: a `.wasm` file is one portable asset, while napi needs
  one `.node` file per OS/CPU inside the committed `dist/`.
- **Best Rust-backed pick: `frizbee` (WASM).** Runner-up: `@3leaps/string-metrics-wasm` (rapidfuzz-rs as
  WASM). The napi option is `@stll/fuzzy-search`. The no-dependency fallback is the ~20-line OSA scan from the
  first report.
- **The honest view:** at this catalog size, Rust buys about 1 ms per query, and the CLI takes 40–80 ms
  end to end. No library supplies the aliases (`k8s`, `es`, `pg` gave `[]` or noise in every library tested).
  The curated alias map is still the real fix.

---

## 1. rapidfuzz-js: what it really is

| Fact | Evidence |
|---|---|
| **Pure TypeScript, not Rust.** The tarball has only `dist/**/*.js`, `.d.ts`, and `.js.map`. There is no `.wasm`, no `.node`, and no `optionalDependencies`. | `npm pack rapidfuzz-js@0.13.0`, listed by hand (§5). The repo's language stats are TypeScript 1.94 MB, JS 90 KB, Python 35 KB, and no Rust ([GitHub languages API](https://api.github.com/repos/sarunast/rapidfuzz-js/languages)). |
| The README says "powered by the **algorithms** of RapidFuzz". It is a port, not a binding. "No runtime dependencies". | [README @ 9afa428](https://github.com/sarunast/rapidfuzz-js/blob/9afa4283c5a33f0edec7ea3042e88d0387535933/README.md) |
| Version 0.13.0 (2026-09-24). First release 2026-08-10, then 13 minor versions in 6 weeks. | `npm view rapidfuzz-js time` |
| Maintenance: one maintainer (`sarunast`), 3 stars, about 720 downloads a week (2026-09-28 to 10-04). | [npm](https://www.npmjs.com/package/rapidfuzz-js/v/0.13.0), `api.npmjs.org/downloads` |
| License: `package.json` and `LICENSE` say MIT. GitHub's detector reports `NOASSERTION`. | tarball `LICENSE` |
| `engines.node >= 22`. **This conflicts with the kit's Node ≥18 promise** (`package.json` `engines`). | tarball `package.json` |
| Scorers: `rapidfuzz-js/fuzz` exports `ratio`, `partialRatio`, `tokenRatio`, `tokenSetRatio`, `tokenSortRatio`, `partialToken{Set,Sort,}Ratio`, `weightedRatio` (WRatio). Distance metrics: levenshtein, indel, lcs, osa, damerau-levenshtein, hamming, jaro, jaro-winkler, prefix/postfix, cosine, dice, tversky. The `process.extract` equivalents are `search` / `bestMatch` / `searchIter` / `createMatcher`, plus `scoreMatrix` / `scorePairs` for batches. | `dist/fuzz/index.d.ts`, `dist/index.d.ts` |

**Verdict:** a complete, well-typed port, but it does not meet the "Rust-backed" requirement. It requires
Node 22, and it is the slowest library in the hands-on test (0.76 ms/query). With `weightedRatio` it is also
the noisiest: `es` → `access, business, mesh…` (§5).

---

## 2. Rust-backed candidates (checked on npm, in tarballs, and on crates.io)

Downloads are npm weekly counts for 2026-09-28 to 10-04. Sizes are tarball contents.

| Package | Rust core | Binding | Platforms | Types | Size | Activity / popularity | License | Fit for "rank a query against ~2k strings, typo-tolerant" |
|---|---|---|---|---|---|---|---|---|
| **[`frizbee`](https://www.npmjs.com/package/frizbee/v/0.13.0)** 0.13.0 | [saghen/frizbee](https://github.com/saghen/frizbee/tree/84f89b4721391958564e135e302b8232d4df01d2/bindings/frizbee-wasm) (crate 0.13.0, 2.9 M downloads, 590 stars, pushed 2026-09-18) | **WASM** (wasm-bindgen, SIMD128) | Any runtime with Wasm SIMD | yes (`pkg/frizbee_wasm.d.ts`) | 174 KB `.wasm` + 27 KB glue | npm: 1 version (2026-08-13), about 1.5 k/wk | MIT | **Good.** `new Matcher(q, {maxTypos, maxItems}).matchList(strings)` returns `{score,index,exact}` sorted. Smith-Waterman, fzf-like. Literal modes too (`exact`/`prefix`/`substring`). `initSync` is available. |
| **[`@3leaps/string-metrics-wasm`](https://www.npmjs.com/package/@3leaps/string-metrics-wasm/v/0.3.11)** 0.3.11 | [rapidfuzz-rs](https://github.com/maxbachmann/rapidfuzz-rs) crate `rapidfuzz = "0.5"` (last release 2023-12-01) | **WASM**, inlined as base64 in JS, sync init | Any | yes | 530 KB unpacked (311 KB base64 module) | 6 versions, last 2026-06-16. 0 stars, about 385/wk | MIT | **Good.** `extract(q, choices, {scorer, limit, scoreCutoff})` returns `{choice,score,index}`. `distance(a,b,'damerauLevenshtein')`, `suggest()`. Note: `ratio`, Levenshtein, OSA, Damerau, and Jaro run in WASM (`src/lib.rs`). `partialRatio`, `tokenSetRatio`, `extract`, and `suggest` are TypeScript on top (`src/index.ts`). |
| **[`@stll/fuzzy-search`](https://www.npmjs.com/package/@stll/fuzzy-search/v/1.1.5)** 1.1.5 | Rust Myers bit-parallel ([stella/fuzzy-search](https://github.com/stella/fuzzy-search/tree/d1b1f2340a68ae854782da7ad464280d96002b7a)) | **napi-rs** `.node` (+ `wasm32-wasi` fallback package) | darwin x64/arm64, linux-gnu x64/arm64, win32-x64. **No musl, no win-arm64.** | yes | about 520–570 KB per `.node` | 18 versions since 2026-03, last 2026-09-30. About 46.6 k/wk, 1 star | MIT on npm. **The repo LICENSE on `main` is Apache-2.0**, so the two disagree. | **Medium.** The shape is "find patterns inside a text" (`new FuzzySearch([{pattern, distance}]).findIter(text)`), plus `distance(a,b,metric)`. For our use: pattern = query, text = vocabulary joined with spaces, `wholeWords: true`. Exact Damerau semantics, `distance: "auto"` (Elasticsearch rule), max distance 3. |
| [`nucleo-matcher-wasm`](https://www.npmjs.com/package/nucleo-matcher-wasm/v/0.4.2) 0.4.2 | helix [nucleo-matcher](https://github.com/helix-editor/nucleo/tree/8c16d47cdfa9607d3e44df5f81c635c6f43c65ee) 0.3.1 (crate last released 2024-02) | WASM | Any (in theory) | yes | 270 KB `.wasm` | 464/wk, 1 star | **MPL-2.0** | **Poor.** fzf-style subsequence scoring has no typo tolerance: `postgress` returned `[]`. **Broken on Bun**: the ESM entry does `import * as wasm from "./x.wasm"`, which fails with `wasm.__wbindgen_start is not a function`. The CJS entry does `readFileSync(\`${__dirname}/…wasm\`)`, which bakes in an absolute build-machine path, so `--compile` binaries fail with ENOENT (§5). |
| [`nucleo-matcher-napi`](https://www.npmjs.com/package/nucleo-matcher-napi/v/0.1.0) 0.1.0 | nucleo-matcher | napi-rs | 7 targets | yes | — | 1 version (2026-07), 4/wk, 0 stars | MPL-2.0 | Same matcher limits as above, and abandoned-level adoption. |
| [`@ff-labs/fff-bun`](https://www.npmjs.com/package/@ff-labs/fff-bun/v/0.11.0) / `fff-node` 0.11.0 | [dmtrKovalenko/fff](https://github.com/dmtrKovalenko/fff) (11 k stars) | **`bun:ffi` / `ffi-rs`** C ABI, not napi | 8 targets | yes | — | about 287 k/wk | MIT | **Wrong shape.** It is a file/content finder over a directory tree (git status, frecency, watcher). It has no API for "rank this in-memory string list". |
| Tantivy bindings: [`@harperfast/fulltext`](https://www.npmjs.com/package/@harperfast/fulltext), [`@oxdev03/node-tantivy-binding`](https://www.npmjs.com/package/@oxdev03/node-tantivy-binding), [`@diskette/tantivy`](https://www.npmjs.com/package/@diskette/tantivy), [`tantivy`](https://www.npmjs.com/package/tantivy) | tantivy 0.26 | napi-rs | 3–13 targets | yes | — | 4 to 9.5 k/wk | MIT / Apache-2.0 | **Overkill.** A BM25 full-text index engine. Fuzzy means FuzzyTermQuery. Needs schema/index setup for 2k docs. |
| `strsim`, `fuzzy-matcher`/skim, `rapidfuzz-rs` direct | crates exist (strsim 0.11.1, fuzzy-matcher 0.3.7 from 2020, skim 5.7.4) | — | — | — | — | — | — | **No maintained npm binding found.** The npm names `strsim`, `skim`, and `fuzzy-matcher` are unrelated 2014–2022 JS packages. GitHub code search shows these crates only *inside* other napi apps (next.js, deno). The only published rapidfuzz-rs binding is `@3leaps/string-metrics-wasm`. |
| [`wasm-fuzzy`](https://www.npmjs.com/package/wasm-fuzzy) 0.1.2 | unknown | WASM | — | yes | 144 KB | last 2022, 7/wk | none listed | Abandoned. |
| `@napi-rs/*` | — | — | — | — | — | — | — | No fuzzy or search package exists in the `@napi-rs` scope. |

---

## 3. Bun compatibility (official docs, pinned to the doc-source commit)

**N-API in the Bun runtime**
- "Bun implements this interface from scratch, so most existing Node-API extensions work with Bun out of the
  box." `require("./x.node")` and `process.dlopen` both work.
  [docs/runtime/node-api.mdx @ 7be1d45](https://github.com/oven-sh/bun/blob/7be1d459f28566735bd602ce009e24cba0548e1e/docs/runtime/node-api.mdx)
- `WebAssembly`: "🟢 Fully implemented." `node:wasi`: "🟡 Partially implemented."
  [nodejs-compat.mdx @ ee7e565](https://github.com/oven-sh/bun/blob/ee7e56543f3657c86ee7d8b7a58e569d12943c7e/docs/runtime/nodejs-compat.mdx)

**`bun build --compile` (single-file executable)**
- "### Embed N-API Addons — You can embed `.node` files into executables." The addon must be `require`d
  directly: "If you're using `@mapbox/node-pre-gyp` or similar tools, require the `.node` file directly, or it
  won't bundle correctly."
- WASM: embed it with `import wasmPath from "./processor.wasm" with { type: "file" }`, then
  `WebAssembly.instantiate(await file(wasmPath).arrayBuffer())`. `.wasm` and `.node` can also be added as extra
  entry points. Embedded files live under `/$bunfs/`.
- Targets: `bun-linux-x64`, `bun-linux-arm64`, `bun-windows-x64`, `bun-windows-arm64`, `bun-darwin-x64`,
  `bun-darwin-arm64`, `bun-linux-x64-musl`, `bun-linux-arm64-musl`.
- Source: [docs/bundler/executables.mdx @ 4227e46](https://github.com/oven-sh/bun/blob/4227e466c4893034efcbf3a69402fa8fd865463f/docs/bundler/executables.mdx)
  (sections "Cross-compile to other platforms", "Embed assets & files", "Embed N-API Addons").

**`Bun.build` without `--compile` (what this repo uses)**
- "In the bundler, Bun handles `.node` files with the `file` loader." The file loader "copies the file into
  `outdir` as-is, and the import resolves to a relative path".
  [docs/bundler/loaders.mdx @ bbdc5a5](https://github.com/oven-sh/bun/blob/bbdc5a519e0a06d1b3133b564f91096b9ba10a31/docs/bundler/loaders.mdx)

**What this means (each point was confirmed hands-on, §5)**
- **Cross-compiling with napi** only works if the *target's* platform package is installed at build time. The
  napi-rs loader `require`s `@scope/pkg-<platform>` by name. A plain `--target=bun-linux-x64` build from macOS
  threw `Cannot require module @stll/fuzzy-search-linux-x64-gnu` at runtime. It worked after
  `bun add <pkg>-linux-x64-gnu --os linux --cpu x64` (a Bun install flag). Each binary then embeds only its own
  target's `.node`.
- **`Bun.build({target:"node"})` with napi** copies *every installed* platform `.node` into `outdir`. For this
  repo, that means committing 0.5 MB native binaries per platform to `dist/`. Platforms that were not
  pre-installed (musl, win-arm64 for `@stll`) would fail on user machines. The deterministic `build:check` gate
  would also depend on which platform packages happen to be installed.
- **WASM is one portable asset.** Inlined base64 (`@3leaps`) needs no file at all. A `.wasm` file loaded
  through `with { type: "file" }` plus explicit bytes (frizbee) works on Node 18, on Node 22, under Bun, and
  in `--compile` binaries for any target. You build once and it is not per-platform.
- **Decision: WASM.**

---

## 4. Honest assessment

- **Speed is not the problem.** Measured on 1,704 name+label vocabulary words (§5): the plain-JS OSA scan
  takes **1.2–1.3 ms/query**. Rust libraries take **0.02–0.19 ms**. The whole CLI call
  (`node dist/cli.mjs search kubernetes`) takes **40–80 ms** wall time (Bun: 20–60 ms). `loadCatalog()` alone
  takes about 18 ms and today's `searchIcon` about 2.4 ms. A Rust matcher saves about 1 ms out of about 50.
  It cannot be seen by a user.
- **Aliases are still required.** Every library returned `[]` for `k8s`. For `es` and `pg`, each library
  returned either `[]` or wrong neighbours (`ecs/efs/eks`, `pgvector/paginated/page`). Shorthand is not a
  typo. `k8s→kubernetes`, `es→elasticsearch/opensearch`, `pg→postgres` can come only from the curated
  `data/search-aliases.json` in the first report.
- **The costs are real:**
  - It is the kit's first dependency, so `bun.lock` and `package-lock` change and `npm ci` installs something.
  - `dist/` grows from about 76 KB to about 280–410 KB.
  - The bundled licence must be added to `THIRD_PARTY_NOTICES.md`.
  - frizbee needs Wasm SIMD. Under Docker `linux/amd64` emulation on Apple Silicon, Bun's JSC refused to
    compile it (`can't get Function local's type`). Native arm64 Linux, macOS, and Node 18 (arm64) were fine.
    Treat old or emulated x86 machines as a risk, and add a JS fallback.
- **Good things a library does buy:** a vetted Damerau/Smith-Waterman implementation, highlight indices, and
  literal `prefix`/`exact` modes. That is less scoring code to maintain than a hand-rolled version. It is
  modest but real.

### Recommendation
1. **Do the alias map plus tiered ranking from `fuzzy-alias-search.md` §5 first.** It fixes most failures,
   and no library can replace it.
2. **If the fuzzy tier must be Rust: `frizbee` (WASM).**
   - Why: MIT, the most active and most-used Rust core (2.9 M crate downloads; the README lists blink.cmp, atuin,
     television, skim, and fff as users, see
     [README @ 5fa0fa4](https://github.com/saghen/frizbee/blob/5fa0fa4cb05ad64178af8f21038e8ae135419438/README.md)), typo-tolerant, a direct "rank a list" API, and small (174 KB).
   - Load it synchronously so `searchIcon` stays sync: `initSync({ module: readFileSync(<wasm path>) })`, with
     the path from `import … with { type: "file" }`. Do **not** call the default `init()` from `wrapper-node.mjs`:
     its `readFile(new URL('./pkg/…', import.meta.url))` fails inside `--compile` binaries (§5).
   - Run it only on vocabulary tokens of 5+ characters that had no exact, alias, or prefix hit.
     `maxTypos = len ≤ 8 ? 1 : 2`.
   - Add a score floor: `lambad` also returned `llamaindex(76)` and `lumberyard(74)` next to `lambda(87)`.
3. **Runner-up: `@3leaps/string-metrics-wasm`.**
   - It is real rapidfuzz-rs, and its WASM is inlined with sync init, so it needs zero asset handling and was
     built for compiled binaries. `extract`/`distance` match the report's edit-distance rule exactly.
   - Downsides: bus factor 1, 0 stars, a 2023 rapidfuzz crate, and 311 KB inline.
4. **napi option (only if you later ship per-platform `--compile` binaries): `@stll/fuzzy-search`.**
   - It is the fastest, with exact Damerau semantics.
   - It needs a per-target install (`--os/--cpu`), has no musl/win-arm64 builds, and has a licence mismatch to
     resolve.
5. **No-dependency fallback:** the about 20-line OSA scan with the ≤4/≤8/9+ length guard (first report §4d).
   It gave the same hits as `@stll` on every test query, at 1.2 ms. Keep it as the fallback for (2) anyway,
   for runtimes without SIMD.

### Docs to update if a dependency or the Bun direction is adopted (not edited here)
- `CLAUDE.md`: still says "No bundler, no transpiler … Plain `.mjs` only" and "respect `package-lock.json`".
  `AGENTS.md` already describes Bun as the build-only bundler, so sync `CLAUDE.md` to it.
- `AGENTS.md:9,14`: "Zero runtime dependencies"; "Bun writes no lockfile for a zero-dep package".
- `CONTRIBUTING.md:14-15`: "There are no dependencies, so there is nothing to install".
- `docs/developer-guide.md:12,20,86,124`: "zero deps", "`src/core.mjs` is the zero-dep … engine … Imports only
  `node:fs`/`node:path`".
- `README.md:25`, `package.json` `description`, `CONTEXT.md:10,86`, and the `src/core.mjs:1` header: "zero-dependency".
- `docs/adr/0002-cli-only-remove-mcp.md` and `0004-graphviz-optional-bake-router.md`: they state the zero-dep
  identity. A new ADR (`0006`) should record the exception. Note it can be a *devDependency bundled into
  `dist/`*, so installed users still get zero runtime deps, but `src/` run directly (`npm test`,
  `npm run cli`) would need `node_modules`.
- `THIRD_PARTY_NOTICES.md`: add frizbee (MIT) or rapidfuzz-rs plus the binding (MIT).
- `scripts/build.mjs`: asset naming and handling for a `.wasm` file, if frizbee is used.

---

## 5. Hands-on test (scratch dir only; nothing written to the repo)

Environment: macOS arm64, Bun 1.4.2, Node 22.20.0, Docker (OrbStack). Catalog exported read-only:
```sh
cd /Users/huybui/code/drawio-ai-kit && node -e 'import("./src/core.mjs").then(({loadCatalog})=>{…write /tmp/fzbench/catalog.json…})'
# → 2168 entries, 1704 distinct name+label words (the first report's 1,828 also counted tags/category)
cd /tmp/fzbench && bun init -y
bun add frizbee@0.13.0 @3leaps/string-metrics-wasm@0.3.11 @stll/fuzzy-search@1.1.5 rapidfuzz-js@0.13.0 nucleo-matcher-wasm@0.4.2
bun bench.ts                                   # /tmp/fzbench/bench.ts, 200 iterations × 7 queries
```
The haystack is the vocabulary (token-level typo correction, as the first report recommends). Edit budget:
0 for ≤4 chars, 1 for 5–8, 2 for 9+.

| Query | plain-JS OSA | frizbee (wasm) | 3leaps rapidfuzz-rs (wasm, `ratio` ≥80) | @stll Myers (napi) | rapidfuzz-js (pure TS, WRatio ≥80) | nucleo (wasm) |
|---|---|---|---|---|---|---|
| `kubenetes` | kubernetes d1 | kubernetes 151 | kubernetes 95 | kubernetes d1 | kubernetes 95, net 90 | kubernetes 207 |
| `postgress` | postgres d1, postgresql d2, postgre d2 | postgresql 135, postgres 135, postgre 118 | postgres 94, postgre 88, postgresql 84 | postgres d1, postgresql d2, postgre d2 | postgres 94, os 90, postgre 88, postgresql 84 | **[]** |
| `elasticsearch` | elasticsearch d0 | elasticsearch 228 | elasticsearch 100, elasticache 83 | elasticsearch d0 | elasticsearch 100, ar 90, elastic 90, search 90… | elasticsearch 348 |
| `opensearh` | opensearch d1 | opensearch 151 | opensearch 95 | opensearch d1 | opensearch 95, ar 90, open 90 | opensearch 231 |
| `k8s` | [] | [] | [] | [] | [] | [] |
| `es` | [] (guard) | ecs, efs, eks, easm, elastic | ecs, efs, eks | [] (guard) | access, business, mesh… | ecs, efs, eks, easm… |
| `pg` | [] (guard) | pgvector, paginated, page… | [] | [] (guard) | pgvector | pgvector, paginated… |
| **ms/query** (bun) | **1.24** | 0.08 | 0.16 | 0.08 | 0.76 | 0.02 |

Extra frizbee and 3leaps typo checks on Node 22 (`node /tmp/fzscripts/sync.mjs`, frizbee via `initSync`):
- `kubermetes` → kubernetes (both)
- `elastcsearch` → elasticsearch (both)
- `postgers` → postgres/postgresql (both)
- `dyanmodb` → dynamodb (both)
- `lambad` → lambda. frizbee also returned llamaindex 76 and lumberyard 74.

**Single-file executable**
```sh
bun build --compile bench.ts --outfile out/bench-native        # 63.7 MB; a bare hello-world is 62.2 MB → libs+catalog ≈ 1.5 MB
cp out/bench-native /tmp/fz-isolated-bin && mv node_modules node_modules.off && cd / && /tmp/fz-isolated-bin
```
- frizbee (wasm embedded via `with {type:"file"}` + explicit bytes), 3leaps (inline), @stll (embedded
  `.node`), rapidfuzz-js: **all OK** with `node_modules` hidden. Same results and timings.
- nucleo-matcher-wasm: **FAIL**. `ENOENT … /private/tmp/fzbench/node_modules/nucleo-matcher-wasm/dist/nucleo_wasm_bg.wasm`
  (build path baked in). Its ESM entry already fails under plain `bun` (`wasm.__wbindgen_start is not a function`).
- frizbee with default `await init()`, compiled: **FAIL**. `wrapper-node.mjs` reads the wasm from disk.

**Cross-compile**
```sh
bun build --compile --target=bun-linux-x64 bench.ts --outfile out/bench-linux-x64
docker run --rm --platform linux/amd64 -v /tmp/fzbench/out:/out:ro debian:stable-slim /out/bench-linux-x64
#   → error: Cannot require module @stll/fuzzy-search-linux-x64-gnu
bun add @stll/fuzzy-search-linux-x64-gnu@1.1.5 --os linux --cpu x64     # then rebuild
#   → napi OK; frizbee wasm: CompileError "can't get Function local's type" (no Wasm SIMD under amd64 emulation); 3leaps OK
bun add @stll/fuzzy-search-linux-arm64-gnu@1.1.5 --os linux --cpu arm64
bun build --compile --target=bun-linux-arm64 bench.ts --outfile out/bench-linux-arm64
docker run --rm --platform linux/arm64 -v /tmp/fzbench/out:/out:ro debian:stable-slim /out/bench-linux-arm64
#   → all five libraries OK, same results (frizbee 0.12 ms, 3leaps 0.15, @stll 0.08, plain JS 1.27)
```
Each cross-compiled binary contained only its own target's `.node` (`fuzzy-search.linux-x64-gnu-v71a0dx5.node`
and `…linux-arm64-gnu-8c5q3cha.node`).

**The repo's actual shipping mode: `Bun.build` with target node, run on Node 18**
```sh
bun build nodebundle.ts --target=node --format=esm --minify --outdir=out/nodedist
#   → nodebundle.js 351 KB (3leaps inlined) + frizbee_wasm_bg-mpg8fa46.wasm 174 KB
#     + one .node asset PER INSTALLED PLATFORM (darwin-arm64, linux-x64-gnu, linux-arm64-gnu; ≈0.5 MB each)
docker run --rm --platform linux/arm64 -v …/nodedist18:/d:ro node:18-slim node /d/nodebundle.mjs
#   → v18.20.8: 3leaps kubernetes 94.7, frizbee opensearch 151, stll postgres  (all OK)
```
