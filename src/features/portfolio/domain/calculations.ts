import { MoneyDecimal } from './decimal'
import { isClosed } from './closure'
import { localToday } from './dates'
import type { AccountSummary, Overview, Portfolio } from './types'
import { latestObservation } from './observations'

export { latestObservation } from './observations'

export function holdingValue(
  portfolio: Portfolio,
  holdingId: string,
  onDate = localToday(),
): string | null {
  const holding = portfolio.holdings.find((candidate) => candidate.id === holdingId)
  if (!holding) {
    throw new Error(`Unknown holding: ${holdingId}`)
  }
  const account = portfolio.accounts.find((candidate) => candidate.id === holding.accountId)
  if (isClosed(holding, onDate) || (account && isClosed(account, onDate))) {
    return '0'
  }

  const quantity = latestObservation(portfolio, 'quantity', holdingId, onDate)
  if (!quantity) {
    return '0'
  }
  const amount = new MoneyDecimal(quantity.amount)
  if (amount.isZero()) {
    return '0'
  }

  const price = latestObservation(portfolio, 'price', holding.listingId, onDate)
  if (!price) {
    return null
  }
  return amount.mul(new MoneyDecimal(price.amount)).toFixed()
}

export function calculateOverview(portfolio: Portfolio, onDate = localToday()): Overview {
  const categories: Record<string, string> = {
    cash: '0',
    investments: '0',
    property: '0',
    possessions: '0',
    other: '0',
    lent: '0',
    debt: '0',
  }
  const unvaluedHoldings: string[] = []
  const accounts: AccountSummary[] = []

  for (const account of portfolio.accounts) {
    if (isClosed(account, onDate)) continue
    const cash = new MoneyDecimal(
      latestObservation(portfolio, 'cash', account.id, onDate)?.amount ?? '0',
    )
    let investments = new MoneyDecimal(0)
    let incomplete = false
    for (const holding of portfolio.holdings) {
      if (holding.accountId !== account.id) {
        continue
      }
      const valuation = holdingValue(portfolio, holding.id, onDate)
      if (valuation === null) {
        incomplete = true
        unvaluedHoldings.push(holding.id)
      } else {
        investments = investments.plus(valuation)
      }
    }
    if (cash.isNegative()) {
      categories.debt = new MoneyDecimal(categories.debt).plus(cash.abs()).toFixed()
    } else {
      categories.cash = new MoneyDecimal(categories.cash).plus(cash).toFixed()
    }
    categories.investments = new MoneyDecimal(categories.investments).plus(investments).toFixed()
    accounts.push({
      accountId: account.id,
      cash: cash.toFixed(),
      investments: investments.toFixed(),
      total: cash.plus(investments).toFixed(),
      incomplete,
    })
  }

  for (const record of portfolio.records) {
    if (isClosed(record, onDate)) continue
    const valuation = latestObservation(portfolio, 'valuation', record.id, onDate)
    if (valuation) {
      categories[record.category] = new MoneyDecimal(categories[record.category])
        .plus(valuation.amount)
        .toFixed()
    }
  }

  const assets = ['cash', 'investments', 'property', 'possessions', 'other', 'lent'].reduce(
    (total, category) => total.plus(categories[category]),
    new MoneyDecimal(0),
  )
  const liabilities = new MoneyDecimal(categories.debt)
  return {
    assets: assets.toFixed(),
    liabilities: liabilities.toFixed(),
    netWorth: assets.minus(liabilities).toFixed(),
    incomplete: unvaluedHoldings.length > 0,
    categories,
    unvaluedHoldings,
    accounts,
  }
}
