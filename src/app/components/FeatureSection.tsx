import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { FeatureId } from '../types'

export function FeatureSection({
  featureId,
  title,
  note,
  enabled,
  onToggle,
  children,
}: {
  featureId: FeatureId
  title: string
  note: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: ReactNode
}) {
  return (
    <section className={`feature-section ${enabled ? 'enabled' : ''}`} data-testid={`feature-section-${featureId}`}>
      <div className="feature-header">
        <label className="check title-check">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={title}
            data-testid={`feature-toggle-${featureId}`}
            onChange={(event) => onToggle(event.target.checked)}
          />
          {title}
        </label>
        <span>{note}</span>
      </div>
      {enabled && <div className="condition-list">{children}</div>}
    </section>
  )
}

export function NumberField({
  label,
  testId,
  value,
  min,
  max,
  compact,
  onChange,
}: {
  label: string
  testId?: string
  value: number
  min?: number
  max?: number
  compact?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className={`field ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <input data-testid={testId} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)} />
    </label>
  )
}

export function SeasonSelect({
  label,
  seasonNames,
  value,
  seasons,
  onChange,
}: {
  label: string
  seasonNames: readonly string[]
  value: number
  seasons: (0 | 1 | 2 | 3)[]
  onChange: (season: 0 | 1 | 2 | 3) => void
}) {
  return (
    <label className="field compact">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value) as 0 | 1 | 2 | 3)}>
        {seasons.map((season) => (
          <option value={season} key={season}>
            {seasonNames[season]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="add-button" data-testid="add-condition" onClick={onClick}>
      <Plus size={16} /> {children}
    </button>
  )
}

export function IconButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} data-testid="condition-remove" onClick={onClick}>
      {icon}
    </button>
  )
}
