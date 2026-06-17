import type { FeatureStats, SearchMessage, SearchRequest } from '../search-core'

export type SearchPoolMessage = SearchMessage | { type: 'error'; message: string }

type WorkerInbound =
  | { type: 'start-search'; request: SearchRequest; jobId: string }
  | { type: 'cancel-search'; jobId?: string }

type WorkerOutbound =
  | ({ jobId: string } & SearchMessage)
  | { type: 'error'; jobId: string; message: string }

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerOutbound>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: WorkerInbound): void
  terminate(): void
}

interface SearchChunk {
  index: number
  startSeed: number
  endSeed: number
  total: number
  checkedCount: number
  featureStats: FeatureStats[]
  results: Extract<SearchMessage, { type: 'found' }>[]
  resultsSorted: boolean
  completed: boolean
}

interface ActiveRun {
  jobId: string
  request: SearchRequest
  chunks: SearchChunk[]
  workerCount: number
  nextChunkIndex: number
  flushIndex: number
  emittedCount: number
  activeChunkIndexes: (number | null)[]
  startedAt: number
  onMessage: (message: SearchPoolMessage) => void
  finalized: boolean
}

interface SearchWorkerPoolOptions {
  createWorker?: () => WorkerLike
  hardwareConcurrency?: number
  maxWorkers?: number
}

export interface SearchWorkerPoolRun {
  jobId: string
  workerCount: number
}

export const DEFAULT_MAX_SEARCH_WORKERS = 8
const MIN_CHUNK_SIZE = 50_000
const MAX_CHUNK_SIZE = 1_000_000

export class SearchWorkerPool {
  private readonly createWorker: () => WorkerLike
  private readonly hardwareConcurrency: number
  private readonly maxWorkers: number
  private readonly workers: WorkerLike[] = []
  private activeRun: ActiveRun | null = null

  constructor(options: SearchWorkerPoolOptions = {}) {
    this.createWorker = options.createWorker ?? createBrowserSearchWorker
    this.hardwareConcurrency = options.hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency ?? 1
    this.maxWorkers = normalizeWorkerLimit(options.maxWorkers ?? DEFAULT_MAX_SEARCH_WORKERS)
  }

  startSearch(request: SearchRequest, jobId: string, onMessage: (message: SearchPoolMessage) => void): SearchWorkerPoolRun {
    this.cancelActiveWorkers()

    const total = searchTotal(request)
    const workerCount = selectSearchWorkerCount(request, this.hardwareConcurrency, this.maxWorkers)
    const chunks = createSearchChunks(request, workerCount)
    const activeRun: ActiveRun = {
      jobId,
      request,
      chunks,
      workerCount: Math.min(workerCount, chunks.length),
      nextChunkIndex: 0,
      flushIndex: 0,
      emittedCount: 0,
      activeChunkIndexes: Array.from({ length: Math.min(workerCount, chunks.length) }, () => null),
      startedAt: performance.now(),
      onMessage,
      finalized: false,
    }

    this.ensureWorkers(activeRun.workerCount)
    this.activeRun = activeRun
    onMessage({ type: 'start', total })

    if (chunks.length === 0) {
      this.finalizeRun(activeRun, false)
      return { jobId, workerCount: 1 }
    }

    for (let workerIndex = 0; workerIndex < activeRun.workerCount; workerIndex += 1) {
      this.assignNextChunk(activeRun, workerIndex)
    }

    return { jobId, workerCount: activeRun.workerCount }
  }

  cancelSearch(jobId?: string | null): void {
    const run = this.activeRun
    if (!run || (jobId && jobId !== run.jobId)) return

    this.cancelActiveWorkers(run.jobId)
    this.finalizeRun(run, true)
  }

  dispose(): void {
    this.cancelActiveWorkers()
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.workers.length = 0
    this.activeRun = null
  }

  private ensureWorkers(count: number): void {
    while (this.workers.length < count) {
      const workerIndex = this.workers.length
      const worker = this.createWorker()
      worker.onmessage = (event) => {
        this.handleWorkerMessage(workerIndex, event.data)
      }
      worker.onerror = (event) => {
        this.handleWorkerError(workerIndex, event)
      }
      this.workers.push(worker)
    }
  }

  private assignNextChunk(run: ActiveRun, workerIndex: number): void {
    if (run.finalized || run.nextChunkIndex >= run.chunks.length) return

    const chunk = run.chunks[run.nextChunkIndex]
    run.nextChunkIndex += 1
    run.activeChunkIndexes[workerIndex] = chunk.index
    this.workers[workerIndex].postMessage({
      type: 'start-search',
      jobId: run.jobId,
      request: {
        ...run.request,
        startSeed: chunk.startSeed,
        endSeed: chunk.endSeed,
      },
    })
  }

  private handleWorkerMessage(workerIndex: number, message: WorkerOutbound): void {
    const run = this.activeRun
    if (!run || run.finalized || message.jobId !== run.jobId || workerIndex >= run.workerCount) return

    if (message.type === 'error') {
      this.failRun(run, message.message)
      return
    }

    const chunkIndex = run.activeChunkIndexes[workerIndex]
    const chunk = chunkIndex === null ? null : run.chunks[chunkIndex]
    if (!chunk) return

    if (message.type === 'start') return

    if (message.type === 'progress') {
      chunk.checkedCount = message.checkedCount
      chunk.featureStats = message.featureStats
      run.onMessage(createProgressMessage(run))
      return
    }

    if (message.type === 'found') {
      chunk.results.push(message)
      chunk.resultsSorted = false
      this.flushReadyResults(run)
      if (run.finalized) return
      if (run.emittedCount >= run.request.outputLimit) {
        this.cancelActiveWorkers(run.jobId)
        this.finalizeRun(run, false)
      }
      return
    }

    if (message.type === 'complete') {
      if (message.cancelled) {
        run.activeChunkIndexes[workerIndex] = null
        this.finalizeRun(run, true)
        return
      }

      chunk.completed = !message.cancelled
      run.activeChunkIndexes[workerIndex] = null
      this.flushReadyResults(run)

      if (run.finalized) return

      if (run.emittedCount >= run.request.outputLimit) {
        this.cancelActiveWorkers(run.jobId)
        this.finalizeRun(run, false)
        return
      }

      if (run.nextChunkIndex < run.chunks.length) {
        this.assignNextChunk(run, workerIndex)
        return
      }

      if (run.activeChunkIndexes.every((activeChunkIndex) => activeChunkIndex === null)) {
        this.finalizeRun(run, false)
      }
    }
  }

  private handleWorkerError(workerIndex: number, event: ErrorEvent): void {
    const run = this.activeRun
    if (!run || run.finalized || workerIndex >= run.workerCount) return
    this.failRun(run, event.message || 'Search worker failed')
  }

  private flushReadyResults(run: ActiveRun): void {
    while (run.flushIndex < run.chunks.length) {
      const chunk = run.chunks[run.flushIndex]

      if (!chunk.resultsSorted) {
        chunk.results.sort((a, b) => a.seed - b.seed)
        chunk.resultsSorted = true
      }
      while (chunk.results.length > 0) {
        if (run.emittedCount >= run.request.outputLimit) return
        const result = chunk.results.shift()
        if (!result) break
        run.onMessage(result)
        run.emittedCount += 1
      }

      if (!chunk.completed) return
      run.flushIndex += 1
    }
  }

  private failRun(run: ActiveRun, message: string): void {
    this.cancelActiveWorkers(run.jobId)
    run.finalized = true
    if (this.activeRun === run) this.activeRun = null
    run.onMessage({ type: 'error', message })
  }

  private finalizeRun(run: ActiveRun, cancelled: boolean): void {
    if (run.finalized) return

    run.finalized = true
    if (this.activeRun === run) this.activeRun = null
    run.onMessage({
      type: 'complete',
      totalFound: run.emittedCount,
      elapsed: Math.round(elapsedSeconds(run.startedAt) * 10) / 10,
      cancelled,
    })
  }

  private cancelActiveWorkers(jobId?: string): void {
    for (const worker of this.workers) {
      worker.postMessage({ type: 'cancel-search', jobId })
    }
  }
}

export function selectSearchWorkerCount(
  request: SearchRequest,
  hardwareConcurrency = 1,
  maxWorkers = DEFAULT_MAX_SEARCH_WORKERS,
): number {
  const total = searchTotal(request)
  const requestedLimit = normalizeWorkerLimit(maxWorkers)
  const hardwareLimit = Math.max(1, Math.trunc(hardwareConcurrency) - 1)
  const cappedLimit = Math.max(1, Math.min(requestedLimit, hardwareLimit))
  const automaticRangeLimit = total >= 10_000_000 ? DEFAULT_MAX_SEARCH_WORKERS : total >= 1_000_000 ? 4 : total >= 250_000 ? 2 : 1
  const explicitRangeLimit =
    requestedLimit > DEFAULT_MAX_SEARCH_WORKERS
      ? Math.max(automaticRangeLimit, Math.min(cappedLimit, Math.ceil(total / MIN_CHUNK_SIZE)))
      : automaticRangeLimit

  return Math.max(1, Math.min(cappedLimit, explicitRangeLimit))
}

export function defaultMaxSearchWorkers(hardwareConcurrency = globalThis.navigator?.hardwareConcurrency ?? 1): number {
  return Math.max(1, Math.min(DEFAULT_MAX_SEARCH_WORKERS, maxSearchWorkersForHardware(hardwareConcurrency)))
}

export function maxSearchWorkersForHardware(hardwareConcurrency = globalThis.navigator?.hardwareConcurrency ?? 1): number {
  return Math.max(1, Math.trunc(hardwareConcurrency) - 1)
}

export function createSearchChunks(request: SearchRequest, workerCount: number): SearchChunk[] {
  const total = searchTotal(request)
  if (total <= 0) return []

  const chunkSize =
    workerCount <= 1
      ? total
      : Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, Math.ceil(total / Math.max(1, workerCount * 8))))
  const chunks: SearchChunk[] = []

  for (let startSeed = request.startSeed; startSeed <= request.endSeed; startSeed += chunkSize) {
    const endSeed = Math.min(request.endSeed, startSeed + chunkSize - 1)
    chunks.push({
      index: chunks.length,
      startSeed,
      endSeed,
      total: endSeed - startSeed + 1,
      checkedCount: 0,
      featureStats: [],
      results: [],
      resultsSorted: true,
      completed: false,
    })
  }

  return chunks
}

function createProgressMessage(run: ActiveRun): Extract<SearchMessage, { type: 'progress' }> {
  const checkedCount = run.chunks.reduce((sum, chunk) => sum + chunk.checkedCount, 0)
  const total = searchTotal(run.request)
  const elapsed = elapsedSeconds(run.startedAt)

  return {
    type: 'progress',
    checkedCount,
    total,
    progress: total > 0 ? Math.round((checkedCount / total) * 10_000) / 100 : 100,
    speed: elapsed > 0 ? Math.round(checkedCount / elapsed) : 0,
    elapsed: Math.round(elapsed * 10) / 10,
    featureStats: mergeFeatureStats(run.chunks),
  }
}

function mergeFeatureStats(chunks: SearchChunk[]): FeatureStats[] {
  const passCounts = new Map<string, number>()

  for (const chunk of chunks) {
    for (const stat of chunk.featureStats) {
      passCounts.set(stat.name, (passCounts.get(stat.name) ?? 0) + stat.passCount)
    }
  }

  return [...passCounts.entries()].map(([name, passCount]) => ({ name, passCount }))
}

function searchTotal(request: SearchRequest): number {
  return Math.max(0, request.endSeed - request.startSeed + 1)
}

function elapsedSeconds(startedAt: number): number {
  return (performance.now() - startedAt) / 1000
}

function createBrowserSearchWorker(): WorkerLike {
  return new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' })
}

function normalizeWorkerLimit(value: number): number {
  return Math.max(1, Math.trunc(value))
}
