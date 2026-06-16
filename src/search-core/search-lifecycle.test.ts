import { describe, expect, it } from 'vitest'
import { searchSeeds, searchSeedsAsync, type SearchMessage, type SearchRequest } from './index'

function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    startSeed: 1,
    endSeed: 5_000,
    useLegacyRandom: false,
    weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 4 }],
    fairyConditions: [],
    mineChestConditions: [],
    monsterLevelConditions: [],
    desertFestivalCondition: null,
    cartConditions: [],
    outputLimit: 20,
    ...overrides,
  }
}

describe('search lifecycle behavior', () => {
  it('emits monotonic progress for checked counts and percentages', () => {
    const progressMessages: Extract<SearchMessage, { type: 'progress' }>[] = []

    searchSeeds(request({ outputLimit: 10_000 }), {
      now: () => 1000,
      onMessage(message) {
        if (message.type === 'progress') progressMessages.push(message)
      },
    })

    expect(progressMessages.length).toBeGreaterThan(0)
    for (let index = 1; index < progressMessages.length; index += 1) {
      expect(progressMessages[index].checkedCount).toBeGreaterThanOrEqual(progressMessages[index - 1].checkedCount)
      expect(progressMessages[index].progress).toBeGreaterThanOrEqual(progressMessages[index - 1].progress)
    }
    expect(progressMessages.at(-1)?.checkedCount).toBe(5_000)
  })

  it('honors outputLimit and reports a non-cancelled early completion', () => {
    const completeMessages: Extract<SearchMessage, { type: 'complete' }>[] = []
    const found = searchSeeds(request({ endSeed: 10_000, outputLimit: 2 }), {
      now: () => 1000,
      onMessage(message) {
        if (message.type === 'complete') completeMessages.push(message)
      },
    })

    expect(found).toHaveLength(2)
    expect(completeMessages).toHaveLength(1)
    expect(completeMessages[0]).toMatchObject({ totalFound: 2, cancelled: false })
  })

  it('stops async search after cancellation and reports cancelled completion', async () => {
    const controller = new AbortController()
    const progressMessages: Extract<SearchMessage, { type: 'progress' }>[] = []
    const completeMessages: Extract<SearchMessage, { type: 'complete' }>[] = []

    const found = await searchSeedsAsync(
      request({
        endSeed: 100_000,
        weatherConditions: [],
        cartConditions: [
          {
            startYear: 1,
            startSeason: 0,
            startDay: 5,
            endYear: 1,
            endSeason: 1,
            endDay: 28,
            itemName: '红叶卷心菜',
            requireQty5: false,
            minOccurrences: 1,
          },
        ],
      }),
      {
        signal: controller.signal,
        now: () => 1000,
        onMessage(message) {
          if (message.type === 'progress') {
            progressMessages.push(message)
            controller.abort()
          }
          if (message.type === 'complete') completeMessages.push(message)
        },
      },
      { yieldEvery: 1_000 },
    )

    expect(progressMessages.length).toBeGreaterThan(0)
    expect(progressMessages.at(-1)?.checkedCount).toBeLessThan(100_000)
    expect(found.length).toBeLessThanOrEqual(20)
    expect(completeMessages).toHaveLength(1)
    expect(completeMessages[0]).toMatchObject({ cancelled: true })
  })
})
