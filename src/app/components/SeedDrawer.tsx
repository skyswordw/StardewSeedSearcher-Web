import type { ReactNode } from 'react'
import { CheckCircle2, Clipboard, X } from 'lucide-react'
import type { AppCopy, Locale } from '../../i18n'
import { formatDayList, formatDisplayDate, formatTextList } from '../formatters'
import type { FoundSeed } from '../types'

export function SeedDrawer({
  found,
  t,
  locale,
  onClose,
  onCopy,
}: {
  found: FoundSeed
  t: AppCopy
  locale: Locale
  onClose: () => void
  onCopy: () => void
}) {
  const { details, enabled } = found
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={`${t.seedLabel} ${found.seed} ${t.intro}`} data-testid="seed-detail">
      <aside className="seed-drawer" data-testid="seed-drawer">
        <header>
          <div>
            <span>{t.drawerTitle}</span>
            <h2>{found.seed}</h2>
          </div>
          <div className="drawer-actions">
            <button type="button" onClick={onCopy}>
              <Clipboard size={16} /> {t.copy}
            </button>
            <button type="button" aria-label={t.close} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {enabled.weather && details.weather && (
          <DetailSection title={t.detailSections.weather}>
            <p>
              {t.weatherDetails.greenRain}: {t.seasons[1]} {details.weather.greenRainDay}
            </p>
            <p>
              {t.weatherDetails.springRain}: {formatDayList(details.weather.springRain, t)}
            </p>
            <p>
              {t.weatherDetails.summerRain}: {formatDayList(details.weather.summerRain, t)}
            </p>
            <p>
              {t.weatherDetails.fallRain}: {formatDayList(details.weather.fallRain, t)}
            </p>
          </DetailSection>
        )}
        {enabled.fairy && details.fairy && (
          <DetailSection title={t.detailSections.fairy}>
            {details.fairy.days.length === 0 ? (
              <p>{t.noFairyRecords}</p>
            ) : (
              details.fairy.days.map((day, index) => (
                <p key={index}>
                  {formatDisplayDate(day.year, day.season, day.day, t, locale)} {day.isBlocked ? t.fairyBlocked : t.fairyAvailable}
                </p>
              ))
            )}
          </DetailSection>
        )}
        {enabled.mineChest && details.mineChest && (
          <DetailSection title={t.detailSections.mineChest}>
            {details.mineChest.map((item) => (
              <p key={item.floor}>
                {locale === 'en' ? `Floor ${item.floor}` : `${item.floor}层`}: {item.item} {item.matched ? <CheckCircle2 size={14} /> : null}
              </p>
            ))}
          </DetailSection>
        )}
        {enabled.monsterLevel && details.monsterLevel && (
          <DetailSection title={t.detailSections.monsterLevel}>
            {details.monsterLevel.map((item, index) => (
              <p key={index}>{item.description}</p>
            ))}
          </DetailSection>
        )}
        {enabled.desertFestival && details.desertFestival && (
          <DetailSection title={t.detailSections.desertFestival}>
            <p>
              {t.seasons[0]} 15: {formatTextList(details.desertFestival.day15)}
            </p>
            <p>
              {t.seasons[0]} 16: {formatTextList(details.desertFestival.day16)}
            </p>
            <p>
              {t.seasons[0]} 17: {formatTextList(details.desertFestival.day17)}
            </p>
          </DetailSection>
        )}
        {enabled.cart && details.cart && (
          <DetailSection title={t.detailSections.cart}>
            {details.cart.matches.length === 0 ? (
              <p>{t.noCartMatches}</p>
            ) : (
              details.cart.matches.map((match, index) => (
                <p key={index}>
                  {formatDisplayDate(match.year, match.season, match.day, t, locale)}: {match.itemName} x{match.quantity === -1 ? t.unlimited : match.quantity}, {match.price}g
                </p>
              ))
            )}
          </DetailSection>
        )}
      </aside>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
