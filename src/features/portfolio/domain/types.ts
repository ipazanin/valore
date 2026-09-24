export type Currency = string

export type RecordCategory = 'property' | 'possessions' | 'other' | 'lent' | 'debt'
export type ObservationKind = 'cash' | 'quantity' | 'price' | 'valuation'

export interface Account {
  id: string
  closedOn?: string
  name: string
  currency: Currency
  createdAt: string
  updatedAt: string
}

export interface Instrument {
  id: string
  name: string
  kind: 'stock' | 'etf'
  isin: string | null
  createdAt: string
  updatedAt: string
}

export interface Listing {
  id: string
  instrumentId: string
  symbol: string
  exchange: string
  currency: Currency
  createdAt: string
  updatedAt: string
}

export interface Holding {
  id: string
  closedOn?: string
  accountId: string
  listingId: string
  createdAt: string
  updatedAt: string
}

export interface AssetRecord {
  id: string
  closedOn?: string
  name: string
  category: RecordCategory
  currency: Currency
  createdAt: string
  updatedAt: string
}

export interface Observation {
  id: string
  kind: ObservationKind
  subjectId: string
  effectiveDate: string
  amount: string
  recordedAt: string
}

export interface Portfolio {
  settings: { reportingCurrency: Currency; createdAt: string }
  accounts: Account[]
  instruments: Instrument[]
  listings: Listing[]
  holdings: Holding[]
  records: AssetRecord[]
  observations: Observation[]
}

export interface AccountSummary {
  accountId: string
  cash: string
  investments: string
  total: string
  incomplete: boolean
}

export interface Overview {
  assets: string
  liabilities: string
  netWorth: string
  incomplete: boolean
  categories: Record<string, string>
  unvaluedHoldings: string[]
  accounts: AccountSummary[]
}
