# StardewSeedSearcher Web

An unofficial, browser-only Web port of
[CuiYinYin2023/StardewSeedSearcher](https://github.com/CuiYinYin2023/StardewSeedSearcher)
for finding Stardew Valley world seeds that match specific early-game conditions.

Open the Web page, set the seed filters, and start searching. No extra download or local setup is needed for normal use.

> This project is not affiliated with, endorsed by, or maintained by the upstream author. Upstream copyright and MIT License notices are preserved.

## What it does

- Search world seeds directly in the browser.
- Filter by weather, crop fairy, mixed mine chests, monster floors, Desert Festival vendors, and traveling cart entries.
- Show progress, speed, per-filter pass counts, and whether the search stopped early because the output limit was reached.
- Stop an active search, inspect seed details, copy seed numbers, or export results.
- Use Chinese or English UI copy.
- Deploy as a static Vite site on GitHub Pages, Cloudflare Pages, Vercel, or any static host.

## Current baseline

| Area | Status |
| --- | --- |
| Upstream source | `CuiYinYin2023/StardewSeedSearcher` |
| Baseline | `V1.0 / 0e7d0df08f14f2c342747ca9a22c90d8edc9d892` |
| Stardew Valley target | `1.6.15` |
| Result targets | PC / Android / iOS |
| Switch JKISS random logic | Not included in the first Web release |

## Quick start

Use Node 22 from `.node-version`.

```bash
npm install
npm run dev
```

Open the Vite URL printed by the dev server, usually `http://localhost:5173`.

For a production build:

```bash
npm run build
```

The static output is written to `dist/`.

## Common commands

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run fixtures:check
npm run parity:sample:ci
npm run parity:sample -- --seed 20260616 --cases 500 --window 2000
npm run bench:search -- --scenario weather-default-1m --repeat 5
```

When changing deterministic search behavior, regenerate and review oracle fixtures:

```bash
npm run fixtures:generate
npm run fixtures:check
npm run test -- src/search-core/search.test.ts
```

## Project layout

```text
src/App.tsx                 Main React UI
src/App.css                 App styling
src/search.worker.ts        Browser Web Worker entrypoint
src/search-core/            Deterministic search logic, predictors, fixtures, tests
src/assets/                 Bundled UI images
e2e/                        Playwright functional and visual audit tests
tools/oracle/               C# upstream fixture generation tooling
tools/bench/                Search benchmark scenarios
public/upstream/            Upstream license and README snapshots
```

## Search-core parity

`src/search-core` is covered by Vitest tests and a C# oracle golden matrix. The fixture suite covers `.NET Random`, Stardew hash helpers, date conversion, weather, crop fairy, mine chests, monster floors, Desert Festival vendors, traveling cart behavior, legacy random mode, and combined search output.

Oracle tooling intentionally uses repo-local caches so it does not modify the global machine setup:

```text
.dotnet/
.dotnet-home/
.nuget/packages/
tools/oracle/upstream/
```

These paths are ignored by git. `npm run fixtures:generate` downloads the required .NET SDK into `.dotnet/`, prepares upstream source under `tools/oracle/upstream/StardewSeedSearcher`, runs a temporary C# fixture runner, and writes `src/search-core/__fixtures__/oracle-sample.json`.

The committed golden fixture is a fixed, hand-picked deterministic matrix for core edges and known representative scenarios. Random parity sampling adds another layer: it uses a fixed RNG seed to generate reproducible random `SearchRequest` cases, runs each case through both the TypeScript search core and pinned C# oracle, then compares found seed lists and found seed details. The sampler currently covers weather, crop fairy, mine chests, monster floors, Desert Festival vendors, traveling cart, legacy random mode, single-feature requests, and mixed-feature requests.

CI runs a lightweight sampler gate:

```bash
npm run parity:sample:ci
# equivalent to:
npm run parity:sample -- --seed 20260616 --cases 50 --window 2000
```

For release checks, increase the sample count locally:

```bash
npm run parity:sample -- --seed 20260616 --cases 500 --window 2000
```

If sampling fails, the output includes the sampler seed, case index, generated request JSON, TypeScript result, and C# oracle result. Reproduce one failed case with:

```bash
npm run parity:sample -- --seed 20260616 --case-index 17 --window 2000
```

Random sampling improves parity confidence, but it is not an exhaustive proof over every seed and condition combination.

## CI and deployment

GitHub CI is defined in `.github/workflows/ci.yml` and runs:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run fixtures:check
npm run parity:sample:ci
npm run build
npm run test:e2e -- --project=chromium
```

GitHub Pages publishing is defined in `.github/workflows/pages.yml`. It sets `VITE_BASE_PATH=/StardewSeedSearcher-Web/`, builds the app, and deploys `dist/`. Other static hosts can use `npm run build` with output directory `dist`; set `VITE_BASE_PATH` only when deploying under a subpath.

## Benchmark smoke checks

Before release, run at least the main benchmark scenarios plus a browser smoke check:

```bash
npm run bench:search -- --scenario weather-default-1m --repeat 5
npm run bench:search -- --scenario monster-wide-1m --repeat 3
npm run bench:search -- --scenario cart-normal-1m --repeat 3
npm run bench:search -- --scenario cancel-heavy --repeat 5
npm run build
npm run test:e2e -- --project=chromium
```

The browser currently uses one Web Worker. If a worker pool is added later, preserve result order, `outputLimit`, cancellation semantics, and monotonic progress reporting.

## Attribution

- Upstream source: [CuiYinYin2023/StardewSeedSearcher](https://github.com/CuiYinYin2023/StardewSeedSearcher)
- Baseline: `V1.0 / 0e7d0df08f14f2c342747ca9a22c90d8edc9d892`
- Upstream license copy: `public/upstream/StardewSeedSearcher.LICENSE`
- Upstream README snapshot: `public/upstream/StardewSeedSearcher.README.md`

This project is released under the MIT License. The upstream copyright notice is preserved in `LICENSE`.
