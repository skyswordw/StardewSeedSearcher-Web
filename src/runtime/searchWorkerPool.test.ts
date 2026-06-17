import { describe, expect, it } from 'vitest'
import {
  SearchWorkerPool,
  createSearchChunks,
  maxSearchWorkersForHardware,
  selectSearchWorkerCount,
  type SearchPoolMessage,
} from './searchWorkerPool'
import type { SearchMessage, SearchRequest } from '../search-core'

type WorkerInbound =
  | { type: 'start-search'; request: SearchRequest; jobId: string }
  | { type: 'cancel-search'; jobId?: string }

type WorkerOutbound =
  | ({ jobId: string } & SearchMessage)
  | { type: 'error'; jobId: string; message: string }

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerOutbound>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: WorkerInbound[] = []
  terminated = false

  postMessage(message: WorkerInbound): void {
    this.messages.push(message)
  }

  emit(message: WorkerOutbound): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerOutbound>)
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent)
  }

  terminate(): void {
    this.terminated = true
  }
}

function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    startSeed: 1,
    endSeed: 500_000,
    useLegacyRandom: false,
    weatherConditions: [{ season: 0, startDay: 1, endDay: 28, minRainDays: 4 }],
    fairyConditions: [],
    mineChestConditions: [],
    monsterLevelConditions: [],
    desertFestivalCondition: null,
    cartConditions: [],
    outputLimit: 2,
    ...overrides,
  }
}

function found(jobId: string, seed: number): WorkerOutbound {
  return {
    type: 'found',
    jobId,
    seed,
    details: {
      weather: null,
      fairy: null,
      mineChest: null,
      monsterLevel: null,
      desertFestival: null,
      cart: null,
    },
    enabledFeatures: {
      weather: false,
      weatherSeasons: [],
      fairy: false,
      mineChest: false,
      monsterLevel: false,
      desertFestival: false,
      cart: false,
    },
  }
}

function complete(jobId: string): WorkerOutbound {
  return { type: 'complete', jobId, totalFound: 0, elapsed: 0, cancelled: false }
}

function cancelled(jobId: string): WorkerOutbound {
  return { type: 'complete', jobId, totalFound: 0, elapsed: 0, cancelled: true }
}

describe('search worker pool', () => {
  it('keeps light searches on one unchunked worker', () => {
    expect(selectSearchWorkerCount(request({ endSeed: 100_000 }), 16, 8)).toBe(1)
    expect(createSearchChunks(request({ endSeed: 100_000 }), 1)).toEqual([
      expect.objectContaining({ index: 0, startSeed: 1, endSeed: 100_000, total: 100_000 }),
    ])
  })

  it('allows explicit high worker limits up to the reported hardware capacity', () => {
    expect(selectSearchWorkerCount(request({ endSeed: 1_000_000 }), 32, 8)).toBe(4)
    expect(selectSearchWorkerCount(request({ endSeed: 1_000_000 }), 32, 16)).toBe(16)
    expect(selectSearchWorkerCount(request({ endSeed: 10_000_000 }), 64, 40)).toBe(40)
    expect(maxSearchWorkersForHardware(32)).toBe(31)
    expect(maxSearchWorkersForHardware(64)).toBe(63)
  })

  it('buffers later chunks so outputLimit uses global seed order', () => {
    const workers = [new FakeWorker(), new FakeWorker()]
    const messages: SearchPoolMessage[] = []
    const pool = new SearchWorkerPool({
      createWorker: () => workers.shift() ?? new FakeWorker(),
      hardwareConcurrency: 8,
      maxWorkers: 2,
    })

    pool.startSearch(request(), 'job-1', (message) => messages.push(message))
    const firstWorker = workersFrom(pool, 0)
    const secondWorker = workersFrom(pool, 1)

    secondWorker.emit(found('job-1', 75_000))
    secondWorker.emit(complete('job-1'))
    expect(messages.filter((message) => message.type === 'found')).toEqual([])

    firstWorker.emit(found('job-1', 10))
    firstWorker.emit(found('job-1', 20))
    firstWorker.emit(complete('job-1'))

    expect(messages.filter((message) => message.type === 'found').map((message) => message.seed)).toEqual([10, 20])
    expect(messages.at(-1)).toMatchObject({ type: 'complete', totalFound: 2, cancelled: false })
    expect(secondWorker.messages).toContainEqual({ type: 'cancel-search', jobId: 'job-1' })
  })

  it('broadcasts cancellation and reports a cancelled completion once', () => {
    const created: FakeWorker[] = []
    const messages: SearchPoolMessage[] = []
    const pool = new SearchWorkerPool({
      createWorker: () => {
        const worker = new FakeWorker()
        created.push(worker)
        return worker
      },
      hardwareConcurrency: 8,
      maxWorkers: 2,
    })

    pool.startSearch(request(), 'job-1', (message) => messages.push(message))
    pool.cancelSearch('job-1')
    created[0].emit(complete('job-1'))

    expect(created).toHaveLength(2)
    expect(created.every((worker) => worker.messages.some((message) => message.type === 'cancel-search'))).toBe(true)
    expect(messages.filter((message) => message.type === 'complete')).toEqual([
      expect.objectContaining({ type: 'complete', totalFound: 0, cancelled: true }),
    ])
  })

  it('preserves cancelled worker completions', () => {
    const created: FakeWorker[] = []
    const messages: SearchPoolMessage[] = []
    const pool = new SearchWorkerPool({
      createWorker: () => {
        const worker = new FakeWorker()
        created.push(worker)
        return worker
      },
      hardwareConcurrency: 1,
      maxWorkers: 1,
    })

    pool.startSearch(request({ endSeed: 100_000 }), 'job-1', (message) => messages.push(message))
    created[0].emit(cancelled('job-1'))

    expect(messages.filter((message) => message.type === 'complete')).toEqual([
      expect.objectContaining({ type: 'complete', totalFound: 0, cancelled: true }),
    ])
  })

  it('ignores stale job messages after a new search starts', () => {
    const created: FakeWorker[] = []
    const messages: SearchPoolMessage[] = []
    const pool = new SearchWorkerPool({
      createWorker: () => {
        const worker = new FakeWorker()
        created.push(worker)
        return worker
      },
      hardwareConcurrency: 8,
      maxWorkers: 2,
    })

    pool.startSearch(request(), 'job-1', (message) => messages.push(message))
    pool.startSearch(request(), 'job-2', (message) => messages.push(message))
    created[0].emit(found('job-1', 10))
    created[0].emit(found('job-2', 15))

    expect(messages.filter((message) => message.type === 'found').map((message) => message.seed)).toEqual([15])
  })
})

function workersFrom(pool: SearchWorkerPool, index: number): FakeWorker {
  return (pool as unknown as { workers: FakeWorker[] }).workers[index]
}
