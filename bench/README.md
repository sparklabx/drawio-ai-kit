# Performance baseline

`scripts/bench.mjs` is a black-box benchmark. It only touches `dist/cli.mjs` and `dist/kit.mjs`, so the same
harness proves that the TypeScript refactor, the minisearch swap, and the import changes did not make the kit slower.

## Run

```sh
node scripts/bench.mjs --runtime both                    # print JSON (node + bun)
bun  scripts/bench.mjs --runtime both --out bench/baseline.json   # refresh the baseline
node scripts/bench.mjs --compare bench/baseline.json     # delta table; exit 1 on regression
```

Flags: `--runtime node|bun|both` (default both), `--runs N` (15), `--warmup N` (3), `--out <file>`,
`--compare <baseline.json>`, `--tolerance 0.10`, `--min-abs-ms 2`, `--min-abs-bytes 1048576`.

Rebuild `dist/` (`bun run build`) before you compare. The harness measures what is in `dist/`.

## What it measures

| Group | Metric | How |
|---|---|---|
| `<rt>.cli.{root,search_lambda,search_multi}` | `wall_ms`, `peak_rss_mb` | Spawns `<rt> dist/cli.mjs root`, `search lambda`, `search "k8s, pg, es"` in a fresh process. RSS comes from `/usr/bin/time -l` (macOS) or `-v` (GNU). If neither exists, RSS is `null`. |
| `<rt>.inproc.import_ms` | import `dist/kit.mjs` | One fresh child per run. Today this includes the default catalog parse, because `bpmn` calls `loadCatalog()` when it is imported. |
| `<rt>.inproc.loadCatalog_ms` | `loadCatalog()` | Today this only reads the memoized cache (about 0 ms). If a refactor moves the parse out of import, the cost moves from `import_ms` to here. Compare the two together. |
| `<rt>.inproc.search_first_ms` / `search_warm_ms` | `searchIcon` | The first call includes lazy pack loading. The warm value is the median of 200 calls over 5 queries. |
| `<rt>.inproc.example_{aws,azure,bpmn}_{first,warm}_ms` | end-to-end build + validate + mxfile | Copies `examples/aws/build_serverless.mjs`, `azure/build_azure_vnet.mjs`, and `bpmn/build_bpmn.mjs` to a temp dir and rewrites their imports to `dist/kit.mjs`. It works with `../../src/*`, `drawio-ai-kit`, and absolute paths. |
| `package` | `npm_pack.size_bytes`, `unpacked_bytes`, `dist_bytes` | `npm pack --dry-run --json` and a byte count of `dist/`. |

Each metric records `median`, `p95`, and `n`. `--compare` checks only the medians and the `*_bytes` values.
A metric counts as a regression only when it is worse by more than `--tolerance` **and** by more than the absolute floor.
The floors are 2 ms for times, 1 MB for RSS, and 1 MiB for bytes, so sub-millisecond noise does not fail the run.

## Baseline (commit 5085063, Apple M4, node 22.20.0, bun 1.4.2)

| Metric (median ms) | node | bun |
|---|---|---|
| cli root | 24.2 | 15.0 |
| cli search lambda | 28.0 | 17.8 |
| cli search "k8s, pg, es" | 35.6 | 22.6 |
| peak RSS search multi (MB) | 65.9 | 38.5 |
| import kit (incl. catalog parse) | 5.7 | 3.7 |
| first search / warm search | 4.3 / 2.65 | 2.8 / 1.8 |
| example aws / azure / bpmn (first) | 16.7 / 8.3 / 2.8 | 11.3 / 8.4 / 2.7 |

Package: 1,885,326 B packed, 5,697,441 B unpacked, 74 files. `dist/` is 77,971 B.
