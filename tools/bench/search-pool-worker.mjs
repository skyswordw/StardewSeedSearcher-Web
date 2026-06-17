import { parentPort, workerData } from 'node:worker_threads'
import { createServer } from 'vite'

const server = await createServer({
  root: workerData.root,
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
})

const core = await server.ssrLoadModule('/src/search-core/index.ts')

parentPort.postMessage({ type: 'ready' })

parentPort.on('message', (message) => {
  if (message.type !== 'run') return

  let checkedCount = 0
  const foundSeeds = core.searchSeeds(message.request, {
    onMessage(searchMessage) {
      if (searchMessage.type === 'progress') {
        checkedCount = Math.max(checkedCount, searchMessage.checkedCount)
      }
    },
  })

  parentPort.postMessage({
    type: 'result',
    chunkIndex: message.chunkIndex,
    checkedCount,
    foundSeeds,
  })
})

process.on('disconnect', () => {
  void server.close()
})
