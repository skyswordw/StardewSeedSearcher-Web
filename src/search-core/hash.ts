import { csharpMod } from './csharp'
import { INT_MAX } from './types'
import { xxhash32 } from './xxhash32'

const encoder = new TextEncoder()

export function getHashFromString(value: string): number {
  return xxhash32(encoder.encode(value))
}

export function getHashFromArray(...values: number[]): number {
  const buffer = new ArrayBuffer(values.length * 4)
  const view = new DataView(buffer)
  values.forEach((value, index) => {
    view.setInt32(index * 4, value | 0, true)
  })
  return xxhash32(new Uint8Array(buffer))
}

export function getRandomSeed(
  a: number,
  b = 0,
  c = 0,
  d = 0,
  e = 0,
  useLegacyRandom = false,
): number {
  a = csharpMod(a, INT_MAX)
  b = csharpMod(b, INT_MAX)
  c = csharpMod(c, INT_MAX)
  d = csharpMod(d, INT_MAX)
  e = csharpMod(e, INT_MAX)

  if (useLegacyRandom) {
    return csharpMod(a + b + c + d + e, INT_MAX)
  }
  return getHashFromArray(a, b, c, d, e)
}
