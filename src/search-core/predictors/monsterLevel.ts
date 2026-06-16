import { CsRandom, csharpDiv } from '../csharp'
import { getRandomSeed } from '../hash'
import { dateToAbsoluteDay, getSeasonName } from '../time'
import type { MonsterLevelCondition, MonsterLevelDetail, SearchFeature } from '../types'

function start(condition: MonsterLevelCondition): number {
  return dateToAbsoluteDay(1, condition.startSeason, condition.startDay)
}

function end(condition: MonsterLevelCondition): number {
  return dateToAbsoluteDay(1, condition.endSeason, condition.endDay)
}

export class MonsterLevelPredictor implements SearchFeature {
  readonly name = '怪物层'
  conditions: MonsterLevelCondition[]

  constructor(conditions: MonsterLevelCondition[] = []) {
    this.conditions = conditions
  }

  check(gameID: number, useLegacyRandom: boolean): boolean {
    const sorted = [...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))
    for (const condition of sorted) {
      for (let day = start(condition); day <= end(condition); day += 1) {
        for (let mineLevel = condition.startLevel; mineLevel <= condition.endLevel; mineLevel += 1) {
          if (mineLevel % 5 === 0) continue
          const seed = useLegacyRandom
            ? day + mineLevel * 100 + csharpDiv(gameID, 2)
            : getRandomSeed(day, csharpDiv(gameID, 2), mineLevel * 100, 0, 0, false)
          if (new CsRandom(seed).nextDouble() < 0.044) {
            const mod40 = mineLevel % 40
            if (mod40 > 5 && mod40 < 30 && mod40 !== 19) return false
          }
        }
      }
    }
    return true
  }

  estimateCost(): number {
    if (this.conditions.length === 0) return 0
    return this.estimateConditionCost([...this.conditions].sort((a, b) => this.estimateConditionCost(a) - this.estimateConditionCost(b))[0])
  }

  getDetails(): MonsterLevelDetail[] {
    return this.conditions.map((condition) => ({
      description: this.formatConditionDescription(condition),
      satisfied: true,
      absoluteStartDay: start(condition),
    }))
  }

  private estimateConditionCost(condition: MonsterLevelCondition): number {
    let elevatorCount = 0
    for (let level = condition.startLevel; level <= condition.endLevel; level += 1) {
      if (level % 5 === 0) elevatorCount += 1
    }
    return (end(condition) - start(condition) + 1) * (condition.endLevel - condition.startLevel + 1 - elevatorCount)
  }

  private formatConditionDescription(condition: MonsterLevelCondition): string {
    const dateRange =
      start(condition) === end(condition)
        ? `${getSeasonName(condition.startSeason)}${condition.startDay}`
        : `${getSeasonName(condition.startSeason)}${condition.startDay}-${getSeasonName(condition.endSeason)}${condition.endDay}`
    return `${dateRange} ${condition.startLevel}-${condition.endLevel}层无怪物层`
  }
}

export function predictMonsterLevel(conditions: MonsterLevelCondition[]): MonsterLevelDetail[] {
  return new MonsterLevelPredictor(conditions).getDetails()
}
