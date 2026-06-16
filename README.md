# StardewSeedSearcher Web

星露谷物语种子搜索器的非官方 Web 版。打开网页，设置筛选条件，就可以直接搜索符合目标事件的世界种子；普通使用不需要下载桌面程序，也不需要配置本地环境。

基于 [CuiYinYin2023/StardewSeedSearcher](https://github.com/CuiYinYin2023/StardewSeedSearcher) 移植，保留原项目 MIT License 与原作者版权声明。本项目不隶属于原作者，也不代表原项目官方维护版本。

## 功能亮点

- 在网页中直接搜索 Stardew Valley 世界种子。
- 支持天气、仙子、混合矿井宝箱、怪物层、沙漠节商人、猪车等筛选条件。
- 显示搜索进度、速度、筛选通过数量和提前停止状态。
- 支持停止搜索、查看种子详情、复制种子号和导出结果。
- 提供中文和英文界面。
- 可作为静态站点部署到 GitHub Pages、Cloudflare Pages、Vercel 或其他静态托管平台。

## 当前范围

| 项目 | 说明 |
| --- | --- |
| 上游来源 | `CuiYinYin2023/StardewSeedSearcher` |
| 移植基线 | `V1.0` |
| 星露谷版本 | `1.6.15` |
| 当前预测目标 | PC / Android / iOS；暂不覆盖 Switch 版随机逻辑 |

## 快速开始

本项目使用 `.node-version` 指定的 Node 22。

```bash
npm install
npm run dev
```

开发服务器启动后，打开终端输出的 Vite 地址，通常是 `http://localhost:5173`。

生产构建：

```bash
npm run build
```

构建产物会输出到 `dist/`。

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/skyswordw/StardewSeedSearcher-Web)

## 常用命令

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

如果修改了确定性搜索逻辑，建议重新生成并检查 oracle fixture：

```bash
npm run fixtures:generate
npm run fixtures:check
npm run test -- src/search-core/search.test.ts
```

## 项目结构

```text
src/app/                    React 主界面、组件、UI 类型和页面样式
src/runtime/                浏览器兼容性辅助函数
src/workers/                浏览器搜索任务入口
src/i18n/                   中英文界面文案
src/search-core/            确定性搜索逻辑、预测器、fixture 和测试
src/assets/                 应用内图片资源
e2e/                        Playwright 功能和视觉测试
tools/oracle/               C# 上游 oracle fixture 工具
tools/bench/                搜索性能 benchmark 场景
public/upstream/            上游 license 与 README 快照
```

## 搜索一致性校验

`src/search-core` 使用 Vitest 和 C# oracle golden matrix 做一致性测试，覆盖 `.NET Random`、Stardew hash helper、日期转换、天气、仙子、矿井宝箱、怪物层、沙漠节商人、猪车、旧随机模式和组合搜索输出。

oracle 工具使用仓库内隔离缓存，避免污染全局环境：

```text
.dotnet/
.dotnet-home/
.nuget/packages/
tools/oracle/upstream/
```

这些路径已被 git 忽略。`npm run fixtures:generate` 会下载所需 .NET SDK、准备上游源码、运行临时 C# fixture runner，并写入 `src/search-core/__fixtures__/oracle-sample.json`。

固定 golden fixture 用来覆盖核心边界和代表场景。随机 parity sampling 则使用固定 RNG seed 生成可复现的随机 `SearchRequest`，分别交给 TypeScript search core 和 pinned C# oracle 执行，再比较 found seed 列表和详情。

CI 中的轻量 sampling：

```bash
npm run parity:sample:ci
# 等价于：
npm run parity:sample -- --seed 20260616 --cases 50 --window 2000
```

发布前可以提高本地样本数：

```bash
npm run parity:sample -- --seed 20260616 --cases 500 --window 2000
```

如果 sampling 失败，输出会包含 sampler seed、case index、request JSON、TypeScript result 和 C# oracle result。可以用下面的命令复现单个失败 case：

```bash
npm run parity:sample -- --seed 20260616 --case-index 17 --window 2000
```

随机 sampling 能提升一致性信心，但不是对所有 seed 和所有条件组合的穷举证明。

## CI 与部署

GitHub CI 位于 `.github/workflows/ci.yml`，会运行：

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

GitHub Pages 发布流程位于 `.github/workflows/pages.yml`。该流程设置 `VITE_BASE_PATH=/StardewSeedSearcher-Web/`，构建项目并部署 `dist/`。如果部署到其他子路径静态站点，也需要设置对应的 `VITE_BASE_PATH`。

## Benchmark / Smoke Check

发布前建议至少跑主场景 benchmark 和一次浏览器 smoke check：

```bash
npm run bench:search -- --scenario weather-default-1m --repeat 5
npm run bench:search -- --scenario monster-wide-1m --repeat 3
npm run bench:search -- --scenario cart-normal-1m --repeat 3
npm run bench:search -- --scenario cancel-heavy --repeat 5
npm run build
npm run test:e2e -- --project=chromium
```

当前浏览器搜索运行在单个 Web Worker 中。若后续引入 worker pool，必须保持结果顺序、`outputLimit`、取消语义和进度单调性。

## Attribution

- Upstream source: [CuiYinYin2023/StardewSeedSearcher](https://github.com/CuiYinYin2023/StardewSeedSearcher)
- Baseline: `V1.0 / 0e7d0df08f14f2c342747ca9a22c90d8edc9d892`
- Upstream license copy: `public/upstream/StardewSeedSearcher.LICENSE`
- Upstream README snapshot: `public/upstream/StardewSeedSearcher.README.md`

This project is released under the MIT License. The upstream copyright notice is preserved in `LICENSE`.

---

## English

StardewSeedSearcher Web is an unofficial browser version of a Stardew Valley seed searcher. Open the page, set the filters, and search for world seeds that match the events you want. Normal use does not require downloading a desktop app or setting up a local environment.

It is ported from [CuiYinYin2023/StardewSeedSearcher](https://github.com/CuiYinYin2023/StardewSeedSearcher), with the upstream MIT License and copyright notices preserved. This project is not affiliated with or maintained by the upstream author.

### Features

- Search Stardew Valley world seeds directly in the browser.
- Filter by weather, crop fairy, mixed mine chests, monster floors, Desert Festival vendors, and traveling cart entries.
- Track progress, speed, per-filter pass counts, and early-stop state.
- Stop a running search, inspect seed details, copy seed numbers, and export results.
- Use Chinese or English UI copy.
- Deploy as a static Vite site on GitHub Pages, Cloudflare Pages, Vercel, or any static host.

### Development

Use Node 22 from `.node-version`.

```bash
npm install
npm run dev
```

Common validation commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run fixtures:check
npm run parity:sample:ci
npm run build
npm run test:e2e -- --project=chromium
```

For deterministic search changes, regenerate and review oracle fixtures:

```bash
npm run fixtures:generate
npm run fixtures:check
npm run test -- src/search-core/search.test.ts
```
