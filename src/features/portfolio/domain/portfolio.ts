import { isSupportedCurrency } from './currency'
import { isUtcTimestamp } from './dates'
import type { Portfolio } from './types'

export function createEmptyPortfolio(
  currency: string,
  timestamp = new Date().toISOString(),
): Portfolio {
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`)
  }
  if (!isUtcTimestamp(timestamp)) {
    throw new Error('Invalid creation timestamp')
  }

  return {
    settings: { reportingCurrency: currency, createdAt: timestamp },
    accounts: [],
    instruments: [],
    listings: [],
    holdings: [],
    records: [],
    observations: [],
  }
}
