import type { AppCopy } from '../../i18n'
import { formatFeatureStatName, formatTime } from '../formatters'
import type { FeatureStatView, FoundSeed } from '../types'

export function ResultsPanel({
  t,
  statusMessage,
  rangeBadge,
  progress,
  checkedCount,
  totalCount,
  foundSeeds,
  speed,
  elapsed,
  stoppedEarly,
  featureStats,
  onSelectSeed,
  onCopySeed,
}: {
  t: AppCopy
  statusMessage: string
  rangeBadge: string
  progress: number
  checkedCount: number
  totalCount: number
  foundSeeds: FoundSeed[]
  speed: number
  elapsed: number
  stoppedEarly: boolean | null
  featureStats: FeatureStatView[]
  onSelectSeed: (seed: FoundSeed) => void
  onCopySeed: (seed: number) => void
}) {
  return (
    <aside className="panel results-panel" data-testid="results-panel">
      <h2>{t.statusTitle}</h2>
      <div className="status-card">
        <p data-testid="status-message">{statusMessage}</p>
        {rangeBadge && <span className="range-badge">{rangeBadge}</span>}
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress)} data-testid="progress">
          <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }}>
            {progress}%
          </div>
        </div>
      </div>
      <div className="metric-grid" data-testid="metric-grid">
        <Metric label={t.checked} value={checkedCount.toLocaleString()} />
        <Metric label={t.totalRange} value={totalCount.toLocaleString()} />
        <Metric label={t.found} value={foundSeeds.length.toLocaleString()} />
        <Metric label={t.speed} value={`${speed.toLocaleString()}/s`} />
        <Metric label={t.elapsed} value={formatTime(elapsed)} />
        <Metric label={t.eta} value={speed > 0 ? formatTime((totalCount - checkedCount) / speed) : '--'} />
      </div>

      <section className="analysis">
        <h3>{t.statsTitle}</h3>
        <div className="analysis-row">
          <span>{t.stoppedEarly}</span>
          <strong>{stoppedEarly === null ? t.unknown : stoppedEarly ? t.yes : t.no}</strong>
        </div>
        {featureStats.length === 0 ? (
          <p className="muted">{t.statsPlaceholder}</p>
        ) : (
          featureStats.map((stat) => (
            <div className="analysis-row" key={stat.name}>
              <span>{formatFeatureStatName(stat.name, t)}</span>
              <strong>{stat.passCount.toLocaleString()}</strong>
            </div>
          ))
        )}
      </section>

      <section className="seed-results" data-testid="results">
        <h3>{t.resultsTitle}</h3>
        <p className="muted">{t.resultsCount(foundSeeds.length)}</p>
        <div className="seed-list">
          {foundSeeds.slice(0, 20).map((item) => (
            <div className="seed-item" data-testid="seed-result" key={item.seed}>
              <span>
                {t.seedLabel}: {item.seed}
              </span>
              <div>
                <button type="button" data-testid="seed-details" onClick={() => onSelectSeed(item)}>
                  {t.intro}
                </button>
                <button type="button" data-testid="seed-copy" onClick={() => onCopySeed(item.seed)}>
                  {t.copy}
                </button>
              </div>
            </div>
          ))}
          {foundSeeds.length === 0 && <p className="empty">{t.noResults}</p>}
        </div>
      </section>
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
