import type { AppCopy, Locale } from '../i18n'
import type { Season } from '../search-core'
import type { FeatureId, SearchStatus } from './types'

const featureStatNames: Record<string, FeatureId> = {
  天气: 'weather',
  天气预测: 'weather',
  仙子: 'fairy',
  仙子预测: 'fairy',
  矿井宝箱: 'mineChest',
  怪物层: 'monsterLevel',
  沙漠节: 'desertFestival',
  猪车: 'cart',
  猪车预测: 'cart',
}

export function formatStatus(status: SearchStatus, t: AppCopy): string {
  if (status.type === 'searching') return t.searching(status.start.toLocaleString(), status.end.toLocaleString())
  if (status.type === 'stopping') return t.stopping
  if (status.type === 'stopped') return t.stopped(status.totalFound)
  if (status.type === 'completed') return t.completed(status.totalFound)
  if (status.type === 'failed') return status.message
  if (status.type === 'copyFailed') return t.copyFailed
  return t.idleStatus
}

export function formatFeatureStatName(name: string, t: AppCopy): string {
  const featureId = featureStatNames[name]
  return featureId ? t.features[featureId] : name
}

export function formatDisplayDate(year: number, season: Season, day: number, t: AppCopy, locale: Locale): string {
  if (locale === 'en') return `Year ${year}, ${t.seasons[season]} ${day}`
  return `第${year}年${t.seasons[season]}${day}日`
}

export function formatDayList(days: number[], t: AppCopy): string {
  return days.length > 0 ? days.join(', ') : t.weatherDetails.none
}

export function formatTextList(items: string[]): string {
  return items.join(', ')
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const sec = Math.floor(seconds % 60)
  return [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    minutes > 0 ? `${minutes}m` : '',
    sec > 0 || seconds < 60 ? `${sec}s` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
