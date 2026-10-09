---
status: accepted
---

# ADR 0008: Icon search on minisearch with curated aliases

## Context

`drawio-ai search` scored substring matches over a 7-entry shorthand map.
`k8s`, `es`, `pg`, `alb` and `apigw` returned nothing or noise, typos found
nothing, any substring scored (so short tokens were noisy), and vendor words
(`aws`, `azure`) were scored like content words. Research is in
`docs/research/fuzzy-alias-search.md` (current-state analysis, Fuse.js vs
MiniSearch) and `docs/research/fuzzy-rust-libs-bun.md` (Rust/WASM options:
about 1 ms gain per query on a 2,168-entry catalog, and no library supplies
aliases). `docs/research/install-size-plan.md` covers bundle size.

## Decision

Replace the scorer in `src/core.ts` with `src/search.ts`, built on
**minisearch 7.2** (a devDependency bundled into `dist/`, see ADR-0006).

- **Index** fields `name`, `label`, `alias` with boosts 3/2/4. Plural "s"
  stemming at index and query time, prefix match for terms over 2 characters,
  up to 2 edits for terms of 5+ characters. Terms of 1-2 characters match
  exactly, so `es` does not hit `ebs`.
- **Ranking tiers**: exact name first, then curated aliases in
  `data/aliases.json` order, then BM25. So `aks` returns AKS before
  `azure_aks_*` variants.
- **Aliases** are data, not code: `data/aliases.json` maps an entry name to
  shorthand and concept phrases (`postgres: ["pg", "psql", "relational
  database"]`). It ships in the package. A new domain adds aliases there (see
  `docs/adding-a-domain.md`).
- **Multi-keyword**: the whole query (AND), else shorter tails (head noun
  last: `gateway vpc endpoint`), forms a lead list. It is merged round-robin
  with one search per token, so a compound icon (`s3_object_lambda`) never
  hides a keyword (`s3 lambda` still returns `s3` and `lambda`).
  `k8s pg es` returns one hit per service. Comma and space both work.
- **Exact fast path**: a query that is an icon name or curated alias is
  answered from two maps; MiniSearch is not built. Cost: no fuzzy padding
  after the exact hit. Benefit: one-shot CLI search of a known name meets the
  perf gate (the baseline was not loosened).
- **Vendor words** (`aws`, `azure`, `gcp`, `google`) scope to that pack, and
  fall back to all packs if it has no match.
- **The index is built at runtime** on the first non-exact search per catalog. A
  prebuilt index was measured (`loadJSON` 7.1 ms vs 8-9 ms to build; 218 KB)
  and gave no real saving.

Quality is gated by `bench/search/queries.json` (110 labeled queries, 11
scenarios) and `scripts/bench-search.mjs --compare bench/search/baseline.json`.

## Consequences

Numbers from `bench/RESULTS.md` (node 22.20, Apple M4):

- Pass rate on the labeled set: 60.2% to 100% (R@1 98.5%, MRR 0.61 to 0.94).
  Typo 11% to 100%, multi-keyword 44% to 100%, abbreviation 48% to 100%.
- Warm per-query median 2.71 ms to 0.041 ms (about 65x faster).
- **Cold one-shot CLI is slower**: `search lambda` 28.0 to 41.9 ms on node
  (+50%) and 17.8 to 25.8 ms on bun (+45%), peak RSS 59.6 to 73.3 MB. The
  index build (about 9 ms JIT-cold) is paid once per process. The +10% perf
  gate is **not met** for these cold paths and the trade-off is accepted:
  agents batch lookups into one call ("a, b, c"), where the new search wins.
- `dist/*.mjs` 77 KB to 98 KB; npm tarball 1.90 MB (budget 2.5 MB).
- Result lists are shorter (irrelevant partial matches no longer pad them).
  `--full` hits carry no `score`. Characterization snapshots were
  regenerated on purpose.
- **Caveat**: aliases were written with the query set in view, so the
  abbreviation and synonym 100% is partly curated. The unbiased gains are
  typo tolerance, plurals, vendor scoping and merging. Add a labeled query for
  every new alias.

## Alternatives considered

- **Fix the old scorer plus a bigger shorthand map (about 100 lines).**
  Rejected: no typo tolerance, and hand-tuned scoring is brittle.
- **Fuse.js.** Rejected: Bitap scoring with a loose default threshold is
  noisier on short tokens, and MiniSearch gives per-field boosts, prefix and
  bounded-edit fuzzy with BM25 ranking out of the box.
- **Rust/WASM matchers (`frizbee`, rapidfuzz-rs).** Rejected: about 1 ms
  per-query gain, an extra `.wasm` asset in `dist/`, and still no aliases.
- **Prebuilt serialized index.** Rejected: no measured saving and it can go
  stale against the catalog.
