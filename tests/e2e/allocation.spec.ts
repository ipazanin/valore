import { expect, test, type Page } from '@playwright/test'
import { createBackup } from '../../src/features/backup/backup'
import { recordObservation } from '../../src/features/portfolio/domain/observations'
import { createEmptyPortfolio } from '../../src/features/portfolio/domain/portfolio'
import type { Portfolio, RecordCategory } from '../../src/features/portfolio/domain/types'

async function restorePortfolio(page: Page, portfolio: Portfolio) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Choose a backup' }).click()
  await page.getByLabel('Backup file').setInputFiles({
    name: 'synthetic-allocation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createBackup(portfolio))),
  })
  await page.getByRole('checkbox', { name: 'I want to restore this portfolio.' }).check()
  await page.getByRole('button', { name: 'Restore portfolio', exact: true }).click()
  await expect(page.getByTestId('assets')).toBeVisible()
}

function portfolioFixture(): Portfolio {
  const portfolio = createEmptyPortfolio('EUR')
  const metadata = {
    createdAt: portfolio.settings.createdAt,
    updatedAt: portfolio.settings.createdAt,
  }
  const accountId = crypto.randomUUID()
  const overdraftId = crypto.randomUUID()
  portfolio.accounts.push(
    { id: accountId, name: 'Broker', currency: 'EUR', ...metadata },
    { id: overdraftId, name: 'Overdraft', currency: 'EUR', ...metadata },
  )
  recordObservation(portfolio, 'cash', accountId, '10')
  recordObservation(portfolio, 'cash', overdraftId, '-500')
  const categories: [RecordCategory, string][] = [
    ['property', '30'], ['possessions', '15'], ['other', '5'], ['lent', '20'], ['debt', '500'],
  ]
  for (const [category, amount] of categories) {
    const id = crypto.randomUUID()
    portfolio.records.push({ id, name: category, category, currency: 'EUR', ...metadata })
    recordObservation(portfolio, 'valuation', id, amount)
  }
  for (const name of ['Priced fund', 'Missing price fund']) {
    const instrumentId = crypto.randomUUID()
    const listingId = crypto.randomUUID()
    const holdingId = crypto.randomUUID()
    portfolio.instruments.push({ id: instrumentId, name, kind: 'etf', isin: null, ...metadata })
    portfolio.listings.push({
      id: listingId,
      instrumentId,
      symbol: name === 'Priced fund' ? 'PRICED' : 'MISSING',
      exchange: 'XETRA',
      currency: 'EUR',
      ...metadata,
    })
    portfolio.holdings.push({ id: holdingId, accountId, listingId, ...metadata })
    recordObservation(portfolio, 'quantity', holdingId, '2')
    if (name === 'Priced fund') recordObservation(portfolio, 'price', listingId, '10')
  }
  return portfolio
}

test('allocation names excluded holdings and shows all known category amounts and shares', async ({
  page,
}) => {
  await restorePortfolio(page, portfolioFixture())
  const allocation = page.getByRole('article', { name: 'Known asset allocation', exact: true })
  await expect(allocation.getByRole('img')).toBeVisible()
  await expect(allocation.getByText('Missing price fund in Broker', { exact: true })).toBeVisible()
  const table = allocation.getByRole('table', { name: 'Known asset allocation by category' })
  const expectedRows = [
    ['Cash', '10.00', '10.00%'],
    ['Investments', '20.00', '20.00%'],
    ['Property', '30.00', '30.00%'],
    ['Vehicles & possessions', '15.00', '15.00%'],
    ['Other assets', '5.00', '5.00%'],
    ['Money lent', '20.00', '20.00%'],
  ]
  for (const [category, amount, percentage] of expectedRows) {
    const row = table.getByRole('row').filter({
      has: page.getByRole('rowheader', { name: category, exact: true }),
    })
    await expect(row.getByRole('cell').nth(0)).toHaveText(`EUR ${amount}`)
    await expect(row.getByRole('cell').nth(1)).toHaveText(percentage!)
  }
  await expect(table.getByRole('rowheader', { name: 'Debts', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('liabilities')).toHaveText('EUR 1,000.00')
  const tableRegion = allocation.getByRole('region', { name: 'Asset allocation table' })
  await tableRegion.focus()
  await expect(tableRegion).toBeFocused()
  await page.reload()
  await expect(allocation.getByRole('img')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  )
})

test('an empty allocation retains every category without drawing a placeholder ring', async ({
  page,
}) => {
  await restorePortfolio(page, createEmptyPortfolio('EUR'))
  const allocation = page.getByRole('article', { name: 'Asset allocation', exact: true })
  await expect(allocation.getByText(/No known assets to allocate/)).toBeVisible()
  await expect(allocation.getByRole('img')).toHaveCount(0)
  const rows = allocation.locator('tbody tr')
  await expect(rows).toHaveCount(6)
  for (const row of await rows.all()) {
    await expect(row.getByRole('cell').nth(0)).toHaveText('EUR 0.00')
    await expect(row.getByRole('cell').nth(1)).toHaveText('—')
  }
})
