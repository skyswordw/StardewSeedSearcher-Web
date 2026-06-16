import { expect, test } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  configureTinySeedRange,
  dynamicScreenshotMasks,
  openApp,
  openFirstSeedDrawer,
  startSearch,
  waitForCompleteState,
} from './ui-helpers'

test.describe('visual audit', () => {
  test('desktop idle layout has a stable baseline', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop screenshot baseline belongs to the chromium project')
    test.skip(Boolean(process.env.CI), 'pixel baselines are local-only to avoid OS/font drift in CI')

    await openApp(page)
    await assertNoHorizontalOverflow(page)

    await expect(page).toHaveScreenshot('desktop-idle.png', {
      fullPage: true,
      mask: dynamicScreenshotMasks(page),
    })
  })

  test('mobile idle layout has no horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout audit belongs to the mobile project')

    await openApp(page)
    await assertNoHorizontalOverflow(page)
    await expect(page.getByTestId('tool-grid')).toHaveCSS('grid-template-columns', /.+/)
    await expect(page.getByTestId('results-panel')).toBeVisible()
  })

  test('completed results and drawer layout match stable baselines', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'result screenshots are captured once in desktop chromium')
    test.skip(Boolean(process.env.CI), 'pixel baselines are local-only to avoid OS/font drift in CI')

    await openApp(page, { mockWorker: true })
    await configureTinySeedRange(page)
    await startSearch(page)
    await waitForCompleteState(page)
    await assertNoHorizontalOverflow(page)

    await expect(page).toHaveScreenshot('desktop-complete-results.png', {
      fullPage: true,
      mask: dynamicScreenshotMasks(page),
    })

    await openFirstSeedDrawer(page)
    await expect(page).toHaveScreenshot('desktop-seed-drawer.png', {
      fullPage: true,
      mask: dynamicScreenshotMasks(page),
    })
  })
})
