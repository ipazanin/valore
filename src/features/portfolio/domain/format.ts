import { isSupportedCurrency } from './currency'
import { MoneyDecimal, normalizeAmount } from './decimal'

function groupDecimal(amount: string): string {
  const [whole, fraction] = amount.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

export function formatMoney(amount: string, currency: string): string {
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`)
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(amount)) {
    throw new Error('Invalid money amount')
  }
  const decimal = new MoneyDecimal(amount)
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits
  const sign = decimal.isNegative() ? '-' : ''
  return `${sign}${currency} ${groupDecimal(decimal.abs().toFixed(digits))}`
}

export function formatQuantity(amount: string): string {
  return groupDecimal(normalizeAmount(amount))
}
