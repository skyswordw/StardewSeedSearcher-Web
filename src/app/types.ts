import type { EnabledFeatures, SeedDetails } from '../search-core'

export interface FoundSeed {
  seed: number
  details: SeedDetails
  enabled: EnabledFeatures
}

export interface FeatureStatView {
  name: string
  passCount: number
}

export type SearchStatus =
  | { type: 'idle' }
  | { type: 'searching'; start: number; end: number }
  | { type: 'stopping' }
  | { type: 'stopped'; totalFound: number }
  | { type: 'completed'; totalFound: number }
  | { type: 'copyFailed' }

export type FeatureId = 'weather' | 'fairy' | 'mineChest' | 'monsterLevel' | 'desertFestival' | 'cart'
