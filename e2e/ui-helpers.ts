import { expect, type Page } from '@playwright/test'

export const productTitlePattern = /stardew.*seed.*searcher|seed.*searcher|星露谷物语|种子搜索器/i

export const featureIds = [
  'weather',
  'fairy',
  'mineChest',
  'monsterLevel',
  'desertFestival',
  'cart',
] as const

export type FeatureId = (typeof featureIds)[number]

export const dynamicScreenshotMasks = (page: Page) => [
  page.getByTestId('status-message'),
  page.getByTestId('progress'),
  page.getByTestId('metric-grid'),
  page.getByTestId('search-analysis'),
]

export async function openApp(page: Page, options: { mockWorker?: boolean } = {}) {
  if (options.mockWorker) {
    await installMockSearchWorker(page)
  }

  await page.goto('/')
  await expect(page).toHaveTitle(productTitlePattern)
  await expect(page.getByRole('heading', { name: productTitlePattern }).first()).toBeVisible()
}

export function featureToggle(page: Page, featureId: FeatureId) {
  return page.getByTestId(`feature-toggle-${featureId}`)
}

export function featureSection(page: Page, featureId: FeatureId) {
  return page.getByTestId(`feature-section-${featureId}`)
}

export function conditionRows(page: Page) {
  return page.getByTestId('condition-row')
}

export function resultRows(page: Page) {
  return page.getByTestId('seed-result')
}

export async function configureTinySeedRange(page: Page) {
  await page.getByTestId('start-seed').fill('1')
  await page.getByTestId('output-limit').fill('1')
  await page.getByTestId('search-range').selectOption('100000')
}

export async function setEveryFeature(page: Page, enabled: boolean) {
  for (const featureId of featureIds) {
    const toggle = featureToggle(page, featureId)
    if ((await toggle.isChecked()) !== enabled) {
      await toggle.setChecked(enabled)
    }
    await expect(toggle).toBeChecked({ checked: enabled })
  }
}

export async function startSearch(page: Page) {
  await page.getByTestId('start-search').click()
}

export async function waitForRunningState(page: Page) {
  await expect(page.getByTestId('status-message')).toContainText(/正在搜索|Searching/)
  await expect(page.getByTestId('start-search')).toContainText(/停止搜索|Stop search/)
}

export async function waitForCompleteState(page: Page) {
  await expect(page.getByTestId('status-message')).toContainText(/搜索完成|找到|Search complete|Found/)
  await expect(page.getByTestId('start-search')).toContainText(/开始搜索|Start search/)
  await expect(resultRows(page).first()).toBeVisible()
}

export async function assertNoHorizontalOverflow(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const scrollingElement = document.scrollingElement ?? document.documentElement
          return {
            bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
            documentOverflow: scrollingElement.scrollWidth - scrollingElement.clientWidth,
            viewportOverflow: document.documentElement.scrollWidth - window.innerWidth,
          }
        }),
      { message: 'document should not overflow horizontally' },
    )
    .toEqual({ bodyOverflow: 0, documentOverflow: 0, viewportOverflow: 0 })
}

export async function openFirstSeedDrawer(page: Page) {
  await resultRows(page).first().getByTestId('seed-details').click()
  const drawer = page.getByTestId('seed-detail')
  await expect(drawer).toBeVisible()
  await expect(drawer).toHaveAttribute('role', 'dialog')
  await expect(drawer).toContainText(/种子简介|Seed details/)
  return drawer
}

export async function installMockSearchWorker(page: Page) {
  await page.addInitScript(() => {
    const enabledFromRequest = (request: {
      weatherConditions: unknown[]
      fairyConditions: unknown[]
      mineChestConditions: unknown[]
      monsterLevelConditions: unknown[]
      desertFestivalCondition: { requireJas?: boolean; requireLeah?: boolean } | null
      cartConditions: unknown[]
    }) => ({
      weather: request.weatherConditions.length > 0,
      weatherSeasons: [0],
      fairy: request.fairyConditions.length > 0,
      mineChest: request.mineChestConditions.length > 0,
      monsterLevel: request.monsterLevelConditions.length > 0,
      desertFestival: Boolean(request.desertFestivalCondition?.requireJas || request.desertFestivalCondition?.requireLeah),
      cart: request.cartConditions.length > 0,
    })

    class MockSearchWorker extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null
      private activeJobId: string | null = null
      private timers: number[] = []
      private cancelled = false

      constructor() {
        super()
      }

      postMessage(message: {
        type: 'start-search' | 'cancel-search'
        jobId?: string
        request?: {
          startSeed: number
          endSeed: number
          weatherConditions: unknown[]
          fairyConditions: unknown[]
          mineChestConditions: unknown[]
          monsterLevelConditions: unknown[]
          desertFestivalCondition: { requireJas?: boolean; requireLeah?: boolean } | null
          cartConditions: unknown[]
        }
      }) {
        if (message.type === 'cancel-search') {
          this.cancelled = true
          this.clearTimers()
          this.emit({ type: 'complete', jobId: this.activeJobId, totalFound: 0, elapsed: 0.2, cancelled: true })
          return
        }

        if (!message.request || !message.jobId) return
        this.clearTimers()
        this.cancelled = false
        this.activeJobId = message.jobId
        const request = message.request
        const total = Math.max(1, request.endSeed - request.startSeed + 1)
        const seed = 123456

        this.schedule(20, () => this.emit({ type: 'start', jobId: message.jobId, total }))
        this.schedule(70, () =>
          this.emit({
            type: 'progress',
            jobId: message.jobId,
            checkedCount: Math.min(50, total),
            total,
            progress: 45,
            speed: 250,
            elapsed: 0.2,
            featureStats: [{ name: '天气', passCount: 12 }],
          }),
        )
        this.schedule(130, () =>
          this.emit({
            type: 'found',
            jobId: message.jobId,
            seed,
            enabledFeatures: enabledFromRequest(request),
            details: {
              weather: {
                greenRainDay: 12,
                springRain: [3, 13, 24],
                summerRain: [7, 12],
                fallRain: [2, 16],
              },
              fairy: { days: [{ year: 1, season: 0, day: 6, isBlocked: false }] },
              mineChest: [{ floor: 10, item: '阿比盖尔的弓', matched: true }],
              monsterLevel: [{ description: '春 5，1-40 层没有怪物层。', satisfied: true, absoluteStartDay: 5 }],
              desertFestival: { day15: ['贾斯'], day16: ['莉亚'], day17: ['桑迪'] },
              cart: {
                matches: [
                  {
                    year: 1,
                    season: 0,
                    day: 5,
                    absoluteDay: 5,
                    itemName: '石头',
                    quantity: 5,
                    price: 100,
                  },
                ],
              },
            },
          }),
        )
        this.schedule(180, () =>
          this.emit({
            type: 'progress',
            jobId: message.jobId,
            checkedCount: total,
            total,
            progress: 100,
            speed: 500,
            elapsed: 0.4,
            featureStats: [{ name: '天气', passCount: 24 }],
          }),
        )
        this.schedule(700, () =>
          this.emit({ type: 'complete', jobId: message.jobId, totalFound: 1, elapsed: 0.4, cancelled: false }),
        )
      }

      terminate() {
        this.clearTimers()
      }

      private schedule(delay: number, callback: () => void) {
        const timer = window.setTimeout(() => {
          if (!this.cancelled) callback()
        }, delay)
        this.timers.push(timer)
      }

      private clearTimers() {
        for (const timer of this.timers) window.clearTimeout(timer)
        this.timers = []
      }

      private emit(data: Record<string, unknown>) {
        const event = new MessageEvent('message', { data })
        this.onmessage?.(event)
        this.dispatchEvent(event)
      }
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: MockSearchWorker,
    })
  })
}
