import { expect, test, type Page } from '@playwright/test'
import { createBackup } from '../../src/features/backup/backup'
import type { Portfolio } from '../../src/features/portfolio/domain/types'

const timestamp = '2020-01-01T12:00:00.000Z'
const accountId = '00000000-0000-4000-8000-000000000001'
const instrumentId = '00000000-0000-4000-8000-000000000002'
const listingId = '00000000-0000-4000-8000-000000000003'
const holdingId = '00000000-0000-4000-8000-000000000004'
const propertyId = '00000000-0000-4000-8000-000000000005'
const debtId = '00000000-0000-4000-8000-000000000006'

function observation(
  id: number,
  kind: 'cash' | 'quantity' | 'price' | 'valuation',
  subjectId: string,
  date: string,
  amount: string,
) {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    kind,
    subjectId,
    effectiveDate: date,
    amount,
    recordedAt: timestamp,
  }
}

function syntheticPortfolio(): Portfolio {
  return {
    settings: { reportingCurrency: 'EUR', createdAt: timestamp },
    accounts: [
      {
        id: accountId,
        name: 'Broker',
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    instruments: [
      {
        id: instrumentId,
        name: 'Global ETF',
        kind: 'etf',
        isin: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    listings: [
      {
        id: listingId,
        instrumentId,
        symbol: 'GLBL',
        exchange: 'Xetra',
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    holdings: [
      { id: holdingId, accountId, listingId, createdAt: timestamp, updatedAt: timestamp },
    ],
    records: [
      {
        id: propertyId,
        closedOn: '2024-01-08',
        name: 'Home',
        category: 'property',
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: debtId,
        name: 'Loan',
        category: 'debt',
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    observations: [
      observation(11, 'cash', accountId, '2024-01-01', '-50'),
      observation(12, 'quantity', holdingId, '2024-01-01', '0'),
      observation(13, 'quantity', holdingId, '2024-01-03', '1'),
      observation(14, 'price', listingId, '2024-01-05', '20'),
      observation(15, 'valuation', propertyId, '2024-01-01', '100'),
      observation(16, 'valuation', debtId, '2024-01-01', '200'),
      observation(17, 'valuation', debtId, '2024-03-09', '210'),
      observation(18, 'valuation', debtId, '2024-03-11', '220'),
    ],
  }
}

async function restore(page: Page, portfolio: Portfolio) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Choose a backup' }).click()
  await page.getByLabel('Backup file').setInputFiles({
    name: 'synthetic-history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createBackup(portfolio))),
  })
  await page.getByLabel('I want to restore this portfolio.').check()
  await page.getByRole('button', { name: 'Restore portfolio' }).click()
  await expect(page.getByTestId('net-worth')).toBeVisible()
}

async function openHistory(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'Dated balances' })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1)
}

test('dated table exposes complete, incomplete, negative, and closed values with sources', async ({
  page,
}) => {
  await restore(page, syntheticPortfolio())
  await openHistory(page)
  const table = page.getByRole('table', { name: /Exact dated assets/ })
  const first = table.getByRole('row', { name: /Jan 1, 2024/ })
  await expect(first).toContainText('EUR 100')
  await expect(first).toContainText('-EUR 150')
  const gap = table.getByRole('row', { name: /Jan 3, 2024/ })
  await expect(gap).toContainText('Incomplete')
  await expect(gap).toContainText('Global ETF (GLBL) · Broker · price needed')
  await expect(gap).toContainText('Known amount')
  const closed = table.getByRole('row', { name: /Jan 8, 2024/ })
  await expect(closed).toContainText('EUR 20')
  await expect(closed).toContainText('-EUR 230')
  await expect(table.getByRole('row', { name: /Mar 9, 2024/ })).toContainText('-EUR 240')
  await expect(table.getByRole('row', { name: /Mar 11, 2024/ })).toContainText('-EUR 250')

  const sources = closed.getByText(/sources/)
  await sources.focus()
  await page.keyboard.press('Enter')
  await expect(closed).toContainText('Shared price · Global ETF (GLBL)')
  await expect(closed).toContainText('Saved Jan 5, 2024 · 3 days old')
  await expect(closed).not.toContainText('Value · Home')
  await expectNoHorizontalOverflow(page)
})

test('calendar ranges and independently visible series work with a keyboard', async ({ page }) => {
  await restore(page, syntheticPortfolio())
  await openHistory(page)
  const table = page.getByRole('table', { name: /Exact dated assets/ })
  await expect(table.getByRole('row', { name: /Jan 1, 2024/ })).toBeVisible()
  await page.getByLabel('3 months').focus()
  await page.keyboard.press('Space')
  await expect(page.getByLabel('3 months')).toBeChecked()
  await expect(table.getByRole('row', { name: /Jan 1, 2024/ })).toHaveCount(0)
  expect(await table.getByRole('row').count()).toBeGreaterThan(1)
  await page.getByLabel('1 year').check()
  await expect(table.getByRole('row', { name: /Jan 1, 2024/ })).toHaveCount(0)
  await page.getByLabel('All', { exact: true }).check()
  await expect(table.getByRole('row', { name: /Jan 1, 2024/ })).toBeVisible()

  const chart = page.getByRole('img', { name: /Dated net worth, assets and liabilities/ })
  const series = page.getByRole('group', { name: 'Show series' })
  await expect(chart).toBeVisible()
  await series.getByLabel('Net worth').uncheck()
  await series.getByLabel('Assets', { exact: true }).uncheck()
  await expect(chart).toBeVisible()
  await series.getByLabel('Liabilities', { exact: true }).uncheck()
  await expect(page.getByText('Choose a series to display the chart.')).toBeVisible()
  await series.getByLabel('Assets', { exact: true }).check()
  await expect(chart).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('empty and single-date histories have clear states', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adding records' }).click()
  await openHistory(page)
  await expect(page.getByText('No dated observations in this range.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Accounts' }).click()
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill('New account')
  await page.getByLabel('Cash balance (EUR)').fill('12.34')
  await page.getByRole('button', { name: 'Save account' }).click()
  await openHistory(page)
  await expect(page.getByText(/One dated value is available/)).toBeVisible()
  await expect(page.getByRole('table', { name: /Exact dated assets/ }))
    .toContainText('EUR 12.34')
  await expectNoHorizontalOverflow(page)
})

test('a next-day save appears without remounting the history panel', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    timezoneId: 'UTC',
  })
  try {
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-09-24T23:59:00.000Z'))
    await page.goto('./')
    await page.getByRole('button', { name: 'Start adding records' }).click()
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Accounts' }).click()
    await page.getByRole('button', { name: '+ Add account' }).click()
    await page.getByLabel('Account name').fill('Clock account')
    await page.getByLabel('Cash balance (EUR)').fill('1')
    await page.getByRole('button', { name: 'Save account' }).click()
    await openHistory(page)
    const table = page.getByRole('table', { name: /Exact dated assets/ })
    await expect(table.getByRole('row', { name: /Sep 24, 2026/ })).toBeVisible()

    await page.clock.setFixedTime(new Date('2026-09-25T00:01:00.000Z'))
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Accounts' }).click()
    await page.getByRole('button', { name: 'Update Clock account cash' }).click()
    await page.getByLabel('Cash balance (EUR)').fill('2')
    await page.getByRole('button', { name: 'Save account' }).click()
    await openHistory(page)
    const newest = table.getByRole('row', { name: /Sep 25, 2026/ })
    await expect(newest).toContainText('EUR 2')
    await expect(table.getByRole('row', { name: /Sep 24, 2026/ })).toContainText('EUR 1')
  } finally {
    await context.close()
  }
})

test('history dates remain calendar dates in Honolulu and across New York DST', async ({ browser }) => {
  const backup = syntheticPortfolio()
  for (const timezoneId of ['Pacific/Honolulu', 'America/New_York']) {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
      timezoneId,
    })
    try {
      const page = await context.newPage()
      await restore(page, backup)
      await openHistory(page)
      const table = page.getByRole('table', { name: /Exact dated assets/ })
      await expect(table.getByRole('row', { name: /Mar 9, 2024/ })).toBeVisible()
      await expect(table.getByRole('row', { name: /Mar 11, 2024/ })).toBeVisible()
      await expect(table.getByRole('row', { name: /Jan 3, 2024/ })).toContainText('Incomplete')
      await expect(page.getByRole('img', { name: /Dated net worth/ })).toBeVisible()
    } finally {
      await context.close()
    }
  }
})
