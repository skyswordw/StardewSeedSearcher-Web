import { expect, test } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  conditionRows,
  configureTinySeedRange,
  featureIds,
  featureSection,
  featureToggle,
  openApp,
  openFirstSeedDrawer,
  resultRows,
  setEveryFeature,
  startSearch,
  waitForCompleteState,
  waitForRunningState,
} from './ui-helpers'

test.describe('functional UI coverage', () => {
  test('renders the idle state without horizontal overflow', async ({ page }) => {
    await openApp(page)

    await expect(page.getByTestId('connection-status')).toHaveCount(0)
    await expect(page.getByTestId('status-message')).toHaveText('等待搜索')
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    await expect(page.getByText('暂无结果')).toBeVisible()
    await expect(page.getByRole('button', { name: /导出所有种子号/ })).toBeDisabled()
    await expect(page.getByTestId('github-repo-link')).toHaveAttribute('href', 'https://github.com/skyswordw/StardewSeedSearcher-Web')
    await expect(page.getByTestId('github-repo-link')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('switches to English and preserves core controls', async ({ page }) => {
    await openApp(page)

    await page.getByTestId('language-switch').getByRole('button', { name: 'English' }).click()

    await expect(page).toHaveTitle(/Unofficial Stardew Valley seed searcher Web port/)
    await expect(page.getByTestId('status-message')).toHaveText('Ready to search')
    await expect(page.getByTestId('start-search')).toContainText('Start search')
    await expect(page.getByRole('button', { name: /Export seed numbers/ })).toBeDisabled()
    await expect(featureSection(page, 'weather')).toContainText('Weather filter')
    await expect(page.getByTestId('search-range')).toHaveValue('100000')
    await assertNoHorizontalOverflow(page)

    await page.getByTestId('language-switch').getByRole('button', { name: '中文' }).click()
    await expect(page.getByTestId('status-message')).toHaveText('等待搜索')
  })

  test('toggles every feature section and preserves controls when re-enabled', async ({ page }) => {
    await openApp(page)

    for (const featureId of featureIds) {
      const toggle = featureToggle(page, featureId)
      const section = featureSection(page, featureId)

      await expect(toggle).toBeVisible()
      await toggle.setChecked(false)
      await expect(toggle).not.toBeChecked()
      await expect(section.getByTestId('add-condition')).toHaveCount(0)

      await toggle.setChecked(true)
      await expect(toggle).toBeChecked()

      if (featureId === 'desertFestival') {
        await expect(section.getByLabel('要求贾斯')).toBeVisible()
      } else {
        await expect(section.getByTestId('add-condition')).toBeVisible()
      }
    }
  })

  test('adds and removes feature conditions', async ({ page }) => {
    await openApp(page)

    const weatherSection = featureSection(page, 'weather')
    const beforeCount = await conditionRows(page).count()
    await weatherSection.getByTestId('add-condition').click()
    await expect.poll(async () => conditionRows(page).count()).toBe(beforeCount + 1)

    await weatherSection.getByLabel('删除天气条件').last().click()
    await expect.poll(async () => conditionRows(page).count()).toBe(beforeCount)
  })

  test('shows validation dialogs for invalid feature values and missing enabled features', async ({ page }) => {
    await openApp(page)

    const weatherSection = featureSection(page, 'weather')
    await weatherSection.getByLabel('起始日').fill('28')
    await weatherSection.getByLabel('结束日').fill('1')
    const invalidWeatherDialog = dismissNextDialog(page)
    await startSearch(page)
    await expect(invalidWeatherDialog).resolves.toBe('天气错误：起始日期不能大于结束日期')

    await weatherSection.getByLabel('起始日').fill('1')
    await setEveryFeature(page, false)
    const missingFeatureDialog = dismissNextDialog(page)
    await startSearch(page)
    await expect(missingFeatureDialog).resolves.toBe('请至少启用一个筛选条件')
  })

  test('runs, stops, and returns to idle after cancelling a search', async ({ page }) => {
    await openApp(page, { mockWorker: true })
    await configureTinySeedRange(page)

    await startSearch(page)
    await waitForRunningState(page)

    await page.getByTestId('start-search').click()
    await expect(page.getByTestId('status-message')).toContainText(/搜索已停止|正在停止搜索/)
    await expect(page.getByTestId('start-search')).toContainText('开始搜索')
  })

  test('runs to completion, enables result actions, and opens the seed drawer', async ({ page }) => {
    await openApp(page, { mockWorker: true })
    await configureTinySeedRange(page)

    await startSearch(page)
    await waitForRunningState(page)
    await waitForCompleteState(page)

    await expect(page.getByRole('button', { name: /导出所有种子号/ })).toBeEnabled()
    await expect(resultRows(page)).toHaveCount(1)
    await expect(resultRows(page).first()).toContainText('种子: 123456')

    const drawer = await openFirstSeedDrawer(page)
    await expect(drawer).toContainText('天气')
    await expect(drawer).toContainText('绿雨')

    await drawer.getByRole('button', { name: '关闭' }).click()
    await expect(drawer).toBeHidden()
  })
})

function dismissNextDialog(page: Parameters<typeof startSearch>[0]) {
  return new Promise<string>((resolve, reject) => {
    page.once('dialog', async (dialog) => {
      try {
        const message = dialog.message()
        await dialog.dismiss()
        resolve(message)
      } catch (error) {
        reject(error)
      }
    })
  })
}
