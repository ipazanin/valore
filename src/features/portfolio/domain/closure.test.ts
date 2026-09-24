import { describe, expect, it } from 'vitest'
import { calculateOverview, holdingValue, latestObservation } from './calculations'
import { isClosed, setClosure, validateClosures } from './closure'
import { deleteObservation, recordObservation } from './observations'
import { createEmptyPortfolio } from './portfolio'
import { validatePortfolio } from './validation'

function fixture() {
  const portfolio = createEmptyPortfolio('EUR', '2020-01-01T00:00:00.000Z')
  const metadata = { createdAt: portfolio.settings.createdAt, updatedAt: portfolio.settings.createdAt }
  const accountId = crypto.randomUUID()
  const instrumentId = crypto.randomUUID()
  const listingId = crypto.randomUUID()
  const holdingId = crypto.randomUUID()
  const recordId = crypto.randomUUID()
  portfolio.accounts.push({ id: accountId, name: 'Broker', currency: 'EUR', ...metadata })
  portfolio.instruments.push({ id: instrumentId, name: 'Fund', kind: 'etf', isin: null, ...metadata })
  portfolio.listings.push({
    id: listingId, instrumentId, symbol: 'FUND', exchange: 'XETRA', currency: 'EUR', ...metadata,
  })
  portfolio.holdings.push({ id: holdingId, accountId, listingId, ...metadata })
  portfolio.records.push({
    id: recordId, name: 'House', category: 'property', currency: 'EUR', ...metadata,
  })
  recordObservation(portfolio, 'cash', accountId, '100', '2020-01-01')
  recordObservation(portfolio, 'quantity', holdingId, '2', '2020-01-01')
  recordObservation(portfolio, 'price', listingId, '10', '2020-01-01')
  recordObservation(portfolio, 'valuation', recordId, '1000', '2020-01-01')
  return { portfolio, accountId, holdingId, listingId, recordId }
}

describe('dated closure', () => {
  it('excludes holdings and records on the closure date without altering cash or earlier values', () => {
    const { portfolio, holdingId, recordId } = fixture()
    const originalObservations = structuredClone(portfolio.observations)
    setClosure(portfolio, 'holding', holdingId, '2020-02-01')
    setClosure(portfolio, 'record', recordId, '2020-02-01')
    expect(calculateOverview(portfolio, '2020-01-31').assets).toBe('1120')
    expect(calculateOverview(portfolio, '2020-02-01').assets).toBe('100')
    expect(holdingValue(portfolio, holdingId, '2020-02-02')).toBe('0')
    expect(latestObservation(portfolio, 'quantity', holdingId)?.amount).toBe('2')
    expect(portfolio.observations).toEqual(originalObservations)
    expect(isClosed(portfolio.records[0]!, '2020-01-31')).toBe(false)
    expect(isClosed(portfolio.records[0]!, '2020-02-01')).toBe(true)
    expect(validatePortfolio(portfolio)).toEqual(portfolio)
  })

  it('removes a closure as a correction to all subsequent history', () => {
    const { portfolio, recordId } = fixture()
    setClosure(portfolio, 'record', recordId, '2020-02-01')
    setClosure(portfolio, 'record', recordId, null)
    expect(portfolio.records[0]).not.toHaveProperty('closedOn')
    expect(calculateOverview(portfolio, '2020-03-01').assets).toBe('1120')
  })

  it('preserves missing-price gaps before closure and excludes the holding afterward', () => {
    const { portfolio, holdingId } = fixture()
    portfolio.observations = portfolio.observations.filter(
      (observation) => observation.kind !== 'price',
    )
    setClosure(portfolio, 'holding', holdingId, '2020-02-01')
    expect(calculateOverview(portfolio, '2020-01-31').unvaluedHoldings).toEqual([holdingId])
    expect(calculateOverview(portfolio, '2020-02-01').unvaluedHoldings).toEqual([])
    expect(calculateOverview(portfolio, '2020-02-01').incomplete).toBe(false)
    expect(holdingValue(portfolio, holdingId, '2020-01-31')).toBeNull()
  })

  it('requires separate cash and quantity zeros rather than a net-zero account', () => {
    const { portfolio, accountId } = fixture()
    recordObservation(portfolio, 'cash', accountId, '-20', '2020-01-01')
    expect(calculateOverview(portfolio).accounts[0]!.total).toBe('0')
    const original = structuredClone(portfolio)
    expect(() => setClosure(portfolio, 'account', accountId, '2020-02-01'))
      .toThrow(/zero cash/)
    expect(portfolio).toEqual(original)
    recordObservation(portfolio, 'cash', accountId, '0', '2020-01-01')
    expect(() => setClosure(portfolio, 'account', accountId, '2020-02-01'))
      .toThrow(/zero quantity/)
  })

  it('does not let archived holdings or zero prices hide remaining quantities', () => {
    const { portfolio, accountId, holdingId, listingId } = fixture()
    recordObservation(portfolio, 'cash', accountId, '0', '2020-01-01')
    recordObservation(portfolio, 'price', listingId, '0', '2020-01-01')
    setClosure(portfolio, 'holding', holdingId, '2020-02-01')
    expect(calculateOverview(portfolio, '2020-03-01').accounts[0]!.total).toBe('0')
    expect(() => setClosure(portfolio, 'account', accountId, '2020-03-01'))
      .toThrow(/including archived holdings/)
    recordObservation(portfolio, 'quantity', holdingId, '0', '2020-02-01')
    setClosure(portfolio, 'account', accountId, '2020-03-01')
    expect(calculateOverview(portfolio, '2020-03-01').accounts).toEqual([])
    expect(holdingValue(portfolio, holdingId, '2020-03-01')).toBe('0')
  })

  it.each(['cash', 'quantity'] as const)('does not treat missing %s as a recorded zero', (kind) => {
    const { portfolio, accountId, holdingId } = fixture()
    recordObservation(portfolio, 'cash', accountId, '0', '2020-01-01')
    recordObservation(portfolio, 'quantity', holdingId, '0', '2020-01-01')
    const observation = portfolio.observations.find((observation) => observation.kind === kind)!
    deleteObservation(portfolio, observation.id)
    expect(() => setClosure(portfolio, 'account', accountId, '2020-02-01'))
      .toThrow(/recorded zero/)
  })

  it('permits an empty asset record to close without manufacturing a valuation', () => {
    const { portfolio, recordId } = fixture()
    portfolio.observations = portfolio.observations.filter(
      (observation) => observation.subjectId !== recordId,
    )
    setClosure(portfolio, 'record', recordId, '2020-02-01')
    expect(validatePortfolio(portfolio)).toEqual(portfolio)
    expect(latestObservation(portfolio, 'valuation', recordId)).toBeUndefined()
  })

  it.each(['cash', 'quantity', 'valuation'] as const)(
    'rejects %s observations after the relevant closure but allows the closure date', (kind) => {
      const { portfolio, accountId, holdingId, recordId } = fixture()
      const subjectId = kind === 'cash' ? accountId : kind === 'quantity' ? holdingId : recordId
      const closureKind = kind === 'cash' ? 'account' : kind === 'quantity' ? 'holding' : 'record'
      recordObservation(portfolio, 'cash', accountId, '0', '2020-02-01')
      recordObservation(portfolio, 'quantity', holdingId, '0', '2020-02-01')
      recordObservation(portfolio, kind, subjectId, '0', '2020-02-01')
      setClosure(portfolio, closureKind, subjectId, '2020-02-01')
      recordObservation(portfolio, kind, subjectId, '0', '2020-02-02')
      expect(() => validatePortfolio(portfolio)).toThrow(/after closure/)
    },
  )

  it('rejects later quantities under a closed account even if the holding has no closure', () => {
    const { portfolio, accountId, holdingId } = fixture()
    recordObservation(portfolio, 'cash', accountId, '0', '2020-02-01')
    recordObservation(portfolio, 'quantity', holdingId, '0', '2020-02-01')
    setClosure(portfolio, 'account', accountId, '2020-02-01')
    recordObservation(portfolio, 'quantity', holdingId, '0', '2020-02-02')
    expect(() => validateClosures(portfolio)).toThrow(/after closure/)
  })

  it('preserves shared listing prices and the other account’s ownership after holding closure', () => {
    const { portfolio, accountId, holdingId, listingId } = fixture()
    const secondAccountId = crypto.randomUUID()
    const secondHoldingId = crypto.randomUUID()
    portfolio.accounts.push({ ...portfolio.accounts[0]!, id: secondAccountId, name: 'Second' })
    portfolio.holdings.push({
      ...portfolio.holdings[0]!, id: secondHoldingId, accountId: secondAccountId,
    })
    recordObservation(portfolio, 'quantity', secondHoldingId, '3', '2020-01-01')
    recordObservation(portfolio, 'cash', accountId, '0', '2020-02-01')
    recordObservation(portfolio, 'quantity', holdingId, '0', '2020-02-01')
    setClosure(portfolio, 'account', accountId, '2020-02-01')
    recordObservation(portfolio, 'price', listingId, '12', '2020-03-01')
    expect(validatePortfolio(portfolio)).toEqual(portfolio)
    expect(holdingValue(portfolio, holdingId, '2020-03-01')).toBe('0')
    expect(holdingValue(portfolio, secondHoldingId, '2020-03-01')).toBe('36')
  })

  it.each(['2020-02-30', '2999-01-01', '', '2020-1-1'])(
    'rejects invalid closure date %s without modifying the subject', (closedOn) => {
      const { portfolio, recordId } = fixture()
      const original = structuredClone(portfolio)
      expect(() => setClosure(portfolio, 'record', recordId, closedOn)).toThrow(/Closure date/)
      expect(portfolio).toEqual(original)
    },
  )

  it('accepts old record shapes and rejects closure fields when the backup version forbids them', () => {
    const { portfolio, recordId } = fixture()
    expect(validatePortfolio(portfolio, { allowClosures: false })).toEqual(portfolio)
    setClosure(portfolio, 'record', recordId, '2020-02-01')
    expect(() => validatePortfolio(portfolio, { allowClosures: false })).toThrow(/closedOn/)
    expect(() => validatePortfolio({
      ...portfolio, records: [{ ...portfolio.records[0], closedOn: null }],
    })).toThrow(/Closure date/)
  })
})
