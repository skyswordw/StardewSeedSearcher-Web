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

## Worker Pool Follow-Up Constraints

This benchmark intentionally does not implement a worker pool. Use these constraints before introducing one:

- Preserve the current single-search semantics first: same normalized request, same output ordering, same `outputLimit`, and same found details.
- Keep progress monotonic across shards. A pool-level aggregator must never emit a lower checked count or percent than a prior progress event.
- Cancellation latency must stay measurable. Pool cancellation should abort queued work and active shards, then report a complete message with `cancelled: true`.
- Avoid unbounded message volume. Aggregate progress on a fixed cadence or checked-count interval instead of forwarding every shard event directly.
- Keep deterministic benchmark coverage. Add pooled variants beside these scenarios and compare against the single-core baseline before changing production defaults.
