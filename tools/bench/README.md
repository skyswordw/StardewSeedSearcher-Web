# Search Benchmarks

Run the search benchmark harness with:

```sh
npm run bench:search -- --scenario weather-default-1m --range 1000 --repeat 1
```

The runner writes JSON to stdout so results can be archived or compared by other tools. By default it runs the benchmark-first scenario set over one million seeds:

- `weather-default-1m`
- `weather-legacy-1m`
- `minechest-1m`
- `monster-wide-1m`
- `cart-normal-1m`
- `cart-skillbook-1m`
- `combined-cheap-first-1m`
- `cancel-heavy`

Each scenario reports per-run elapsed time, seeds per second, checked/found counts, progress event count, first progress latency, cancel latency where applicable, and median/p95 summaries.

## Worker Pool Comparison

Use `--compare-pool` to run each synchronous scenario twice: once through the single-threaded search baseline and once through a Node `worker_threads` pool that uses the same seed chunking thresholds as the browser worker pool:

```sh
npm run bench:search -- --scenario upstream-feedback-mixed-heavy --range 10k --repeat 3 --compare-pool
```

Pass one or more worker counts to sweep machine-specific settings. The automatic default stays conservative at `min(8, available cores - 1)`, while explicit values can use more of the machine up to `available cores - 1`:

```sh
npm run bench:search -- --scenario upstream-feedback-mixed-heavy --range 1m --repeat 5 --compare-pool --pool-workers 1,2,4,8,16,31
```

The pooled benchmark reports worker setup time separately and reuses the pool across repeated runs. It is still a Linux throughput baseline, not a browser UI latency measurement, because Node `worker_threads` and Vite SSR loading differ from Vite's bundled Web Worker path.
