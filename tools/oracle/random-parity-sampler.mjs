#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import {
  dotnet,
  ensureDotnet,
  ensureUpstream,
  output,
  prepareOracleProject,
  root,
  upstreamCommit,
  upstreamDir,
} from './oracle-env.mjs'

const DEFAULT_SAMPLER_SEED = 20_260_616
const DEFAULT_CASES = 50
const DEFAULT_WINDOW = 2000
const DEFAULT_OUTPUT_LIMIT = 20
const DEFAULT_PROFILE = 'both'
const MAX_START_SEED = 200_000

const mineChestItems = {
  10: ['皮靴', '工作靴', '木剑', '铁制短剑', '疾风利剑', '股骨'],
  20: ['钢制轻剑', '木棒', '精灵之刃', '光辉戒指', '磁铁戒指'],
  50: ['冻土靴', '热能靴', '战靴', '镀银军刀', '海盗剑'],
  60: ['水晶匕首', '弯刀', '铁刃', '飞贼之胫', '木锤'],
  80: ['蹈火者靴', '黑暗之靴', '双刃大剑', '圣堂之刃', '长柄锤', '暗影匕首'],
  90: ['黑曜石之刃', '淬火阔剑', '蛇形邪剑', '骨剑', '骨化剑'],
  110: ['太空之靴', '水晶鞋', '钢刀', '巨锤'],
}

const mineChestFloors = Object.keys(mineChestItems).map(Number)
const cartItems = [
  '野山葵',
  '黄水仙',
  '韭葱',
  '蒲公英',
  '防风草',
  '山洞萝卜',
  '椰子',
  '仙人掌果子',
  '河豚',
  '金枪鱼',
  '鲶鱼',
  '咖啡豆',
  '稀有种子',
  '木材',
  '星露谷年历',
  '鱼饵和浮漂',
  '樵夫周刊',
  '采矿月刊',
  '战斗季刊',
]
const allCartItems = loadCartItemNames()

const featureFamilies = [
  'weather',
  'fairy',
  'mineChest',
  'monsterLevel',
  'desertFestival',
  'cart',
  'mixed',
  'legacyMixed',
]

function parseArgs(argv) {
  const options = {
    seed: DEFAULT_SAMPLER_SEED,
    cases: DEFAULT_CASES,
    window: DEFAULT_WINDOW,
    outputLimit: DEFAULT_OUTPUT_LIMIT,
    profile: DEFAULT_PROFILE,
    caseIndex: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`)
    }

    const [rawName, inlineValue] = arg.slice(2).split('=', 2)
    const value = inlineValue ?? argv[++i]
    if (value === undefined) throw new Error(`Missing value for --${rawName}`)

    switch (rawName) {
      case 'seed':
        options.seed = parseInteger(value, rawName)
        break
      case 'cases':
        options.cases = parseInteger(value, rawName)
        break
      case 'window':
        options.window = parseInteger(value, rawName)
        break
      case 'output-limit':
        options.outputLimit = parseInteger(value, rawName)
        break
      case 'profile':
        if (!['random', 'targeted', 'both'].includes(value)) {
          throw new Error('--profile must be one of: random, targeted, both')
        }
        options.profile = value
        break
      case 'case-index':
        options.caseIndex = parseInteger(value, rawName)
        break
      default:
        throw new Error(`Unknown option: --${rawName}`)
    }
  }

  if (options.cases < 1) throw new Error('--cases must be at least 1')
  if (options.window < 1) throw new Error('--window must be at least 1')
  if (options.outputLimit < 1) throw new Error('--output-limit must be at least 1')
  if (options.caseIndex !== null && options.caseIndex < 0) throw new Error('--case-index must be zero or greater')
  return options
}

function loadCartItemNames() {
  const raw = readFileSync(resolve(root, 'src/search-core/data/TravelingCartData.json'), 'utf8').replace(/^\uFEFF/, '')
  const data = JSON.parse(raw)
  const names = Object.values(data)
    .filter((item) => {
      const id = Number.parseInt(item.Id, 10)
      return (
        Number.isFinite(id) &&
        id >= 2 &&
        id <= 789 &&
        item.Price > 0 &&
        !item.OffLimits &&
        (item.Category < 0 || item.Category === -999) &&
        item.Type !== 'Arch' &&
        item.Type !== 'Minerals' &&
        item.Type !== 'Quest'
      )
    })
    .map((item) => item.Name)

  return Array.from(new Set([...names, '星露谷年历', '鱼饵和浮漂', '樵夫周刊', '采矿月刊', '战斗季刊'])).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  )
}

function parseInteger(value, name) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name} must be an integer`)
  return parsed
}

function generateCases(options) {
  const cases = []
  if (options.profile === 'random' || options.profile === 'both') {
    cases.push(...generateRandomCases(options, 0))
  }
  if (options.profile === 'targeted' || options.profile === 'both') {
    cases.push(...generateTargetedCases(options, cases.length))
  }

  if (options.caseIndex !== null) {
    const testCase = cases.find((candidate) => candidate.index === options.caseIndex)
    if (!testCase) {
      throw new Error(`No generated case exists at --case-index ${options.caseIndex} for --profile ${options.profile}`)
    }
    return [testCase]
  }

  return cases
}

function generateRandomCases(options, startIndex) {
  const rng = new XorShift32(options.seed)
  const cases = []
  const totalToGenerate =
    options.profile === 'random' && options.caseIndex !== null ? Math.max(options.cases, options.caseIndex + 1) : options.cases

  for (let offset = 0; offset < totalToGenerate; offset += 1) {
    const index = startIndex + offset
    const family = featureFamilies[offset % featureFamilies.length]
    const request = generateRequest(rng, family, options)
    cases.push({
      index,
      samplerSeed: options.seed,
      family,
      request,
    })
  }

  return cases
}

function generateRequest(rng, family, options) {
  const startSeed = rng.int(1, MAX_START_SEED)
  const windowSize = rng.int(Math.max(1, Math.floor(options.window / 2)), options.window)
  const request = emptyRequest({
    startSeed,
    endSeed: startSeed + windowSize - 1,
    useLegacyRandom: family === 'legacyMixed' ? true : rng.bool(),
    outputLimit: options.outputLimit,
  })

  const plannedFeatures =
    family === 'mixed' || family === 'legacyMixed'
      ? randomFeatureSet(rng)
      : [family]

  for (const feature of plannedFeatures) {
    addFeature(request, rng, feature)
  }

  return request
}

function emptyRequest(base) {
  return {
    startSeed: base.startSeed,
    endSeed: base.endSeed,
    useLegacyRandom: base.useLegacyRandom,
    weatherConditions: [],
    fairyConditions: [],
    mineChestConditions: [],
    monsterLevelConditions: [],
    desertFestivalCondition: null,
    cartConditions: [],
    outputLimit: base.outputLimit,
  }
}

function randomFeatureSet(rng) {
  const shuffled = shuffle(['weather', 'fairy', 'mineChest', 'monsterLevel', 'desertFestival', 'cart'], rng)
  const count = rng.int(2, 4)
  return shuffled.slice(0, count)
}

function addFeature(request, rng, feature) {
  switch (feature) {
    case 'weather':
      request.weatherConditions.push(randomWeatherCondition(rng))
      break
    case 'fairy':
      request.fairyConditions.push(randomFairyCondition(rng))
      break
    case 'mineChest':
      request.mineChestConditions.push(randomMineChestCondition(rng))
      break
    case 'monsterLevel':
      request.monsterLevelConditions.push(randomMonsterLevelCondition(rng))
      break
    case 'desertFestival':
      request.desertFestivalCondition = randomDesertFestivalCondition(rng)
      break
    case 'cart':
      request.cartConditions.push(randomCartCondition(rng))
      break
    default:
      throw new Error(`Unsupported feature family: ${feature}`)
  }
}

function randomWeatherCondition(rng) {
  const season = rng.pick([0, 1, 2])
  const startDay = rng.int(1, 24)
  const endDay = rng.int(startDay, 28)
  return {
    season,
    startDay,
    endDay,
    minRainDays: rng.int(1, Math.max(1, Math.min(4, endDay - startDay + 1))),
  }
}

function randomFairyCondition(rng) {
  const start = randomDateWindow(rng, 1, 3, 1, 84)
  return {
    startYear: start.start.year,
    startSeason: start.start.season,
    startDay: start.start.day,
    endYear: start.end.year,
    endSeason: start.end.season,
    endDay: start.end.day,
    minOccurrences: 1,
  }
}

function randomMineChestCondition(rng) {
  const floor = rng.pick(mineChestFloors)
  return {
    floor,
    itemName: rng.pick(mineChestItems[floor]),
  }
}

function randomMonsterLevelCondition(rng) {
  const start = rng.int(1, 76)
  const end = rng.int(start + 4, Math.min(120, start + 24))
  const dateWindow = randomDateWindow(rng, 1, 1, 1, 84)
  return {
    startSeason: dateWindow.start.season,
    endSeason: dateWindow.end.season,
    startDay: dateWindow.start.day,
    endDay: dateWindow.end.day,
    startLevel: start,
    endLevel: end,
  }
}

function randomDesertFestivalCondition(rng) {
  const requireBoth = rng.int(0, 9) === 0
  if (requireBoth) return { requireJas: true, requireLeah: true }
  return rng.bool() ? { requireJas: true, requireLeah: false } : { requireJas: false, requireLeah: true }
}

function randomCartCondition(rng) {
  const dateWindow = randomDateWindow(rng, 1, 2, 1, 112)
  return {
    startYear: dateWindow.start.year,
    startSeason: dateWindow.start.season,
    startDay: dateWindow.start.day,
    endYear: dateWindow.end.year,
    endSeason: dateWindow.end.season,
    endDay: dateWindow.end.day,
    itemName: rng.int(0, 4) === 0 ? rng.pick(allCartItems) : rng.pick(cartItems),
    requireQty5: rng.int(0, 5) === 0,
    minOccurrences: rng.int(0, 5) === 0 ? 2 : 1,
  }
}

function generateTargetedCases(options, startIndex) {
  const cases = targetedRequestSpecs(options).map((spec, offset) => ({
    index: startIndex + offset,
    samplerSeed: options.seed,
    family: `targeted:${spec.name}`,
    request: spec.request,
  }))

  return cases
}

function targetedRequestSpecs(options) {
  const outputLimit = Math.max(options.outputLimit, 8)
  const make = (overrides) => emptyRequest({
    startSeed: 1,
    endSeed: Math.max(1, overrides.endSeed),
    useLegacyRandom: Boolean(overrides.useLegacyRandom),
    outputLimit: overrides.outputLimit ?? outputLimit,
  })

  function request(overrides) {
    return {
      ...make(overrides),
      startSeed: overrides.startSeed ?? 1,
      weatherConditions: overrides.weatherConditions ?? [],
      fairyConditions: overrides.fairyConditions ?? [],
      mineChestConditions: overrides.mineChestConditions ?? [],
      monsterLevelConditions: overrides.monsterLevelConditions ?? [],
      desertFestivalCondition: overrides.desertFestivalCondition ?? null,
      cartConditions: overrides.cartConditions ?? [],
    }
  }

  return [
    {
      name: 'weather-late-month-high-rain',
      request: request({
        endSeed: 60_000,
        weatherConditions: [
          { season: 0, startDay: 25, endDay: 28, minRainDays: 1 },
          { season: 1, startDay: 23, endDay: 28, minRainDays: 3 },
          { season: 2, startDay: 1, endDay: 28, minRainDays: 10 },
        ],
      }),
    },
    {
      name: 'weather-fixed-forced-rain-legacy',
      request: request({
        endSeed: 500,
        useLegacyRandom: true,
        weatherConditions: [
          { season: 0, startDay: 3, endDay: 3, minRainDays: 1 },
          { season: 1, startDay: 13, endDay: 13, minRainDays: 1 },
        ],
      }),
    },
    {
      name: 'fairy-two-occurrences',
      request: request({
        endSeed: 120_000,
        fairyConditions: [
          { startYear: 1, startSeason: 0, startDay: 1, endYear: 1, endSeason: 2, endDay: 28, minOccurrences: 2 },
        ],
      }),
    },
    {
      name: 'fairy-cross-year-legacy',
      request: request({
        endSeed: 120_000,
        useLegacyRandom: true,
        fairyConditions: [
          { startYear: 1, startSeason: 2, startDay: 27, endYear: 2, endSeason: 0, endDay: 2, minOccurrences: 1 },
        ],
      }),
    },
    {
      name: 'mine-chest-multiple-floors',
      request: request({
        endSeed: 200_000,
        mineChestConditions: [
          { floor: 10, itemName: '皮靴' },
          { floor: 20, itemName: '钢制轻剑' },
          { floor: 50, itemName: '冻土靴' },
          { floor: 110, itemName: '巨锤' },
        ],
      }),
    },
    {
      name: 'mine-chest-same-floor-conflict-legacy',
      request: request({
        endSeed: 5_000,
        useLegacyRandom: true,
        mineChestConditions: [
          { floor: 10, itemName: '皮靴' },
          { floor: 10, itemName: '木剑' },
        ],
      }),
    },
    {
      name: 'monster-high-level-boundaries',
      request: request({
        endSeed: 80_000,
        monsterLevelConditions: [
          { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 77, endLevel: 119 },
          { startSeason: 1, endSeason: 1, startDay: 28, endDay: 28, startLevel: 116, endLevel: 119 },
        ],
      }),
    },
    {
      name: 'monster-mod40-boundaries-legacy',
      request: request({
        endSeed: 80_000,
        useLegacyRandom: true,
        monsterLevelConditions: [
          { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 5, endLevel: 6 },
          { startSeason: 0, endSeason: 0, startDay: 19, endDay: 19, startLevel: 19, endLevel: 19 },
          { startSeason: 0, endSeason: 0, startDay: 28, endDay: 28, startLevel: 29, endLevel: 30 },
        ],
      }),
    },
    {
      name: 'cart-full-data-representatives',
      request: request({
        endSeed: 80_000,
        cartConditions: [
          cartCondition({ itemName: pickCartItem('电池组'), startDay: 5, endSeason: 2, endDay: 28 }),
          cartCondition({ itemName: pickCartItem('红叶卷心菜'), startDay: 5, endSeason: 2, endDay: 28 }),
        ],
      }),
    },
    {
      name: 'cart-qty-five-and-skillbook-legacy',
      request: request({
        endSeed: 120_000,
        useLegacyRandom: true,
        cartConditions: [
          cartCondition({ itemName: pickCartItem('红叶卷心菜'), startDay: 5, endSeason: 2, endDay: 28, requireQty5: true }),
          cartCondition({ itemName: '星露谷年历', startDay: 5, endSeason: 2, endDay: 28 }),
        ],
      }),
    },
    {
      name: 'cart-special-days',
      request: request({
        endSeed: 120_000,
        cartConditions: [
          cartCondition({ itemName: pickCartItem('电池组'), startDay: 15, endDay: 17 }),
          cartCondition({ itemName: pickCartItem('红叶卷心菜'), startSeason: 3, startDay: 15, endSeason: 3, endDay: 17 }),
        ],
      }),
    },
    {
      name: 'desert-festival-both-vendors',
      request: request({
        endSeed: 20_000,
        desertFestivalCondition: { requireJas: true, requireLeah: true },
      }),
    },
    {
      name: 'desert-festival-single-vendor-legacy',
      request: request({
        endSeed: 20_000,
        useLegacyRandom: true,
        desertFestivalCondition: { requireJas: false, requireLeah: true },
      }),
    },
    {
      name: 'mixed-date-boundaries',
      request: request({
        endSeed: 150_000,
        weatherConditions: [{ season: 2, startDay: 27, endDay: 28, minRainDays: 1 }],
        fairyConditions: [
          { startYear: 1, startSeason: 2, startDay: 28, endYear: 2, endSeason: 0, endDay: 1, minOccurrences: 1 },
        ],
        cartConditions: [
          cartCondition({ itemName: pickCartItem('椰子'), startYear: 1, startSeason: 3, startDay: 28, endYear: 2, endSeason: 0, endDay: 5 }),
        ],
      }),
    },
    {
      name: 'mixed-all-features',
      request: request({
        endSeed: 150_000,
        weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 4 }],
        fairyConditions: [
          { startYear: 1, startSeason: 0, startDay: 1, endYear: 1, endSeason: 2, endDay: 28, minOccurrences: 1 },
        ],
        mineChestConditions: [{ floor: 110, itemName: '巨锤' }],
        monsterLevelConditions: [
          { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 1, endLevel: 40 },
        ],
        desertFestivalCondition: { requireJas: true, requireLeah: false },
        cartConditions: [cartCondition({ itemName: pickCartItem('电池组'), startDay: 1, endDay: 28 })],
      }),
    },
    {
      name: 'mixed-all-features-legacy',
      request: request({
        endSeed: 150_000,
        useLegacyRandom: true,
        weatherConditions: [{ season: 1, startDay: 1, endDay: 28, minRainDays: 4 }],
        fairyConditions: [
          { startYear: 1, startSeason: 0, startDay: 1, endYear: 2, endSeason: 0, endDay: 28, minOccurrences: 1 },
        ],
        mineChestConditions: [{ floor: 10, itemName: '木剑' }],
        monsterLevelConditions: [
          { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 1, endLevel: 40 },
        ],
        desertFestivalCondition: { requireJas: false, requireLeah: true },
        cartConditions: [cartCondition({ itemName: pickCartItem('红叶卷心菜'), startDay: 5, endSeason: 2, endDay: 28 })],
      }),
    },
  ]
}

function pickCartItem(preferredName) {
  return allCartItems.includes(preferredName) ? preferredName : allCartItems[0]
}

function cartCondition(overrides) {
  return {
    startYear: overrides.startYear ?? 1,
    startSeason: overrides.startSeason ?? 0,
    startDay: overrides.startDay ?? 5,
    endYear: overrides.endYear ?? overrides.startYear ?? 1,
    endSeason: overrides.endSeason ?? overrides.startSeason ?? 0,
    endDay: overrides.endDay ?? 5,
    itemName: overrides.itemName,
    requireQty5: Boolean(overrides.requireQty5),
    minOccurrences: overrides.minOccurrences ?? 1,
  }
}

function randomDateWindow(rng, minYear, maxYear, minDays, maxDays) {
  const startAbs = rng.int(dayNumber(minYear, 0, 1), dayNumber(maxYear, 3, 28) - minDays + 1)
  const endAbs = rng.int(startAbs + minDays - 1, Math.min(dayNumber(maxYear, 3, 28), startAbs + maxDays - 1))
  return { start: fromAbsoluteDay(startAbs), end: fromAbsoluteDay(endAbs) }
}

function dayNumber(year, season, day) {
  return (year - 1) * 112 + season * 28 + day
}

function fromAbsoluteDay(absoluteDay) {
  let dayOfYear = absoluteDay % 112
  if (dayOfYear === 0) dayOfYear = 112
  const year = Math.floor((absoluteDay - dayOfYear) / 112) + 1
  let day = dayOfYear % 28
  if (day === 0) day = 28
  const season = Math.floor((dayOfYear - day) / 28)
  return { year, season, day }
}

function shuffle(values, rng) {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

class XorShift32 {
  constructor(seed) {
    this.state = seed >>> 0 || 0x9e3779b9
  }

  nextUint32() {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x >>> 0
    return this.state
  }

  int(min, max) {
    if (max < min) throw new Error(`Invalid random range: ${min}..${max}`)
    const span = max - min + 1
    return min + (this.nextUint32() % span)
  }

  bool() {
    return (this.nextUint32() & 1) === 1
  }

  pick(values) {
    return values[this.int(0, values.length - 1)]
  }
}

async function runTypeScript(cases, tempDir) {
  const inputPath = join(tempDir, 'parity-cases.json')
  const outputPath = join(tempDir, 'ts-results.json')
  const runnerPath = join(tempDir, 'ts-parity-runner.mjs')
  writeFileSync(inputPath, `${JSON.stringify(cases)}\n`)
  writeFileSync(runnerPath, typeScriptRunnerSource(root, inputPath, outputPath))

  const result = spawnSync(process.execPath, [runnerPath], {
    cwd: root,
    stdio: 'inherit',
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`TypeScript parity runner failed with exit code ${result.status}`)
  }

  return JSON.parse(readFileSync(outputPath, 'utf8'))
}

function typeScriptRunnerSource(projectRoot, inputPath, outputPath) {
  return `import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createServer } from ${JSON.stringify(pathToFileURL(resolve(projectRoot, 'node_modules/vite/dist/node/index.js')).href)}

const server = await createServer({
  root: ${JSON.stringify(projectRoot)},
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})

try {
  const { searchSeeds, predictSeedDetails, normalizeSearchRequest } = await server.ssrLoadModule('/src/search-core/index.ts')
  const cases = JSON.parse(readFileSync(${JSON.stringify(inputPath)}, 'utf8'))
  const results = cases.map((testCase) => {
    const request = normalizeSearchRequest(testCase.request)
    const foundSeeds = searchSeeds(request, { now: () => 1000, onMessage() {} })
    const details = foundSeeds.map((seed) => ({ seed, details: predictSeedDetails(seed, request) }))
    return { index: testCase.index, foundSeeds, details }
  })
  writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(results))
} finally {
  await server.close()
}
`
}

function runOracle(cases) {
  prepareOracleProject(
    'StardewSeedSearcher.OracleParitySamplerRunner',
    'OracleParitySamplerRunner.cs',
    oracleRunnerSource(cases),
  )

  const project = resolve(upstreamDir, 'StardewSeedSearcher/StardewSeedSearcher.csproj')
  const rawOutput = output(dotnet, ['run', '--project', project, '--configuration', 'Release', '--no-launch-profile'], {
    cwd: upstreamDir,
    maxBuffer: 1024 * 1024 * 64,
  })
  const jsonStart = rawOutput.indexOf('{\n  "results"')
  if (jsonStart < 0) {
    throw new Error(`Could not locate oracle parity JSON in dotnet output:\n${rawOutput}`)
  }
  return JSON.parse(rawOutput.slice(jsonStart)).results
}

function oracleRunnerSource(cases) {
  const casesJson = JSON.stringify(cases).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return String.raw`using System.Text.Encodings.Web;
using System.Text.Json;
using StardewSeedSearcher.Data;
using StardewSeedSearcher.Features;

namespace StardewSeedSearcher;

public static class OracleParitySamplerRunner
{
    public static void Main(string[] args)
    {
        TravelingCartData.Initialize();

        var json = "${casesJson}";
        var cases = JsonSerializer.Deserialize<List<ParityCase>>(json, JsonOptions()) ?? new();
        var results = cases.Select(testCase =>
        {
            var foundSeeds = Search(testCase.Request);
            return new
            {
                index = testCase.Index,
                foundSeeds,
                details = foundSeeds.Select(seed => new
                {
                    seed,
                    details = Details(seed, testCase.Request)
                }).ToArray()
            };
        }).ToArray();

        Console.WriteLine(JsonSerializer.Serialize(new { results }, JsonOptions()));
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = true
    };

    private static int[] Search(SearchRequestSpec spec)
    {
        var features = InitializeFeatures(spec);
        var sortedFeatures = features.OrderBy(feature => feature.EstimateCost(spec.UseLegacyRandom)).ToList();
        var results = new List<int>();

        for (var seed = spec.StartSeed; seed <= spec.EndSeed; seed++)
        {
            var allMatch = true;
            foreach (var feature in sortedFeatures)
            {
                if (!feature.Check(seed, spec.UseLegacyRandom))
                {
                    allMatch = false;
                    break;
                }
            }

            if (!allMatch) continue;
            results.Add(seed);
            if (results.Count >= spec.OutputLimit) break;
        }

        return results.ToArray();
    }

    private static List<ISearchFeature> InitializeFeatures(SearchRequestSpec spec)
    {
        var features = new List<ISearchFeature>();

        if (spec.WeatherConditions.Length > 0)
        {
            var predictor = new WeatherPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.WeatherConditions);
            features.Add(predictor);
        }
        if (spec.FairyConditions.Length > 0)
        {
            var predictor = new FairyPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.FairyConditions);
            features.Add(predictor);
        }
        if (spec.MineChestConditions.Length > 0)
        {
            var predictor = new MineChestPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.MineChestConditions);
            features.Add(predictor);
        }
        if (spec.MonsterLevelConditions.Length > 0)
        {
            var predictor = new MonsterLevelPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.MonsterLevelConditions);
            features.Add(predictor);
        }
        if (spec.DesertFestivalCondition is not null && (spec.DesertFestivalCondition.RequireJas || spec.DesertFestivalCondition.RequireLeah))
        {
            features.Add(new DesertFestivalPredictor
            {
                IsEnabled = true,
                RequireJas = spec.DesertFestivalCondition.RequireJas,
                RequireLeah = spec.DesertFestivalCondition.RequireLeah
            });
        }
        if (spec.CartConditions.Length > 0)
        {
            var predictor = new TravelingCartPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.CartConditions);
            features.Add(predictor);
        }

        return features;
    }

    private static object Details(int seed, SearchRequestSpec spec)
    {
        var weather = spec.WeatherConditions.Length > 0 ? WeatherDetail(seed, spec.UseLegacyRandom) : null;
        var fairy = spec.FairyConditions.Length > 0 ? FairyDetail(seed, spec.FairyConditions, spec.UseLegacyRandom) : null;
        var mineChest = spec.MineChestConditions.Length > 0 ? MineChestDetail(seed, spec.MineChestConditions, spec.UseLegacyRandom) : null;
        var monsterLevel = spec.MonsterLevelConditions.Length > 0 ? MonsterLevelDetail(seed, spec.MonsterLevelConditions, spec.UseLegacyRandom) : null;
        var desertFestival = spec.DesertFestivalCondition is not null && (spec.DesertFestivalCondition.RequireJas || spec.DesertFestivalCondition.RequireLeah)
            ? DesertFestivalDetail(seed, spec.UseLegacyRandom)
            : null;
        var cart = spec.CartConditions.Length > 0 ? CartDetail(seed, spec.CartConditions, spec.UseLegacyRandom) : null;

        return new { weather, fairy, mineChest, monsterLevel, desertFestival, cart };
    }

    private static object WeatherDetail(int seed, bool legacy)
    {
        var predictor = new WeatherPredictor();
        var raw = predictor.PredictWeatherWithDetail(seed, legacy);
        var detail = WeatherPredictor.ExtractWeatherDetail(raw.weather, raw.greenRainDay);
        return new
        {
            springRain = detail.SpringRain,
            summerRain = detail.SummerRain,
            fallRain = detail.FallRain,
            greenRainDay = detail.GreenRainDay
        };
    }

    private static object FairyDetail(int seed, IEnumerable<FairyCondition> conditions, bool legacy)
    {
        var predictor = new FairyPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        return new { days = predictor.GetFairyDays(seed, legacy) };
    }

    private static object MineChestDetail(int seed, IEnumerable<MineChestPredictor.MineChestCondition> conditions, bool legacy)
    {
        var predictor = new MineChestPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        return predictor.GetDetails(seed, legacy);
    }

    private static object MonsterLevelDetail(int seed, IEnumerable<MonsterLevelPredictor.MonsterLevelCondition> conditions, bool legacy)
    {
        var predictor = new MonsterLevelPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        return predictor.GetDetails(seed, legacy);
    }

    private static object DesertFestivalDetail(int seed, bool legacy)
    {
        return new DesertFestivalPredictor().GetDetails(seed, legacy);
    }

    private static object CartDetail(int seed, IEnumerable<CartCondition> conditions, bool legacy)
    {
        var predictor = new TravelingCartPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        var matches = predictor.GetCartMatches(seed, legacy)
            .Cast<CartDayMatch>()
            .Select(match => new
            {
                year = match.Year,
                season = match.Season,
                day = match.Day,
                absoluteDay = match.AbsoluteDay,
                itemName = match.ItemName,
                quantity = match.Quantity,
                price = match.Price
            })
            .ToArray();
        return new { matches };
    }

    private sealed class ParityCase
    {
        public int Index { get; set; }
        public int SamplerSeed { get; set; }
        public string Family { get; set; } = "";
        public SearchRequestSpec Request { get; set; } = new();
    }

    private sealed class SearchRequestSpec
    {
        public int StartSeed { get; set; }
        public int EndSeed { get; set; }
        public bool UseLegacyRandom { get; set; }
        public WeatherCondition[] WeatherConditions { get; set; } = Array.Empty<WeatherCondition>();
        public FairyCondition[] FairyConditions { get; set; } = Array.Empty<FairyCondition>();
        public MineChestPredictor.MineChestCondition[] MineChestConditions { get; set; } = Array.Empty<MineChestPredictor.MineChestCondition>();
        public MonsterLevelPredictor.MonsterLevelCondition[] MonsterLevelConditions { get; set; } = Array.Empty<MonsterLevelPredictor.MonsterLevelCondition>();
        public DesertFestivalConditionSpec? DesertFestivalCondition { get; set; }
        public CartCondition[] CartConditions { get; set; } = Array.Empty<CartCondition>();
        public int OutputLimit { get; set; }
    }

    private sealed class DesertFestivalConditionSpec
    {
        public bool RequireJas { get; set; }
        public bool RequireLeah { get; set; }
    }
}
`
}

function compareResults(cases, tsResults, oracleResults) {
  const tsByIndex = new Map(tsResults.map((result) => [result.index, result]))
  const oracleByIndex = new Map(oracleResults.map((result) => [result.index, result]))
  const failures = []

  for (const testCase of cases) {
    const tsResult = tsByIndex.get(testCase.index)
    const oracleResult = oracleByIndex.get(testCase.index)
    if (!tsResult || !oracleResult || stableStringify(tsResult) !== stableStringify(oracleResult)) {
      failures.push({
        samplerSeed: testCase.samplerSeed,
        caseIndex: testCase.index,
        family: testCase.family,
        request: testCase.request,
        tsResult,
        oracleResult,
      })
    }
  }

  return failures
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value))
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]))
  }
  return value
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const cases = generateCases(options)
  const tempDir = mkdtempSync(join(tmpdir(), 'stardew-parity-'))

  try {
    ensureDotnet()
    ensureUpstream()
    const tsResults = await runTypeScript(cases, tempDir)
    const oracleResults = runOracle(cases)
    const failures = compareResults(cases, tsResults, oracleResults)

    if (failures.length > 0) {
      process.stderr.write(`${JSON.stringify({ failures }, null, 2)}\n`)
      process.stderr.write(
        `Parity sampling failed for ${failures.length}/${cases.length} cases. Reproduce one case with --seed ${failures[0].samplerSeed} --profile ${options.profile} --cases ${options.cases} --case-index ${failures[0].caseIndex} --window ${options.window} --output-limit ${options.outputLimit}.\n`,
      )
      process.exitCode = 1
      return
    }

    console.log(
      `Parity sampling passed: ${cases.length} cases, profile ${options.profile}, sampler seed ${options.seed}, window <= ${options.window}, upstream ${upstreamCommit}.`,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
