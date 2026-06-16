import { useMemo, useRef, useState } from 'react'
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
import avatar from './assets/avatar.png'
import {
  allCartItemNames,
  formatGameDate,
  mineChestFloors,
  mineChestItems,
  seasonNames,
  type CartCondition,
  type DesertFestivalCondition,
  type EnabledFeatures,
  type FairyCondition,
  type MineChestCondition,
  type MonsterLevelCondition,
  type SearchMessage,
  type SearchRequest,
  type SeedDetails,
  type WeatherCondition,
} from './search-core'

const INT_MAX = 2_147_483_647
const searchRangeOptions = [
  { label: '10万', value: '100000' },
  { label: '100万', value: '1000000' },
  { label: '1000万', value: '10000000' },
  { label: '1亿', value: '100000000' },
  { label: '最大', value: 'max' },
]

interface FoundSeed {
  seed: number
  details: SeedDetails
  enabled: EnabledFeatures
}

interface FeatureStatView {
  name: string
  passCount: number
}

function App() {
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
  const [statusMessage, setStatusMessage] = useState('等待搜索')
  const [checkedCount, setCheckedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [featureStats, setFeatureStats] = useState<FeatureStatView[]>([])
  const [foundSeeds, setFoundSeeds] = useState<FoundSeed[]>([])
  const [selectedSeed, setSelectedSeed] = useState<FoundSeed | null>(null)
  const [rangeBadge, setRangeBadge] = useState('')
  const [stoppedEarly, setStoppedEarly] = useState<boolean | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const activeJobId = useRef<string | null>(null)
  const savedStartSeed = useRef(1)

  const calculatedRange = useMemo(() => {
    const range = searchRange === 'max' ? INT_MAX - startSeed + 1 : Number.parseInt(searchRange, 10)
    const endSeed = Math.min(startSeed - 1 + range, INT_MAX)
    return { range, endSeed }
  }, [searchRange, startSeed])

  function validate(): string | null {
    if (!Number.isFinite(startSeed) || startSeed < 1 || startSeed > INT_MAX) return `起始种子必须在 1 ~ ${INT_MAX} 之间`
    if (outputLimit < 1 || outputLimit > 500) return '输出数量必须在 1-500 之间'
    if (!weatherEnabled && !fairyEnabled && !mineChestEnabled && !monsterLevelEnabled && !desertFestivalEnabled && !cartEnabled) {
      return '请至少启用一个筛选条件'
    }
    if (weatherEnabled) {
      for (const condition of weatherConditions) {
        if (condition.startDay > condition.endDay) return '天气错误：起始日期不能大于结束日期'
        if (condition.minRainDays > condition.endDay - condition.startDay + 1) return '天气错误：雨天数不能超过范围总天数'
      }
    }
    if (fairyEnabled && fairyConditions.some((condition) => condition.minOccurrences < 1)) return '仙子错误：出现次数必须大于 0'
    if (cartEnabled && cartConditions.some((condition) => !condition.itemName)) return '猪车错误：请选择物品'
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
    const jobId = crypto.randomUUID()
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
    setRangeBadge(`种子范围: ${request.startSeed.toLocaleString()}-${request.endSeed.toLocaleString()}`)
    setStatusMessage(`正在搜索: ${request.startSeed.toLocaleString()}-${request.endSeed.toLocaleString()}`)
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
    setStatusMessage('正在停止搜索...')
  }

  function setRandomStartSeed() {
    const buffer = new Uint32Array(1)
    crypto.getRandomValues(buffer)
    setStartSeed((buffer[0] % 1_000_000_000) + 1)
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
      setStatusMessage(
        message.cancelled ? `搜索已停止，共找到 ${message.totalFound} 个符合条件的种子` : `搜索完成！找到 ${message.totalFound} 个符合条件的种子`,
      )
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
      '星露谷物语 - 脆音音种子搜索器 Web 版',
      `搜索范围：${startSeed} - ${calculatedRange.endSeed}`,
      `旧随机模式：${useLegacyRandom ? '是' : '否'}`,
      `找到种子数：${foundSeeds.length}`,
      '',
      ...foundSeeds.map((item) => String(item.seed)),
      '',
      'Derived from CuiYinYin2023/StardewSeedSearcher V1.0.',
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stardew-seeds-${Date.now()}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function copySeed(seed: number) {
    await navigator.clipboard?.writeText(String(seed))
  }

  return (
    <main className="app-shell" data-testid="app-shell">
      <div className={`connection-status ${connectionStatus}`} data-testid="connection-status">
        {connectionLabel(connectionStatus)}
      </div>
      <header className="app-header">
        <a href="https://wiki.biligame.com/stardewvalley/%E6%98%9F%E9%9C%B2%E8%B0%B7%E7%89%A9%E8%AF%AD%E7%BB%B4%E5%9F%BA" target="_blank">
          <img src={logo} alt="Stardew Valley" className="brand-icon" />
        </a>
        <div>
          <h1>星露谷物语</h1>
          <p>脆音音种子搜索器 Web 版</p>
        </div>
        <a href="https://space.bilibili.com/349111916" target="_blank">
          <img src={avatar} alt="脆音音头像" className="brand-icon" />
        </a>
      </header>

      <form className="tool-grid" data-testid="tool-grid" onSubmit={submitForm}>
        <section className="panel main-panel" data-testid="main-panel">
          <details className="guide" open>
            <summary>
              <Info size={18} /> 操作指南
            </summary>
            <ul>
              <li>Web 版在浏览器 Web Worker 中搜索，不需要下载或启动本地 C# 服务。</li>
              <li>搜索开始后按钮会变为停止搜索，点击即可取消当前任务。</li>
              <li>预测目标与原项目 V1.0 对齐；如遇预测错误，请同时记录搜索条件和种子号。</li>
            </ul>
          </details>

          <details className="guide">
            <summary>
              <BookOpen size={18} /> 功能说明
            </summary>
            <div className="feature-copy">
              <p>最后更新基线：2026.6.12；适配星露谷版本：1.6.15；搜索结果支持平台：PC / 安卓 / iOS。</p>
              <p>当前覆盖：天气、仙子、矿井混合宝箱、矿井怪物层、沙漠节商人、猪车。</p>
            </div>
          </details>

          <div className="form-row">
            <NumberField label="起始种子" value={startSeed} min={1} max={INT_MAX} onChange={setStartSeed} />
            <label className="field">
              <span>搜索范围</span>
              <select value={searchRange} onChange={(event) => setSearchRange(event.target.value)}>
                {searchRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="输出上限" value={outputLimit} min={1} max={500} onChange={setOutputLimit} />
          </div>

          <div className="quick-row">
            <button type="button" className="soft-button" onClick={() => setStartSeed(1)}>
              最小
            </button>
            <button type="button" className="soft-button" onClick={setRandomStartSeed}>
              随机起点
            </button>
            <label className="check">
              <input type="checkbox" checked={loopSearch} onChange={(event) => setLoopSearch(event.target.checked)} />
              搜索后自动更新起始值
            </label>
            <label className="check">
              <input type="checkbox" checked={useLegacyRandom} onChange={(event) => setUseLegacyRandom(event.target.checked)} />
              使用旧随机模式
            </label>
          </div>

          <FeatureSection title="天气筛选" enabled={weatherEnabled} onToggle={setWeatherEnabled} note="目前只支持第一年，雨天包含绿雨和雷雨。">
            {weatherConditions.map((condition, index) => (
              <div className="condition-row" data-testid="condition-row" key={index}>
                <span>第一年</span>
                <SeasonSelect value={condition.season} seasons={[0, 1, 2]} onChange={(season) => updateAt(weatherConditions, setWeatherConditions, index, { season })} />
                <NumberField compact label="起始日" value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(weatherConditions, setWeatherConditions, index, { startDay })} />
                <NumberField compact label="结束日" value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(weatherConditions, setWeatherConditions, index, { endDay })} />
                <NumberField compact label="至少雨天" value={condition.minRainDays} min={1} max={28} onChange={(minRainDays) => updateAt(weatherConditions, setWeatherConditions, index, { minRainDays })} />
                <IconButton label="删除天气条件" onClick={() => removeAt(weatherConditions, setWeatherConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setWeatherConditions([...weatherConditions, { season: 0, startDay: 1, endDay: 28, minRainDays: 10 }])}>添加条件</AddButton>
          </FeatureSection>

          <FeatureSection title="仙子筛选" enabled={fairyEnabled} onToggle={setFairyEnabled} note="仙子事件可能会被其他事件覆盖。">
            {fairyConditions.map((condition, index) => (
              <div className="condition-row wide" data-testid="condition-row" key={index}>
                <NumberField compact label="开始年" value={condition.startYear} min={1} max={10} onChange={(startYear) => updateAt(fairyConditions, setFairyConditions, index, { startYear })} />
                <SeasonSelect value={condition.startSeason} seasons={[0, 1, 2]} onChange={(startSeason) => updateAt(fairyConditions, setFairyConditions, index, { startSeason })} />
                <NumberField compact label="开始日" value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(fairyConditions, setFairyConditions, index, { startDay })} />
                <NumberField compact label="结束年" value={condition.endYear} min={1} max={10} onChange={(endYear) => updateAt(fairyConditions, setFairyConditions, index, { endYear })} />
                <SeasonSelect value={condition.endSeason} seasons={[0, 1, 2]} onChange={(endSeason) => updateAt(fairyConditions, setFairyConditions, index, { endSeason })} />
                <NumberField compact label="结束日" value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(fairyConditions, setFairyConditions, index, { endDay })} />
                <NumberField compact label="至少次数" value={condition.minOccurrences} min={1} max={99} onChange={(minOccurrences) => updateAt(fairyConditions, setFairyConditions, index, { minOccurrences })} />
                <IconButton label="删除仙子条件" onClick={() => removeAt(fairyConditions, setFairyConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setFairyConditions([...fairyConditions, { startYear: 1, startSeason: 0, startDay: 1, endYear: 1, endSeason: 2, endDay: 28, minOccurrences: 1 }])}>添加条件</AddButton>
          </FeatureSection>

          <FeatureSection title="矿井混合宝箱筛选" enabled={mineChestEnabled} onToggle={setMineChestEnabled} note="必须在创建存档时勾选混合矿井。">
            {mineChestConditions.map((condition, index) => (
              <div className="condition-row" data-testid="condition-row" key={index}>
                <label className="field compact">
                  <span>层数</span>
                  <select value={condition.floor} onChange={(event) => updateAt(mineChestConditions, setMineChestConditions, index, { floor: Number(event.target.value), itemName: mineChestItems[Number(event.target.value)][0] })}>
                    {mineChestFloors.map((floor) => (
                      <option value={floor} key={floor}>
                        {floor}层
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>目标物品</span>
                  <select value={condition.itemName} onChange={(event) => updateAt(mineChestConditions, setMineChestConditions, index, { itemName: event.target.value })}>
                    {mineChestItems[condition.floor].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <IconButton label="删除宝箱条件" onClick={() => removeAt(mineChestConditions, setMineChestConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setMineChestConditions([...mineChestConditions, { floor: 20, itemName: mineChestItems[20][0] }])}>添加条件</AddButton>
          </FeatureSection>

          <FeatureSection title="矿井怪物层筛选" enabled={monsterLevelEnabled} onToggle={setMonsterLevelEnabled} note="筛选指定日期和层数范围没有怪物层，当前支持第一年。">
            {monsterLevelConditions.map((condition, index) => (
              <div className="condition-row wide" data-testid="condition-row" key={index}>
                <SeasonSelect value={condition.startSeason} seasons={[0, 1, 2]} onChange={(startSeason) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { startSeason })} />
                <NumberField compact label="开始日" value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { startDay })} />
                <SeasonSelect value={condition.endSeason} seasons={[0, 1, 2]} onChange={(endSeason) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { endSeason })} />
                <NumberField compact label="结束日" value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { endDay })} />
                <NumberField compact label="起始层" value={condition.startLevel} min={1} max={119} onChange={(startLevel) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { startLevel })} />
                <NumberField compact label="结束层" value={condition.endLevel} min={1} max={119} onChange={(endLevel) => updateAt(monsterLevelConditions, setMonsterLevelConditions, index, { endLevel })} />
                <IconButton label="删除怪物层条件" onClick={() => removeAt(monsterLevelConditions, setMonsterLevelConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setMonsterLevelConditions([...monsterLevelConditions, { startSeason: 0, endSeason: 0, startDay: 5, endDay: 5, startLevel: 1, endLevel: 40 }])}>添加条件</AddButton>
          </FeatureSection>

          <FeatureSection title="沙漠节商人筛选" enabled={desertFestivalEnabled} onToggle={setDesertFestivalEnabled} note="筛选第一年沙漠节出现贾斯或莉亚。">
            <div className="quick-row">
              <label className="check">
                <input type="checkbox" checked={desertFestivalCondition.requireJas} onChange={(event) => setDesertFestivalCondition({ ...desertFestivalCondition, requireJas: event.target.checked })} />
                要求贾斯
              </label>
              <label className="check">
                <input type="checkbox" checked={desertFestivalCondition.requireLeah} onChange={(event) => setDesertFestivalCondition({ ...desertFestivalCondition, requireLeah: event.target.checked })} />
                要求莉亚
              </label>
            </div>
          </FeatureSection>

          <FeatureSection title="猪车筛选" enabled={cartEnabled} onToggle={setCartEnabled} note="可输入物品名称并设置数量为 5 的条件。">
            <datalist id="cart-items">
              {allCartItemNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {cartConditions.map((condition, index) => (
              <div className="condition-row wide" data-testid="condition-row" key={index}>
                <NumberField compact label="开始年" value={condition.startYear} min={1} max={10} onChange={(startYear) => updateAt(cartConditions, setCartConditions, index, { startYear })} />
                <SeasonSelect value={condition.startSeason} seasons={[0, 1, 2, 3]} onChange={(startSeason) => updateAt(cartConditions, setCartConditions, index, { startSeason })} />
                <NumberField compact label="开始日" value={condition.startDay} min={1} max={28} onChange={(startDay) => updateAt(cartConditions, setCartConditions, index, { startDay })} />
                <NumberField compact label="结束年" value={condition.endYear} min={1} max={10} onChange={(endYear) => updateAt(cartConditions, setCartConditions, index, { endYear })} />
                <SeasonSelect value={condition.endSeason} seasons={[0, 1, 2, 3]} onChange={(endSeason) => updateAt(cartConditions, setCartConditions, index, { endSeason })} />
                <NumberField compact label="结束日" value={condition.endDay} min={1} max={28} onChange={(endDay) => updateAt(cartConditions, setCartConditions, index, { endDay })} />
                <label className="field item-field">
                  <span>物品</span>
                  <input list="cart-items" value={condition.itemName} onChange={(event) => updateAt(cartConditions, setCartConditions, index, { itemName: event.target.value })} />
                </label>
                <NumberField compact label="至少次数" value={condition.minOccurrences} min={1} max={99} onChange={(minOccurrences) => updateAt(cartConditions, setCartConditions, index, { minOccurrences })} />
                <label className="check small-check">
                  <input type="checkbox" checked={condition.requireQty5} onChange={(event) => updateAt(cartConditions, setCartConditions, index, { requireQty5: event.target.checked })} />
                  数量5
                </label>
                <IconButton label="删除猪车条件" onClick={() => removeAt(cartConditions, setCartConditions, index)} icon={<Trash2 size={16} />} />
              </div>
            ))}
            <AddButton onClick={() => setCartConditions([...cartConditions, { startYear: 1, startSeason: 0, startDay: 5, endYear: 1, endSeason: 2, endDay: 28, itemName: allCartItemNames[0] ?? '', requireQty5: false, minOccurrences: 1 }])}>添加条件</AddButton>
          </FeatureSection>

          <div className="action-row">
            <button type="submit" className={isSearching ? 'primary stop' : 'primary'} data-testid="start-search">
              {isSearching ? <Square size={18} /> : <Search size={18} />}
              {isSearching ? '停止搜索' : '开始搜索'}
            </button>
            <button type="button" className="secondary" onClick={exportResults} disabled={foundSeeds.length === 0}>
              <Download size={18} /> 导出所有种子号
            </button>
          </div>
        </section>

        <aside className="panel results-panel" data-testid="results-panel">
          <h2>搜索状态</h2>
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
            <Metric label="已检查" value={checkedCount.toLocaleString()} />
            <Metric label="总范围" value={totalCount.toLocaleString()} />
            <Metric label="找到" value={foundSeeds.length.toLocaleString()} />
            <Metric label="速度" value={`${speed.toLocaleString()}/s`} />
            <Metric label="已用时" value={formatTime(elapsed)} />
            <Metric label="预计剩余" value={speed > 0 ? formatTime((totalCount - checkedCount) / speed) : '--'} />
          </div>

          <section className="analysis">
            <h3>筛选统计</h3>
            <div className="analysis-row">
              <span>是否提前停止</span>
              <strong>{stoppedEarly === null ? '?' : stoppedEarly ? '是' : '否'}</strong>
            </div>
            {featureStats.length === 0 ? (
              <p className="muted">搜索开始后显示各条件通过数量。</p>
            ) : (
              featureStats.map((stat) => (
                <div className="analysis-row" key={stat.name}>
                  <span>{stat.name}</span>
                  <strong>{stat.passCount.toLocaleString()}</strong>
                </div>
              ))
            )}
          </section>

          <section className="seed-results" data-testid="results">
            <h3>结果列表</h3>
            <p className="muted">共找到 {foundSeeds.length} 个，显示前 20 个。</p>
            <div className="seed-list">
              {foundSeeds.slice(0, 20).map((item) => (
                <div className="seed-item" data-testid="seed-result" key={item.seed}>
                  <span>种子: {item.seed}</span>
                  <div>
                    <button type="button" onClick={() => setSelectedSeed(item)}>
                      简介
                    </button>
                    <button type="button" onClick={() => copySeed(item.seed)}>
                      复制
                    </button>
                  </div>
                </div>
              ))}
              {foundSeeds.length === 0 && <p className="empty">暂无结果</p>}
            </div>
          </section>
        </aside>
      </form>

      {selectedSeed && <SeedDrawer found={selectedSeed} onClose={() => setSelectedSeed(null)} onCopy={() => copySeed(selectedSeed.seed)} />}
    </main>
  )
}

function FeatureSection({
  title,
  note,
  enabled,
  onToggle,
  children,
}: {
  title: string
  note: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: React.ReactNode
}) {
  return (
    <section className={`feature-section ${enabled ? 'enabled' : ''}`} data-testid={`feature-section-${title}`}>
      <div className="feature-header">
        <label className="check title-check">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={title}
            data-testid={`feature-toggle-${title}`}
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
  value,
  min,
  max,
  compact,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  compact?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className={`field ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)} />
    </label>
  )
}

function SeasonSelect({
  value,
  seasons,
  onChange,
}: {
  value: number
  seasons: (0 | 1 | 2 | 3)[]
  onChange: (season: 0 | 1 | 2 | 3) => void
}) {
  return (
    <label className="field compact">
      <span>季节</span>
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

function SeedDrawer({ found, onClose, onCopy }: { found: FoundSeed; onClose: () => void; onCopy: () => void }) {
  const { details, enabled } = found
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={`种子 ${found.seed} 简介`} data-testid="seed-detail">
      <aside className="seed-drawer" data-testid="seed-drawer">
        <header>
          <div>
            <span>种子简介</span>
            <h2>{found.seed}</h2>
          </div>
          <div className="drawer-actions">
            <button type="button" onClick={onCopy}>
              <Clipboard size={16} /> 复制
            </button>
            <button type="button" aria-label="关闭" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {enabled.weather && details.weather && (
          <DetailSection title="天气">
            <p>绿雨：夏 {details.weather.greenRainDay}</p>
            <p>春雨：{details.weather.springRain.join('、') || '无'}</p>
            <p>夏雨：{details.weather.summerRain.join('、') || '无'}</p>
            <p>秋雨：{details.weather.fallRain.join('、') || '无'}</p>
          </DetailSection>
        )}
        {enabled.fairy && details.fairy && (
          <DetailSection title="仙子">
            {details.fairy.days.length === 0 ? (
              <p>条件范围内没有仙子记录。</p>
            ) : (
              details.fairy.days.map((day, index) => (
                <p key={index}>
                  {formatGameDate(day.year, day.season, day.day)} {day.isBlocked ? '被次日雨天拦截' : '可降临'}
                </p>
              ))
            )}
          </DetailSection>
        )}
        {enabled.mineChest && details.mineChest && (
          <DetailSection title="矿井混合宝箱">
            {details.mineChest.map((item) => (
              <p key={item.floor}>
                {item.floor}层：{item.item} {item.matched ? <CheckCircle2 size={14} /> : null}
              </p>
            ))}
          </DetailSection>
        )}
        {enabled.monsterLevel && details.monsterLevel && (
          <DetailSection title="怪物层">
            {details.monsterLevel.map((item, index) => (
              <p key={index}>{item.description}</p>
            ))}
          </DetailSection>
        )}
        {enabled.desertFestival && details.desertFestival && (
          <DetailSection title="沙漠节商人">
            <p>春15：{details.desertFestival.day15.join('、')}</p>
            <p>春16：{details.desertFestival.day16.join('、')}</p>
            <p>春17：{details.desertFestival.day17.join('、')}</p>
          </DetailSection>
        )}
        {enabled.cart && details.cart && (
          <DetailSection title="猪车">
            {details.cart.matches.length === 0 ? (
              <p>没有记录到匹配项。</p>
            ) : (
              details.cart.matches.map((match, index) => (
                <p key={index}>
                  {formatGameDate(match.year, match.season, match.day)}：{match.itemName} x{match.quantity === -1 ? '无限' : match.quantity}，{match.price}g
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

function connectionLabel(status: 'idle' | 'running' | 'complete' | 'error') {
  if (status === 'running') return 'Worker 搜索中'
  if (status === 'complete') return '搜索完成'
  if (status === 'error') return '搜索错误'
  return '本地浏览器计算'
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
