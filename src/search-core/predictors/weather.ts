import { CsRandom, csharpDiv } from '../csharp'
import { getHashFromString, getRandomSeed } from '../hash'
import { dateToAbsoluteDay } from '../time'
import type { SearchFeature, Season, WeatherCondition, WeatherDetailResult } from '../types'

const locationWeatherHash = getHashFromString('location_weather')

function absoluteStart(condition: WeatherCondition): number {
  return dateToAbsoluteDay(1, condition.season, condition.startDay)
}

function absoluteEnd(condition: WeatherCondition): number {
  return dateToAbsoluteDay(1, condition.season, condition.endDay)
}

export class WeatherPredictor implements SearchFeature {
  readonly name = '天气预测'
  conditions: WeatherCondition[]

  constructor(conditions: WeatherCondition[] = []) {
    this.conditions = conditions
  }

  check(gameID: number, useLegacyRandom: boolean): boolean {
    if (this.conditions.length === 0) return true
    const greenRainDay = this.getGreenRainDay(gameID, useLegacyRandom)
    const sorted = [...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))

    for (const condition of sorted) {
      let rainCount = 0
      const start = absoluteStart(condition)
      const end = absoluteEnd(condition)

      for (let day = start; day <= end; day += 1) {
        const dayOfMonth = ((day - 1) % 28) + 1
        if (this.isRainyDay(condition.season, dayOfMonth, day, gameID, useLegacyRandom, greenRainDay)) {
          rainCount += 1
          if (rainCount >= condition.minRainDays) break
        }
        const remainingDays = end - day
        if (rainCount + remainingDays < condition.minRainDays) return false
      }

      if (rainCount < condition.minRainDays) return false
    }

    return true
  }

  estimateCost(useLegacyRandom: boolean): number {
    void useLegacyRandom
    if (this.conditions.length === 0) return 0
    const best = [...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))[0]
    return 56 + this.estimateConditionCost(best)
  }

  isRainyDay(
    season: number,
    dayOfMonth: number,
    absoluteDay: number,
    gameID: number,
    useLegacyRandom: boolean,
    greenRainDay: number,
  ): boolean {
    if (dayOfMonth === 1) return false

    if (season === 0) {
      if (dayOfMonth === 3) return true
      if ([2, 4, 5, 13, 24].includes(dayOfMonth)) return false
      return this.isRainyDaySpringFall(gameID, absoluteDay, useLegacyRandom)
    }

    if (season === 1) {
      if (dayOfMonth === greenRainDay) return true
      if (dayOfMonth === 13 || dayOfMonth === 26) return true
      if (dayOfMonth === 11 || dayOfMonth === 28) return false
      return this.isRainyDaySummer(gameID, absoluteDay, useLegacyRandom, dayOfMonth)
    }

    if (season === 2) {
      if (dayOfMonth === 16 || dayOfMonth === 27) return false
      return this.isRainyDaySpringFall(gameID, absoluteDay, useLegacyRandom)
    }

    return false
  }

  getGreenRainDay(gameID: number, useLegacyRandom: boolean): number {
    const rng = new CsRandom(getRandomSeed(777, gameID, 0, 0, 0, useLegacyRandom))
    const days = [5, 6, 7, 14, 15, 16, 18, 23]
    return days[rng.next(days.length)]
  }

  isRainyDaySpringFall(gameID: number, absoluteDay: number, useLegacyRandom: boolean): boolean {
    const seed = getRandomSeed(locationWeatherHash, gameID, absoluteDay - 1, 0, 0, useLegacyRandom)
    return new CsRandom(seed).nextDouble() < 0.183
  }

  isRainyDaySummer(gameID: number, absoluteDay: number, useLegacyRandom: boolean, dayOfMonth: number): boolean {
    const seed = getRandomSeed(
      absoluteDay - 1,
      csharpDiv(gameID, 2),
      getHashFromString('summer_rain_chance'),
      0,
      0,
      useLegacyRandom,
    )
    return new CsRandom(seed).nextDouble() < 0.12 + 0.003 * (dayOfMonth - 1)
  }

  predictWeatherWithDetail(gameID: number, useLegacyRandom: boolean): WeatherDetailResult {
    const greenRainDay = this.getGreenRainDay(gameID, useLegacyRandom)
    const result: WeatherDetailResult = {
      springRain: [],
      summerRain: [],
      fallRain: [],
      greenRainDay,
    }

    for (let absoluteDay = 1; absoluteDay <= 84; absoluteDay += 1) {
      const season = Math.floor((absoluteDay - 1) / 28) as Season
      const dayOfMonth = ((absoluteDay - 1) % 28) + 1
      if (this.isRainyDay(season, dayOfMonth, absoluteDay, gameID, useLegacyRandom, greenRainDay)) {
        if (season === 0) result.springRain.push(dayOfMonth)
        if (season === 1) result.summerRain.push(dayOfMonth)
        if (season === 2) result.fallRain.push(dayOfMonth)
      }
    }

    return result
  }

  private estimateConditionCost(condition: WeatherCondition): number {
    const totalDays = absoluteEnd(condition) - absoluteStart(condition) + 1
    const theoreticalTotalDays = Math.trunc(
      condition.season === 1 ? condition.minRainDays / 0.235 : condition.minRainDays / 0.183,
    )
    return Math.min(totalDays, theoreticalTotalDays)
  }
}

export function predictWeather(seed: number, useLegacyRandom: boolean): WeatherDetailResult {
  return new WeatherPredictor().predictWeatherWithDetail(seed, useLegacyRandom)
}
