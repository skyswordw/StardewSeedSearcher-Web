import { describe, expect, it } from 'vitest'
import { CsRandom } from './csharp'
import { getHashFromArray, getHashFromString, getRandomSeed } from './hash'
import { absoluteDayToDate, dateToAbsoluteDay } from './time'
import { MineChestPredictor } from './predictors/mineChest'
import { WeatherPredictor } from './predictors/weather'
import { DesertFestivalPredictor } from './predictors/desertFestival'
import { searchSeeds, type SearchRequest } from './index'
import oracle from './__fixtures__/oracle-sample.json'

describe('C# compatibility primitives', () => {
  it('matches C# oracle Random sequences', () => {
    const rng = new CsRandom(1)
    expect(Array.from({ length: 10 }, () => rng.next())).toEqual(oracle.primitives.randomSeed1Next)

    const ranged = new CsRandom(1)
    expect(Array.from({ length: 8 }, () => ranged.next(2, 31))).toEqual(oracle.primitives.randomSeed1Range2To31)
  })

  it('matches C# oracle Stardew deterministic hash helpers', () => {
    expect(getHashFromString('location_weather')).toBe(oracle.primitives.hashes.location_weather)
    expect(getHashFromString('summer_rain_chance')).toBe(oracle.primitives.hashes.summer_rain_chance)
    expect(getHashFromString('travelerSkillBook')).toBe(oracle.primitives.hashes.travelerSkillBook)
    expect(getHashFromArray(777, 1, 0, 0, 0)).toBe(oracle.primitives.hashes.array_777_1_0_0_0)
    expect(getRandomSeed(777, 1, 0, 0, 0, false)).toBe(oracle.primitives.hashes.randomSeedNew_777_1_0_0_0)
    expect(getRandomSeed(777, 1, 0, 0, 0, true)).toBe(oracle.primitives.hashes.randomSeedLegacy_777_1_0_0_0)
  })

  it('converts Stardew dates like the C# oracle helper', () => {
    expect(dateToAbsoluteDay(1, 0, 1)).toBe(oracle.primitives.dates.y1Spring1)
    expect(dateToAbsoluteDay(1, 2, 28)).toBe(oracle.primitives.dates.y1Fall28)
    expect(dateToAbsoluteDay(2, 0, 1)).toBe(oracle.primitives.dates.y2Spring1)
    expect(absoluteDayToDate(84)).toEqual(oracle.primitives.dates.abs84)
    expect(absoluteDayToDate(113)).toEqual(oracle.primitives.dates.abs113)
  })
})

describe('predictor parity fixtures', () => {
  it('predicts C# oracle weather and green rain for seed 1', () => {
    const detail = new WeatherPredictor().predictWeatherWithDetail(1, false)
    expect(detail).toEqual(oracle.predictors.weatherSeed1New)

    const legacyDetail = new WeatherPredictor().predictWeatherWithDetail(1, true)
    expect(legacyDetail).toEqual(oracle.predictors.weatherSeed1Legacy)
  })

  it('predicts C# oracle mine chest and desert festival fixtures', () => {
    expect(new MineChestPredictor([{ floor: 10, itemName: '皮靴' }]).getDetails(1, false)).toEqual(
      oracle.predictors.mineChestSeed1Floor10New,
    )
    expect(new MineChestPredictor([{ floor: 10, itemName: '皮靴' }]).getDetails(1, true)).toEqual(
      oracle.predictors.mineChestSeed1Floor10Legacy,
    )
    expect(new DesertFestivalPredictor({ requireJas: false, requireLeah: false }).predictVendors(1, false)).toEqual(
      oracle.predictors.desertFestivalSeed1New,
    )
    expect(new DesertFestivalPredictor({ requireJas: false, requireLeah: false }).predictVendors(1, true)).toEqual(
      oracle.predictors.desertFestivalSeed1Legacy,
    )
  })

  it('searches deterministically against C# oracle with progress and output limit', () => {
    const request: SearchRequest = {
      startSeed: 1,
      endSeed: 500,
      useLegacyRandom: false,
      weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 4 }],
      fairyConditions: [],
      mineChestConditions: [],
      monsterLevelConditions: [],
      desertFestivalCondition: null,
      cartConditions: [],
      outputLimit: 3,
    }
    const messages: string[] = []
    const found = searchSeeds(request, {
      now: () => 1000,
      onMessage(message) {
        messages.push(message.type)
      },
    })
    expect(found).toEqual(oracle.searches.weatherSpringRain4Seeds1To500New)
    expect(messages).toContain('start')
    expect(messages).toContain('found')
    expect(messages.at(-1)).toBe('complete')
  })

  it('searches legacy random mode against C# oracle', () => {
    const request: SearchRequest = {
      startSeed: 1,
      endSeed: 500,
      useLegacyRandom: true,
      weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 4 }],
      fairyConditions: [],
      mineChestConditions: [],
      monsterLevelConditions: [],
      desertFestivalCondition: null,
      cartConditions: [],
      outputLimit: 3,
    }
    const found = searchSeeds(request, {
      now: () => 1000,
      onMessage() {},
    })
    expect(found).toEqual(oracle.searches.weatherSpringRain4Seeds1To500Legacy)
  })
})
