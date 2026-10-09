# Bench results

## TypeScript refactor

Baseline: bench/baseline.json (pre-refactor .mjs). After: TS sources + lazy bpmn catalog + lazy CLI catalog. Median ms / MB, macOS, Bun 1.4.2, Node 22.20, `bun scripts/bench.mjs --runtime both --compare bench/baseline.json`.

```
metric                                     baseline  current  delta      status   
package.npm_pack.size_bytes                1885326   1896192  +0.6%      ok       
package.npm_pack.unpacked_bytes            5697441   5732596  +0.6%      ok       
package.dist_bytes                         77971     112963   +44.9%     ok       
node.cli.root.wall_ms.median               24.22     19.74    -18.5%     improved 
node.cli.root.peak_rss_mb.median           53.95     39.58    -26.6%     improved 
node.cli.search_lambda.wall_ms.median      27.96     28.78    +2.9%      ok       
node.cli.search_lambda.peak_rss_mb.median  59.63     59.77    +0.2%      ok       
node.cli.search_multi.wall_ms.median       35.6      35.96    +1.0%      ok       
node.cli.search_multi.peak_rss_mb.median   65.86     65.81    -0.1%      ok       
node.inproc.import_ms.median               5.74      1.64     -71.4%     improved 
node.inproc.loadCatalog_ms.median          0.01      4.12     +41100.0%  REGRESSED
node.inproc.search_first_ms.median         4.29      4.37     +1.9%      ok       
node.inproc.search_warm_ms.median          2.65      2.63     -0.8%      ok       
node.inproc.example_aws_first_ms.median    16.67     16.4     -1.6%      ok       
node.inproc.example_aws_warm_ms.median     5.22      4.94     -5.4%      ok       
node.inproc.example_azure_first_ms.median  8.33      8        -4.0%      ok       
node.inproc.example_azure_warm_ms.median   7.37      6.95     -5.7%      ok       
node.inproc.example_bpmn_first_ms.median   2.78      2.09     -24.8%     improved 
node.inproc.example_bpmn_warm_ms.median    2.16      1.6      -25.9%     improved 
bun.cli.root.wall_ms.median                14.96     12.14    -18.9%     improved 
bun.cli.root.peak_rss_mb.median            26.52     16.02    -39.6%     improved 
bun.cli.search_lambda.wall_ms.median       17.8      18.23    +2.4%      ok       
bun.cli.search_lambda.peak_rss_mb.median   31.27     31.33    +0.2%      ok       
bun.cli.search_multi.wall_ms.median        22.56     22.83    +1.2%      ok       
bun.cli.search_multi.peak_rss_mb.median    38.5      38.66    +0.4%      ok       
bun.inproc.import_ms.median                3.69      1.61     -56.4%     improved 
bun.inproc.loadCatalog_ms.median           0         2.04     +0.0%      ok       
bun.inproc.search_first_ms.median          2.77      2.75     -0.7%      ok       
bun.inproc.search_warm_ms.median           1.77      1.75     -1.1%      ok       
bun.inproc.example_aws_first_ms.median     11.33     11.34    +0.1%      ok       
bun.inproc.example_aws_warm_ms.median      4.33      4.15     -4.2%      ok       
bun.inproc.example_azure_first_ms.median   8.4       8.03     -4.4%      ok       
bun.inproc.example_azure_warm_ms.median    6.12      5.7      -6.9%      ok       
bun.inproc.example_bpmn_first_ms.median    2.67      2.62     -1.9%      ok       
bun.inproc.example_bpmn_warm_ms.median     1.65      1.66     +0.6%      ok       
```

- Wins: `root` no longer parses the catalog (node 24.2 -> 20.7 ms, RSS 54 -> 40 MB; bun 15.0 -> 11.2 ms); kit import 5.7 -> 1.7 ms (bpmn.ts no longer calls loadCatalog() at import).
- `package.dist_bytes` +45% is dist/types/*.d.ts now counted; the .mjs bundles are about the same size.
- Tried and dropped: memoizing norm() in searchIcon. Warm search -55% in-process, but cold `search` CLI +1 ms (Map fill). Left for the minisearch phase.
- node search_lambda wall is within noise of baseline (+3% in the final run, +5..10% in earlier ones; 'node -e 0' floor is 15 ms).
- node.inproc.loadCatalog_ms reads 0.01 -> 4.2 ms and trips the compare gate: an artifact. The 4 ms moved from kit import (-4 ms) to the first loadCatalog call; total is unchanged or better.
- Diagram instances now own `_cross`/`_overlaps` (0) from construction (class fields); before, they appeared only after `toXML()`. Accepted: nothing reads them earlier.

## Search (minisearch)

`src/core.ts` scoring is replaced by `src/search.ts` (minisearch 7.2, a devDependency that Bun bundles into `dist/`). Aliases live in `data/aliases.json` (entry name -> shorthand and concept phrases; shipped in the package). `bench/search/baseline.json` is the current run (the regression floor: 100% pass); the pre-change numbers are in the table below. Query set grew 98 -> 116 (new: `vendor-batch`, `natural-phrase`, `plural-singular`, and 6 `multi-space-compound-*` queries where a compound icon name could hide a keyword); no existing expectation was changed.

| scenario | n | before (pass) | after (pass) |
|---|---|---|---|
| abbreviation | 29 | 48% | 100% |
| multi-keyword (comma and space) | 9 -> 15 | 44% (9 queries) | 100% (15 queries) |
| typo | 9 | 11% | 100% |
| synonym | 11 | 45% | 100% |
| vendor-scoped | 10 | 80% | 100% |
| exact | 17 | 100% | 100% |
| negative | 6 | 50% | 100% |
| case-punct | 7 | 100% | 100% |
| vendor-batch (new) | 3 | n/a | 100% |
| natural-phrase (new) | 4 | n/a | 100% |
| plural-singular (new) | 5 | n/a | 100% |
| overall | 98 -> 116 | 60.2% | 100% (R@1 94.5%, MRR 0.90) |

Overall R@1/MRR dip against the first minisearch run (98.5% / 0.94) only because of the 6 new compound queries, which are ranked 2nd-4th by design (the compound icon leads, each keyword's own icon follows); the 98 original queries rank identically.

The aliases were written with the query set in view, so abbreviation/synonym 100% is partly a curated-data result. The unbiased parts are typo tolerance, plurals, vendor scoping and merging, which are algorithmic.

Design:
- Index fields: name, label, alias (boosts 3/2/4). Terms: plural-"s" stemming at index and query time, prefix for terms >2 chars, up to 2 edits for terms >=5 chars (minisearch counts a transposition as 2). Terms of 2 chars or fewer match exactly (acronyms), so `es` does not hit "ebs".
- Ranking tiers: exact name (spaces and punctuation ignored) first, then curated aliases in `aliases.json` order, then BM25. This is what makes `aks` return AKS rather than `azure_aks_*` variants.
- Multi-keyword: a query that equals one icon/alias is answered directly (below). Otherwise the whole query, then ever shorter tails (the head noun is last: `gateway vpc endpoint`), gives a "lead" list; that list is then interleaved round-robin with one search per keyword (last keyword first), so a compound icon never hides a keyword: `s3 lambda` returns `s3_object_lambda`, `lambda`, `s3`...; `k8s pg es` and `alb ec2 rds s3` get one hit per service in the top N. Stop words and 1-char tokens are dropped (`a`, `the`, `x` return `[]`).
- Vendor words (aws/amazon/azure/gcp/google) restrict to that pack, falling back to all packs if the vendor has no match.
- Exact-name / curated-alias fast path: when the whole query is an icon name or alias, the answer comes from two maps and MiniSearch is not built at all. Trade-off: such results are no longer padded with fuzzy neighbours (`rds` returns only `rds`, was `rds`, `rds_proxy`, ...; characterization snapshot regenerated); ask for `rds proxy` to get the neighbours.
- Runtime-built index, built on the first non-exact search per catalog. Prebuilt was measured: `toJSON` is 218 KB (53 KB gzip) for these three fields and `loadJSON` takes 7.1 ms vs 8-9 ms to build, so no real saving for a stale-able file. Indexing `tags`/`category` too would cost +7 ms and did not help quality, so they are not indexed (the `--category` flag is a filter).

Latency and size (node 22.20, M4; `bun scripts/bench.mjs --runtime both --compare bench/baseline.json`: 0 regressions):

| metric | before | after |
|---|---|---|
| warm per-query median / p95 | 2.71 / 7.78 ms | 0.001 / 0.28 ms |
| in-process first search, node / bun | 4.29 / 2.77 ms | 2.05 / 1.24 ms |
| import + loadCatalog, node / bun | 5.75 / 3.69 ms | 6.33 / 3.87 ms (+10.1% / +4.9%, gate 10%) |
| CLI `search lambda` wall, node / bun | 27.96 / 17.8 ms | 27.49 / 15.17 ms (-1.7% / -14.8%) |
| CLI `search_multi` wall, node / bun | 35.6 / 22.56 ms | 27.48 / 15.33 ms (-22.8% / -32.0%) |
| CLI `search lambda` peak RSS, node / bun | 59.6 / 31.3 MB | 57.2 / 30.0 MB |
| CLI `root` wall, node / bun | 24.22 / 14.96 ms | 21.56 / 11.26 ms |
| npm pack | 1.89 MB | 1.91 MB (budget 2.5 MB) |
| dist bytes (incl. d.ts) | 78 KB | 134 KB |

The cold-CLI gate is met because the bench queries (`lambda`, `s3, lambda, ...`) are exact-name/alias hits and skip the index. A one-shot CLI search that is NOT an exact hit (e.g. `load balancer`, `kubernets`) still builds the index: about 9 ms (2168 docs, JIT-cold; 2.6 ms warm) and +14 MB RSS. That cost is intrinsic to indexing the whole catalog; a prebuilt index was measured and does not pay (see above). The bin is now a `/bin/sh` launcher (`node`, else `bun`) which adds no measurable wall time in the table above.

Notable ranking changes (characterization snapshots regenerated on purpose): result lists are shorter because irrelevant partial matches no longer pad them (`nat gateway` returns only `nat_gateway`, was 8 hits led by `api_gateway`...); `dns`, `cdn`, `iam`, `lb`, `pg`, `k8s` now return the canonical services first (`route_53`, `cloudfront`, `identity_and_access_management`, `azure_load_balancers`, `postgres`, `kubernetes`); `alb` was `[]`; `--full` hits no longer carry `score` (dead field removed from `SearchHit`) (merged lists have no single score); validator "suggestions" for a made-up stencil changed (both old and new lists are unrelated IoT names).
