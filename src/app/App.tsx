import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BookOpen,
  Download,
  Info,
  Search,
  Square,
  Trash2,
} from 'lucide-react'
import './App.css'
import logo from '../assets/logo.png'
import { copy, localeNames, type Locale } from '../i18n'
import { copyTextToClipboard, createJobId, randomInt } from '../runtime/browserCompat'
import {
  allCartItemNames,
  mineChestFloors,
  mineChestItems,
  type CartCondition,
  type DesertFestivalCondition,
  type FairyCondition,
  type MineChestCondition,
  type MonsterLevelCondition,
  type SearchMessage,
  type SearchRequest,
  type WeatherCondition,
} from '../search-core'
import { AddButton, FeatureSection, IconButton, NumberField, SeasonSelect } from './components/FeatureSection'
import { ResultsPanel } from './components/ResultsPanel'
import { SeedDrawer } from './components/SeedDrawer'
import { formatStatus } from './formatters'
import { removeAt, updateAt } from './formUtils'
import type { FeatureStatView, FoundSeed, SearchStatus } from './types'

const INT_MAX = 2_147_483_647

function App() {
  const [locale, setLocale] = useState<Locale>('zh')
  const t = copy[locale]
  const [startSeed, setStartSeed] = useState(1)
  const [searchRange, setSearchRange] = useState('100000')
  const [loopSearch, setLoopSearch] = useState(true)
  const [useLegacyRandom, setUseLegacyRandom] = useState(false)
  const [outputLimit, setOutputLimit] = useState(20)

  const [weatherEnabled, setWeatherEnabled] = useState(true)
  const [weatherConditions, setWeatherConditions] = useState<WeatherCondition[]>([
    { season: 0, startDay: 1, endDay: 28, minRainDays: 10 },
  ])
  const [fairyEnabled, setFairyEnabled] = useState(false)
  const [fairyConditions, setFairyConditions] = useState<FairyCondition[]>([
    { startYear: 1, startSeason: 0, startDay: 1, endYear: 1, endSeason: 2, endDay: 28, minOccurrences: 1 },
  ])
  const [mineChestEnabled, setMineChestEnabled] = useState(false)
  const [mineChestConditions, setMineChestConditions] = useState<MineChestCondition[]>([{ floor: 10, itemName: mineChestItems[10][0] }])
  const [monsterLevelEnabled, setMonsterLevelEnabled] = useState(false)
  const [monsterLevelConditions, setMonsterLevelConditions] = useState<MonsterLevelCondition[]>([
    { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 1, endLevel: 40 },
  ])
  const [desertFestivalEnabled, setDesertFestivalEnabled] = useState(false)
  const [desertFestivalCondition, setDesertFestivalCondition] = useState<DesertFestivalCondition>({
    requireJas: true,
    requireLeah: false,
  })
  const [cartEnabled, setCartEnabled] = useState(false)
  const [cartConditions, setCartConditions] = useState<CartCondition[]>([
    {
      startYear: 1,
      startSeason: 0,
      startDay: 5,
      endYear: 1,
      endSeason: 2,
      endDay: 28,
      itemName: allCartItemNames[0] ?? '石头',
      requireQty5: false,
      minOccurrences: 1,
    },
  ])

  const [isSearching, setIsSearching] = useState(false)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ type: 'idle' })
  const [checkedCount, setCheckedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [featureStats, setFeatureStats] = useState<FeatureStatView[]>([])
  const [foundSeeds, setFoundSeeds] = useState<FoundSeed[]>([])
  const [selectedSeed, setSelectedSeed] = useState<FoundSeed | null>(null)
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null)
  const [stoppedEarly, setStoppedEarly] = useState<boolean | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const activeJobId = useRef<string | null>(null)
  const savedStartSeed = useRef(1)

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
    document.title = `StardewSeedSearcher Web - ${t.subtitle}`
  }, [locale, t.subtitle])

  const calculatedRange = useMemo(() => {
    const range = searchRange === 'max' ? INT_MAX - startSeed + 1 : Number.parseInt(searchRange, 10)
    const endSeed = Math.min(startSeed - 1 + range, INT_MAX)
    return { range, endSeed }
  }, [searchRange, startSeed])

  const statusMessage = useMemo(() => formatStatus(searchStatus, t), [searchStatus, t])
  const rangeBadge = activeRange ? t.rangeBadge(activeRange.start.toLocaleString(), activeRange.end.toLocaleString()) : ''

  function validate(): string | null {
    if (!Number.isFinite(startSeed) || startSeed < 1 || startSeed > INT_MAX) return t.validation.startSeed(INT_MAX)
    if (outputLimit < 1 || outputLimit > 500) return t.validation.outputLimit
    if (!weatherEnabled && !fairyEnabled && !mineChestEnabled && !monsterLevelEnabled && !desertFestivalEnabled && !cartEnabled) {
      return t.validation.featureRequired
    }
    if (weatherEnabled) {
      for (const condition of weatherConditions) {
        if (condition.startDay > condition.endDay) return t.validation.weatherDateOrder
        if (condition.minRainDays > condition.endDay - condition.startDay + 1) return t.validation.weatherRainRange
      }
    }
    if (fairyEnabled && fairyConditions.some((condition) => condition.minOccurrences < 1)) return t.validation.fairyOccurrences
    if (cartEnabled && cartConditions.some((condition) => !condition.itemName)) return t.validation.cartItem
    return null
  }

  function buildRequest(): SearchRequest {
    return {
      startSeed,
      endSeed: calculatedRange.endSeed,
      useLegacyRandom,
      weatherConditions: weatherEnabled ? weatherConditions : [],
      fairyConditions: fairyEnabled ? fairyConditions : [],
      mineChestConditions: mineChestEnabled ? mineChestConditions : [],
      monsterLevelConditions: monsterLevelEnabled ? monsterLevelConditions : [],
      desertFestivalCondition: desertFestivalEnabled ? desertFestivalCondition : null,
      cartConditions: cartEnabled ? cartConditions : [],
      outputLimit,
    }
  }

  function startSearch() {
    const error = validate()
    if (error) {
      window.alert(error)
      return
    }

    const request = buildRequest()
    const worker = workerRef.current ?? new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const jobId = createJobId()
    activeJobId.current = jobId
    savedStartSeed.current = startSeed

    setFoundSeeds([])
    setSelectedSeed(null)
    setFeatureStats([])
    setCheckedCount(0)
    setTotalCount(request.endSeed - request.startSeed + 1)
    setProgress(0)
    setSpeed(0)
    setElapsed(0)
    setStoppedEarly(null)
    setActiveRange({ start: request.startSeed, end: request.endSeed })
    setSearchStatus({ type: 'searching', start: request.startSeed, end: request.endSeed })
    setIsSearching(true)

    worker.onmessage = (event: MessageEvent<SearchMessage & { jobId: string; message?: string }>) => {
      if (event.data.jobId !== activeJobId.current) return
      handleWorkerMessage(event.data, request)
    }

    worker.postMessage({ type: 'start-search', jobId, request })
  }

  function stopSearch() {
    workerRef.current?.postMessage({ type: 'cancel-search', jobId: activeJobId.current })
    setSearchStatus({ type: 'stopping' })
  }

  function setRandomStartSeed() {
    setStartSeed(randomInt(1_000_000_000) + 1)
  }

  function handleWorkerMessage(message: SearchMessage & { message?: string }, request: SearchRequest) {
    if (message.type === 'start') {
      setTotalCount(message.total)
      return
    }
    if (message.type === 'progress') {
      setCheckedCount(message.checkedCount)
      setTotalCount(message.total)
      setProgress(Math.floor(message.progress))
      setSpeed(message.speed)
      setElapsed(message.elapsed)
      setFeatureStats(message.featureStats)
      return
    }
    if (message.type === 'found') {
      setFoundSeeds((prev) => [...prev, { seed: message.seed, details: message.details, enabled: message.enabledFeatures }])
      return
    }
    if (message.type === 'complete') {
      setSearchStatus(message.cancelled ? { type: 'stopped', totalFound: message.totalFound } : { type: 'completed', totalFound: message.totalFound })
      setIsSearching(false)
      setStoppedEarly(!message.cancelled && message.totalFound >= request.outputLimit)
      if (searchRange === 'max') {
        setStartSeed(message.cancelled ? savedStartSeed.current : 1)
      } else if (!message.cancelled && loopSearch) {
        setStartSeed(Math.min(request.endSeed + 1, INT_MAX))
      }
    }
  }

  function submitForm(event: FormEvent) {
    event.preventDefault()
    if (isSearching) stopSearch()
    else startSearch()
  }

  function exportResults() {
    const content = [
      t.exportLines.title,
      t.exportLines.range(startSeed, calculatedRange.endSeed),
      t.exportLines.legacy(useLegacyRandom),
      t.exportLines.found(foundSeeds.length),
      '',
      ...foundSeeds.map((item) => String(item.seed)),
      '',
      t.exportLines.attribution,
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stardew-seeds-${Date.now()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function copySeed(seed: number) {
    const copied = await copyTextToClipboard(String(seed))
    if (!copied) setSearchStatus({ type: 'copyFailed' })
  }

  return (
    <main className="app-shell" data-testid="app-shell" lang={locale === 'en' ? 'en' : 'zh-CN'}>
      <a
        className="github-corner"
        data-testid="github-repo-link"
        href="https://github.com/skyswordw/StardewSeedSearcher-Web"
        target="_blank"
        rel="noreferrer"
        aria-label={t.githubRepository}
        title={t.githubRepository}
      >
        <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
          <path className="github-corner-bg" d="M80 0v80L0 0Z" />
          <g className="github-corner-mark" transform="translate(47 10) scale(1.45)">
            <GithubMarkPath />
          </g>
        </svg>
      </a>
      <header className="app-header">
        <a href="https://wiki.biligame.com/stardewvalley/%E6%98%9F%E9%9C%B2%E8%B0%B7%E7%89%A9%E8%AF%AD%E7%BB%B4%E5%9F%BA" target="_blank">
          <img src={logo} alt="Stardew Valley" className="brand-icon" />
        </a>
        <div className="app-title">
          <h1>StardewSeedSearcher Web</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="language-switch" role="group" aria-label={t.language} data-testid="language-switch">
          {(['zh', 'en'] as const).map((nextLocale) => (
            <button
              key={nextLocale}
              type="button"
              className={locale === nextLocale ? 'active' : ''}
              aria-pressed={locale === nextLocale}
              onClick={() => setLocale(nextLocale)}
            >
              {localeNames[nextLocale]}
            </button>
          ))}
        </div>
      </header>

      <form className="tool-grid" data-testid="tool-grid" onSubmit={submitForm}>
        <section className="panel main-panel" data-testid="main-panel">
          <details className="guide" open>
            <summary>
              <Info size={18} /> {t.guide}
            </summary>
            <ul>
              {t.guideItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>

          <details className="guide">
            <summary>
              <BookOpen size={18} /> {t.featureInfo}
            </summary>
            <div className="feature-copy">
              <p>{t.baseline}</p>
              <p>{t.coverage}</p>
            </div>
          </details>

          <div className="form-row">
            <NumberField label={t.startSeed} testId="start-seed" value={startSeed} min={1} max={INT_MAX} onChange={setStartSeed} />
            <label className="field">
              <span>{t.searchRange}</span>
              <select data-testid="search-range" value={searchRange} onChange={(event) => setSearchRange(event.target.value)}>
                {t.ranges.map(([label, value]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label={t.outputLimit} testId="output-limit" value={outputLimit} min={1} max={500} onChange={setOutputLimit} />
          </div>

          <div className="quick-row">
            <button type="button" className="soft-button" onClick={() => setStartSeed(1)}>
              {t.min}
            </button>
            <button type="button" className="soft-button" onClick={setRandomStartSeed}>
              {t.randomStart}
            </button>
            <label className="check">
              <input type="checkbox" checked={loopSearch} onChange={(event) => setLoopSearch(event.target.checked)} />
              {t.loopSearch}
            </label>
            <label className="check">
              <input type="checkbox" checked={useLegacyRandom} onChange={(event) => setUseLegacyRandom(event.target.checked)} />
              {t.legacyRandom}
            </label>
          </div>

          <FeatureSection featureId="weather" title={t.features.weather} enabled={weatherEnabled} onToggle={setWeatherEnabled} note={t.notes.weather}>
            {weatherConditions.map((condition, index) => (
              <div className="condition-row" data-testid="condition-row" key={index}>
                <span>{t.firstYear}</span>
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.season} seasons={[0, 1, 2]} onChange={(season) => updateAt(weatherConditions, setWeatherConditions, index, { season })} />
                <NumberField compact label={t.startDay} value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(weatherConditions, setWeatherConditions, index, { startDay })} />
                <NumberField compact label={t.endDay} value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(weatherConditions, setWeatherConditions, index, { endDay })} />
                <NumberField compact label={t.minRainDays} value={condition.minRainDays} min={1} max={28} onChange={(minRainDays) => updateAt(weatherConditions, setWeatherConditions, index, { minRainDays })} />
                <IconButton label={t.deleteWeatherCondition} onClick={() => removeAt(weatherConditions, setWeatherConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setWeatherConditions([...weatherConditions, { season: 0, startDay: 1, endDay: 28, minRainDays: 10 }])}>{t.addCondition}</AddButton>
          </FeatureSection>

          <FeatureSection featureId="fairy" title={t.features.fairy} enabled={fairyEnabled} onToggle={setFairyEnabled} note={t.notes.fairy}>
            {fairyConditions.map((condition, index) => (
              <div className="condition-row wide" data-testid="condition-row" key={index}>
                <NumberField compact label={t.startYear} value={condition.startYear} min={1} max={10} onChange={(startYear) => updateAt(fairyConditions, setFairyConditions, index, { startYear })} />
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.startSeason} seasons={[0, 1, 2]} onChange={(startSeason) => updateAt(fairyConditions, setFairyConditions, index, { startSeason })} />
                <NumberField compact label={t.startDay} value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(fairyConditions, setFairyConditions, index, { startDay })} />
                <NumberField compact label={t.endYear} value={condition.endYear} min={1} max={10} onChange={(endYear) => updateAt(fairyConditions, setFairyConditions, index, { endYear })} />
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.endSeason} seasons={[0, 1, 2]} onChange={(endSeason) => updateAt(fairyConditions, setFairyConditions, index, { endSeason })} />
                <NumberField compact label={t.endDay} value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(fairyConditions, setFairyConditions, index, { endDay })} />
                <NumberField compact label={t.minOccurrences} value={condition.minOccurrences} min={1} max={99} onChange={(minOccurrences) => updateAt(fairyConditions, setFairyConditions, index, { minOccurrences })} />
                <IconButton label={t.deleteFairyCondition} onClick={() => removeAt(fairyConditions, setFairyConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setFairyConditions([...fairyConditions, { startYear: 1, startSeason: 0, startDay: 1, endYear: 1, endSeason: 2, endDay: 28, minOccurrences: 1 }])}>{t.addCondition}</AddButton>
          </FeatureSection>

          <FeatureSection featureId="mineChest" title={t.features.mineChest} enabled={mineChestEnabled} onToggle={setMineChestEnabled} note={t.notes.mineChest}>
            {mineChestConditions.map((condition, index) => (
              <div className="condition-row" data-testid="condition-row" key={index}>
                <label className="field compact">
                  <span>{t.floor}</span>
                  <select value={condition.floor} onChange={(event) => updateAt(mineChestConditions, setMineChestConditions, index, { floor: Number(event.target.value), itemName: mineChestItems[Number(event.target.value)][0] })}>
                    {mineChestFloors.map((floor) => (
                      <option value={floor} key={floor}>
                        {locale === 'en' ? `Floor ${floor}` : `${floor}层`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t.targetItem}</span>
                  <select value={condition.itemName} onChange={(event) => updateAt(mineChestConditions, setMineChestConditions, index, { itemName: event.target.value })}>
                    {mineChestItems[condition.floor].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <IconButton label={t.deleteChestCondition} onClick={() => removeAt(mineChestConditions, setMineChestConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setMineChestConditions([...mineChestConditions, { floor: 20, itemName: mineChestItems[20][0] }])}>{t.addCondition}</AddButton>
          </FeatureSection>

          <FeatureSection featureId="monsterLevel" title={t.features.monsterLevel} enabled={monsterLevelEnabled} onToggle={setMonsterLevelEnabled} note={t.notes.monsterLevel}>
            {monsterLevelConditions.map((condition, index) => (
              <div className="condition-row wide" data-testid="condition-row" key={index}>
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.startSeason} seasons={[0, 1, 2]} onChange={(startSeason) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { startSeason })} />
                <NumberField compact label={t.startDay} value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { startDay })} />
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.endSeason} seasons={[0, 1, 2]} onChange={(endSeason) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { endSeason })} />
                <NumberField compact label={t.endDay} value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { endDay })} />
                <NumberField compact label={t.startLevel} value={condition.startLevel} min={1} max={119} onChange={(startLevel) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { startLevel })} />
                <NumberField compact label={t.endLevel} value={condition.endLevel} min={1} max={119} onChange={(endLevel) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { endLevel })} />
                <IconButton label={t.deleteMonsterCondition} onClick={() => removeAt(monsterLevelConditions, setMonsterLevelConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setMonsterLevelConditions([...monsterLevelConditions, { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 1, endLevel: 40 }])}>{t.addCondition}</AddButton>
          </FeatureSection>

          <FeatureSection featureId="desertFestival" title={t.features.desertFestival} enabled={desertFestivalEnabled} onToggle={setDesertFestivalEnabled} note={t.notes.desertFestival}>
            <div className="quick-row">
              <label className="check">
                <input type="checkbox" checked={desertFestivalCondition.requireJas} onChange={(event) => setDesertFestivalCondition({ ...desertFestivalCondition, requireJas: event.target.checked })} />
                {t.requireJas}
              </label>
              <label className="check">
                <input type="checkbox" checked={desertFestivalCondition.requireLeah} onChange={(event) => setDesertFestivalCondition({ ...desertFestivalCondition, requireLeah: event.target.checked })} />
                {t.requireLeah}
              </label>
            </div>
          </FeatureSection>

          <FeatureSection featureId="cart" title={t.features.cart} enabled={cartEnabled} onToggle={setCartEnabled} note={t.notes.cart}>
            <datalist id="cart-items">
              {allCartItemNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {cartConditions.map((condition, index) => (
              <div className="condition-row wide" data-testid="condition-row" key={index}>
                <NumberField compact label={t.startYear} value={condition.startYear} min={1} max={10} onChange={(startYear) => updateAt(cartConditions, setCartConditions, index, { startYear })} />
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.startSeason} seasons={[0, 1, 2, 3]} onChange={(startSeason) => updateAt(cartConditions, setCartConditions, index, { startSeason })} />
                <NumberField compact label={t.startDay} value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(cartConditions, setCartConditions, index, { startDay })} />
                <NumberField compact label={t.endYear} value={condition.endYear} min={1} max={10} onChange={(endYear) => updateAt(cartConditions, setCartConditions, index, { endYear })} />
                <SeasonSelect label={t.season} seasonNames={t.seasons} value={condition.endSeason} seasons={[0, 1, 2, 3]} onChange={(endSeason) => updateAt(cartConditions, setCartConditions, index, { endSeason })} />
                <NumberField compact label={t.endDay} value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(cartConditions, setCartConditions, index, { endDay })} />
                <label className="field item-field">
                  <span>{t.item}</span>
                  <input list="cart-items" value={condition.itemName} onChange={(event) => updateAt(cartConditions, setCartConditions, index, { itemName: event.target.value })} />
                </label>
                <NumberField compact label={t.minOccurrences} value={condition.minOccurrences} min={1} max={99} onChange={(minOccurrences) => updateAt(cartConditions, setCartConditions, index, { minOccurrences })} />
                <label className="check small-check">
                  <input type="checkbox" checked={condition.requireQty5} onChange={(event) => updateAt(cartConditions, setCartConditions, index, { requireQty5: event.target.checked })} />
                  {t.quantityFive}
                </label>
                <IconButton label={t.deleteCartCondition} onClick={() => removeAt(cartConditions, setCartConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setCartConditions([...cartConditions, { startYear: 1, startSeason: 0, startDay: 5, endYear: 1, endSeason: 2, endDay: 28, itemName: allCartItemNames[0] ?? '', requireQty5: false, minOccurrences: 1 }])}>{t.addCondition}</AddButton>
          </FeatureSection>

          <div className="action-row">
            <button type="submit" className={isSearching ? 'primary stop' : 'primary'} data-testid="start-search">
              {isSearching ? <Square size={18} /> : <Search size={18} />}
              {isSearching ? t.stopSearch : t.startSearch}
            </button>
            <button type="button" className="secondary" onClick={exportResults} disabled={foundSeeds.length === 0}>
              <Download size={18} /> {t.exportSeeds}
            </button>
          </div>
        </section>

        <ResultsPanel
          t={t}
          statusMessage={statusMessage}
          rangeBadge={rangeBadge}
          progress={progress}
          checkedCount={checkedCount}
          totalCount={totalCount}
          foundSeeds={foundSeeds}
          speed={speed}
          elapsed={elapsed}
          stoppedEarly={stoppedEarly}
          featureStats={featureStats}
          onSelectSeed={setSelectedSeed}
          onCopySeed={(seed) => {
            void copySeed(seed)
          }}
        />
      </form>

      {selectedSeed && <SeedDrawer found={selectedSeed} t={t} locale={locale} onClose={() => setSelectedSeed(null)} onCopy={() => copySeed(selectedSeed.seed)} />}
    </main>
  )
}

function GithubMarkPath() {
  return (
    <path d="M8 0.2a7.9 7.9 0 0 0-2.5 15.4c0.4 0.1 0.5-0.2 0.5-0.4v-1.5c-2.1 0.5-2.5-0.9-2.5-0.9-0.3-0.8-0.8-1-0.8-1-0.7-0.5 0-0.5 0-0.5 0.7 0.1 1.1 0.8 1.1 0.8 0.7 1.1 1.7 0.8 2.1 0.6 0.1-0.5 0.3-0.8 0.5-1-1.7-0.2-3.4-0.8-3.4-3.8 0-0.8 0.3-1.5 0.8-2.1-0.1-0.2-0.3-1 0.1-2 0 0 0.6-0.2 2.1 0.8a7.1 7.1 0 0 1 3.8 0c1.5-1 2.1-0.8 2.1-0.8 0.4 1 0.2 1.8 0.1 2 0.5 0.6 0.8 1.3 0.8 2.1 0 3-1.8 3.6-3.4 3.8 0.3 0.2 0.5 0.7 0.5 1.4v2.1c0 0.2 0.1 0.5 0.5 0.4A7.9 7.9 0 0 0 8 0.2Z" />
  )
}

export default App
