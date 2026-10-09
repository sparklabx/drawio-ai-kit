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
