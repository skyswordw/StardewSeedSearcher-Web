import type {
  EnabledFeatures,
  FeatureStats,
  SearchCallbacks,
  SearchFeature,
  SearchMessage,
  SearchRequest,
  SeedDetails,
} from './types'
import { INT_MAX } from './types'
import { DesertFestivalPredictor } from './predictors/desertFestival'
import { FairyPredictor } from './predictors/fairy'
import { MineChestPredictor } from './predictors/mineChest'
import { MonsterLevelPredictor } from './predictors/monsterLevel'
import { TravelingCartPredictor } from './predictors/travelingCart'
import { WeatherPredictor } from './predictors/weather'

interface FeatureBundle {
  weather?: WeatherPredictor
  fairy?: FairyPredictor
  mineChest?: MineChestPredictor
  monsterLevel?: MonsterLevelPredictor
  desertFestival?: DesertFestivalPredictor
  cart?: TravelingCartPredictor
  features: SearchFeature[]
}

export function normalizeSearchRequest(request: Partial<SearchRequest>): SearchRequest {
  return {
    startSeed: Math.max(1, Math.trunc(request.startSeed ?? 1)),
    endSeed: Math.min(INT_MAX, Math.trunc(request.endSeed ?? request.startSeed ?? 1)),
    useLegacyRandom: Boolean(request.useLegacyRandom),
    weatherConditions: request.weatherConditions ?? [],
    fairyConditions: request.fairyConditions ?? [],
    mineChestConditions: request.mineChestConditions ?? [],
    monsterLevelConditions: request.monsterLevelConditions ?? [],
    desertFestivalCondition: request.desertFestivalCondition ?? null,
    cartConditions: request.cartConditions ?? [],
    outputLimit: Math.max(1, Math.trunc(request.outputLimit ?? 20)),
  }
}

export function initializeFeatures(request: SearchRequest): FeatureBundle {
  const bundle: FeatureBundle = { features: [] }

  if (request.weatherConditions.length > 0) {
    bundle.weather = new WeatherPredictor(request.weatherConditions)
    bundle.features.push(bundle.weather)
  }
  if (request.fairyConditions.length > 0) {
    bundle.fairy = new FairyPredictor(request.fairyConditions)
    bundle.features.push(bundle.fairy)
  }
  if (request.mineChestConditions.length > 0) {
    bundle.mineChest = new MineChestPredictor(request.mineChestConditions)
    bundle.features.push(bundle.mineChest)
  }
  if (request.monsterLevelConditions.length > 0) {
    bundle.monsterLevel = new MonsterLevelPredictor(request.monsterLevelConditions)
    bundle.features.push(bundle.monsterLevel)
  }
  if (request.desertFestivalCondition?.requireJas || request.desertFestivalCondition?.requireLeah) {
    bundle.desertFestival = new DesertFestivalPredictor(request.desertFestivalCondition)
    bundle.features.push(bundle.desertFestival)
  }
  if (request.cartConditions.length > 0) {
    bundle.cart = new TravelingCartPredictor(request.cartConditions)
    bundle.features.push(bundle.cart)
  }

  return bundle
}

export function getEnabledFeatures(request: SearchRequest): EnabledFeatures {
  return {
    weather: request.weatherConditions.length > 0,
    weatherSeasons: Array.from(new Set(request.weatherConditions.map((condition) => condition.season))),
    fairy: request.fairyConditions.length > 0,
    mineChest: request.mineChestConditions.length > 0,
    monsterLevel: request.monsterLevelConditions.length > 0,
    desertFestival: Boolean(request.desertFestivalCondition?.requireJas || request.desertFestivalCondition?.requireLeah),
    cart: request.cartConditions.length > 0,
  }
}

export function predictSeedDetails(seed: number, request: SearchRequest, bundle = initializeFeatures(request)): SeedDetails {
  return {
    weather: bundle.weather ? bundle.weather.predictWeatherWithDetail(seed, request.useLegacyRandom) : null,
    fairy: bundle.fairy ? { days: bundle.fairy.getFairyDays(seed, request.useLegacyRandom) } : null,
    mineChest: bundle.mineChest ? bundle.mineChest.getDetails(seed, request.useLegacyRandom) : null,
    monsterLevel: bundle.monsterLevel ? bundle.monsterLevel.getDetails() : null,
    desertFestival: bundle.desertFestival ? bundle.desertFestival.predictVendors(seed, request.useLegacyRandom) : null,
    cart: bundle.cart ? { matches: bundle.cart.getCartMatches(seed, request.useLegacyRandom) } : null,
  }
}

export function searchSeeds(rawRequest: SearchRequest, callbacks: SearchCallbacks): number[] {
  const request = normalizeSearchRequest(rawRequest)
  const bundle = initializeFeatures(request)
  const sortedFeatures = [...bundle.features].sort((a, b) => a.estimateCost(request.useLegacyRandom) - b.estimateCost(request.useLegacyRandom))
  const passCounts = new Map(sortedFeatures.map((feature) => [feature.name, 0]))
  const foundSeeds: number[] = []
  const total = request.endSeed - request.startSeed + 1
  let checkedCount = 0
  const started = callbacks.now?.() ?? performance.now()

  callbacks.onMessage({ type: 'start', total })

  for (let seed = request.startSeed; seed <= request.endSeed; seed += 1) {
    if (callbacks.signal?.aborted) break

    let allMatch = true
    for (const feature of sortedFeatures) {
      if (!feature.check(seed, request.useLegacyRandom)) {
        allMatch = false
        break
      }
      passCounts.set(feature.name, (passCounts.get(feature.name) ?? 0) + 1)
    }

    checkedCount += 1

    if (allMatch) {
      foundSeeds.push(seed)
      callbacks.onMessage({
        type: 'found',
        seed,
        details: predictSeedDetails(seed, request, bundle),
        enabledFeatures: getEnabledFeatures(request),
      })
      if (foundSeeds.length >= request.outputLimit) break
    }

    if (checkedCount % 1000 === 0 || checkedCount === total || seed === request.endSeed) {
      callbacks.onMessage(progressMessage(checkedCount, total, passCounts, started, callbacks.now))
    }
  }

  callbacks.onMessage(progressMessage(checkedCount, total, passCounts, started, callbacks.now))
  callbacks.onMessage({
    type: 'complete',
    totalFound: foundSeeds.length,
    elapsed: elapsedSeconds(started, callbacks.now),
    cancelled: Boolean(callbacks.signal?.aborted),
  })

  return foundSeeds
}

export async function searchSeedsAsync(
  rawRequest: SearchRequest,
  callbacks: SearchCallbacks,
  options: { yieldEvery?: number } = {},
): Promise<number[]> {
  const request = normalizeSearchRequest(rawRequest)
  const bundle = initializeFeatures(request)
  const sortedFeatures = [...bundle.features].sort((a, b) => a.estimateCost(request.useLegacyRandom) - b.estimateCost(request.useLegacyRandom))
  const passCounts = new Map(sortedFeatures.map((feature) => [feature.name, 0]))
  const foundSeeds: number[] = []
  const total = request.endSeed - request.startSeed + 1
  const yieldEvery = Math.max(100, Math.trunc(options.yieldEvery ?? 2000))
  let checkedCount = 0
  const started = callbacks.now?.() ?? performance.now()

  callbacks.onMessage({ type: 'start', total })

  for (let seed = request.startSeed; seed <= request.endSeed; seed += 1) {
    if (callbacks.signal?.aborted) break

    let allMatch = true
    for (const feature of sortedFeatures) {
      if (!feature.check(seed, request.useLegacyRandom)) {
        allMatch = false
        break
      }
      passCounts.set(feature.name, (passCounts.get(feature.name) ?? 0) + 1)
    }

    checkedCount += 1

    if (allMatch) {
      foundSeeds.push(seed)
      callbacks.onMessage({
        type: 'found',
        seed,
        details: predictSeedDetails(seed, request, bundle),
        enabledFeatures: getEnabledFeatures(request),
      })
      if (foundSeeds.length >= request.outputLimit) break
    }

    if (checkedCount % 1000 === 0 || checkedCount === total || seed === request.endSeed) {
      callbacks.onMessage(progressMessage(checkedCount, total, passCounts, started, callbacks.now))
    }

    if (checkedCount % yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  callbacks.onMessage(progressMessage(checkedCount, total, passCounts, started, callbacks.now))
  callbacks.onMessage({
    type: 'complete',
    totalFound: foundSeeds.length,
    elapsed: elapsedSeconds(started, callbacks.now),
    cancelled: Boolean(callbacks.signal?.aborted),
  })

  return foundSeeds
}

function progressMessage(
  checkedCount: number,
  total: number,
  passCounts: Map<string, number>,
  started: number,
  now?: () => number,
): Extract<SearchMessage, { type: 'progress' }> {
  const elapsed = elapsedSeconds(started, now)
  const speed = elapsed > 0 ? Math.round(checkedCount / elapsed) : 0
  return {
    type: 'progress',
    checkedCount,
    total,
    progress: total > 0 ? Math.round((checkedCount / total) * 10_000) / 100 : 100,
    speed,
    elapsed: Math.round(elapsed * 10) / 10,
    featureStats: featureStats(passCounts),
  }
}

function elapsedSeconds(started: number, now?: () => number): number {
  return ((now?.() ?? performance.now()) - started) / 1000
}

function featureStats(passCounts: Map<string, number>): FeatureStats[] {
  return [...passCounts.entries()].map(([name, passCount]) => ({ name, passCount }))
}
