import { MoneyDecimal } from './decimal'
import type { Overview } from './types'

const assetCategories = ['cash', 'investments', 'property', 'possessions', 'other', 'lent'] as const

export function calculateAllocation(overview: Overview) {
  const totalAssets = new MoneyDecimal(overview.assets)
  if (!totalAssets.isFinite() || totalAssets.isNegative()) {
    throw new Error('Asset allocation requires a nonnegative known asset total.')
  }

  return assetCategories.map((category) => {
    const amount = new MoneyDecimal(overview.categories[category])
    if (!amount.isFinite() || amount.isNegative()) {
      throw new Error('Asset allocation requires nonnegative category amounts.')
    }
    return {
      category,
      amount: amount.toFixed(),
      percentage: totalAssets.isZero() ? null : amount.div(totalAssets).mul(100).toFixed(),
    }
  })
}
