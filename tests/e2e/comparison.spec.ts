import { expect, test, type Page } from '@playwright/test'
import { createBackup } from '../../src/features/backup/backup'
import { recordObservation } from '../../src/features/portfolio/domain/observations'
import { createEmptyPortfolio } from '../../src/features/portfolio/domain/portfolio'
import type { Portfolio } from '../../src/features/portfolio/domain/types'

function portfolioFixture(cash: string, debt: string, unpriced = false): Portfolio {
  const portfolio = createEmptyPortfolio('EUR')
  const metadata = {
    createdAt: portfolio.settings.createdAt,
    updatedAt: portfolio.settings.createdAt,
  }
  const accountId = crypto.randomUUID()
  const debtId = crypto.randomUUID()
  portfolio.accounts.push({ id: accountId, name: 'Checking', currency: 'EUR', ...metadata })
  portfolio.records.push({
    id: debtId,
    name: 'Loan',
    category: 'debt',
    currency: 'EUR',
    ...metadata,
  })
  recordObservation(portfolio, 'cash', accountId, cash)
  recordObservation(portfolio, 'valuation', debtId, debt)
  if (unpriced) {
    const instrumentId = crypto.randomUUID()
    const listingId = crypto.randomUUID()
    const holdingId = crypto.randomUUID()
    portfolio.instruments.push({
      id: instrumentId,
      name: 'Unpriced fund',
      kind: 'etf',
      isin: null,
      ...metadata,
    })
    portfolio.listings.push({
      id: listingId,
      instrumentId,
      symbol: 'UNPRICED',
      exchange: 'XETRA',
      currency: 'EUR',
      ...metadata,
    })
    portfolio.holdings.push({ id: holdingId, accountId, listingId, ...metadata })
    recordObservation(portfolio, 'quantity', holdingId, '2')
  }
  return portfolio
}

async function restorePortfolio(page: Page, portfolio: Portfolio) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Choose a backup' }).click()
  await page.getByLabel('Backup file').setInputFiles({
    name: 'synthetic-comparison.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createBackup(portfolio))),
  })
  await page.getByRole('checkbox', { name: 'I want to restore this portfolio.' }).check()
  await page.getByRole('button', { name: 'Restore portfolio', exact: true }).click()
  await expect(page.getByTestId('assets')).toBeVisible()
}

const scenarios = [
  {
    name: 'positive net worth',
    cash: '125.25',
    debt: '25',
    assets: 'EUR 125.25',
    liabilities: 'EUR 25.00',
    netWorth: 'EUR 100.25',
    incomplete: false,
  },
  {
    name: 'negative cash counted once with negative net worth',
    cash: '-25',
    debt: '75',
    assets: 'EUR 0.00',
    liabilities: 'EUR 100.00',
    netWorth: '-EUR 100.00',
    incomplete: false,
  },
  {
    name: 'zero net worth with equal assets and liabilities',
    cash: '50',
    debt: '50',
    assets: 'EUR 50.00',
    liabilities: 'EUR 50.00',
    netWorth: 'EUR 0.00',
    incomplete: false,
  },
  {
    name: 'known totals with an unpriced holding',
    cash: '25',
    debt: '100',
    assets: 'EUR 25.00',
    liabilities: 'EUR 100.00',
    netWorth: '-EUR 75.00',
    incomplete: true,
  },
  {
    name: 'amount precision beyond binary floating point',
    cash: '999999999999999999.12',
    debt: '0',
    assets: 'EUR 999,999,999,999,999,999.12',
    liabilities: 'EUR 0.00',
    netWorth: 'EUR 999,999,999,999,999,999.12',
    incomplete: false,
  },
]

for (const scenario of scenarios) {
  test(`balance comparison preserves ${scenario.name}`, async ({ page }) => {
    await restorePortfolio(
      page,
      portfolioFixture(scenario.cash, scenario.debt, scenario.incomplete),
    )
    const comparison = page.getByRole('article', { name: 'Assets and liabilities', exact: true })
    await expect(comparison.getByRole('img')).toBeVisible()
    const table = comparison.getByRole('table', { name: 'Assets, liabilities and net worth' })
    const balances = [
      [scenario.incomplete ? 'Known assets' : 'Assets', scenario.assets],
      ['Liabilities', scenario.liabilities],
      [scenario.incomplete ? 'Known net worth' : 'Net worth', scenario.netWorth],
    ]
    for (const [label, amount] of balances) {
      const row = table.getByRole('row').filter({
        has: page.getByRole('rowheader', { name: label, exact: true }),
      })
      await expect(row.getByRole('cell')).toHaveText(amount!)
    }
    if (scenario.incomplete) {
      await expect(comparison.getByText('Incomplete · Known values only.')).toBeVisible()
      await expect(comparison.getByText(/exclude holdings without a price/)).toBeVisible()
    }
    const tableRegion = comparison.getByRole('region', { name: 'Balance comparison table' })
    await tableRegion.focus()
    await expect(tableRegion).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth + 1),
    )
  })
}

test('an empty portfolio shows zero amounts without arbitrary bars', async ({ page }) => {
  await restorePortfolio(page, createEmptyPortfolio('EUR'))
  const comparison = page.getByRole('article', { name: 'Assets and liabilities', exact: true })
  await expect(comparison.getByRole('img')).toHaveCount(0)
  await expect(comparison.getByText(/No recorded assets or liabilities to compare/)).toBeVisible()
  await expect(comparison.getByRole('cell')).toHaveText(['EUR 0.00', 'EUR 0.00', 'EUR 0.00'])
})

test('an unpriced-only portfolio keeps zero known balances explicitly incomplete', async ({ page }) => {
  await restorePortfolio(page, portfolioFixture('0', '0', true))
  const comparison = page.getByRole('article', { name: 'Assets and liabilities', exact: true })
  await expect(comparison.getByRole('img')).toHaveCount(0)
  await expect(comparison.getByText(/Holdings without prices remain unvalued/)).toBeVisible()
  await expect(comparison.getByRole('rowheader', { name: 'Known net worth' })).toBeVisible()
})
