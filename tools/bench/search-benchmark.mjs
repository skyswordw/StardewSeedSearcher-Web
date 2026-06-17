#!/usr/bin/env node

import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const DEFAULT_RANGE = 1_000_000
const DEFAULT_REPEAT = 3

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, '../..')

function baseRequest({ startSeed, endSeed, range, outputLimit = range + 1 }) {
  return {
    startSeed,
    endSeed,
    useLegacyRandom: false,
    weatherConditions: [],
    fairyConditions: [],
    mineChestConditions: [],
    monsterLevelConditions: [],
    desertFestivalCondition: null,
    cartConditions: [],
    outputLimit,
  }
}

const scenarioDefinitions = {
  'weather-default-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 10 }],
    },
  }),
  'weather-legacy-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      useLegacyRandom: true,
      weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 10 }],
    },
  }),
  'minechest-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      mineChestConditions: [
        { floor: 10, itemName: '皮靴' },
        { floor: 20, itemName: '钢制轻剑' },
        { floor: 50, itemName: '冻土靴' },
      ],
    },
  }),
  'monster-wide-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      monsterLevelConditions: [
        { startSeason: 0, endSeason: 2, startDay: 1, endDay: 28, startLevel: 1, endLevel: 119 },
      ],
    },
  }),
  'cart-normal-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      cartConditions: [
        {
          startYear: 1,
          startSeason: 0,
          startDay: 5,
          endYear: 1,
          endSeason: 0,
          endDay: 5,
          itemName: '红叶卷心菜',
          requireQty5: false,
          minOccurrences: 1,
        },
      ],
    },
  }),
  'cart-skillbook-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      cartConditions: [
        {
          startYear: 1,
          startSeason: 0,
          startDay: 5,
          endYear: 1,
          endSeason: 0,
          endDay: 5,
          itemName: '星露谷年历',
          requireQty5: false,
          minOccurrences: 1,
        },
      ],
    },
  }),
  'combined-cheap-first-1m': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 10 }],
      mineChestConditions: [
        { floor: 10, itemName: '皮靴' },
        { floor: 20, itemName: '钢制轻剑' },
        { floor: 50, itemName: '冻土靴' },
      ],
      cartConditions: [
        {
          startYear: 1,
          startSeason: 0,
          startDay: 5,
          endYear: 1,
          endSeason: 0,
          endDay: 5,
          itemName: '红叶卷心菜',
          requireQty5: false,
          minOccurrences: 1,
        },
      ],
    },
  }),
  'upstream-feedback-mixed-heavy': ({ startSeed, endSeed, range }) => ({
    mode: 'sync',
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 10 }],
      fairyConditions: [
        { startYear: 1, startSeason: 0, startDay: 1, endYear: 1, endSeason: 0, endDay: 28, minOccurrences: 2 },
      ],
      mineChestConditions: [{ floor: 110, itemName: '巨锤' }],
      monsterLevelConditions: [
        { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 1, endLevel: 40 },
      ],
      desertFestivalCondition: { requireJas: true, requireLeah: false },
      cartConditions: [
        {
          startYear: 1,
          startSeason: 0,
          startDay: 5,
          endYear: 1,
          endSeason: 2,
          endDay: 28,
          itemName: '电池组',
          requireQty5: false,
          minOccurrences: 1,
        },
      ],
    },
  }),
  'cancel-heavy': ({ startSeed, endSeed, range }) => ({
    mode: 'async-cancel',
    yieldEvery: 2_000,
    request: {
      ...baseRequest({ startSeed, endSeed, range }),
      cartConditions: [
        {
          startYear: 1,
          startSeason: 0,
          startDay: 5,
          endYear: 1,
          endSeason: 1,
          endDay: 28,
          itemName: '红叶卷心菜',
          requireQty5: false,
          minOccurrences: 1,
        },
      ],
      monsterLevelConditions: [
        { startSeason: 0, endSeason: 2, startDay: 1, endDay: 28, startLevel: 1, endLevel: 119 },
      ],
    },
  }),
}

function usage() {
  return `Usage: node tools/bench/search-benchmark.mjs [options]

Options:
  --scenario <name>   Scenario to run. May be repeated or comma-separated.
  --range <count>     Number of seeds per run. Supports k/m suffixes. Default: 1m.
  --start <seed>      First seed. Default: 1.
  --repeat <count>    Runs per scenario. Default: 3.
  --list              Print scenario names as JSON.
  --help              Show this help.
`
}

function parseArgs(argv) {
  const options = {
    scenarioNames: [],
    range: DEFAULT_RANGE,
    repeat: DEFAULT_REPEAT,
    startSeed: 1,
    list: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--list') {
      options.list = true
    } else if (arg === '--scenario') {
      const value = argv[++index]
      if (!value) throw new Error('--scenario requires a value')
      options.scenarioNames.push(...value.split(',').map((name) => name.trim()).filter(Boolean))
    } else if (arg === '--range') {
      const value = argv[++index]
      if (!value) throw new Error('--range requires a value')
      options.range = parseCount(value)
    } else if (arg === '--repeat') {
      const value = argv[++index]
      if (!value) throw new Error('--repeat requires a value')
      options.repeat = parseCount(value)
    } else if (arg === '--start') {
      const value = argv[++index]
      if (!value) throw new Error('--start requires a value')
      options.startSeed = parseCount(value)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.range < 1) throw new Error('--range must be at least 1')
  if (options.repeat < 1) throw new Error('--repeat must be at least 1')
  if (options.startSeed < 1) throw new Error('--start must be at least 1')

  const available = Object.keys(scenarioDefinitions)
  const requested = options.scenarioNames.length > 0 ? options.scenarioNames : available
  const unknown = requested.filter((name) => !scenarioDefinitions[name])
  if (unknown.length > 0) {
    throw new Error(`Unknown scenario(s): ${unknown.join(', ')}. Use --list to inspect available scenarios.`)
  }
  options.scenarioNames = requested

  return options
}

function parseCount(raw) {
  const normalized = raw.replaceAll('_', '').trim()
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kKmM])?$/)
  if (!match) throw new Error(`Invalid count: ${raw}`)

  const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1_000 : 1
  return Math.trunc(Number(match[1]) * multiplier)
}

async function loadSearchCore() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  })

  try {
    const core = await server.ssrLoadModule('/src/search-core/index.ts')
    return { server, core }
  } catch (error) {
    await server.close()
    throw error
  }
}

function createRunRecorder(startedAt) {
  let progressEventCount = 0
  let firstProgressLatencyMs = null
  let maxCheckedCount = 0
  let foundEventCount = 0
  let completeMessage = null
  let cancelRequestedAt = null

  return {
    onMessage(message, cancel) {
      if (message.type === 'progress') {
        progressEventCount += 1
        maxCheckedCount = Math.max(maxCheckedCount, message.checkedCount)
        firstProgressLatencyMs ??= performance.now() - startedAt
        if (cancel && cancelRequestedAt === null) {
          cancelRequestedAt = performance.now()
          cancel()
        }
      } else if (message.type === 'found') {
        foundEventCount += 1
      } else if (message.type === 'complete') {
        completeMessage = message
      }
    },
    finish(finishedAt, returnedSeeds) {
      const elapsedMs = finishedAt - startedAt
      const checkedCount = maxCheckedCount
      const seedsPerSec = elapsedMs > 0 ? (checkedCount / elapsedMs) * 1000 : 0
      const cancelLatencyMs = cancelRequestedAt === null ? null : finishedAt - cancelRequestedAt
      const foundCount = completeMessage?.totalFound ?? returnedSeeds.length ?? foundEventCount

      return {
        elapsedMs: round(elapsedMs, 3),
        elapsedSeconds: round(elapsedMs / 1000, 6),
        seedsPerSec: Math.round(seedsPerSec),
        checkedCount,
        foundCount,
        progressEventCount,
        firstProgressLatencyMs: firstProgressLatencyMs === null ? null : round(firstProgressLatencyMs, 3),
        cancelLatencyMs: cancelLatencyMs === null ? null : round(cancelLatencyMs, 3),
        cancelled: completeMessage?.cancelled ?? false,
      }
    },
  }
}

async function runScenario(name, definition, core) {
  const startedAt = performance.now()
  const recorder = createRunRecorder(startedAt)

  if (definition.mode === 'async-cancel') {
    const controller = new AbortController()
    const seeds = await core.searchSeedsAsync(
      definition.request,
      {
        signal: controller.signal,
        onMessage(message) {
          recorder.onMessage(message, () => controller.abort())
        },
      },
      { yieldEvery: definition.yieldEvery },
    )
    return recorder.finish(performance.now(), seeds)
  }

  const seeds = core.searchSeeds(definition.request, {
    onMessage(message) {
      recorder.onMessage(message)
    },
  })
  return recorder.finish(performance.now(), seeds)
}

function summarizeRuns(runs) {
  return {
    elapsedMs: summarize(runs.map((run) => run.elapsedMs)),
    seedsPerSec: summarize(runs.map((run) => run.seedsPerSec)),
    checkedCount: summarize(runs.map((run) => run.checkedCount)),
    foundCount: summarize(runs.map((run) => run.foundCount)),
    progressEventCount: summarize(runs.map((run) => run.progressEventCount)),
    firstProgressLatencyMs: summarize(runs.map((run) => run.firstProgressLatencyMs).filter((value) => value !== null)),
    cancelLatencyMs: summarize(runs.map((run) => run.cancelLatencyMs).filter((value) => value !== null)),
  }
}

function summarize(values) {
  if (values.length === 0) return { median: null, p95: null }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  }
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 1) return sortedValues[0]
  const index = Math.ceil(percentileValue * sortedValues.length) - 1
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, index))]
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const availableScenarios = Object.keys(scenarioDefinitions)

  if (options.help) {
    process.stdout.write(usage())
    return
  }

  if (options.list) {
    process.stdout.write(`${JSON.stringify({ scenarios: availableScenarios }, null, 2)}\n`)
    return
  }

  const { server, core } = await loadSearchCore()
  try {
    const endSeed = options.startSeed + options.range - 1
    const scenarioResults = []

    for (const name of options.scenarioNames) {
      const definition = scenarioDefinitions[name]({
        startSeed: options.startSeed,
        endSeed,
        range: options.range,
      })
      const runs = []
      for (let runIndex = 0; runIndex < options.repeat; runIndex += 1) {
        runs.push(await runScenario(name, definition, core))
      }

      scenarioResults.push({
        name,
        mode: definition.mode,
        range: options.range,
        startSeed: options.startSeed,
        endSeed,
        repeat: options.repeat,
        runs,
        summary: summarizeRuns(runs),
      })
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          tool: 'search-benchmark',
          version: 1,
          generatedAt: new Date().toISOString(),
          workerPool: false,
          scenarios: scenarioResults,
        },
        null,
        2,
      )}\n`,
    )
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
