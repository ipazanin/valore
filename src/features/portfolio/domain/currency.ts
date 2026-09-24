export const SUPPORTED_CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'JPY',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'BGN',
  'RON',
  'NZD',
  'SGD',
  'HKD',
  'INR',
  'CNY',
  'BRL',
  'ZAR',
] as const

const currencySet = new Set<string>(SUPPORTED_CURRENCIES)

export function isSupportedCurrency(currency: string): boolean {
  return currencySet.has(currency)
}
