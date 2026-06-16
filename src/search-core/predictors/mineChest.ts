import { CsRandom } from '../csharp'
import { getRandomSeed } from '../hash'
import { mineChestItems } from '../data/mineChest'
import type { MineChestCondition, MineChestDetail, SearchFeature } from '../types'

export class MineChestPredictor implements SearchFeature {
  readonly name = '矿井宝箱'
  conditions: MineChestCondition[]

  constructor(conditions: MineChestCondition[] = []) {
    this.conditions = conditions
  }

  check(gameID: number, useLegacyRandom: boolean): boolean {
    return this.conditions.every((condition) => this.predictItem(gameID, condition.floor, useLegacyRandom) === condition.itemName)
  }

  estimateCost(): number {
    return this.conditions.length
  }

  getDetails(gameID: number, useLegacyRandom: boolean): MineChestDetail[] {
    return this.conditions.map((condition) => {
      const item = this.predictItem(gameID, condition.floor, useLegacyRandom)
      return { floor: condition.floor, item, matched: item === condition.itemName }
    })
  }

  predictItem(gameID: number, floor: number, useLegacyRandom: boolean): string {
    let seed: number
    if (useLegacyRandom) {
      seed = getRandomSeed(((gameID * 512 + floor) % Number.MAX_SAFE_INTEGER) % 2_147_483_647, 0, 0, 0, 0, true)
    } else {
      seed = getRandomSeed(((gameID * 512) % 2_147_483_647) | 0, floor, 0, 0, 0, false)
    }

    const items = mineChestItems[floor]
    return items[new CsRandom(seed).next(items.length)]
  }
}

export function predictMineChest(seed: number, useLegacyRandom: boolean, conditions: MineChestCondition[]): MineChestDetail[] {
  return new MineChestPredictor(conditions).getDetails(seed, useLegacyRandom)
}
