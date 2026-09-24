import { expect, test, type Browser, type Download, type Page } from '@playwright/test'

async function downloadText(download: Download): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function startPortfolio(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adding records' }).click()
  await expect(page.getByTestId('net-worth')).toBeVisible()
}

async function openTab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click()
}

async function addRecord(page: Page, name: string, category: string, amount: string) {
  await openTab(page, 'Assets & debts')
  await page.getByRole('button', { name: '+ Add record' }).click()
  await page.getByLabel('Record name').fill(name)
  await page.getByLabel('Category').selectOption(category)
  await page.getByLabel(/(?:Current resale estimate|Outstanding amount) \(EUR\)/).fill(amount)
  await page.getByLabel('Value date').fill('2020-01-01')
  await page.getByRole('button', { name: 'Save record' }).click()
}

async function archive(page: Page, name: string, date?: string) {
  await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click()
  await expect(page.getByLabel('Closure date')).toBeFocused()
  if (date) await page.getByLabel('Closure date').fill(date)
  await page.getByRole('button', { name: 'Review closure' }).click()
  await expect(page.getByRole('button', { name: 'Confirm change' })).toBeFocused()
  await page.getByRole('button', { name: 'Confirm change' }).click()
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1)
}

async function restoreBackup(browser: Browser, backupText: string): Promise<void> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
  })
  try {
    const page = await context.newPage()
    await page.goto('./')
    await page.getByRole('button', { name: 'Choose a backup' }).click()
    await page.getByLabel('Backup file').setInputFiles({
      name: 'closed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backupText),
    })
    await page.getByLabel('I want to restore this portfolio.').check()
    await page.getByRole('button', { name: 'Restore portfolio' }).click()
    await expect(page.getByTestId('assets')).toHaveText('EUR 0.00')
    await expect(page.getByTestId('liabilities')).toHaveText('EUR 500.00')
    await openTab(page, 'History')
    await page.getByLabel('Record', { exact: true }).selectOption({ label: 'Value · Home (Property)' })
    await page.getByLabel('As-of date', { exact: true }).fill('2020-02-01')
    await expect(
      page.getByText('No value applies on this date because this record is archived.'),
    ).toBeVisible()
    await expect(page.getByText(/This record is archived from Feb 1, 2020/)).toBeVisible()
  } finally {
    await context.close()
  }
}

test('archived assets leave totals on their closure date and restore from backup', async ({
  page,
  browser,
}) => {
  await startPortfolio(page)
  await addRecord(page, 'Home', 'property', '1000')
  await addRecord(page, 'Loan', 'debt', '500')
  await archive(page, 'Home', '2020-02-01')
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0)

  await openTab(page, 'Overview')
  await expect(page.getByTestId('assets')).toHaveText('EUR 0.00')
  await expect(page.getByTestId('liabilities')).toHaveText('EUR 500.00')
  await openTab(page, 'History')
  await page.getByLabel('Record', { exact: true }).selectOption({ label: 'Value · Home (Property)' })
  await page.getByLabel('As-of date', { exact: true }).fill('2020-01-31')
  await expect(page.getByRole('article', { name: /Applicable on/ })).toContainText('EUR 1,000')
  await page.getByLabel('As-of date', { exact: true }).fill('2020-02-01')
  await expect(
    page.getByText('No value applies on this date because this record is archived.'),
  ).toBeVisible()

  await openTab(page, 'Assets & debts')
  await page.getByLabel('Show archived assets and debts').check()
  const home = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Home', exact: true }) })
  await expect(home).toContainText('Archived Feb 1, 2020')
  await expect(home).toContainText('Last saved · Jan 1, 2020')
  await expect(home).toContainText('EUR 1,000.00')
  await expectNoHorizontalOverflow(page)

  const downloadPromise = page.waitForEvent('download')
  await openTab(page, 'Backup')
  await page.getByRole('button', { name: 'Export backup' }).click()
  await restoreBackup(browser, await downloadText(await downloadPromise))

  await openTab(page, 'Assets & debts')
  await archive(page, 'Loan', '2020-03-01')
  await expect(page.getByText('Archived Mar 1, 2020')).toBeVisible()
  await openTab(page, 'Overview')
  await expect(page.getByTestId('liabilities')).toHaveText('EUR 0.00')
  await openTab(page, 'Assets & debts')
  await page.getByRole('button', { name: 'Change closure for Home' }).click()
  await page.getByRole('button', { name: 'Remove closure' }).click()
  await expect(page.getByText(/may carry forward into current totals/)).toBeVisible()
  await page.getByRole('button', { name: 'Confirm change' }).click()
  await openTab(page, 'Overview')
  await expect(page.getByTestId('assets')).toHaveText('EUR 1,000.00')
})

test('account closure checks recorded cash and every holding, including archived holdings', async ({
  page,
}) => {
  await startPortfolio(page)
  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill('Broker')
  await page.getByLabel('Cash balance (EUR)').fill('100')
  await page.getByRole('button', { name: 'Save account' }).click()
  await page.getByRole('button', { name: 'Add holding to Broker' }).click()
  await page.getByLabel('Investment name').fill('Global ETF')
  await page.getByLabel('Listing symbol').fill('GLBL')
  await page.getByLabel('Exchange').fill('Xetra')
  await page.getByLabel('Total quantity today').fill('2')
  await page.getByLabel('Unit price today (EUR, optional)').fill('10')
  await page.getByRole('button', { name: 'Save holding' }).click()

  await archive(page, 'Global ETF in Broker')
  await archive(page, 'Broker')
  await expect(page.locator('.closure-editor').getByRole('alert')).toContainText(
    'recorded zero cash balance',
  )
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Update Broker cash' }).click()
  await page.getByLabel('Cash balance (EUR)').fill('0')
  await page.getByRole('button', { name: 'Save account' }).click()

  await archive(page, 'Broker')
  await expect(page.locator('.closure-editor').getByRole('alert')).toContainText(
    'recorded zero quantity for every holding',
  )
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByLabel('Show archived accounts and holdings').check()
  await expect(page.getByText(/Archived/).first()).toBeVisible()
  await openTab(page, 'History')
  await page
    .getByLabel('Record', { exact: true })
    .selectOption({ label: 'Quantity · Global ETF (GLBL) · Broker' })
  await page.getByRole('button', { name: /Edit observation from/ }).click()
  await page.getByLabel('Total quantity', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Save observation' }).click()
  await openTab(page, 'Accounts')
  await page.getByLabel('Show archived accounts and holdings').uncheck()
  await archive(page, 'Broker')
  await expect(page.getByRole('heading', { name: 'Broker', exact: true })).toHaveCount(0)
  await openTab(page, 'Overview')
  await expect(page.getByTestId('assets')).toHaveText('EUR 0.00')
  await expectNoHorizontalOverflow(page)
})
