import { expect, test, type Page } from '@playwright/test'

async function startPortfolio(page: Page): Promise<void> {
  await page.goto('./')
  await page.getByLabel('Reporting currency').selectOption('EUR')
  await page.getByRole('button', { name: 'Start adding records' }).click()
  await expect(page.getByTestId('net-worth')).toBeVisible()
}

async function addCashAccount(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Accounts' })
    .click()
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill('Savings')
  await page.getByLabel('Cash balance (EUR)').fill('1000')
  await page.getByRole('button', { name: 'Save account' }).click()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Overview' })
    .click()
  await expect(page.getByRole('region', { name: 'Asset allocation table' })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1)
}

async function canvasImage(page: Page, label: string): Promise<string> {
  return page.getByRole('img', { name: label }).evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  )
}

async function expectThemeContrast(page: Page): Promise<void> {
  const failures = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    const luminance = (token: string): number => {
      const shortHex = styles.getPropertyValue(token).trim().slice(1)
      const hex =
        shortHex.length === 3 ? [...shortHex].map((digit) => digit + digit).join('') : shortHex
      if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid color token: ${token}`)
      const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      const linear = channels.map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      )
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
    }
    const pairs: [string, string, number][] = [
      ['--ink', '--surface', 4.5],
      ['--ink', '--canvas', 4.5],
      ['--ink', '--editor-bg', 4.5],
      ['--muted', '--surface', 4.5],
      ['--muted', '--canvas', 4.5],
      ['--muted', '--editor-bg', 4.5],
      ['--muted', '--tint', 4.5],
      ['--on-brand', '--brand', 4.5],
      ['--on-brand', '--brand-hover', 4.5],
      ['--on-brand', '--danger', 4.5],
      ['--on-brand', '--danger-hover', 4.5],
      ['--warning', '--warning-bg', 4.5],
      ['--danger', '--danger-bg', 4.5],
      ['--field-border', '--surface', 3],
      ['--control-border', '--surface', 3],
      ['--chart-axis', '--surface', 3],
    ]
    return pairs.flatMap(([foreground, background, minimum]) => {
      const first = luminance(foreground)
      const second = luminance(background)
      const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      return ratio < minimum ? [`${foreground} on ${background}: ${ratio.toFixed(2)}`] : []
    })
  })
  expect(failures).toEqual([])
}

test('theme choice persists and system changes update charts and controls', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await startPortfolio(page)
  const theme = page.getByLabel('Appearance')
  await expect(theme).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectThemeContrast(page)
  await addCashAccount(page)

  const swatch = page
    .getByRole('region', { name: 'Asset allocation table' })
    .locator('.swatch')
    .first()
  const darkColor = await swatch.evaluate((element) => getComputedStyle(element).backgroundColor)
  await expect(page.getByRole('img', { name: 'Asset allocation' })).toBeVisible()
  const darkAllocation = await canvasImage(page, 'Asset allocation')
  expect(darkAllocation).not.toBe('data:,')
  const comparisonLabel =
    'Assets and liabilities, on a common scale from zero. Values in the table.'
  const darkComparison = await canvasImage(page, comparisonLabel)

  await theme.focus()
  await expect(theme).toBeFocused()
  await theme.press('l')
  await theme.press('Tab')
  await expect(theme).toHaveValue('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expectThemeContrast(page)
  const lightColor = await swatch.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(lightColor).not.toBe(darkColor)
  await expect.poll(() => canvasImage(page, 'Asset allocation')).not.toBe(darkAllocation)
  await expect.poll(() => canvasImage(page, comparisonLabel)).not.toBe(darkComparison)

  await page.reload()
  await expect(theme).toHaveValue('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'History' })
    .click()
  const historyLabel =
    'Dated net worth, assets and liabilities; exact values are in the table below.'
  await expect(page.getByRole('img', { name: historyLabel })).toBeVisible()
  const lightHistory = await canvasImage(page, historyLabel)
  await theme.selectOption('dark')
  await expect.poll(() => canvasImage(page, historyLabel)).not.toBe(lightHistory)
  await theme.selectOption('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await theme.selectOption('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(theme).toHaveValue('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoHorizontalOverflow(page)
})

test('appearance survives backup, legacy restore follows system, and form drafts survive', async ({
  page,
  browser,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await startPortfolio(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Accounts' })
    .click()
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill('Long-term savings')
  await page.getByLabel('Cash balance (EUR)').fill('123.45')
  await page.getByLabel('Appearance').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Account name')).toHaveValue('Long-term savings')
  await expect(page.getByLabel('Cash balance (EUR)')).toHaveValue('123.45')
  await page.getByRole('button', { name: 'Save account' }).click()
  await expect(page.getByRole('heading', { name: 'Long-term savings' })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Backup' })
    .click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloadPromise
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const backupText = Buffer.concat(chunks).toString('utf8')
  const backup = JSON.parse(backupText)
  expect(backup.version).toBe(4)
  expect(backup.portfolio.settings.theme).toBe('dark')

  const restoredContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    colorScheme: 'light',
    viewport: page.viewportSize() ?? { width: 1280, height: 800 },
  })
  try {
    const restoredPage = await restoredContext.newPage()
    await restoredPage.goto('./')
    await restoredPage.getByRole('button', { name: 'Choose a backup' }).click()
    await restoredPage.getByLabel('Backup file').setInputFiles({
      name: 'saved.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backupText),
    })
    await expect(restoredPage.getByText('Validated backup · Version 4')).toBeVisible()
    await restoredPage.getByLabel('I want to restore this portfolio.').check()
    await restoredPage.getByRole('button', { name: 'Restore portfolio' }).click()
    await expect(restoredPage.getByLabel('Appearance')).toHaveValue('dark')
    await expect(restoredPage.locator('html')).toHaveAttribute('data-theme', 'dark')

    const legacy = structuredClone(backup)
    legacy.version = 3
    delete legacy.portfolio.settings.theme
    await restoredPage
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Backup' })
      .click()
    await restoredPage.getByLabel('Backup file').setInputFiles({
      name: 'legacy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    })
    await expect(restoredPage.getByText('Validated backup · Version 3')).toBeVisible()
    await restoredPage
      .getByLabel('I understand that this will replace my current portfolio.')
      .check()
    await restoredPage.getByRole('button', { name: 'Replace portfolio' }).click()
    await expect(restoredPage.getByLabel('Appearance')).toHaveValue('system')
    await expect(restoredPage.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(restoredPage.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await expectNoHorizontalOverflow(restoredPage)
  } finally {
    await restoredContext.close()
  }
})
