import { describe, expect, it } from 'vitest'
import { CsRandom } from './csharp'
import { getHashFromArray, getHashFromString, getRandomSeed } from './hash'
import { absoluteDayToDate, dateToAbsoluteDay } from './time'
import { FairyPredictor } from './predictors/fairy'
import { MineChestPredictor } from './predictors/mineChest'
import { MonsterLevelPredictor } from './predictors/monsterLevel'
import { TravelingCartPredictor } from './predictors/travelingCart'
import { WeatherPredictor } from './predictors/weather'
import { DesertFestivalPredictor } from './predictors/desertFestival'
import {
  getEnabledFeatures,
  predictSeedDetails,
  searchSeeds,
  type CartCondition,
  type DesertFestivalCondition,
  type FairyCondition,
  type MineChestCondition,
  type MonsterLevelCondition,
  type SearchMessage,
  type SearchRequest,
  type Season,
  type WeatherCondition,
} from './index'
import oracleJson from './__fixtures__/oracle-sample.json'

interface OracleFixture {
  primitives: {
    random: OracleRandomCase[]
    hashes: OracleHashCase[]
    dates: {
      toAbsolute: Array<{
        name: string
        input: { year: number; season: number; day: number }
        expected: number
      }>
      fromAbsolute: Array<{
        absoluteDay: number
        expected: { year: number; season: Season; day: number }
      }>
    }
  }
  predictorCases: OraclePredictorCase[]
  searchCases: OracleSearchCase[]
}

interface OracleRandomCase {
  name: string
  seed: number
  operation: 'next' | 'nextRange'
  min: number | null
  max: number | null
  count: number
  expected: number[]
}

type OracleHashCase =
  | { kind: 'string'; value: string; expected: number }
  | { kind: 'array'; name: string; values: number[]; expected: number }
  | { kind: 'randomSeed'; name: string; values: [number, number, number, number, number]; useLegacyRandom: boolean; expected: number }

type OraclePredictorCase =
  | {
      name: string
      kind: 'weather'
      seed: number
      useLegacyRandom: boolean
      input: { weatherConditions: WeatherConditionJson[] }
      expected: unknown
    }
  | {
      name: string
      kind: 'mineChest'
      seed: number
      useLegacyRandom: boolean
      input: { mineChestConditions: MineChestCondition[] }
      expected: unknown
    }
  | {
      name: string
      kind: 'desertFestival'
      seed: number
      useLegacyRandom: boolean
      input: { desertFestivalCondition: DesertFestivalCondition }
      expected: unknown
    }
  | {
      name: string
      kind: 'fairy'
      seed: number
      useLegacyRandom: boolean
      input: { fairyConditions: FairyConditionJson[] }
      expected: unknown
    }
  | {
      name: string
      kind: 'monsterLevel'
      seed: number
      useLegacyRandom: boolean
      input: { monsterLevelConditions: MonsterLevelConditionJson[] }
      expected: unknown
    }
  | {
      name: string
      kind: 'cart'
      seed: number
      useLegacyRandom: boolean
      input: { cartConditions: CartConditionJson[] }
      expected: unknown
    }

interface OracleSearchCase {
  name: string
  request: SearchRequestJson
  expected: number[]
}

type WeatherConditionJson = Omit<WeatherCondition, 'season'> & { season: number }
type FairyConditionJson = Omit<FairyCondition, 'startSeason' | 'endSeason'> & { startSeason: number; endSeason: number }
type MonsterLevelConditionJson = Omit<MonsterLevelCondition, 'startSeason' | 'endSeason'> & {
  startSeason: number
  endSeason: number
}
type CartConditionJson = Omit<CartCondition, 'startSeason' | 'endSeason'> & { startSeason: number; endSeason: number }
type SearchRequestJson = Omit<
  SearchRequest,
  'weatherConditions' | 'fairyConditions' | 'monsterLevelConditions' | 'cartConditions'
> & {
  weatherConditions: WeatherConditionJson[]
  fairyConditions: FairyConditionJson[]
  monsterLevelConditions: MonsterLevelConditionJson[]
  cartConditions: CartConditionJson[]
}

const oracle = oracleJson as OracleFixture

describe('C# compatibility primitives', () => {
  it.each(oracle.primitives.random.map((testCase) => [testCase.name, testCase] as const))(
    'matches C# Random sequence: %s',
    (_name, testCase: OracleRandomCase) => {
      const rng = new CsRandom(testCase.seed)
      const actual = Array.from({ length: testCase.count }, () => {
        if (testCase.operation === 'next') return rng.next()
        expect(testCase.min).toEqual(expect.any(Number))
        expect(testCase.max).toEqual(expect.any(Number))
        return rng.next(testCase.min ?? 0, testCase.max ?? 0)
      })
      expect(actual).toEqual(testCase.expected)
    },
  )

  it.each(oracle.primitives.hashes.map((testCase) => [hashCaseName(testCase), testCase] as const))(
    'matches C# hash helper: %s',
    (_name, testCase: OracleHashCase) => {
      if (testCase.kind === 'string') {
        expect(getHashFromString(testCase.value)).toBe(testCase.expected)
        return
      }

      if (testCase.kind === 'array') {
        expect(getHashFromArray(...testCase.values)).toBe(testCase.expected)
        return
      }

      expect(getRandomSeed(...testCase.values, testCase.useLegacyRandom)).toBe(testCase.expected)
    },
  )

  it.each(oracle.primitives.dates.toAbsolute.map((testCase) => [testCase.name, testCase] as const))(
    'converts C# date to absolute day: %s',
    (_name, testCase) => {
      expect(dateToAbsoluteDay(testCase.input.year, testCase.input.season, testCase.input.day)).toBe(testCase.expected)
    },
  )

  it.each(oracle.primitives.dates.fromAbsolute.map((testCase) => [`absolute-${testCase.absoluteDay}`, testCase] as const))(
    'converts C# absolute day to date: %s',
    (_name, testCase) => {
      expect(absoluteDayToDate(testCase.absoluteDay)).toEqual(testCase.expected)
    },
  )
})

describe('predictor parity fixtures', () => {
  it.each(oracle.predictorCases.map((testCase) => [testCase.name, testCase] as const))(
    'matches C# predictor case: %s',
    (_name, testCase: OraclePredictorCase) => {
      expect(runPredictorCase(testCase)).toEqual(testCase.expected)
    },
  )
})

describe('search parity fixtures', () => {
  it.each(oracle.searchCases.map((testCase) => [testCase.name, testCase] as const))(
    'matches C# search case: %s',
    (_name, testCase: OracleSearchCase) => {
      const messages: SearchMessage[] = []
      const request = toSearchRequest(testCase.request)
      const found = searchSeeds(request, {
        now: constantClock(),
        onMessage(message) {
          messages.push(message)
        },
      })

      expect(found).toEqual(testCase.expected)
      expect(found).toHaveLength(Math.min(testCase.request.outputLimit, testCase.expected.length))
      expect(messages[0]).toEqual({ type: 'start', total: testCase.request.endSeed - testCase.request.startSeed + 1 })
      expect(messages.at(-1)).toMatchObject({ type: 'complete', totalFound: found.length, cancelled: false })
      expectProgressMonotonic(messages)
      expectFoundDetailsMatchEnabledFeatures(messages, request)
    },
  )

  it('marks complete as cancelled when the signal is already aborted', () => {
    const controller = new AbortController()
    controller.abort()
    const request = toSearchRequest(oracle.searchCases[0].request)
    const messages: SearchMessage[] = []

    const found = searchSeeds(request, {
      signal: controller.signal,
      now: constantClock(),
      onMessage(message) {
        messages.push(message)
      },
    })

    expect(found).toEqual([])
    expect(messages.at(-1)).toMatchObject({ type: 'complete', totalFound: 0, cancelled: true })
  })

  it('honors outputLimit independently of the fixture limit', () => {
    const fixtureCase = oracle.searchCases.find((testCase) => testCase.expected.length >= 3)
    expect(fixtureCase).toBeDefined()

    if (!fixtureCase) throw new Error('Expected at least one fixture with three results')

    const request = { ...toSearchRequest(fixtureCase.request), outputLimit: 2 }
    const found = searchSeeds(request, {
      now: constantClock(),
      onMessage() {},
    })

    expect(found).toEqual(fixtureCase.expected.slice(0, 2))
  })
})

function runPredictorCase(testCase: OraclePredictorCase): unknown {
  switch (testCase.kind) {
    case 'weather':
      return new WeatherPredictor(testCase.input.weatherConditions.map(toWeatherCondition)).predictWeatherWithDetail(
        testCase.seed,
        testCase.useLegacyRandom,
      )
    case 'mineChest':
      return new MineChestPredictor(testCase.input.mineChestConditions).getDetails(testCase.seed, testCase.useLegacyRandom)
    case 'desertFestival':
      return new DesertFestivalPredictor(testCase.input.desertFestivalCondition).predictVendors(
        testCase.seed,
        testCase.useLegacyRandom,
      )
    case 'fairy':
      return {
        days: new FairyPredictor(testCase.input.fairyConditions.map(toFairyCondition)).getFairyDays(
          testCase.seed,
          testCase.useLegacyRandom,
        ),
      }
    case 'monsterLevel':
      return new MonsterLevelPredictor(testCase.input.monsterLevelConditions.map(toMonsterLevelCondition)).getDetails()
    case 'cart':
      return {
        matches: new TravelingCartPredictor(testCase.input.cartConditions.map(toCartCondition)).getCartMatches(
          testCase.seed,
          testCase.useLegacyRandom,
        ),
      }
  }
}

function expectProgressMonotonic(messages: SearchMessage[]): void {
  const progressMessages = messages.filter((message): message is Extract<SearchMessage, { type: 'progress' }> => message.type === 'progress')
  expect(progressMessages.length).toBeGreaterThan(0)

  let lastChecked = 0
  let lastProgress = 0
  for (const message of progressMessages) {
    expect(message.checkedCount).toBeGreaterThanOrEqual(lastChecked)
    expect(message.progress).toBeGreaterThanOrEqual(lastProgress)
    expect(message.checkedCount).toBeLessThanOrEqual(message.total)
    lastChecked = message.checkedCount
    lastProgress = message.progress
  }
}

function expectFoundDetailsMatchEnabledFeatures(messages: SearchMessage[], request: SearchRequest): void {
  const foundMessages = messages.filter((message): message is Extract<SearchMessage, { type: 'found' }> => message.type === 'found')
  for (const message of foundMessages) {
    expect(message.enabledFeatures).toEqual(getEnabledFeatures(request))
    expect(message.details).toEqual(predictSeedDetails(message.seed, request))

    expect(message.details.weather === null).toBe(!message.enabledFeatures.weather)
    expect(message.details.fairy === null).toBe(!message.enabledFeatures.fairy)
    expect(message.details.mineChest === null).toBe(!message.enabledFeatures.mineChest)
    expect(message.details.monsterLevel === null).toBe(!message.enabledFeatures.monsterLevel)
    expect(message.details.desertFestival === null).toBe(!message.enabledFeatures.desertFestival)
    expect(message.details.cart === null).toBe(!message.enabledFeatures.cart)
  }
}

function constantClock(): () => number {
  return () => 1000
}

function hashCaseName(testCase: OracleHashCase): string {
  if (testCase.kind === 'string') return testCase.value
  return testCase.name
}

function toSearchRequest(request: SearchRequestJson): SearchRequest {
  return {
    ...request,
    weatherConditions: request.weatherConditions.map(toWeatherCondition),
    fairyConditions: request.fairyConditions.map(toFairyCondition),
    monsterLevelConditions: request.monsterLevelConditions.map(toMonsterLevelCondition),
    cartConditions: request.cartConditions.map(toCartCondition),
  }
}

function toWeatherCondition(condition: WeatherConditionJson): WeatherCondition {
  return { ...condition, season: toSeason(condition.season) }
}

function toFairyCondition(condition: FairyConditionJson): FairyCondition {
  return {
    ...condition,
    startSeason: toSeason(condition.startSeason),
    endSeason: toSeason(condition.endSeason),
  }
}

function toMonsterLevelCondition(condition: MonsterLevelConditionJson): MonsterLevelCondition {
  return {
    ...condition,
    startSeason: toSeason(condition.startSeason),
    endSeason: toSeason(condition.endSeason),
  }
}

function toCartCondition(condition: CartConditionJson): CartCondition {
  return {
    ...condition,
    startSeason: toSeason(condition.startSeason),
    endSeason: toSeason(condition.endSeason),
  }
}

function toSeason(season: number): Season {
  if (season !== 0 && season !== 1 && season !== 2 && season !== 3) {
    throw new Error(`Invalid fixture season: ${season}`)
  }
  return season
}
