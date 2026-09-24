import { expect, test, type Page } from '@playwright/test'

async function startPortfolio(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start adding records' }).click()
  await expect(page.getByTestId('net-worth')).toBeVisible()
}

async function openTab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click()
}

async function addAccount(page: Page) {
  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill('Broker')
  await page.getByLabel('Cash balance (EUR)').fill('100')
  await page.getByRole('button', { name: 'Save account' }).click()
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1)
}

test('backdated observations can be added, corrected, deleted, and left empty', async ({ page }) => {
  await startPortfolio(page)
  await addAccount(page)
  await openTab(page, 'History')
  await expect(page.getByLabel('Record')).toHaveValue(/cash:/)

  await page.getByLabel('As-of date', { exact: true }).fill('')
  await expect(page.getByRole('heading', { name: 'Choose an as-of date' })).toBeVisible()
  await expect(page.getByText('Enter a valid current or past date.')).toBeVisible()
  await page.getByLabel('As-of date', { exact: true }).fill('2019-12-31')
  await expect(page.getByText('No observation applies on this date.')).toBeVisible()

  await page.getByRole('button', { name: 'Add observation' }).click()
  await expect(page.getByLabel('Effective date')).toBeFocused()
  await page.getByLabel('Effective date').fill('2020-01-01')
  await page.getByLabel('Cash balance', { exact: true }).fill('12.345')
  await page.getByRole('button', { name: 'Save observation' }).click()
  await expect(page.getByRole('heading', { name: 'Saved observations' })).toBeFocused()

  await page.getByLabel('As-of date', { exact: true }).fill('2020-01-03')
  await expect(page.getByRole('article', { name: /Applicable on/ })).toContainText('EUR 12.345')
  await expect(page.getByText('Saved for Jan 1, 2020 · 2 days old')).toBeVisible()
  await page.getByRole('button', { name: 'Edit observation from Jan 1, 2020' }).click()
  await page.getByLabel('Cash balance', { exact: true }).fill('20.5')
  await page.getByRole('button', { name: 'Save observation' }).click()
  await expect(page.getByRole('article', { name: /Applicable on/ })).toContainText('EUR 20.5')

  await page.getByRole('button', { name: 'Delete observation from Jan 1, 2020' }).click()
  await expect(page.getByRole('group', { name: 'Delete observation from Jan 1, 2020?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Saved observations' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Edit observation from Jan 1, 2020' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete observation from Jan 1, 2020' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('No observation applies on this date.')).toBeVisible()

  await page.getByRole('button', { name: /Delete observation from/ }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('No saved observations for this record.')).toBeVisible()
  await page.reload()
  await openTab(page, 'History')
  await expect(page.getByText('No saved observations for this record.')).toBeVisible()
  await expect(page.getByText('No observation applies on this date.')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('the last shared listing price can be deleted and added back independently', async ({ page }) => {
  await startPortfolio(page)
  await addAccount(page)
  await openTab(page, 'Accounts')
  await page.getByRole('button', { name: 'Add holding to Broker' }).click()
  await page.getByLabel('Investment name').fill('Global ETF')
  await page.getByLabel('Listing symbol').fill('GLBL')
  await page.getByLabel('Exchange').fill('Xetra')
  await page.getByLabel('Total quantity today').fill('2')
  await page.getByLabel('Unit price today (EUR, optional)').fill('10')
  await page.getByRole('button', { name: 'Save holding' }).click()

  await openTab(page, 'History')
  await page.getByLabel('Record').selectOption({ label: 'Shared price · Global ETF (GLBL · Xetra)' })
  await expect(page.getByText('This listing price is shared by holdings in every account.')).toBeVisible()
  await page.getByRole('button', { name: /Delete observation from/ }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('No observation applies on this date.')).toBeVisible()
  await openTab(page, 'Overview')
  await expect(page.getByText('Your totals are incomplete.')).toBeVisible()

  await openTab(page, 'History')
  await page.getByRole('button', { name: 'Add observation' }).click()
  await page.getByLabel('Effective date').fill('2020-01-01')
  await page.getByLabel('Unit price', { exact: true }).fill('7.25')
  await page.getByRole('button', { name: 'Save observation' }).click()
  await expect(page.getByRole('article', { name: /Applicable on/ })).toContainText('EUR 7.25')
  await openTab(page, 'Overview')
  await expect(page.getByText('Your totals are incomplete.')).toHaveCount(0)
  await expect(page.getByTestId('assets')).toHaveText('EUR 114.50')
  await expectNoHorizontalOverflow(page)
})
