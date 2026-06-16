import type { Season } from './types'

const DAYS_PER_SEASON = 28
const SEASONS_PER_YEAR = 4
const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR

export const seasonNames = ['春', '夏', '秋', '冬'] as const

export function dateToAbsoluteDay(year: number, season: number, day: number): number {
  return (year - 1) * DAYS_PER_YEAR + season * DAYS_PER_SEASON + day
}

export function absoluteDayToDate(absoluteDay: number): {
  year: number
  season: Season
  day: number
} {
  let dayOfYear = absoluteDay % DAYS_PER_YEAR
  if (dayOfYear === 0) dayOfYear = DAYS_PER_YEAR

  const year = Math.floor((absoluteDay - dayOfYear) / DAYS_PER_YEAR) + 1
  let day = dayOfYear % DAYS_PER_SEASON
  if (day === 0) day = DAYS_PER_SEASON
  const season = Math.floor((dayOfYear - day) / DAYS_PER_SEASON) as Season
  return { year, season, day }
}

export function getSeasonName(season: number): string {
  return seasonNames[season as Season] ?? '未知'
}

export function formatGameDate(year: number, season: Season, day: number): string {
  return `第${year}年${getSeasonName(season)}${day}日`
}
