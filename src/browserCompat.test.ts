import { describe, expect, it } from 'vitest'
import { createJobId, randomInt } from './browserCompat'

describe('browser compatibility helpers', () => {
  it('uses native randomUUID when available', () => {
    const cryptoSource = {
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    } as unknown as Crypto

    expect(createJobId(cryptoSource)).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('falls back to getRandomValues when randomUUID is missing', () => {
    const cryptoSource = {
      getRandomValues(values: Uint32Array) {
        values.set([1, 2, 255, 4096])
        return values
      },
    } as unknown as Crypto

    expect(createJobId(cryptoSource)).toBe('job-00000001-00000002-000000ff-00001000')
  })

  it('uses crypto-backed random integers when available', () => {
    const cryptoSource = {
      getRandomValues(values: Uint32Array) {
        values[0] = 1234
        return values
      },
    } as unknown as Crypto

    expect(randomInt(1000, cryptoSource)).toBe(234)
  })
})
