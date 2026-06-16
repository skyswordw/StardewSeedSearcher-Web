# Oracle Fixtures

This directory contains the C# parity oracle tooling.

Baseline:

- Repository: `https://github.com/CuiYinYin2023/StardewSeedSearcher`
- Commit/tag: `0e7d0df08f14f2c342747ca9a22c90d8edc9d892` / `V1.0`
- License: MIT, preserved in `public/upstream/StardewSeedSearcher.LICENSE`

The oracle intentionally avoids global .NET installation. `npm run fixtures:generate` installs .NET 9 SDK into the repository-local `.dotnet/` directory when needed, uses `.dotnet-home/` for CLI state, uses `.nuget/packages/` for NuGet cache, prepares the upstream checkout under `tools/oracle/upstream/`, injects a temporary C# runner, and writes:

```text
src/search-core/__fixtures__/oracle-sample.json
```

Run:

```bash
npm run dotnet:local -- --info
npm run fixtures:generate
```

The generated fixture is committed and used by Vitest parity checks.

Random parity sampling complements the committed golden matrix. It generates reproducible random
`SearchRequest` cases with a fixed sampler seed, runs both TypeScript search-core and the pinned C#
oracle, and compares found seeds plus found seed details.

Run the CI-sized sample:

```bash
npm run parity:sample:ci
```

Run a larger local release sample:

```bash
npm run parity:sample -- --seed 20260616 --cases 500 --window 2000
```

Failures print the sampler seed, case index, generated request JSON, TypeScript result, and C# oracle
result. Reproduce one failing case with:

```bash
npm run parity:sample -- --seed 20260616 --case-index 17 --window 2000
```

This randomized sampler is a statistical parity check, not an exhaustive proof over every possible
seed and condition combination.
