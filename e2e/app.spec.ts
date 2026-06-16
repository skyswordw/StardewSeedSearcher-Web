import { expect, test } from '@playwright/test'
import {
  clickFirstVisible,
  conditionRows,
  configureTinySeedRange,
  featureToggleCandidates,
  maybeOpenFirstSeedDetail,
  openApp,
  productTitlePattern,
  resultRows,
  toggleState,
  tryVisibleControls,
  waitForSearchFeedback,
} from './ui-helpers'

test.describe('Stardew Seed Searcher UI', () => {
  test('renders the app title', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(productTitlePattern)
    await expect(page.getByRole('heading', { name: productTitlePattern }).first()).toBeVisible()
  })

  test('toggles feature sections', async ({ page }) => {
    await openApp(page)

    const toggles = featureToggleCandidates(page)
    await expect(toggles.first()).toBeVisible()

    const firstToggle = toggles.first()
    const before = await toggleState(firstToggle)
    await firstToggle.click()
    await expect.poll(async () => toggleState(firstToggle)).not.toBe(before)
  })

  test('adds and removes search conditions', async ({ page }) => {
    await openApp(page)

    const addCondition = page
      .getByRole('button', { name: /add condition|new condition|add filter|add requirement/i })
      .or(page.locator('[data-testid="add-condition"], [data-testid="condition-add"]'))
      .first()

    await expect(addCondition).toBeVisible()

    const beforeCount = await conditionRows(page).count()
    await addCondition.click()
    await expect.poll(async () => conditionRows(page).count()).toBeGreaterThan(beforeCount)

    const removeCondition = page
      .getByRole('button', { name: /remove condition|delete condition|remove filter|delete filter/i })
      .or(page.locator('[data-testid="remove-condition"], [data-testid="condition-remove"]'))
      .last()

    await expect(removeCondition).toBeVisible()
    await removeCondition.click()
    await expect.poll(async () => conditionRows(page).count()).toBe(beforeCount)
  })

  test('runs a tiny search range and exposes result affordances when available', async ({ page }) => {
    await openApp(page)
    await configureTinySeedRange(page)

    await clickFirstVisible(
      page
        .getByRole('button', { name: /search|start search|run search|find seeds/i })
        .or(page.locator('[data-testid="start-search"], [data-testid="search-submit"]')),
      'search button',
    )

    await waitForSearchFeedback(page)

    const firstResultVisible = await resultRows(page).first().isVisible().catch(() => false)
    if (firstResultVisible) {
      await maybeOpenFirstSeedDetail(page)
    }

    await tryVisibleControls(page, [
      /export/i,
      /copy/i,
      /download/i,
      /copy link/i,
      /copy seed/i,
    ])
  })
})
