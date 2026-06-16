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
- Vitest 单元测试和 parity fixture scaffold
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
```

## Oracle / Parity

`src/search-core` 已按 TDD 方式建立 TypeScript 搜索核心和 C# oracle sample fixture 测试，覆盖 `.NET Random`、Stardew hash helper、日期转换、天气、矿井宝箱、沙漠节和完整搜索输出。

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

生成的 sample fixture 位于 `src/search-core/__fixtures__/oracle-sample.json`，Vitest 会直接比较 TypeScript 输出和 C# oracle 输出。

## 部署

这是 Vite 静态应用，构建输出在 `dist/`：

```bash
npm run build
```

Cloudflare Pages、Vercel 或 GitHub Pages 的构建命令使用 `npm run build`，输出目录使用 `dist`。如果部署在 GitHub Pages 子路径，后续需要在 `vite.config.ts` 增加对应 `base`。

## Attribution

- Upstream source: `CuiYinYin2023/StardewSeedSearcher`
- Baseline: `V1.0 / 0e7d0df08f14f2c342747ca9a22c90d8edc9d892`
- Upstream license copy: `public/upstream/StardewSeedSearcher.LICENSE`
- Upstream README snapshot: `public/upstream/StardewSeedSearcher.README.md`

This project is released under the MIT License. Upstream copyright notice is preserved in `LICENSE`.
