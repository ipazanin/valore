import { describe, expect, it } from 'vitest'
import { setClosure } from './closure'
import { localToday } from './dates'
import { buildHistory } from './history'
import { correctObservation, deleteObservation, recordObservation } from './observations'
import { createEmptyPortfolio } from './portfolio'

function fixture() {
  const portfolio = createEmptyPortfolio('EUR', '2020-01-01T00:00:00.000Z')
  const metadata = { createdAt: portfolio.settings.createdAt, updatedAt: portfolio.settings.createdAt }
  portfolio.accounts.push({ id: 'account', name: 'Broker', currency: 'EUR', ...metadata })
  portfolio.instruments.push({ id: 'instrument', name: 'Fund', kind: 'etf', isin: null, ...metadata })
  portfolio.listings.push({
    id: 'listing', instrumentId: 'instrument', symbol: 'FUND', exchange: 'XETRA',
    currency: 'EUR', ...metadata,
  })
  portfolio.holdings.push({
    id: 'holding', accountId: 'account', listingId: 'listing', ...metadata,
  })
  portfolio.records.push({
    id: 'record', name: 'Home', category: 'property', currency: 'EUR', ...metadata,
  })
  return portfolio
}

describe('recorded history', () => {
  it('calculates quantity and price changes without ownership from earlier quotes', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-03-01')
    recordObservation(portfolio, 'price', 'listing', '10', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'holding', '1.5', '2020-02-01')
    recordObservation(portfolio, 'price', 'listing', '12', '2020-02-15')
    const history = buildHistory(portfolio, { endDate: '2020-03-15' })
    expect(history.map((point) => [point.date, point.overview.assets])).toEqual([
      ['2020-01-01', '0'], ['2020-02-01', '15'], ['2020-02-15', '18'],
      ['2020-03-01', '24'], ['2020-03-15', '24'],
    ])
    expect(history[0]!.sources).toEqual([])
    expect(history[4]!.sources).toEqual([
      { kind: 'quantity', subjectId: 'holding', amount: '2', sourceDate: '2020-03-01', ageDays: 14 },
      { kind: 'price', subjectId: 'listing', amount: '12', sourceDate: '2020-02-15', ageDays: 29 },
    ])
  })

  it('preserves an initial missing-price gap and resumes valuation when a price exists', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-01-01')
    recordObservation(portfolio, 'price', 'listing', '10', '2020-02-01')
    const history = buildHistory(portfolio, { endDate: '2020-02-01' })
    expect(history.map((point) => point.overview.incomplete)).toEqual([true, false])
    expect(history[0]!.overview.unvaluedHoldings).toEqual(['holding'])
    expect(history[0]!.sources.map((source) => source.kind)).toEqual(['quantity'])
    expect(history[1]!.overview.assets).toBe('20')
  })

  it('counts negative cash once and preserves exact fractional amounts', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '-10.000000000001', '2020-01-01')
    recordObservation(portfolio, 'valuation', 'record', '25.000000000002', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'holding', '0.1', '2020-01-01')
    recordObservation(portfolio, 'price', 'listing', '0.2', '2020-01-01')
    const [point] = buildHistory(portfolio, { endDate: '2020-01-01' })
    expect(point!.overview).toMatchObject({
      assets: '25.020000000002', liabilities: '10.000000000001', netWorth: '15.020000000001',
    })
    expect(point!.sources.find((source) => source.kind === 'cash')?.amount)
      .toBe('-10.000000000001')
  })

  it('keeps zero quantity sources without requiring prices and accepts explicit zero prices', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'quantity', 'holding', '0', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-02-01')
    recordObservation(portfolio, 'price', 'listing', '0', '2020-02-01')
    const history = buildHistory(portfolio, { endDate: '2020-02-01' })
    expect(history.map((point) => point.overview.incomplete)).toEqual([false, false])
    expect(history[0]!.sources).toEqual([
      { kind: 'quantity', subjectId: 'holding', amount: '0', sourceDate: '2020-01-01', ageDays: 0 },
    ])
    expect(history[1]!.sources.find((source) => source.kind === 'price')?.amount).toBe('0')
  })

  it('preserves zero and negative net worth while carrying valuations across cash updates', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '-50', '2020-03-01')
    recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
    recordObservation(portfolio, 'cash', 'account', '-20', '2020-02-01')
    recordObservation(portfolio, 'valuation', 'record', '20', '2020-01-01')
    const original = structuredClone(portfolio)
    const history = buildHistory(portfolio, { endDate: '2020-03-01' })
    expect(history.map((point) => [
      point.date, point.overview.assets, point.overview.liabilities, point.overview.netWorth,
    ])).toEqual([
      ['2020-01-01', '30', '0', '30'],
      ['2020-02-01', '20', '20', '0'],
      ['2020-03-01', '20', '50', '-30'],
    ])
    expect(history[2]!.sources.find((source) => source.kind === 'valuation')).toMatchObject({
      amount: '20',
      sourceDate: '2020-01-01',
      ageDays: 60,
    })
    expect(portfolio).toEqual(original)
  })

  it('deduplicates a shared listing price while retaining each account’s quantity source', () => {
    const portfolio = fixture()
    portfolio.accounts.push({ ...portfolio.accounts[0]!, id: 'second-account', name: 'Second' })
    portfolio.holdings.push({
      ...portfolio.holdings[0]!, id: 'second-holding', accountId: 'second-account',
    })
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'second-holding', '3', '2020-01-01')
    recordObservation(portfolio, 'price', 'listing', '10', '2020-01-01')
    const [point] = buildHistory(portfolio, { endDate: '2020-01-01' })
    expect(point!.overview.assets).toBe('50')
    expect(point!.sources.filter((source) => source.kind === 'price')).toHaveLength(1)
    expect(point!.sources.filter((source) => source.kind === 'quantity')).toHaveLength(2)
  })

  it('recalculates corrected and deleted past observations without changing later snapshots', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
    const middle = recordObservation(portfolio, 'cash', 'account', '20', '2020-02-01')
    recordObservation(portfolio, 'cash', 'account', '30', '2020-03-01')
    correctObservation(portfolio, middle.id, '2020-02-15', '25')
    expect(buildHistory(portfolio, { endDate: '2020-03-01' })
      .map((point) => [point.date, point.overview.assets])).toEqual([
      ['2020-01-01', '10'], ['2020-02-15', '25'], ['2020-03-01', '30'],
    ])
    deleteObservation(portfolio, middle.id)
    expect(buildHistory(portfolio, { startDate: '2020-02-15', endDate: '2020-03-01' })
      .map((point) => point.overview.assets)).toEqual(['10', '30'])
  })

  it('adds closure boundaries and removes closed subjects from source details', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'valuation', 'record', '100', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'holding', '2', '2020-01-01')
    recordObservation(portfolio, 'price', 'listing', '10', '2020-01-01')
    setClosure(portfolio, 'record', 'record', '2020-02-01')
    setClosure(portfolio, 'holding', 'holding', '2020-03-01')
    const history = buildHistory(portfolio, { endDate: '2020-03-01' })
    expect(history.map((point) => [point.date, point.overview.assets])).toEqual([
      ['2020-01-01', '120'], ['2020-02-01', '20'], ['2020-03-01', '0'],
    ])
    expect(history[1]!.sources.map((source) => source.kind)).toEqual(['quantity', 'price'])
    expect(history[2]!.sources).toEqual([])
  })

  it('excludes closed accounts and their holdings even when their raw zero sources remain', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '0', '2020-01-01')
    recordObservation(portfolio, 'quantity', 'holding', '0', '2020-01-01')
    setClosure(portfolio, 'account', 'account', '2020-02-01')
    const history = buildHistory(portfolio, { endDate: '2020-02-01' })
    expect(history[0]!.sources).toHaveLength(2)
    expect(history[1]!.sources).toEqual([])
    expect(history[1]!.overview.accounts).toEqual([])
  })

  it('clips ranges to recorded history and includes carried values at both requested boundaries', () => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
    recordObservation(portfolio, 'cash', 'account', '20', '2020-03-01')
    expect(buildHistory(portfolio, { endDate: '2019-12-31' })).toEqual([])
    expect(buildHistory(portfolio, { startDate: '2019-01-01', endDate: '2020-01-01' })
      .map((point) => point.date)).toEqual(['2020-01-01'])
    const history = buildHistory(portfolio, { startDate: '2020-02-01', endDate: '2020-02-15' })
    expect(history.map((point) => [point.date, point.overview.assets])).toEqual([
      ['2020-02-01', '10'], ['2020-02-15', '10'],
    ])
    expect(history[0]!.sources[0]!.ageDays).toBe(31)
    expect(buildHistory(portfolio, { startDate: '2020-02-01', endDate: '2020-02-01' }))
      .toHaveLength(1)
  })

  it('ends at today by default and never includes a future observation or requested date', () => {
    const portfolio = fixture()
    const observation = recordObservation(portfolio, 'cash', 'account', '10', '2020-01-01')
    portfolio.observations.push({
      ...observation, id: 'future', amount: '99', effectiveDate: '2999-01-01',
    })
    const defaultHistory = buildHistory(portfolio)
    const futureRange = buildHistory(portfolio, { endDate: '2999-02-01' })
    expect(defaultHistory.at(-1)?.date).toBe(localToday())
    expect(defaultHistory.at(-1)?.overview.assets).toBe('10')
    expect(futureRange).toEqual(defaultHistory)
    expect(buildHistory(portfolio, { startDate: '2999-01-01' })).toEqual([])
  })

  it('returns no points without observations, even if named records have closure dates', () => {
    const portfolio = fixture()
    setClosure(portfolio, 'record', 'record', '2020-02-01')
    expect(buildHistory(portfolio)).toEqual([])
  })

  it.each([
    ['2024-03-30', '2024-04-01', 2],
    ['2024-10-26', '2024-10-28', 2],
    ['0099-12-31', '0100-01-01', 1],
  ] as const)('counts calendar days from %s to %s without timezone or year conversion', (
    sourceDate, endDate, ageDays,
  ) => {
    const portfolio = fixture()
    recordObservation(portfolio, 'cash', 'account', '10', sourceDate)
    const history = buildHistory(portfolio, { endDate })
    expect(history.map((point) => point.date)).toEqual([sourceDate, endDate])
    expect(history[1]!.sources[0]).toMatchObject({ sourceDate, ageDays })
  })

  it.each([
    { startDate: '' }, { startDate: '2020-02-30' }, { endDate: '2020-13-01' },
    { startDate: '2020-02-01', endDate: '2020-01-01' },
  ])('rejects invalid ranges before constructing points: %j', (range) => {
    expect(() => buildHistory(fixture(), range)).toThrow(/History/)
  })
})
