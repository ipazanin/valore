import Decimal from 'decimal.js'

export const MoneyDecimal = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_UP })

const decimalPattern = /^(-?)(\d{1,18})(?:\.(\d{1,12}))?$/

export function normalizeAmount(input: string, allowNegative = false): string {
  const trimmed = input.trim()
  const match = decimalPattern.exec(trimmed)
  if (!match) {
    throw new Error('Enter a decimal amount with up to 18 whole digits and 12 decimal places')
  }

  const amount = new MoneyDecimal(trimmed)
  if (!allowNegative && amount.isNegative()) {
    throw new Error('Amount cannot be negative')
  }

  return amount.isZero() ? '0' : amount.toFixed()
}
