import { describe, expect, it } from 'vitest'
import { calculateOverview, holdingValue, latestObservation } from './calculations'
import { correctObservation, deleteObservation, recordObservation } from './observations'
import { createEmptyPortfolio } from './portfolio'
import type { ObservationKind } from './types'

function fixture() {
  const portfolio = createEmptyPortfolio('EUR', '2020-01-01T00:00:00.000Z')
  const metadata = {
    createdAt: portfolio.settings.createdAt,
    updatedAt: portfolio.settings.createdAt,
  }
  portfolio.accounts.push({
    id: 'account',
    name: 'Broker',
    currency: 'EUR',
    ...metadata,
  })
  portfolio.instruments.push({
    id: 'instrument',
    name: 'Fund',
    kind: 'etf',
    isin: null,
    ...metadata,
  })
  portfolio.listings.push({
    id: 'listing',
    instrumentId: 'instrument',
    symbol: 'FUND',
    exchange: 'XETRA',
    currency: 'EUR',
    ...metadata,
  })
  portfolio.holdings.push({
    id: 'holding',
    accountId: 'account',
    listingId: 'listing',
    ...metadata,
  })
  portfolio.records.push({
    id: 'record',
    name: 'House',
    category: 'property',
    currency: 'EUR',
    ...metadata,
  })
  return portfolio
}

const observations: [ObservationKind, string][] = [
  ['cash', 'account'],
  ['quantity', 'holding'],
  ['price', 'listing'],
  ['valuation', 'record'],
]

describe('dated observations', () => {
  it.each(observations)(
    'backdates %s independently and corrects the same date without replacing history',
    (kind, subjectId) => {
      const portfolio = fixture()
      recordObservation(portfolio, kind, subjectId, '20', '2020-03-01')
      const earlier = recordObservation(portfolio, kind, subjectId, '10', '2020-01-01')
      const corrected = recordObservation(portfolio, kind, subjectId, '12.500', '2020-01-01')
      expect(corrected.id).toBe(earlier.id)
      expect(portfolio.observations).toHaveLength(2)
      expect(latestObservation(portfolio, kind, subjectId, '2019-12-31')).toBeUndefined()
      expect(latestObservation(portfolio, kind, subjectId, '2020-02-01')?.amount).toBe('12.5')
      expect(latestObservation(portfolio, kind, subjectId, '2020-03-01')?.amount).toBe('20')
      expect(corrected.recordedAt.slice(0, 10)).not.toBe(corrected.effectiveDate)
    },
  )

  it('corrects shared prices without changing ownership dates or quantities', () => {
    const portfolio = fixture()
    portfolio.accounts.push({
      ...portfolio.accounts[0]!,
      id: 'second-account',
      name: 'Second broker',
    })
    portfolio.holdings.push({
      ...portfolio.holdings[0]!,
      id: 'second-holding',
      accountId: 'second-account',
    })
    recordObservation(portfolio, 'price', 'listing', '10', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'holding', '1.5', '2020-02-01')
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-03-01')
    recordObservation(portfolio, 'quantity', 'second-holding', '3', '2020-02-01')
    const quantities = structuredClone(
      portfolio.observations.filter((observation) => observation.kind === 'quantity'),
    )
    recordObservation(portfolio, 'price', 'listing', '12', '2020-02-15')
    expect(portfolio.observations.filter((observation) => observation.kind === 'quantity')).toEqual(
      quantities,
    )
    expect(holdingValue(portfolio, 'holding', '2020-01-15')).toBe('0')
    expect(holdingValue(portfolio, 'holding', '2020-02-15')).toBe('18')
    expect(holdingValue(portfolio, 'second-holding', '2020-02-15')).toBe('36')
    expect(holdingValue(portfolio, 'holding', '2020-03-01')).toBe('24')
  })

  it('preserves identity on date changes and rejects collisions without changes', () => {
    const portfolio = fixture()
    const earlier = recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
    recordObservation(portfolio, 'cash', 'account', '20', '2020-03-01')
    const original = structuredClone(portfolio)
    expect(() => correctObservation(portfolio, earlier.id, '2020-03-01', '99')).toThrow(
      /already exists/,
    )
    expect(portfolio).toEqual(original)
    correctObservation(portfolio, earlier.id, '2020-02-01', '-12.25')
    expect(earlier).toMatchObject({
      id: earlier.id,
      kind: 'cash',
      subjectId: 'account',
      effectiveDate: '2020-02-01',
      amount: '-12.25',
    })
    expect(latestObservation(portfolio, 'cash', 'account', '2020-01-15')).toBeUndefined()
  })

  it.each(observations)(
    'allows deletion of the final %s observation without removing the subject',
    (kind, subjectId) => {
      const portfolio = fixture()
      const observation = recordObservation(portfolio, kind, subjectId, '10', '2020-01-01')
      deleteObservation(portfolio, observation.id)
      expect(portfolio.observations).toEqual([])
      expect(portfolio.accounts).toHaveLength(1)
      expect(portfolio.records).toHaveLength(1)
      expect(portfolio.holdings).toHaveLength(1)
      expect(portfolio.listings).toHaveLength(1)
    },
  )

  it('carries forward the earlier amount after deletion and preserves later updates', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
    const intermediate = recordObservation(portfolio, 'cash', 'account', '20', '2020-02-01')
    recordObservation(portfolio, 'cash', 'account', '30', '2020-03-01')
    deleteObservation(portfolio, intermediate.id)
    expect(calculateOverview(portfolio, '2020-02-15').assets).toBe('10')
    expect(calculateOverview(portfolio, '2020-03-01').assets).toBe('30')
  })

  it('deleting the only price leaves owned holdings explicitly unvalued', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-01-01')
    const price = recordObservation(portfolio, 'price', 'listing', '10', '2020-01-01')
    deleteObservation(portfolio, price.id)
    expect(holdingValue(portfolio, 'holding')).toBeNull()
    expect(calculateOverview(portfolio).unvaluedHoldings).toEqual(['holding'])
  })

  it.each(['2020-02-30', '2999-01-01', '01/01/2020'])(
    'rejects invalid or future dates before changing observations: %s',
    (effectiveDate) => {
      const portfolio = fixture()
      const observation = recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
      const original = structuredClone(portfolio)
      expect(() => recordObservation(portfolio, 'cash', 'account', '20', effectiveDate)).toThrow(
        /past or present/,
      )
      expect(() => correctObservation(portfolio, observation.id, effectiveDate, '20')).toThrow(
        /past or present/,
      )
      expect(portfolio).toEqual(original)
    },
  )
})
