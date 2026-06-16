export const INT_MAX = 2_147_483_647
export const INT_MIN = -2_147_483_648

export type Season = 0 | 1 | 2 | 3

export interface WeatherCondition {
  season: Season
  startDay: number
  endDay: number
  minRainDays: number
}

export interface FairyCondition {
  startYear: number
  startSeason: Season
  startDay: number
  endYear: number
  endSeason: Season
  endDay: number
  minOccurrences: number
}

export interface MineChestCondition {
  floor: number
  itemName: string
}

export interface MonsterLevelCondition {
  startSeason: Season
  endSeason: Season
  startDay: number
  endDay: number
  startLevel: number
  endLevel: number
}

export interface DesertFestivalCondition {
  requireJas: boolean
  requireLeah: boolean
}

export interface CartCondition {
  startYear: number
  startSeason: Season
  startDay: number
  endYear: number
  endSeason: Season
  endDay: number
  itemName: string
  requireQty5: boolean
  minOccurrences: number
}

export interface SearchRequest {
  startSeed: number
  endSeed: number
  useLegacyRandom: boolean
  weatherConditions: WeatherCondition[]
  fairyConditions: FairyCondition[]
  mineChestConditions: MineChestCondition[]
  monsterLevelConditions: MonsterLevelCondition[]
  desertFestivalCondition: DesertFestivalCondition | null
  cartConditions: CartCondition[]
  outputLimit: number
}

export interface WeatherDetailResult {
  springRain: number[]
  summerRain: number[]
  fallRain: number[]
  greenRainDay: number
}

export interface FairyDayDetail {
  year: number
  season: Season
  day: number
  isBlocked: boolean
}

export interface MineChestDetail {
  floor: number
  item: string
  matched: boolean
}

export interface MonsterLevelDetail {
  description: string
  satisfied: boolean
  absoluteStartDay: number
}

export interface DesertFestivalDetail {
  day15: string[]
  day16: string[]
  day17: string[]
}

export interface CartDayMatch {
  year: number
  season: Season
  day: number
  absoluteDay: number
  itemName: string
  quantity: number
  price: number
}

export interface SeedDetails {
  weather: WeatherDetailResult | null
  fairy: { days: FairyDayDetail[] } | null
  mineChest: MineChestDetail[] | null
  monsterLevel: MonsterLevelDetail[] | null
  desertFestival: DesertFestivalDetail | null
  cart: { matches: CartDayMatch[] } | null
}

export interface EnabledFeatures {
  weather: boolean
  weatherSeasons: Season[]
  fairy: boolean
  mineChest: boolean
  monsterLevel: boolean
  desertFestival: boolean
  cart: boolean
}

export interface FeatureStats {
  name: string
  passCount: number
}

export type SearchMessage =
  | { type: 'start'; total: number }
  | {
      type: 'progress'
      checkedCount: number
      total: number
      progress: number
      speed: number
      elapsed: number
      featureStats: FeatureStats[]
    }
  | {
      type: 'found'
      seed: number
      details: SeedDetails
      enabledFeatures: EnabledFeatures
    }
  | { type: 'complete'; totalFound: number; elapsed: number; cancelled: boolean }

export interface SearchCallbacks {
  onMessage: (message: SearchMessage) => void
  signal?: AbortSignal
  now?: () => number
}

export interface SearchFeature {
  name: string
  estimateCost(useLegacyRandom: boolean): number
  check(seed: number, useLegacyRandom: boolean): boolean
}
