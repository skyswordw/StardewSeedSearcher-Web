# Repository Guidelines

## Project Structure & Module Organization

This is a React + TypeScript + Vite static app for StardewSeedSearcher Web.

- `src/App.tsx` and `src/App.css` contain the main UI.
- `src/search-core/` contains deterministic search logic, predictors, fixtures, and Vitest coverage.
- `src/search.worker.ts` runs searches in a Web Worker.
- `src/assets/` stores bundled images; `public/upstream/` preserves upstream license/README snapshots.
- `e2e/` contains Playwright functional and visual audit tests.
- `tools/oracle/` and `tools/bench/` contain fixture generation and benchmark tooling.

Do not commit generated or local cache output such as `node_modules/`, `dist/`, `.dotnet/`, `.dotnet-home/`, `.nuget/`, `test-results/`, `playwright-report/`, or `tools/oracle/upstream/`.

## Build, Test, and Development Commands

Use Node 22 from `.node-version`.

- `npm install` or `npm ci`: install dependencies.
- `npm run dev`: start the local Vite server.
- `npm run typecheck`: run TypeScript project checks.
- `npm run lint`: run ESLint.
- `npm run test`: run Vitest unit/parity tests.
- `npm run test:e2e`: run Playwright tests across configured projects.
- `npm run build`: typecheck and build `dist/`.
- `npm run fixtures:generate`: regenerate committed oracle fixture JSON.
- `npm run fixtures:check`: detect fixture drift without rewriting tracked files.
- `npm run bench:search -- --scenario weather-default-1m --repeat 5`: run search benchmarks.

## Coding Style & Naming Conventions

Use TypeScript, React function components, 2-space indentation, single quotes, and no semicolons, matching the existing code. Prefer explicit types for shared data contracts in `src/search-core/`. Keep UI copy neutral: product name is `StardewSeedSearcher Web`, and attribution should state this is an unofficial Web port.

## Testing Guidelines

Add Vitest tests next to code as `*.test.ts`. Search-core changes should extend the golden fixture or add data-driven assertions. UI changes should update Playwright coverage in `e2e/`; stable screenshot changes require updating the committed Chromium baselines. Run `npm run test:e2e` after UI, worker, or browser-compatibility changes.

## Commit & Pull Request Guidelines

History uses short, imperative commit subjects, for example `Improve Safari compatibility` and `Clarify unofficial Web port branding`. Keep commits focused. PRs should describe user-visible changes, list verification commands, note fixture or screenshot updates, and include screenshots for UI changes. Link related issues when available.

## Attribution & Oracle Notes

Preserve `LICENSE`, `public/upstream/*`, and oracle provenance metadata. C# is generation-only tooling for oracle fixtures; do not introduce it as a runtime dependency.
