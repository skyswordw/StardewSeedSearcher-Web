import { CsRandom, csharpDiv } from '../csharp'
import { getRandomSeed } from '../hash'
import { absoluteDayToDate, dateToAbsoluteDay } from '../time'
import type { FairyCondition, FairyDayDetail, SearchFeature } from '../types'
import { WeatherPredictor } from './weather'

function start(condition: FairyCondition): number {
  return dateToAbsoluteDay(condition.startYear, condition.startSeason, condition.startDay)
}

function end(condition: FairyCondition): number {
  return dateToAbsoluteDay(condition.endYear, condition.endSeason, condition.endDay)
}

export class FairyPredictor implements SearchFeature {
  readonly name = '仙子预测'
  conditions: FairyCondition[]

  constructor(conditions: FairyCondition[] = []) {
    this.conditions = conditions
  }

  check(seed: number, useLegacyRandom: boolean): boolean {
    if (this.conditions.length === 0) return true
    const weather = new WeatherPredictor()
    const greenRainDay = weather.getGreenRainDay(seed, useLegacyRandom)
    const sorted = [...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))

    for (const condition of sorted) {
      let foundCount = 0
      const conditionStart = start(condition)
      const conditionEnd = end(condition)

      for (let day = conditionStart; day <= conditionEnd; day += 1) {
        if (foundCount + conditionEnd - day + 1 < condition.minOccurrences) return false
        const date = absoluteDayToDate(day)
        if (date.season >= 3) continue
        if (!this.hasFairy(seed, day, useLegacyRandom)) continue

        const nextDayAbs = day + 1
        const nextDate = absoluteDayToDate(nextDayAbs)
        const isNextDayRainy = weather.isRainyDay(
          nextDate.season,
          nextDate.day,
          nextDayAbs,
          seed,
          useLegacyRandom,
          greenRainDay,
        )
        if (!isNextDayRainy) {
          foundCount += 1
          if (foundCount >= condition.minOccurrences) break
        }
      }
      if (foundCount < condition.minOccurrences) return false
    }

    return true
  }

  estimateCost(useLegacyRandom: boolean): number {
    if (this.conditions.length === 0) return 0
    const callsPerDay = useLegacyRandom ? 1 : 11
    const best = [...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))[0]
    return this.estimateConditionCost(best) * callsPerDay
  }

  getFairyDays(seed: number, useLegacyRandom: boolean): FairyDayDetail[] {
    const days: FairyDayDetail[] = []
    const weather = new WeatherPredictor()
    const greenRainDay = weather.getGreenRainDay(seed, useLegacyRandom)

    for (const condition of this.conditions) {
      for (let day = start(condition); day <= end(condition); day += 1) {
        const date = absoluteDayToDate(day)
        if (date.season >= 3) continue
        if (!this.hasFairy(seed, day, useLegacyRandom)) continue
        const nextDayAbs = day + 1
        const nextDate = absoluteDayToDate(nextDayAbs)
        days.push({
          year: date.year,
          season: date.season,
          day: date.day,
          isBlocked: weather.isRainyDay(nextDate.season, nextDate.day, nextDayAbs, seed, useLegacyRandom, greenRainDay),
        })
      }
    }

    return days
  }

  private hasFairy(gameID: number, day: number, useLegacyRandom: boolean): boolean {
    const rng = new CsRandom(getRandomSeed(day + 1, csharpDiv(gameID, 2), 0, 0, 0, useLegacyRandom))
    for (let i = 0; i < 10; i += 1) rng.nextDouble()
    return rng.nextDouble() < 0.01
  }

  private estimateConditionCost(condition: FairyCondition): number {
    return end(condition) - start(condition) + 1
  }
}

export function predictFairy(seed: number, useLegacyRandom: boolean, conditions: FairyCondition[]): FairyDayDetail[] {
  return new FairyPredictor(conditions).getFairyDays(seed, useLegacyRandom)
}
