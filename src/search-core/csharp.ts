import { INT_MAX, INT_MIN } from './types'

const MBIG = INT_MAX
const MSEED = 161_803_398

export function toInt32(value: number): number {
  return value | 0
}

export function csharpDiv(a: number, b: number): number {
  return Math.trunc(a / b)
}

export function csharpMod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b
}

export function positiveMod(a: number, b: number): number {
  const result = csharpMod(a, b)
  return result < 0 ? result + b : result
}

export function int32Mul(a: number, b: number): number {
  return Math.imul(a, b)
}

export class CsRandom {
  private inext = 0
  private inextp = 21
  private seedArray = new Int32Array(56)

  constructor(seed: number) {
    const intSeed = toInt32(seed)
    const subtraction = intSeed === INT_MIN ? INT_MAX : Math.abs(intSeed)
    let mj = MSEED - subtraction
    this.seedArray[55] = mj
    let mk = 1

    for (let i = 1; i < 55; i += 1) {
      const ii = (21 * i) % 55
      this.seedArray[ii] = mk
      mk = mj - mk
      if (mk < 0) mk += MBIG
      mj = this.seedArray[ii]
    }

    for (let k = 1; k < 5; k += 1) {
      for (let i = 1; i < 56; i += 1) {
        this.seedArray[i] -= this.seedArray[1 + ((i + 30) % 55)]
        if (this.seedArray[i] < 0) this.seedArray[i] += MBIG
      }
    }
  }

  private internalSample(): number {
    let locINext = this.inext + 1
    let locINextp = this.inextp + 1
    if (locINext >= 56) locINext = 1
    if (locINextp >= 56) locINextp = 1

    let retVal = this.seedArray[locINext] - this.seedArray[locINextp]
    if (retVal === MBIG) retVal -= 1
    if (retVal < 0) retVal += MBIG

    this.seedArray[locINext] = retVal
    this.inext = locINext
    this.inextp = locINextp
    return retVal
  }

  sample(): number {
    return this.internalSample() * (1.0 / MBIG)
  }

  next(): number
  next(maxValue: number): number
  next(minValue: number, maxValue: number): number
  next(minValue?: number, maxValue?: number): number {
    if (minValue === undefined) return this.internalSample()
    if (maxValue === undefined) {
      if (minValue < 0) throw new RangeError('maxValue must be positive')
      return Math.floor(this.sample() * minValue)
    }
    if (minValue > maxValue) throw new RangeError('minValue must be smaller than maxValue')
    const range = maxValue - minValue
    if (range <= INT_MAX) return Math.floor(this.sample() * range) + minValue
    return Math.floor(this.getSampleForLargeRange() * range) + minValue
  }

  nextDouble(): number {
    return this.sample()
  }

  private getSampleForLargeRange(): number {
    let result = this.internalSample()
    if (this.internalSample() % 2 === 0) result = -result
    let d = result
    d += INT_MAX - 1
    d /= 2 * INT_MAX - 1
    return d
  }
}
