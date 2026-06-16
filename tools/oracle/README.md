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
