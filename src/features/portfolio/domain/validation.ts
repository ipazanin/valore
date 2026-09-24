import { isSupportedCurrency } from './currency'
import { isLocalDate, isUtcTimestamp, localToday } from './dates'
import { normalizeAmount } from './decimal'
import type { ObservationKind, Portfolio, RecordCategory } from './types'

const portfolioKeys = [
  'settings',
  'accounts',
  'instruments',
  'listings',
  'holdings',
  'records',
  'observations',
]
const recordCategories = new Set<RecordCategory>([
  'property',
  'possessions',
  'other',
  'lent',
  'debt',
])
const observationKinds = new Set<ObservationKind>(['cash', 'quantity', 'price', 'valuation'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function strictObject(input: unknown, keys: string[], location: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${location} must be an object`)
  }
  const object = input as Record<string, unknown>
  const actualKeys = Object.keys(object)
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) {
      throw new Error(`${location}.${key} is required`)
    }
  }
  for (const key of actualKeys) {
    if (!keys.includes(key)) {
      throw new Error(`${location}.${key} is not supported`)
    }
  }
  return object
}

function requiredString(input: unknown, location: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error(`${location} must be a nonempty string`)
  }
  return input
}

function name(input: unknown, location: string): string {
  const text = requiredString(input, location)
  if (text !== text.trim()) {
    throw new Error(`${location} must not have surrounding whitespace`)
  }
  return text
}

function uuid(input: unknown, location: string, allIds: Set<string>): string {
  const id = requiredString(input, location)
  if (!uuidPattern.test(id)) {
    throw new Error(`${location} must be a UUID`)
  }
  if (allIds.has(id.toLowerCase())) {
    throw new Error(`Duplicate ID: ${id}`)
  }
  allIds.add(id.toLowerCase())
  return id
}

function timestamp(input: unknown, location: string): string {
  const text = requiredString(input, location)
  if (!isUtcTimestamp(text)) {
    throw new Error(`${location} must be a UTC ISO timestamp`)
  }
  return text
}

function currency(input: unknown, expected: string, location: string): string {
  const code = requiredString(input, location)
  if (!isSupportedCurrency(code)) {
    throw new Error(`${location} has unsupported currency ${code}`)
  }
  if (code !== expected) {
    throw new Error(`${location} must match reporting currency ${expected}`)
  }
  return code
}

function entries(input: unknown, location: string): unknown[] {
  if (!Array.isArray(input)) {
    throw new Error(`${location} must be an array`)
  }
  return input
}

function metadata(
  record: Record<string, unknown>,
  location: string,
  allIds: Set<string>,
  portfolioCreatedAt: string,
) {
  const id = uuid(record.id, `${location}.id`, allIds)
  const createdAt = timestamp(record.createdAt, `${location}.createdAt`)
  const updatedAt = timestamp(record.updatedAt, `${location}.updatedAt`)
  if (
    Date.parse(createdAt) < Date.parse(portfolioCreatedAt) ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new Error(`${location} has inconsistent creation or update timestamps`)
  }
  return { id, createdAt, updatedAt }
}

function uniqueIdentity(identity: string, known: Set<string>, location: string): void {
  if (known.has(identity)) {
    throw new Error(`Duplicate ${location}`)
  }
  known.add(identity)
}

export function validatePortfolio(input: unknown, requireObservations = false): Portfolio {
  const portfolio = strictObject(input, portfolioKeys, 'portfolio')
  const settings = strictObject(portfolio.settings, ['reportingCurrency', 'createdAt'], 'settings')
  const reportingCurrency = requiredString(settings.reportingCurrency, 'settings.reportingCurrency')
  if (!isSupportedCurrency(reportingCurrency)) {
    throw new Error(`Unsupported reporting currency: ${reportingCurrency}`)
  }
  const portfolioCreatedAt = timestamp(settings.createdAt, 'settings.createdAt')
  const allIds = new Set<string>()

  const accountIds = new Set<string>()
  for (const [index, inputAccount] of entries(portfolio.accounts, 'accounts').entries()) {
    const location = `accounts[${index}]`
    const account = strictObject(
      inputAccount,
      ['id', 'name', 'currency', 'createdAt', 'updatedAt'],
      location,
    )
    const { id } = metadata(account, location, allIds, portfolioCreatedAt)
    name(account.name, `${location}.name`)
    currency(account.currency, reportingCurrency, `${location}.currency`)
    accountIds.add(id)
  }

  const instrumentIds = new Set<string>()
  const isinIdentities = new Set<string>()
  const namedInstrumentIdentities = new Set<string>()
  for (const [index, inputInstrument] of entries(portfolio.instruments, 'instruments').entries()) {
    const location = `instruments[${index}]`
    const instrument = strictObject(
      inputInstrument,
      ['id', 'name', 'kind', 'isin', 'createdAt', 'updatedAt'],
      location,
    )
    const { id } = metadata(instrument, location, allIds, portfolioCreatedAt)
    const instrumentName = name(instrument.name, `${location}.name`)
    if (instrument.kind !== 'stock' && instrument.kind !== 'etf') {
      throw new Error(`${location}.kind must be stock or etf`)
    }
    if (instrument.isin !== null) {
      const isin = requiredString(instrument.isin, `${location}.isin`)
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) {
        throw new Error(`${location}.isin must be an uppercase 12-character ISIN`)
      }
      uniqueIdentity(isin, isinIdentities, 'instrument ISIN')
    }
    uniqueIdentity(
      `${instrument.kind}\u0000${instrumentName.toLocaleLowerCase('en')}`,
      namedInstrumentIdentities,
      'instrument name and kind',
    )
    instrumentIds.add(id)
  }

  const listingIds = new Set<string>()
  const listingIdentities = new Set<string>()
  for (const [index, inputListing] of entries(portfolio.listings, 'listings').entries()) {
    const location = `listings[${index}]`
    const listing = strictObject(
      inputListing,
      ['id', 'instrumentId', 'symbol', 'exchange', 'currency', 'createdAt', 'updatedAt'],
      location,
    )
    const { id } = metadata(listing, location, allIds, portfolioCreatedAt)
    const instrumentId = requiredString(listing.instrumentId, `${location}.instrumentId`)
    if (!instrumentIds.has(instrumentId)) {
      throw new Error(`${location}.instrumentId references a missing instrument`)
    }
    const symbol = name(listing.symbol, `${location}.symbol`)
    const exchange = name(listing.exchange, `${location}.exchange`)
    currency(listing.currency, reportingCurrency, `${location}.currency`)
    uniqueIdentity(
      `${symbol.toLocaleUpperCase('en')}\u0000${exchange.toLocaleUpperCase('en')}\u0000${reportingCurrency}`,
      listingIdentities,
      'listing identity',
    )
    listingIds.add(id)
  }

  const holdingIds = new Set<string>()
  const holdingIdentities = new Set<string>()
  for (const [index, inputHolding] of entries(portfolio.holdings, 'holdings').entries()) {
    const location = `holdings[${index}]`
    const holding = strictObject(
      inputHolding,
      ['id', 'accountId', 'listingId', 'createdAt', 'updatedAt'],
      location,
    )
    const { id } = metadata(holding, location, allIds, portfolioCreatedAt)
    const accountId = requiredString(holding.accountId, `${location}.accountId`)
    const listingId = requiredString(holding.listingId, `${location}.listingId`)
    if (!accountIds.has(accountId) || !listingIds.has(listingId)) {
      throw new Error(`${location} references a missing account or listing`)
    }
    uniqueIdentity(
      `${accountId}\u0000${listingId}`,
      holdingIdentities,
      'holding account and listing',
    )
    holdingIds.add(id)
  }

  const recordIds = new Set<string>()
  for (const [index, inputRecord] of entries(portfolio.records, 'records').entries()) {
    const location = `records[${index}]`
    const record = strictObject(
      inputRecord,
      ['id', 'name', 'category', 'currency', 'createdAt', 'updatedAt'],
      location,
    )
    const { id } = metadata(record, location, allIds, portfolioCreatedAt)
    name(record.name, `${location}.name`)
    if (!recordCategories.has(record.category as RecordCategory)) {
      throw new Error(`${location}.category is not supported`)
    }
    currency(record.currency, reportingCurrency, `${location}.currency`)
    recordIds.add(id)
  }

  const observedCash = new Set<string>()
  const observedQuantities = new Set<string>()
  const observedValuations = new Set<string>()
  const observationDates = new Set<string>()
  const today = localToday()
  for (const [index, inputObservation] of entries(
    portfolio.observations,
    'observations',
  ).entries()) {
    const location = `observations[${index}]`
    const observation = strictObject(
      inputObservation,
      ['id', 'kind', 'subjectId', 'effectiveDate', 'amount', 'recordedAt'],
      location,
    )
    uuid(observation.id, `${location}.id`, allIds)
    if (!observationKinds.has(observation.kind as ObservationKind)) {
      throw new Error(`${location}.kind is not supported`)
    }
    const kind = observation.kind as ObservationKind
    const subjectId = requiredString(observation.subjectId, `${location}.subjectId`)
    const subjects =
      kind === 'cash'
        ? accountIds
        : kind === 'quantity'
          ? holdingIds
          : kind === 'price'
            ? listingIds
            : recordIds
    if (!subjects.has(subjectId)) {
      throw new Error(`${location}.subjectId references a missing ${kind} subject`)
    }
    const effectiveDate = requiredString(observation.effectiveDate, `${location}.effectiveDate`)
    if (!isLocalDate(effectiveDate) || effectiveDate > today) {
      throw new Error(`${location}.effectiveDate must be a valid current or past local date`)
    }
    const amount = requiredString(observation.amount, `${location}.amount`)
    if (amount !== amount.trim()) {
      throw new Error(`${location}.amount has surrounding whitespace`)
    }
    try {
      normalizeAmount(amount, kind === 'cash')
    } catch (error) {
      throw new Error(`${location}.amount: ${(error as Error).message}`)
    }
    timestamp(observation.recordedAt, `${location}.recordedAt`)
    uniqueIdentity(
      `${kind}\u0000${subjectId}\u0000${effectiveDate}`,
      observationDates,
      'observation kind, subject, and date',
    )
    if (kind === 'cash') observedCash.add(subjectId)
    if (kind === 'quantity') observedQuantities.add(subjectId)
    if (kind === 'valuation') observedValuations.add(subjectId)
  }

  for (const accountId of accountIds) {
    if (requireObservations && !observedCash.has(accountId))
      throw new Error(`Account ${accountId} needs a cash observation`)
  }
  for (const holdingId of holdingIds) {
    if (requireObservations && !observedQuantities.has(holdingId))
      throw new Error(`Holding ${holdingId} needs a quantity observation`)
  }
  for (const recordId of recordIds) {
    if (requireObservations && !observedValuations.has(recordId))
      throw new Error(`Record ${recordId} needs a valuation observation`)
  }

  return input as Portfolio
}
