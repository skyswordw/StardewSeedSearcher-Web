import { Download } from 'lucide-react'
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
  onExportResults,
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
  onExportResults: () => void
  onSelectSeed: (seed: FoundSeed) => void
  onCopySeed: (seed: number) => void
}) {
  const finalPassCount = featureStats.at(-1)?.passCount ?? foundSeeds.length
  const filteredCount = Math.max(0, checkedCount - finalPassCount)

  return (
    <aside className="panel results-panel" data-testid="results-panel">
      <header className="results-heading">
        <div>
          <h2>{t.resultsPanelTitle}</h2>
          <p>{rangeBadge}</p>
        </div>
        <button type="button" className="secondary results-export" onClick={onExportResults} disabled={foundSeeds.length === 0}>
          <Download size={18} /> {t.exportSeeds}
        </button>
      </header>

      <div className="status-card">
        <p data-testid="status-message">{statusMessage}</p>
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

      <section className="analysis" data-testid="search-analysis">
        <h3>{t.analysisTitle}</h3>
        <div className="analysis-summary">
          <AnalysisSummary label={t.analysisCheckedSeeds} value={`${checkedCount.toLocaleString()} / ${totalCount.toLocaleString()}`} />
          <AnalysisSummary label={t.analysisPassedSeeds} value={t.analysisSeedCount(finalPassCount)} />
          <AnalysisSummary label={t.analysisFilteredSeeds} value={t.analysisSeedCount(filteredCount)} />
          <AnalysisSummary label={t.stoppedEarly} value={stoppedEarly === null ? t.unknown : stoppedEarly ? t.yes : t.no} />
        </div>
        {featureStats.length === 0 ? (
          <p className="muted">{t.statsPlaceholder}</p>
        ) : (
          <div className="analysis-table" role="table" aria-label={t.analysisTitle}>
            <div className="analysis-table-head" role="row">
              <span>{t.analysisFilter}</span>
              <span>{t.analysisPassed}</span>
              <span>{t.analysisPassRate}</span>
            </div>
            {featureStats.map((stat, index) => {
              const inputCount = index === 0 ? checkedCount : featureStats[index - 1].passCount
              return (
                <div className="analysis-table-row" role="row" key={stat.name}>
                  <span>{formatFeatureStatName(stat.name, t)}</span>
                  <strong>{t.analysisSeedCount(stat.passCount)}</strong>
                  <span className="rate-pill">{formatPassRate(stat.passCount, inputCount)}</span>
                </div>
              )
            })}
          </div>
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

function AnalysisSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="analysis-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatPassRate(passCount: number, inputCount: number): string {
  if (inputCount <= 0) return '--'
  const rate = (passCount / inputCount) * 100
  if (rate > 0 && rate < 0.1) return '<0.1%'
  if (rate < 10) return `${rate.toFixed(1)}%`
  return `${Math.round(rate)}%`
}
