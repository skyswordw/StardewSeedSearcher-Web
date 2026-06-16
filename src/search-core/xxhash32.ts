const PRIME32_1 = 0x9e3779b1
const PRIME32_2 = 0x85ebca77
const PRIME32_3 = 0xc2b2ae3d
const PRIME32_4 = 0x27d4eb2f
const PRIME32_5 = 0x165667b1

function rotl(value: number, count: number): number {
  return (value << count) | (value >>> (32 - count))
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

function round(acc: number, input: number): number {
  acc = Math.imul((acc + Math.imul(input, PRIME32_2)) >>> 0, 1) >>> 0
  acc = rotl(acc, 13) >>> 0
  acc = Math.imul(acc, PRIME32_1) >>> 0
  return acc
}

export function xxhash32(bytes: Uint8Array, seed = 0): number {
  let offset = 0
  let h32: number

  if (bytes.length >= 16) {
    let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0
    let v2 = (seed + PRIME32_2) >>> 0
    let v3 = seed >>> 0
    let v4 = (seed - PRIME32_1) >>> 0
    const limit = bytes.length - 16
    while (offset <= limit) {
      v1 = round(v1, readU32(bytes, offset))
      offset += 4
      v2 = round(v2, readU32(bytes, offset))
      offset += 4
      v3 = round(v3, readU32(bytes, offset))
      offset += 4
      v4 = round(v4, readU32(bytes, offset))
      offset += 4
    }
    h32 = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0
  } else {
    h32 = (seed + PRIME32_5) >>> 0
  }

  h32 = (h32 + bytes.length) >>> 0

  while (offset <= bytes.length - 4) {
    h32 = (h32 + Math.imul(readU32(bytes, offset), PRIME32_3)) >>> 0
    h32 = Math.imul(rotl(h32, 17), PRIME32_4) >>> 0
    offset += 4
  }

  while (offset < bytes.length) {
    h32 = (h32 + Math.imul(bytes[offset], PRIME32_5)) >>> 0
    h32 = Math.imul(rotl(h32, 11), PRIME32_1) >>> 0
    offset += 1
  }

  h32 ^= h32 >>> 15
  h32 = Math.imul(h32, PRIME32_2) >>> 0
  h32 ^= h32 >>> 13
  h32 = Math.imul(h32, PRIME32_3) >>> 0
  h32 ^= h32 >>> 16

  return h32 | 0
}
