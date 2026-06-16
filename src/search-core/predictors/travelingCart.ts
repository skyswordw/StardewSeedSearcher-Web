import { CsRandom, csharpDiv } from '../csharp'
import { optimizedCartItems, skillBooks, skillBookSet } from '../data/travelingCart'
import { getHashFromString, getRandomSeed } from '../hash'
import { absoluteDayToDate, dateToAbsoluteDay } from '../time'
import type { CartCondition, CartDayMatch, SearchFeature } from '../types'

interface CartItem {
  category: string
  name: string
  quantity: number
  price: number
}

function start(condition: CartCondition): number {
  return dateToAbsoluteDay(condition.startYear, condition.startSeason, condition.startDay)
}

function end(condition: CartCondition): number {
  return dateToAbsoluteDay(condition.endYear, condition.endSeason, condition.endDay)
}

export class TravelingCartPredictor implements SearchFeature {
  readonly name = '猪车预测'
  conditions: CartCondition[]

  constructor(conditions: CartCondition[] = []) {
    this.conditions = conditions
  }

  check(seed: number, useLegacyRandom: boolean): boolean {
    if (this.conditions.length === 0) return true
    const sorted = [...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))
    const originalGuarantee = new CsRandom(getRandomSeed(12 * seed, 0, 0, 0, 0, useLegacyRandom)).next(2, 31)

    for (const condition of sorted) {
      let matches = 0
      for (let day = start(condition); day <= end(condition); day += 1) {
        if (!isCartDay(day)) continue
        if (this.internalDayMatch(seed, day, originalGuarantee, condition, useLegacyRandom)) {
          matches += 1
          if (matches >= Math.max(1, condition.minOccurrences)) break
        }
      }
      if (matches < Math.max(1, condition.minOccurrences)) return false
    }

    return true
  }

  estimateCost(): number {
    if (this.conditions.length === 0) return 0
    return this.estimateConditionCost([...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))[0])
  }

  getCartMatches(seed: number, useLegacyRandom: boolean): CartDayMatch[] {
    return this.conditions.flatMap((condition) =>
      this.findAllMatches(seed, start(condition), end(condition), condition.itemName, condition.requireQty5, useLegacyRandom),
    )
  }

  predictCartDay(gameID: number, day: number, originalGuarantee: number, useLegacyRandom: boolean): CartItem[] {
    const rng = new CsRandom(getRandomSeed(day, csharpDiv(gameID, 2), 0, 0, 0, useLegacyRandom))
    const selectedItemKeys = this.getRandomItems(rng)
    let seenRareSeed = false
    const items: CartItem[] = []

    selectedItemKeys.forEach((itemKey, index) => {
      const item = optimizedCartItems[itemKey]
      const price = Math.max(rng.next(1, 11) * 100, rng.next(3, 6) * item.price)
      const quantity = rng.nextDouble() < 0.1 ? 5 : 1
      if (item.name === 'Rare Seed') seenRareSeed = true
      items.push({ category: `基础物品${index + 1}`, name: item.name, quantity, price })
    })

    if (this.calculateVisitsRemaining(day, originalGuarantee) === 0) {
      rng.next(1, 11)
      rng.next(3, 6)
      rng.nextDouble()
    }

    for (let i = 0; i < 645; i += 1) rng.next()
    rng.next(1, 11)

    const season = Math.trunc((day - 1) / 28)
    if (season < 2 && !seenRareSeed) rng.nextDouble()

    const skillSeed = getRandomSeed(getHashFromString('travelerSkillBook'), gameID, day, 0, 0, useLegacyRandom)
    if (new CsRandom(skillSeed).nextDouble() < 0.05) {
      items.push({ category: '技能书', name: skillBooks[rng.next(skillBooks.length)], quantity: -1, price: 6000 })
    } else {
      items.push({ category: '技能书', name: '(None)', quantity: 0, price: 0 })
    }

    return items
  }

  private findAllMatches(
    seed: number,
    startDay: number,
    endDay: number,
    itemName: string,
    requireQty5: boolean,
    useLegacyRandom: boolean,
    stopAt = Number.MAX_SAFE_INTEGER,
  ): CartDayMatch[] {
    const matches: CartDayMatch[] = []
    const originalGuarantee = new CsRandom(getRandomSeed(12 * seed, 0, 0, 0, 0, useLegacyRandom)).next(2, 31)

    for (let day = startDay; day <= endDay; day += 1) {
      if (!isCartDay(day)) continue
      const items = this.predictCartDay(seed, day, originalGuarantee, useLegacyRandom)
      const match = items.find((item) => item.name === itemName && (!requireQty5 || item.quantity === 5))
      if (match) {
        const date = absoluteDayToDate(day)
        matches.push({
          year: date.year,
          season: date.season,
          day: date.day,
          absoluteDay: day,
          itemName: match.name,
          quantity: match.quantity,
          price: match.price,
        })
      }
      if (matches.length >= stopAt) break
    }

    return matches
  }

  private internalDayMatch(
    seed: number,
    day: number,
    originalGuarantee: number,
    condition: CartCondition,
    useLegacyRandom: boolean,
  ): boolean {
    const isBookSearch = skillBookSet.has(condition.itemName)
    if (isBookSearch) {
      const skillSeed = getRandomSeed(getHashFromString('travelerSkillBook'), seed, day, 0, 0, useLegacyRandom)
      if (new CsRandom(skillSeed).nextDouble() >= 0.05) return false
    }

    const rng = new CsRandom(getRandomSeed(day, csharpDiv(seed, 2), 0, 0, 0, useLegacyRandom))
    const { topIndices } = this.selectTopItems(rng)
    let seenRareSeed = false

    if (!isBookSearch) {
      for (let i = 0; i < 10; i += 1) {
        const item = optimizedCartItems[topIndices[i]]
        if (item.name === condition.itemName) {
          for (let k = 0; k < i; k += 1) {
            rng.next(1, 11)
            rng.next(3, 6)
            rng.nextDouble()
          }
          rng.next(1, 11)
          rng.next(3, 6)
          const qty = rng.nextDouble() < 0.1 ? 5 : 1
          return !condition.requireQty5 || qty === 5
        }
      }
      return false
    }

    for (let i = 0; i < 10; i += 1) {
      if (optimizedCartItems[topIndices[i]].name === 'Rare Seed') seenRareSeed = true
      rng.next(1, 11)
      rng.next(3, 6)
      rng.nextDouble()
    }

    if (this.calculateVisitsRemaining(day, originalGuarantee) === 0) {
      rng.next(1, 11)
      rng.next(3, 6)
      rng.nextDouble()
    }

    for (let i = 0; i < 645; i += 1) rng.next()
    rng.next(1, 11)
    if (Math.trunc((day - 1) / 28) < 2 && !seenRareSeed) rng.nextDouble()

    return skillBooks[rng.next(skillBooks.length)] === condition.itemName
  }

  private getRandomItems(rng: CsRandom): number[] {
    return [...this.selectTopItems(rng).topIndices]
  }

  private selectTopItems(rng: CsRandom): { topKeys: number[]; topIndices: number[] } {
    const topKeys = Array(10).fill(Number.MAX_SAFE_INTEGER)
    const topIndices = Array(10).fill(0)

    optimizedCartItems.forEach((item, index) => {
      const randomKey = rng.next()
      if (!item.isEligible) return
      if (randomKey < topKeys[9]) {
        let j = 8
        while (j >= 0 && topKeys[j] > randomKey) {
          topKeys[j + 1] = topKeys[j]
          topIndices[j + 1] = topIndices[j]
          j -= 1
        }
        topKeys[j + 1] = randomKey
        topIndices[j + 1] = index
      }
    })

    return { topKeys, topIndices }
  }

  private calculateVisitsRemaining(day: number, originalGuarantee: number): number {
    let visitsNow = originalGuarantee - Math.trunc(day / 7) - Math.trunc((day + 2) / 7)
    if (day >= 99) visitsNow -= 1
    if (day >= 100) visitsNow -= 1
    if (day >= 101) visitsNow -= 1
    return visitsNow
  }

  private estimateConditionCost(condition: CartCondition): number {
    const maxCalls = 1381
    const calls = skillBookSet.has(condition.itemName) ? 0.05 * maxCalls : 730
    return countCartDay(start(condition), end(condition)) * calls
  }
}

export function isCartDay(day: number): boolean {
  const dayOfWeek = day % 7
  const dayOfYear = day % 112
  if (dayOfWeek === 5 || dayOfWeek === 0) return true
  if (dayOfYear >= 15 && dayOfYear <= 17) return true
  if (dayOfYear >= 99 && dayOfYear <= 101) return true
  return false
}

export function countCartDay(absoluteStartDay: number, absoluteEndDay: number): number {
  let total = 0
  for (let day = absoluteStartDay; day <= absoluteEndDay; day += 1) {
    if (isCartDay(day)) total += 1
  }
  return total
}

export function predictTravelingCart(seed: number, useLegacyRandom: boolean, conditions: CartCondition[]): CartDayMatch[] {
  return new TravelingCartPredictor(conditions).getCartMatches(seed, useLegacyRandom)
}
