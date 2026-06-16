import { CsRandom, csharpDiv } from '../csharp'
import { getRandomSeed } from '../hash'
import type { DesertFestivalCondition, DesertFestivalDetail, SearchFeature } from '../types'

const possibleVendors = new Set([
  'Abigail',
  'Caroline',
  'Clint',
  'Demetrius',
  'Elliott',
  'Emily',
  'Evelyn',
  'George',
  'Gus',
  'Haley',
  'Harvey',
  'Jas',
  'Jodi',
  'Alex',
  'Kent',
  'Leah',
  'Marnie',
  'Maru',
  'Pam',
  'Penny',
  'Pierre',
  'Robin',
  'Sam',
  'Sebastian',
  'Shane',
  'Vincent',
  'Leo',
])

const scheduleExclusion: Record<number, Set<string>> = {
  0: new Set(['Abigail', 'Caroline', 'Elliott', 'Gus', 'Alex', 'Leah', 'Pierre', 'Sam', 'Sebastian', 'Haley']),
  1: new Set(['Haley', 'Clint', 'Demetrius', 'Maru', 'Pam', 'Penny', 'Robin', 'Leo']),
  2: new Set(['Evelyn', 'George', 'Jas', 'Jodi', 'Kent', 'Marnie', 'Shane', 'Vincent']),
}

const charactersInOrder = [
  'Evelyn',
  'George',
  'Alex',
  'Emily',
  'Haley',
  'Jodi',
  'Sam',
  'Vincent',
  'Clint',
  'Lewis',
  'Abigail',
  'Caroline',
  'Pierre',
  'Gus',
  'Pam',
  'Penny',
  'Harvey',
  'Elliott',
  'Demetrius',
  'Maru',
  'Robin',
  'Sebastian',
  'Linus',
  'Wizard',
  'Jas',
  'Marnie',
  'Shane',
  'Leah',
  'Dwarf',
  'Sandy',
  'Willy',
]

export class DesertFestivalPredictor implements SearchFeature {
  readonly name = '沙漠节'
  condition: DesertFestivalCondition

  constructor(condition: DesertFestivalCondition) {
    this.condition = condition
  }

  check(gameID: number, useLegacyRandom: boolean): boolean {
    if (!this.condition.requireJas && !this.condition.requireLeah) return true
    const vendors = this.predictVendors(gameID, useLegacyRandom)
    const flat = [vendors.day15, vendors.day16, vendors.day17].flat()
    if (this.condition.requireJas && !flat.includes('Jas')) return false
    if (this.condition.requireLeah && !flat.includes('Leah')) return false
    return true
  }

  estimateCost(): number {
    return 12
  }

  predictVendors(gameID: number, useLegacyRandom: boolean): DesertFestivalDetail {
    const days: string[][] = [[], [], []]

    for (let d = 0; d < 3; d += 1) {
      const day = 15 + d
      const vendorPool = this.buildVendorPool(d)
      const rng = new CsRandom(getRandomSeed(day, csharpDiv(gameID, 2), 0, 0, 0, useLegacyRandom))

      for (let k = 0; k < d; k += 1) {
        for (let m = 0; m < 2; m += 1) {
          vendorPool.splice(rng.next(vendorPool.length), 1)
        }
      }

      for (let i = 0; i < 2; i += 1) {
        const index = rng.next(vendorPool.length)
        days[d].push(vendorPool[index])
        vendorPool.splice(index, 1)
      }
    }

    return { day15: days[0], day16: days[1], day17: days[2] }
  }

  private buildVendorPool(dayIndex: number): string[] {
    const exclusion = scheduleExclusion[dayIndex]
    return charactersInOrder.filter((name) => possibleVendors.has(name) && !exclusion.has(name))
  }
}

export function predictDesertFestival(seed: number, useLegacyRandom: boolean): DesertFestivalDetail {
  return new DesertFestivalPredictor({ requireJas: false, requireLeah: false }).predictVendors(seed, useLegacyRandom)
}
