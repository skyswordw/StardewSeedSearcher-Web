import { searchSeedsAsync, type SearchMessage, type SearchRequest } from '../search-core'

type WorkerInbound =
  | { type: 'start-search'; request: SearchRequest; jobId: string }
  | { type: 'cancel-search'; jobId?: string }

type WorkerOutbound =
  | ({ jobId: string } & SearchMessage)
  | { type: 'error'; jobId: string; message: string }

let controller: AbortController | null = null
let activeJobId: string | null = null

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const message = event.data
  if (message.type === 'cancel-search') {
    controller?.abort()
    return
  }

  if (message.type === 'start-search') {
    controller?.abort()
    controller = new AbortController()
    activeJobId = message.jobId
    const jobId = message.jobId

    setTimeout(() => {
      void (async () => {
        try {
          await searchSeedsAsync(
            message.request,
            {
              signal: controller?.signal,
              onMessage(searchMessage) {
                postMessage({ jobId, ...searchMessage } satisfies WorkerOutbound)
              },
            },
            { yieldEvery: 2000 },
          )
        } catch (error) {
          postMessage({
            type: 'error',
            jobId,
            message: error instanceof Error ? error.message : String(error),
          } satisfies WorkerOutbound)
        } finally {
          if (activeJobId === jobId) {
            activeJobId = null
            controller = null
          }
        }
      })()
    }, 0)
  }
}
