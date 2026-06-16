# StardewSeedSearcher Web

纯前端 Web 版星露谷物语种子搜索器。项目 derived from
[CuiYinYin2023/StardewSeedSearcher](https://github.com/CuiYinYin2023/StardewSeedSearcher)
`V1.0 / 0e7d0df08f14f2c342747ca9a22c90d8edc9d892`，保留原项目 MIT License 与原作者版权声明。

当前首版目标是覆盖原项目 V1.0 已有功能，并把搜索任务移到浏览器 Web Worker 中运行，部署形态为静态站点，不需要用户下载 C# 后端或本地启动服务。

## 功能范围

- 天气筛选
- 仙子筛选
- 矿井混合宝箱筛选
- 矿井怪物层筛选
- 沙漠节商人筛选
- 猪车筛选
- 搜索进度、速度、筛选统计、停止搜索、结果简介、复制和导出
- PC / Android / iOS 结果目标沿用原项目说明；Switch JKISS 随机逻辑不在首版范围内

## 技术栈

- React + TypeScript + Vite
- Web Worker 执行搜索
- Vitest 单元测试和 C# oracle golden matrix
- Playwright e2e
- 静态部署兼容 GitHub Pages、Cloudflare Pages、Vercel

## 开发命令

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
npm run dotnet:install
npm run dotnet:local -- --info
npm run fixtures:generate
npm run fixtures:check
npm run bench:search -- --scenario weather-default-1m --range 1000 --repeat 1
```

项目固定使用 Node 22。GitHub Actions 会读取 `.node-version`，本地开发也建议通过 nvm、fnm、mise 或同类工具切到 22 后再执行依赖安装和构建。

## CI

GitHub CI 位于 `.github/workflows/ci.yml`，在 pull request、`main` push 和手动触发时运行：

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run fixtures:check
npm run build
npm run test:e2e -- --project=chromium
```

CI 会安装 Playwright Chromium 及系统依赖。e2e 失败时会上传 `playwright-report/` 和 `test-results/`，用于查看失败截图、trace 和 HTML report。

## Oracle / Parity

`src/search-core` 已按 TDD 方式建立 TypeScript 搜索核心和 C# oracle golden matrix 测试，覆盖 `.NET Random`、Stardew hash helper、日期转换、天气、仙子、矿井宝箱、矿井怪物层、沙漠节、猪车、新旧随机模式和组合搜索输出。

为避免污染全局环境，oracle 使用仓库内隔离的 .NET SDK、NuGet cache 和 dotnet home：

```text
.dotnet/
.dotnet-home/
.nuget/packages/
tools/oracle/upstream/
```

这些目录已在 `.gitignore` 中忽略。生成 fixture 时会自动下载 .NET 9 SDK 到 `.dotnet/`，再把上游 `CuiYinYin2023/StardewSeedSearcher@0e7d0df` 准备到 `tools/oracle/upstream/StardewSeedSearcher`，注入临时 C# runner 并输出 JSON：

```bash
npm run fixtures:generate
```

生成的 golden fixture 位于 `src/search-core/__fixtures__/oracle-sample.json`，Vitest 会按数据驱动 case 比较 TypeScript 输出和 C# oracle 输出。

常用 oracle check：

```bash
npm run fixtures:generate
npm run fixtures:check
npm run test -- src/search-core/search.test.ts
```

`fixtures:check` 会在临时位置重新生成 oracle JSON 并和已提交 fixture 比较，CI 用它防止手工改动或 fixture 漂移。如果更新了 oracle fixture，应确认差异只来自预期的搜索规则或 fixture 样本变更。

## Benchmark / Smoke Check

搜索性能基准位于 `tools/bench/search-benchmark.mjs`，输出 JSON 到 stdout。发布前建议至少跑主场景和交互 smoke check：

```bash
npm run bench:search -- --scenario weather-default-1m --repeat 5
npm run bench:search -- --scenario monster-wide-1m --repeat 3
npm run bench:search -- --scenario cart-normal-1m --repeat 3
npm run bench:search -- --scenario cancel-heavy --repeat 5
npm run build
npm run test:e2e -- --project=chromium
```

浏览器内搜索运行在单 Web Worker 中；worker pool 不是当前默认实现。若后续引入 worker pool，必须保持结果顺序、`outputLimit`、取消语义和进度单调性，详见 `tools/bench/README.md`。

## 部署

这是 Vite 静态应用，构建输出在 `dist/`：

```bash
npm run build
```

Cloudflare Pages、Vercel 或 GitHub Pages 的构建命令使用 `npm run build`，输出目录使用 `dist`。本地和普通静态根路径部署默认使用 `/`。

GitHub Pages project site 由 `.github/workflows/pages.yml` 发布：`main` push 或手动触发时设置 `VITE_BASE_PATH=/StardewSeedSearcher-Web/`，运行 `npm ci && npm run build`，然后上传 `dist/` 到 Pages。其他托管平台如果也部署在子路径，可在构建环境中显式设置对应的 `VITE_BASE_PATH`。

## Attribution

- Upstream source: `CuiYinYin2023/StardewSeedSearcher`
- Baseline: `V1.0 / 0e7d0df08f14f2c342747ca9a22c90d8edc9d892`
- Upstream license copy: `public/upstream/StardewSeedSearcher.LICENSE`
- Upstream README snapshot: `public/upstream/StardewSeedSearcher.README.md`

This project is released under the MIT License. Upstream copyright notice is preserved in `LICENSE`.
