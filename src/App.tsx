import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Download,
  Info,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import logo from './assets/logo.png'
import { copyTextToClipboard, createJobId, randomInt } from './browserCompat'
import { copy, localeNames, type AppCopy, type Locale } from './i18n'
import {
  allCartItemNames,
  mineChestFloors,
  mineChestItems,
  type CartCondition,
  type DesertFestivalCondition,
  type EnabledFeatures,
  type FairyCondition,
  type MineChestCondition,
  type MonsterLevelCondition,
  type Season,
  type SearchMessage,
  type SearchRequest,
  type SeedDetails,
  type WeatherCondition,
} from './search-core'

const INT_MAX = 2_147_483_647

interface FoundSeed {
  seed: number
  details: SeedDetails
  enabled: EnabledFeatures
}

interface FeatureStatView {
  name: string
  passCount: number
}

type SearchStatus =
  | { type: 'idle' }
  | { type: 'searching'; start: number; end: number }
  | { type: 'stopping' }
  | { type: 'stopped'; totalFound: number }
  | { type: 'completed'; totalFound: number }
  | { type: 'copyFailed' }

type FeatureId = 'weather' | 'fairy' | 'mineChest' | 'monsterLevel' | 'desertFestival' | 'cart'

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
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle')
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
    const worker = workerRef.current ?? new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
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
    setConnectionStatus('running')
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
      setConnectionStatus(message.cancelled ? 'idle' : 'complete')
      setStoppedEarly(!message.cancelled && message.totalFound >= request.outputLimit)
      if (searchRange === 'max') {
        setStartSeed(message.cancelled ? savedStartSeed.current : 1)
      } else if (!message.cancelled && loopSearch) {
        setStartSeed(Math.min(request.endSeed + 1, INT_MAX))
      }
    }
  }

  function submitForm(event: React.FormEvent) {
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
      <div className={`connection-status ${connectionStatus}`} data-testid="connection-status">
        {connectionLabel(connectionStatus, t)}
      </div>
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
                    <button type="button" data-testid="seed-details" onClick={() => setSelectedSeed(item)}>
                      {t.intro}
                    </button>
                    <button type="button" data-testid="seed-copy" onClick={() => copySeed(item.seed)}>
                      {t.copy}
                    </button>
                  </div>
                </div>
              ))}
              {foundSeeds.length === 0 && <p className="empty">{t.noResults}</p>}
            </div>
          </section>
        </aside>
      </form>

      {selectedSeed && <SeedDrawer found={selectedSeed} t={t} locale={locale} onClose={() => setSelectedSeed(null)} onCopy={() => copySeed(selectedSeed.seed)} />}
    </main>
  )
}

function FeatureSection({
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
  children: React.ReactNode
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

function NumberField({
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

function SeasonSelect({
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

function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="add-button" data-testid="add-condition" onClick={onClick}>
      <Plus size={16} /> {children}
    </button>
  )
}

function IconButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} data-testid="condition-remove" onClick={onClick}>
      {icon}
    </button>
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

function SeedDrawer({
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

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function updateAt<T>(items: T[], setItems: (items: T[]) => void, index: number, patch: Partial<T>) {
  setItems(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
}

function removeAt<T>(items: T[], setItems: (items: T[]) => void, index: number) {
  setItems(items.filter((_, itemIndex) => itemIndex !== index))
}

function connectionLabel(status: 'idle' | 'running' | 'complete' | 'error', t: AppCopy) {
  if (status === 'running') return t.workerRunning
  if (status === 'complete') return t.complete
  if (status === 'error') return t.error
  return t.localCompute
}

function formatStatus(status: SearchStatus, t: AppCopy): string {
  if (status.type === 'searching') return t.searching(status.start.toLocaleString(), status.end.toLocaleString())
  if (status.type === 'stopping') return t.stopping
  if (status.type === 'stopped') return t.stopped(status.totalFound)
  if (status.type === 'completed') return t.completed(status.totalFound)
  if (status.type === 'copyFailed') return t.copyFailed
  return t.idleStatus
}

function formatFeatureStatName(name: string, t: AppCopy): string {
  const featureId = featureStatNames[name]
  return featureId ? t.features[featureId] : name
}

function formatDisplayDate(year: number, season: Season, day: number, t: AppCopy, locale: Locale): string {
  if (locale === 'en') return `Year ${year}, ${t.seasons[season]} ${day}`
  return `第${year}年${t.seasons[season]}${day}日`
}

function formatDayList(days: number[], t: AppCopy): string {
  return days.length > 0 ? days.join(', ') : t.weatherDetails.none
}

function formatTextList(items: string[]): string {
  return items.join(', ')
}

function formatTime(seconds: number): string {
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

export default App
