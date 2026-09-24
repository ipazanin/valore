import { expect, test, type Download, type Page } from '@playwright/test'

async function downloadText(download: Download): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function startPortfolio(page: Page, currency = 'EUR') {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Choose your currency' })).toBeVisible()
  await page.getByLabel('Reporting currency').selectOption(currency)
  await page.getByRole('button', { name: 'Start adding records' }).click()
  await expect(page.getByTestId('net-worth')).toBeVisible()
}

async function openTab(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name })
    .click()
}

async function addAccount(page: Page, name: string, cash: string) {
  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill(name)
  await page.getByLabel('Cash balance (EUR)').fill(cash)
  await page.getByRole('button', { name: 'Save account' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

async function addRecord(page: Page, name: string, category: string, amount: string) {
  await openTab(page, 'Assets & debts')
  await page.getByRole('button', { name: '+ Add record' }).click()
  await page.getByLabel('Record name').fill(name)
  await page.getByLabel('Category').selectOption(category)
  await page.getByLabel(/(?:Current resale estimate|Outstanding amount) \(EUR\)/).fill(amount)
  await page.getByRole('button', { name: 'Save record' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

async function addHolding(
  page: Page,
  account: string,
  name: string,
  symbol: string,
  quantity: string,
  price = '',
  kind: 'etf' | 'stock' = 'etf',
) {
  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: `Add holding to ${account}` }).click()
  await page.getByLabel('Investment name').fill(name)
  await page.getByLabel('Investment type').selectOption(kind)
  await page.getByLabel('Listing symbol').fill(symbol)
  await page.getByLabel('Exchange').fill('Xetra')
  await page.getByLabel('Total quantity today').fill(quantity)
  if (price) await page.getByLabel('Unit price today (EUR, optional)').fill(price)
  await page.getByRole('button', { name: 'Save holding' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

async function expectTotals(page: Page, assets: string, liabilities: string, netWorth: string) {
  await openTab(page, 'Overview')
  await expect(page.getByTestId('assets')).toHaveText(`EUR ${assets}`)
  await expect(page.getByTestId('liabilities')).toHaveText(`EUR ${liabilities}`)
  await expect(page.getByTestId('net-worth')).toHaveText(`EUR ${netWorth}`)
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(
    widths.document,
    `document width ${widths.document} exceeds viewport ${widths.viewport}`,
  ).toBeLessThanOrEqual(widths.viewport + 1)
}

test('calculates signed cash, property, debt and fractional holdings; edits survive reload and export', async ({
  page,
}) => {
  await startPortfolio(page)
  await addAccount(page, 'Main bank', '2500.25')
  await addAccount(page, 'Overdrawn broker', '-400.50')
  await addRecord(page, 'Home', 'property', '180000')
  await addRecord(page, 'Mortgage', 'debt', '120000')
  await addHolding(page, 'Main bank', 'Global ETF', 'GLBL', '2.5', '100.20')
  await addHolding(page, 'Overdrawn broker', 'Unpriced stock', 'UPRC', '3', '', 'stock')

  await expectTotals(page, '182,750.75', '120,400.50', '62,350.25')
  await expect(page.getByText('Your totals are incomplete.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'A little more clarity.' }).getByText(/Unpriced stock \(UPRC\)/)).toBeVisible()
  await openTab(page, 'Accounts')
  await expect(
    page
      .locator('.cash-row')
      .filter({ has: page.getByRole('button', { name: 'Update Overdrawn broker cash' }) })
      .getByText('-EUR 400.50'),
  ).toBeVisible()
  await expect(page.getByText('Unvalued · Price needed')).toBeVisible()

  await page.getByRole('button', { name: 'Update Global ETF in Main bank' }).click()
  await page.getByLabel('Total quantity today').fill('3.25')
  await page.getByLabel('Unit price today (EUR, optional)').fill('110.20')
  await page.getByRole('button', { name: 'Save holding' }).click()
  await page.getByRole('button', { name: 'Update Overdrawn broker cash' }).click()
  await page.getByLabel('Cash balance (EUR)').fill('-100.50')
  await page.getByRole('button', { name: 'Save account' }).click()

  await openTab(page, 'Assets & debts')
  await page.getByRole('button', { name: 'Update Home' }).click()
  await page.getByLabel('Current resale estimate (EUR)').fill('190000')
  await page.getByRole('button', { name: 'Save record' }).click()
  await page.getByRole('button', { name: 'Update Mortgage' }).click()
  await page.getByLabel('Outstanding amount (EUR)').fill('110000')
  await page.getByRole('button', { name: 'Save record' }).click()
  await expectTotals(page, '192,858.40', '110,100.50', '82,757.90')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'A little more clarity.' })).toBeVisible()
  await expect(page.getByTestId('assets')).toHaveText('EUR 192,858.40')
  await expect(page.getByTestId('liabilities')).toHaveText('EUR 110,100.50')
  await expect(page.getByTestId('net-worth')).toHaveText('EUR 82,757.90')
  await expect(page.getByText('Your totals are incomplete.')).toBeVisible()

  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: 'Update Unpriced stock in Overdrawn broker' }).click()
  await page.getByLabel('Unit price today (EUR, optional)').fill('10')
  await page.getByRole('button', { name: 'Save holding' }).click()
  await expectTotals(page, '192,888.40', '110,100.50', '82,787.90')
  await expect(page.getByText('Your totals are incomplete.')).toHaveCount(0)

  for (const tab of ['Overview', 'Accounts', 'Assets & debts', 'Backup']) {
    await openTab(page, tab)
    await expectNoHorizontalOverflow(page)
  }

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloadPromise
  const backup = JSON.parse(await downloadText(download))
  expect(backup.format).toBe('valore')
  expect(backup.version).toBe(3)
  expect(backup.portfolio.settings.reportingCurrency).toBe('EUR')
  expect(backup.portfolio.accounts).toHaveLength(2)
  expect(backup.portfolio.records).toHaveLength(2)
  expect(backup.portfolio.holdings).toHaveLength(2)
  expect(
    backup.portfolio.instruments.map((instrument: { kind: string }) => instrument.kind).sort(),
  ).toEqual(['etf', 'stock'])
  expect(backup.portfolio.observations).toHaveLength(8)
  const observationDates = backup.portfolio.observations.map(
    (observation: { effectiveDate: string }) => observation.effectiveDate,
  )
  expect(new Set(observationDates).size).toBe(1)
  expect(observationDates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('backup validation and preview preserve records until replacement; restore works in a fresh context', async ({
  page,
  browser,
}) => {
  await startPortfolio(page)
  await addAccount(page, 'Saved account', '123.45')
  await openTab(page, 'Backup')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloadPromise
  const backupText = await downloadText(download)
  const backup = JSON.parse(backupText)

  await addAccount(page, 'Current account', '900')
  await openTab(page, 'Backup')
  const fileInput = page.getByLabel('Backup file')
  await fileInput.setInputFiles({
    name: 'saved.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  })
  await expect(page.getByText('Validated backup · Version 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace portfolio' })).toBeDisabled()
  await openTab(page, 'Accounts')
  await expect(page.getByRole('heading', { name: 'Current account' })).toBeVisible()
  await openTab(page, 'Backup')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Validated backup · Version 3')).toHaveCount(0)

  await fileInput.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  await expect(page.getByRole('alert')).toContainText('Backup is not valid JSON')
  const foreign = structuredClone(backup)
  foreign.portfolio.accounts[0].currency = 'USD'
  await fileInput.setInputFiles({
    name: 'foreign.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(foreign)),
  })
  await expect(page.getByRole('alert')).toContainText('must match reporting currency EUR')
  await page.reload()
  await openTab(page, 'Accounts')
  await expect(page.getByRole('heading', { name: 'Current account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Saved account' })).toBeVisible()

  const contextOptions = {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    viewport: page.viewportSize() ?? { width: 1280, height: 800 },
  }
  const onboardingContext = await browser.newContext(contextOptions)
  try {
    const onboardingPage = await onboardingContext.newPage()
    await onboardingPage.goto('./')
    await expect(
      onboardingPage.getByRole('heading', { name: 'Choose your currency' }),
    ).toBeVisible()
    await onboardingPage.getByRole('button', { name: 'Choose a backup' }).click()
    await onboardingPage
      .getByLabel('Backup file')
      .setInputFiles({
        name: 'saved.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backupText),
      })
    await expect(onboardingPage.getByText('Validated backup · Version 3')).toBeVisible()
    await expect(onboardingPage.getByRole('button', { name: 'Restore portfolio' })).toBeDisabled()
    await onboardingPage.getByLabel('I want to restore this portfolio.').check()
    await onboardingPage.getByRole('button', { name: 'Restore portfolio' }).click()
    await expect(onboardingPage.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await onboardingPage.reload()
    await expect(onboardingPage.getByTestId('net-worth')).toHaveText('EUR 123.45')
  } finally {
    await onboardingContext.close()
  }

  const otherContext = await browser.newContext(contextOptions)
  try {
    const otherPage = await otherContext.newPage()
    await startPortfolio(otherPage, 'USD')
    await openTab(otherPage, 'Backup')
    await otherPage
      .getByLabel('Backup file')
      .setInputFiles({
        name: 'saved.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backupText),
      })
    await expect(otherPage.getByText('Validated backup · Version 3')).toBeVisible()
    await expect(
      otherPage.getByText('This replaces every current record and the currency setting.'),
    ).toBeVisible()
    await otherPage.getByLabel('I understand that this will replace my current portfolio.').check()
    await otherPage.getByRole('button', { name: 'Replace portfolio' }).click()
    await expect(otherPage.getByRole('status')).toContainText('Backup restored')
    await expect(otherPage.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await otherPage.reload()
    await expect(otherPage.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await openTab(otherPage, 'Accounts')
    await expect(otherPage.getByRole('heading', { name: 'Saved account' })).toBeVisible()
  } finally {
    await otherContext.close()
  }
})

test('setup and forms have labeled controls and support keyboard submission', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  await page.getByLabel('Reporting currency').focus()
  await expect(page.getByLabel('Reporting currency')).toBeFocused()
  await page.getByRole('button', { name: 'Start adding records' }).focus()
  await expect(page.getByRole('button', { name: 'Start adding records' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('net-worth')).toHaveText('EUR 0.00')
  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: '+ Add account' }).click()
  await expect(page.getByLabel('Account name')).toBeFocused()
  await page.getByLabel('Account name').fill('Accessible account')
  await page.getByLabel('Cash balance (EUR)').fill('1')
  await page.getByRole('button', { name: 'Save account' }).click()
  await expect(page.getByRole('heading', { name: 'Accessible account' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
