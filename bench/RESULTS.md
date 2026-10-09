# Bench results

## TypeScript refactor

Baseline: bench/baseline.json (pre-refactor .mjs). After: TS sources + lazy bpmn catalog + lazy CLI catalog. Median ms / MB, macOS, Bun 1.4.2, Node 22.20, `bun scripts/bench.mjs --runtime both --compare bench/baseline.json`.

```
metric                                     baseline  current  delta      status   
package.npm_pack.size_bytes                1885326   1896255  +0.6%      ok       
package.npm_pack.unpacked_bytes            5697441   5732826  +0.6%      ok       
package.dist_bytes                         77971     113189   +45.2%     ok       
node.cli.root.wall_ms.median               24.22     20.7     -14.5%     improved 
node.cli.root.peak_rss_mb.median           53.95     39.58    -26.6%     improved 
node.cli.search_lambda.wall_ms.median      27.96     30.65    +9.6%      ok       
node.cli.search_lambda.peak_rss_mb.median  59.63     59.75    +0.2%      ok       
node.cli.search_multi.wall_ms.median       35.6      37.32    +4.8%      ok       
node.cli.search_multi.peak_rss_mb.median   65.86     65.77    -0.1%      ok       
node.inproc.import_ms.median               5.74      1.7      -70.4%     improved 
node.inproc.loadCatalog_ms.median          0.01      4.23     +42200.0%  REGRESSED
node.inproc.search_first_ms.median         4.29      4.46     +4.0%      ok       
node.inproc.search_warm_ms.median          2.65      2.64     -0.4%      ok       
node.inproc.example_aws_first_ms.median    16.67     16.52    -0.9%      ok       
node.inproc.example_aws_warm_ms.median     5.22      4.99     -4.4%      ok       
node.inproc.example_azure_first_ms.median  8.33      8.21     -1.4%      ok       
node.inproc.example_azure_warm_ms.median   7.37      7.05     -4.3%      ok       
node.inproc.example_bpmn_first_ms.median   2.78      2.09     -24.8%     improved 
node.inproc.example_bpmn_warm_ms.median    2.16      1.62     -25.0%     improved 
bun.cli.root.wall_ms.median                14.96     11.21    -25.1%     improved 
bun.cli.root.peak_rss_mb.median            26.52     16       -39.7%     improved 
bun.cli.search_lambda.wall_ms.median       17.8      16.5     -7.3%      ok       
bun.cli.search_lambda.peak_rss_mb.median   31.27     31.31    +0.1%      ok       
bun.cli.search_multi.wall_ms.median        22.56     21.41    -5.1%      ok       
bun.cli.search_multi.peak_rss_mb.median    38.5      38.25    -0.6%      ok       
bun.inproc.import_ms.median                3.69      1.61     -56.4%     improved 
bun.inproc.loadCatalog_ms.median           0         1.98     +0.0%      ok       
bun.inproc.search_first_ms.median          2.77      2.74     -1.1%      ok       
bun.inproc.search_warm_ms.median           1.77      1.78     +0.6%      ok       
bun.inproc.example_aws_first_ms.median     11.33     11.03    -2.6%      ok       
bun.inproc.example_aws_warm_ms.median      4.33      4.13     -4.6%      ok       
bun.inproc.example_azure_first_ms.median   8.4       8.17     -2.7%      ok       
bun.inproc.example_azure_warm_ms.median    6.12      5.78     -5.6%      ok       
bun.inproc.example_bpmn_first_ms.median    2.67      2.63     -1.5%      ok       
bun.inproc.example_bpmn_warm_ms.median     1.65      1.68     +1.8%      ok       
```

- Wins: `root` no longer parses the catalog (node 24.2 -> 20.7 ms, RSS 54 -> 40 MB; bun 15.0 -> 11.2 ms); kit import 5.7 -> 1.7 ms (bpmn.ts no longer calls loadCatalog() at import).
- `package.dist_bytes` +45% is dist/types/*.d.ts now counted; the .mjs bundles are about the same size.
- Tried and dropped: memoizing norm() in searchIcon. Warm search -55% in-process, but cold `search` CLI +1 ms (Map fill). Left for the minisearch phase.
- node search_lambda wall is within noise of baseline (+5..10% across runs; 'node -e 0' floor is 15 ms).
- node.inproc.loadCatalog_ms reads 0.01 -> 4.2 ms and trips the compare gate: an artifact. The 4 ms moved from kit import (-4 ms) to the first loadCatalog call; total is unchanged or better.
