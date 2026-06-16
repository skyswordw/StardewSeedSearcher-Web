import { expect, type Locator, type Page } from '@playwright/test'

export const productTitlePattern = /stardew.*seed.*searcher|seed.*searcher|星露谷物语|种子搜索器/i

const conditionRowSelector = [
  '[data-testid="condition-row"]',
  '[data-testid^="condition-row-"]',
  '[data-testid="condition-card"]',
  '[data-testid^="condition-card-"]',
  '[aria-label*="condition" i]',
].join(', ')

const resultRowSelector = [
  '[data-testid="seed-result"]',
  '[data-testid^="seed-result-"]',
  '[data-testid="result-row"]',
  '[data-testid^="result-row-"]',
  'table tbody tr',
  '[role="listitem"]:has-text("Seed")',
  '[role="listitem"]:has-text("种子")',
].join(', ')

export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: productTitlePattern }).first()).toBeVisible()
}

export function featureToggleCandidates(page: Page) {
  const namedToggles = page.getByRole('button', {
    name: /traveling cart|cart|mine|chest|feature|condition|bundle|night event|garbage|artifact|geode/i,
  })
  const checkboxes = page.getByRole('checkbox', {
    name: /traveling cart|cart|mine|chest|feature|condition|bundle|night event|garbage|artifact|geode|天气|仙子|矿井|沙漠节|猪车|筛选/i,
  })
  const testIdToggles = page.locator([
    '[data-testid="feature-toggle"]',
    '[data-testid^="feature-toggle-"]',
    '[data-testid="feature-section-toggle"]',
    '[data-testid^="feature-section-toggle-"]',
  ].join(', '))

  return testIdToggles.or(checkboxes).or(namedToggles)
}

export async function toggleState(toggle: Locator) {
  const checked = await toggle.getAttribute('aria-checked')
  if (checked !== null) return `aria-checked:${checked}`

  if (await toggle.evaluate((node) => node instanceof HTMLInputElement && node.type === 'checkbox')) {
    return `checked:${await toggle.isChecked()}`
  }

  const expanded = await toggle.getAttribute('aria-expanded')
  if (expanded !== null) return `aria-expanded:${expanded}`

  const pressed = await toggle.getAttribute('aria-pressed')
  if (pressed !== null) return `aria-pressed:${pressed}`

  const disabled = await toggle.getAttribute('disabled')
  return `visible:${await toggle.isVisible()}:disabled:${disabled ?? 'false'}`
}

export function conditionRows(page: Page) {
  return page.locator(conditionRowSelector)
}

export function resultRows(page: Page) {
  return page.locator(resultRowSelector)
}

export async function clickFirstVisible(locator: Locator, description: string) {
  const count = await locator.count()
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index)
    if (await candidate.isVisible()) {
      await candidate.click()
      return candidate
    }
  }
  throw new Error(`Could not find a visible ${description}`)
}

export async function fillFirstVisibleNumberField(
  page: Page,
  labels: RegExp[],
  value: string,
) {
  for (const label of labels) {
    const input = page.getByLabel(label).or(page.getByPlaceholder(label)).first()
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value)
      return
    }
  }

  const titledInput = page
    .locator('input[type="number"], input[inputmode="numeric"], input:not([type])')
    .filter({ hasText: /seed/i })
    .first()

  if (await titledInput.isVisible().catch(() => false)) {
    await titledInput.fill(value)
    return
  }

  throw new Error(`Could not find a numeric field for ${labels.map(String).join(', ')}`)
}

export async function configureTinySeedRange(page: Page) {
  await fillFirstVisibleNumberField(
    page,
    [/start seed/i, /from seed/i, /min seed/i, /seed start/i, /first seed/i, /起始种子/],
    '1',
  )
  await fillFirstVisibleNumberField(
    page,
    [/output limit/i, /limit/i, /max results/i, /输出上限/],
    '1',
  )
}

export async function waitForSearchFeedback(page: Page) {
  const progress = page
    .getByRole('progressbar')
    .or(page.locator('[data-testid="search-progress"], [data-testid="progress"]'))
    .or(page.getByText(/searching|progress|scanned|checking|running|正在搜索|搜索完成|已检查/i))

  const results = page.locator('[data-testid="results"], [data-testid="search-results"], [aria-label*="results" i]')

  await expect(progress.or(results).first()).toBeVisible({ timeout: 15_000 })
  await expect(results.first()).toBeVisible({ timeout: 30_000 })
}

export async function maybeOpenFirstSeedDetail(page: Page) {
  const firstResult = resultRows(page).first()
  if (!(await firstResult.isVisible().catch(() => false))) return false

  const detailButton = firstResult.getByRole('button', { name: /details?|detail|简介|详情/i }).first()
  if (await detailButton.isVisible().catch(() => false)) {
    await detailButton.click()
  } else {
    await firstResult.click()
  }
  await expect(
    page.locator('[data-testid="seed-detail"], [role="dialog"], [aria-label*="seed detail" i]').first(),
  ).toBeVisible()
  return true
}

export async function tryVisibleControls(page: Page, names: RegExp[]) {
  const clicked: string[] = []
  for (const name of names) {
    const control = page.getByRole('button', { name }).or(page.getByRole('link', { name })).first()
    if ((await control.isVisible().catch(() => false)) && (await control.isEnabled().catch(() => false))) {
      await control.click()
      clicked.push(String(name))
    }
  }
  return clicked
}
