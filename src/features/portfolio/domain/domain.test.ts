import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup, serializeBackup } from '../../backup/backup'
import { calculateOverview, holdingValue, latestObservation } from './calculations'
import { normalizeAmount } from './decimal'
import { localToday } from './dates'
import { formatMoney } from './format'
import { createEmptyPortfolio } from './portfolio'
import type { Portfolio } from './types'
import { validatePortfolio } from './validation'

const timestamp = '2020-01-01T12:00:00.000Z'
const accountId = '00000000-0000-4000-8000-000000000001'
const instrumentId = '00000000-0000-4000-8000-000000000002'
const listingId = '00000000-0000-4000-8000-000000000003'
const holdingId = '00000000-0000-4000-8000-000000000004'
const houseId = '00000000-0000-4000-8000-000000000005'
const loanId = '00000000-0000-4000-8000-000000000006'

function portfolioFixture(): Portfolio {
  const portfolio = createEmptyPortfolio('EUR', timestamp)
  portfolio.accounts.push({
    id: accountId,
    name: 'Broker',
    currency: 'EUR',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  portfolio.instruments.push({
    id: instrumentId,
    name: 'Fund',
    kind: 'etf',
    isin: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  portfolio.listings.push({
    id: listingId,
    instrumentId,
    symbol: 'FUND',
    exchange: 'XETRA',
    currency: 'EUR',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  portfolio.holdings.push({
    id: holdingId,
    accountId,
    listingId,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  portfolio.records.push(
    {
      id: houseId,
      name: 'House',
      category: 'property',
      currency: 'EUR',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: loanId,
      name: 'Mortgage',
      category: 'debt',
      currency: 'EUR',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  )
  portfolio.observations.push(
    {
      id: '00000000-0000-4000-8000-000000000007',
      kind: 'cash',
      subjectId: accountId,
      effectiveDate: '2020-01-01',
      amount: '-100',
      recordedAt: timestamp,
    },
    {
      id: '00000000-0000-4000-8000-000000000008',
      kind: 'quantity',
      subjectId: holdingId,
      effectiveDate: '2020-01-01',
      amount: '1.5',
      recordedAt: timestamp,
    },
    {
      id: '00000000-0000-4000-8000-000000000009',
      kind: 'price',
      subjectId: listingId,
      effectiveDate: '2020-01-01',
      amount: '100.25',
      recordedAt: timestamp,
    },
    {
      id: '00000000-0000-4000-8000-000000000010',
      kind: 'valuation',
      subjectId: houseId,
      effectiveDate: '2020-01-01',
      amount: '300000',
      recordedAt: timestamp,
    },
    {
      id: '00000000-0000-4000-8000-000000000011',
      kind: 'valuation',
      subjectId: loanId,
      effectiveDate: '2020-01-01',
      amount: '120000',
      recordedAt: timestamp,
    },
  )
  return portfolio
}

function changed(fixture: Portfolio, change: (portfolio: Portfolio) => void): Portfolio {
  const copy = structuredClone(fixture)
  change(copy)
  return copy
}

describe('portfolio calculations', () => {
  it('counts underlying amounts once and keeps signed account cash visible', () => {
    const portfolio = validatePortfolio(portfolioFixture())
    const overview = calculateOverview(portfolio)
    expect(overview.categories).toEqual({
      cash: '0',
      investments: '150.375',
      property: '300000',
      possessions: '0',
      other: '0',
      lent: '0',
      debt: '120100',
    })
    expect(overview.assets).toBe('300150.375')
    expect(overview.liabilities).toBe('120100')
    expect(overview.netWorth).toBe('180050.375')
    expect(overview.accounts).toEqual([
      { accountId, cash: '-100', investments: '150.375', total: '50.375', incomplete: false },
    ])
  })

  it('separates every asset category, positive cash, and negative cash', () => {
    const portfolio = portfolioFixture()
    const savingsId = '00000000-0000-4000-8000-000000000013'
    portfolio.accounts.push({
      id: savingsId,
      name: 'Savings',
      currency: 'EUR',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    portfolio.observations.push({
      id: '00000000-0000-4000-8000-000000000014',
      kind: 'cash',
      subjectId: savingsId,
      effectiveDate: '2020-01-01',
      amount: '200',
      recordedAt: timestamp,
    })
    for (const [index, category, amount] of [
      [15, 'possessions', '20'],
      [17, 'other', '30'],
      [19, 'lent', '40'],
    ] as const) {
      const recordId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
      portfolio.records.push({
        id: recordId,
        name: category,
        category,
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      portfolio.observations.push({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        kind: 'valuation',
        subjectId: recordId,
        effectiveDate: '2020-01-01',
        amount,
        recordedAt: timestamp,
      })
    }
    const overview = calculateOverview(validatePortfolio(portfolio))
    expect(overview.categories).toEqual({
      cash: '200',
      investments: '150.375',
      property: '300000',
      possessions: '20',
      other: '30',
      lent: '40',
      debt: '120100',
    })
    expect(overview.assets).toBe('300440.375')
    expect(overview.liabilities).toBe('120100')
    expect(overview.netWorth).toBe('180340.375')
    expect(overview.accounts.find((account) => account.accountId === savingsId)?.total).toBe('200')
  })

  it('marks positive holdings without a price incomplete, while zero holdings need no price', () => {
    const portfolio = changed(portfolioFixture(), (copy) => {
      copy.observations = copy.observations.filter((observation) => observation.kind !== 'price')
    })
    expect(holdingValue(portfolio, holdingId)).toBeNull()
    expect(calculateOverview(portfolio).unvaluedHoldings).toEqual([holdingId])
    portfolio.observations.find((observation) => observation.kind === 'quantity')!.amount = '0'
    expect(holdingValue(portfolio, holdingId)).toBe('0')
    expect(calculateOverview(portfolio).incomplete).toBe(false)
  })

  it('treats an explicit zero price as a known value', () => {
    const portfolio = portfolioFixture()
    portfolio.observations.find((observation) => observation.kind === 'price')!.amount = '0'
    expect(holdingValue(portfolio, holdingId)).toBe('0')
    expect(calculateOverview(portfolio).incomplete).toBe(false)
  })

  it('uses the latest observation no later than the requested day', () => {
    const portfolio = portfolioFixture()
    portfolio.observations.push({
      id: '00000000-0000-4000-8000-000000000012',
      kind: 'cash',
      subjectId: accountId,
      effectiveDate: localToday(),
      amount: '25',
      recordedAt: new Date().toISOString(),
    })
    expect(latestObservation(portfolio, 'cash', accountId, '2020-01-02')?.amount).toBe('-100')
    expect(latestObservation(portfolio, 'cash', accountId)?.amount).toBe('25')
  })

  it('retains decimal precision and formats money without floating point conversion', () => {
    expect(normalizeAmount('000000000000000001.230000000000')).toBe('1.23')
    expect(normalizeAmount('-0.000000000001', true)).toBe('-0.000000000001')
    expect(() => normalizeAmount('1.0000000000001')).toThrow('12 decimal places')
    expect(formatMoney('123456789012345678.235', 'EUR')).toBe('EUR 123,456,789,012,345,678.24')
    expect(formatMoney('1999999999999999998', 'EUR')).toBe('EUR 1,999,999,999,999,999,998.00')
    expect(formatMoney('-1234.5', 'JPY')).toBe('-JPY 1,235')
  })

  it('multiplies boundary amounts exactly and rejects values outside entry limits', () => {
    const portfolio = portfolioFixture()
    const maximum = '999999999999999999.999999999999'
    portfolio.observations.find((observation) => observation.kind === 'quantity')!.amount = maximum
    portfolio.observations.find((observation) => observation.kind === 'price')!.amount = maximum
    const squaredUnits = (10n ** 30n - 1n) ** 2n
    const digits = squaredUnits.toString().padStart(25, '0')
    const exactProduct = `${digits.slice(0, -24)}.${digits.slice(-24)}`
    expect(holdingValue(validatePortfolio(portfolio), holdingId)).toBe(exactProduct)
    expect(() => normalizeAmount('1000000000000000000')).toThrow('18 whole digits')
    expect(() => normalizeAmount('0.0000000000001')).toThrow('12 decimal places')
  })
})

describe('backup validation', () => {
  it('round trips all observations and settings', () => {
    const portfolio = portfolioFixture()
    const restored = parseBackup(serializeBackup(portfolio))
    expect(restored).toMatchObject({ format: 'valore', version: 3, portfolio })
    expect(createBackup(portfolio).portfolio.observations).toHaveLength(5)
  })

  it('preserves version 1 backups and supports records without observations in newer versions', () => {
    const portfolio = portfolioFixture()
    const original = { ...createBackup(portfolio), version: 1 }
    expect(parseBackup(JSON.stringify(original)).portfolio).toEqual(portfolio)
    portfolio.observations = []
    expect(() => parseBackup(JSON.stringify(original))).toThrow('cash observation')
    const restored = parseBackup(serializeBackup(portfolio))
    expect(restored.version).toBe(3)
    expect(restored.portfolio).toEqual(portfolio)
    expect(calculateOverview(restored.portfolio).assets).toBe('0')
  })

  it('rejects incomplete or inconsistent portfolios', () => {
    const fixture = portfolioFixture()
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.accounts[0].currency = 'USD'
        }),
      ),
    ).toThrow('match reporting currency')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.holdings[0].listingId = accountId
        }),
      ),
    ).toThrow('missing account or listing')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations = copy.observations.filter(
            (observation) => observation.kind !== 'quantity',
          )
        }),
        { requireObservations: true },
      ),
    ).toThrow('needs a quantity observation')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations[1].amount = '-1'
        }),
      ),
    ).toThrow('cannot be negative')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations[1].effectiveDate = '2999-01-01'
        }),
      ),
    ).toThrow('current or past')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations[1].effectiveDate = copy.observations[0].effectiveDate
          copy.observations[1].kind = 'cash'
          copy.observations[1].subjectId = accountId
        }),
      ),
    ).toThrow('Duplicate observation')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations = copy.observations.filter((observation) => observation.kind !== 'cash')
        }),
        { requireObservations: true },
      ),
    ).toThrow('needs a cash observation')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations = copy.observations.filter(
            (observation) => observation.kind !== 'valuation' || observation.subjectId !== houseId,
          )
        }),
        { requireObservations: true },
      ),
    ).toThrow('needs a valuation observation')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.listings[0].currency = 'USD'
        }),
      ),
    ).toThrow('match reporting currency')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations[0].effectiveDate = '2020-02-30'
        }),
      ),
    ).toThrow('current or past')
  })

  it('accepts an unpriced holding but rejects repeated identities and broken timestamps', () => {
    const fixture = portfolioFixture()
    expect(
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations = copy.observations.filter(
            (observation) => observation.kind !== 'price',
          )
        }),
      ),
    ).toBeDefined()
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.holdings.push({ ...copy.holdings[0], id: '00000000-0000-4000-8000-000000000013' })
        }),
      ),
    ).toThrow('Duplicate holding')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.observations[0].id = accountId
        }),
      ),
    ).toThrow('Duplicate ID')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.records[0].updatedAt = '2019-12-31T12:00:00.000Z'
        }),
      ),
    ).toThrow('inconsistent creation or update')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.instruments.push({
            ...copy.instruments[0],
            id: '00000000-0000-4000-8000-000000000013',
            name: 'fund',
          })
        }),
      ),
    ).toThrow('Duplicate instrument name and kind')
    expect(() =>
      validatePortfolio(
        changed(fixture, (copy) => {
          copy.listings.push({
            ...copy.listings[0],
            id: '00000000-0000-4000-8000-000000000013',
            symbol: 'fund',
          })
        }),
      ),
    ).toThrow('Duplicate listing identity')
  })

  it('rejects unknown fields, unsupported versions, and oversized files', () => {
    const backup = createBackup(portfolioFixture())
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow('version')
    expect(() => parseBackup(JSON.stringify({ ...backup, secret: 'key' }))).toThrow('fields')
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, portfolio: { ...backup.portfolio, extra: true } })),
    ).toThrow('not supported')
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          portfolio: {
            ...backup.portfolio,
            settings: { ...backup.portfolio.settings, apiKey: 'secret' },
          },
        }),
      ),
    ).toThrow('not supported')
    expect(() => parseBackup('{')).toThrow('valid JSON')
    expect(() => parseBackup('x'.repeat(10 * 1024 * 1024 + 1))).toThrow('10 MB')
  })
})
