import { describe, expect, it } from 'vitest'
import { calculateAllocation } from './allocation'
import { calculateOverview } from './calculations'
import { MoneyDecimal } from './decimal'
import { recordObservation } from './observations'
import { createEmptyPortfolio } from './portfolio'
import type { Overview } from './types'

function overview(categories: Record<string, string> = {}): Overview {
  const assetCategories: Record<string, string> = {
    cash: '0',
    investments: '0',
    property: '0',
    possessions: '0',
    other: '0',
    lent: '0',
    ...categories,
  }
  const assets = Object.entries(assetCategories)
    .filter(([category]) => category !== 'debt')
    .reduce((total, [, amount]) => total.plus(amount), new MoneyDecimal(0))
    .toFixed()
  return {
    assets,
    liabilities: assetCategories.debt ?? '0',
    netWorth: new MoneyDecimal(assets).minus(assetCategories.debt ?? '0').toFixed(),
    categories: { debt: '0', ...assetCategories },
    accounts: [],
    incomplete: false,
    unvaluedHoldings: [],
  }
}

describe('asset allocation', () => {
  it('keeps all six asset categories in a stable order and excludes debt', () => {
    const allocation = calculateAllocation(overview({
      cash: '10',
      investments: '20',
      property: '30',
      possessions: '15',
      other: '5',
      lent: '20',
      debt: '250',
    }))
    expect(allocation.map((category) => category.category)).toEqual([
      'cash', 'investments', 'property', 'possessions', 'other', 'lent',
    ])
    expect(allocation.map((category) => category.percentage)).toEqual([
      '10', '20', '30', '15', '5', '20',
    ])
  })

  it('uses known assets rather than net worth as the incomplete allocation denominator', () => {
    const portfolioOverview = overview({ cash: '25', investments: '75', debt: '200' })
    portfolioOverview.incomplete = true
    portfolioOverview.unvaluedHoldings = ['unpriced-holding']
    const allocation = calculateAllocation(portfolioOverview)
    expect(allocation[0]).toEqual({ category: 'cash', amount: '25', percentage: '25' })
    expect(allocation[1]).toEqual({ category: 'investments', amount: '75', percentage: '75' })
  })

  it('preserves amounts and percentages beyond binary floating point precision', () => {
    const exactAmount = '999999999999999999.123456789012'
    const allocation = calculateAllocation(overview({ cash: exactAmount, property: exactAmount }))
    expect(allocation[0]).toEqual({ category: 'cash', amount: exactAmount, percentage: '50' })
    expect(allocation[2]).toEqual({ category: 'property', amount: exactAmount, percentage: '50' })
    const smallAllocation = calculateAllocation(overview({ cash: '0.1', other: '0.2' }))
    expect(smallAllocation[0]!.percentage).toBe(
      new MoneyDecimal('0.1').div('0.3').mul(100).toFixed(),
    )
  })

  it('retains zero rows and leaves percentages undefined when no known assets exist', () => {
    const allocation = calculateAllocation(overview({ debt: '100' }))
    expect(allocation).toHaveLength(6)
    expect(allocation.every((category) => category.amount === '0')).toBe(true)
    expect(allocation.every((category) => category.percentage === null)).toBe(true)
    expect(calculateAllocation(overview({ cash: '10' }))[1]!.percentage).toBe('0')
  })

  it('never includes negative cash or account grouping totals as asset slices', () => {
    const portfolio = createEmptyPortfolio('EUR')
    const timestamp = portfolio.settings.createdAt
    portfolio.accounts.push(
      {
        id: crypto.randomUUID(),
        name: 'Positive cash',
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        name: 'Overdraft',
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    )
    recordObservation(portfolio, 'cash', portfolio.accounts[0]!.id, '100')
    recordObservation(portfolio, 'cash', portfolio.accounts[1]!.id, '-40')
    const portfolioOverview = calculateOverview(portfolio)
    const allocation = calculateAllocation(portfolioOverview)
    expect(portfolioOverview.accounts.map((account) => account.total)).toEqual(['100', '-40'])
    expect(portfolioOverview.liabilities).toBe('40')
    expect(allocation[0]).toEqual({ category: 'cash', amount: '100', percentage: '100' })
    expect(allocation.reduce(
      (total, category) => total.plus(category.amount), new MoneyDecimal(0),
    ).toFixed()).toBe('100')
  })

  it('rejects negative asset categories rather than drawing misleading slices', () => {
    expect(() => calculateAllocation(overview({ cash: '-1', property: '10' }))).toThrow(
      /nonnegative category amounts/,
    )
  })
})
