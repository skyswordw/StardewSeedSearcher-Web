# Linux Worker Pool Benchmark - 2026-06-17

Environment:

- Platform: Linux
- Node used for benchmark: `v22.22.3` via `npx -p node@22`
- Host reported parallelism: `availableParallelism() = 32`, `os.cpus().length = 32`
- Search range uses inclusive seed windows.
- The Node benchmark uses `worker_threads` plus Vite SSR loading. It is a Linux throughput baseline for the browser worker-pool chunking model, not an exact browser startup-latency measurement.

Upstream reference:

- `ProgramWeb.cs` uses `Math.Max(1, Environment.ProcessorCount - 1)` for `MaxDegreeOfParallelism`.
- No user-configurable upstream maximum parallelism was found in the checked-out C# Web code.

## Commands

```sh
npm_config_cache="$PWD/tools/oracle/.cache/npm" npx -y -p node@22 -p npm@10 npm run bench:search -- --scenario upstream-feedback-mixed-heavy --range 1m --repeat 3 --compare-pool --pool-workers 1,2,4,8
npm_config_cache="$PWD/tools/oracle/.cache/npm" npx -y -p node@22 -p npm@10 npm run bench:search -- --scenario upstream-feedback-mixed-heavy --range 1m --repeat 1 --compare-pool --pool-workers 16,31
npm_config_cache="$PWD/tools/oracle/.cache/npm" npx -y -p node@22 -p npm@10 npm run bench:search -- --scenario weather-default-1m --range 250k --repeat 3 --compare-pool --pool-workers 1,2,4,8
```

## Results

`upstream-feedback-mixed-heavy`, 1,000,000 seeds, repeat 3:

| Mode | Requested workers | Actual workers | Median elapsed | Median seeds/sec | Speedup vs sync | Median setup | Chunks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sync search-core | - | - | 6829.625 ms | 146,421 | 1.00x | - | - |
| Node worker pool | 1 | 1 | 7015.307 ms | 142,545 | 0.97x | 152.107 ms | 1 |
| Node worker pool | 2 | 2 | 3520.905 ms | 284,018 | 1.94x | 162.125 ms | 16 |
| Node worker pool | 4 | 4 | 1954.877 ms | 511,541 | 3.49x | 179.499 ms | 20 |
| Node worker pool | 8 | 4 | 1960.869 ms | 509,978 | 3.48x | 173.900 ms | 20 |

High-worker probe for `upstream-feedback-mixed-heavy`, 1,000,000 seeds, repeat 1:

| Mode | Requested workers | Actual workers | Elapsed | Seeds/sec | Speedup vs same-run sync | Setup | Chunks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sync search-core | - | - | 6887.845 ms | 145,183 | 1.00x | - | - |
| Node worker pool | 16 | 16 | 901.144 ms | 1,109,700 | 7.64x | 322.097 ms | 20 |
| Node worker pool | 31 | 20 | 661.433 ms | 1,511,869 | 10.41x | 354.873 ms | 20 |

`weather-default-1m`, 250,000 seeds, repeat 3:

| Mode | Requested workers | Actual workers | Median elapsed | Median seeds/sec | Speedup vs sync | Median setup | Chunks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sync search-core | - | - | 8969.676 ms | 27,872 | 1.00x | - | - |
| Node worker pool | 1 | 1 | 9128.254 ms | 27,387 | 0.98x | 155.016 ms | 1 |
| Node worker pool | 2 | 2 | 5578.882 ms | 44,812 | 1.61x | 154.315 ms | 5 |
| Node worker pool | 4 | 2 | 5593.078 ms | 44,698 | 1.60x | 153.744 ms | 5 |
| Node worker pool | 8 | 2 | 5609.467 ms | 44,568 | 1.60x | 153.844 ms | 5 |

## Interpretation

- Worker-pool search improves throughput on heavy searches. The 1m mixed-heavy benchmark reached about 3.5x at 4 actual workers in the repeat-3 run.
- Explicit high worker counts can help on this 32-way Linux host. In the high-worker probe, requested 31 workers resolved to 20 actual workers because the chunker enforces a minimum chunk size of 50,000 seeds for a 1m range; that still reached about 10.4x versus the same-run sync baseline.
- One worker is slightly slower than sync because the Node benchmark pays worker messaging and SSR loading overhead without parallelism.
- Smaller ranges do not always use the requested worker count. The 250k weather run capped at 2 actual workers, because `ceil(total / 50_000)` limits useful chunk parallelism.
- Default UI behavior should remain conservative at up to 8 workers. User-entered high values can align with the machine's reported concurrency minus one, but browsers expose `navigator.hardwareConcurrency`, which is usually logical/reported concurrency and may be privacy-capped rather than exact physical core count.
