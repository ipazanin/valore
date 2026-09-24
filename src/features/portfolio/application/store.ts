import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { parseBackup, serializeBackup, type Backup } from '../../backup/backup'
import { calculateOverview } from '../domain/calculations'
import { normalizeAmount } from '../domain/decimal'
import {
  correctObservation,
  deleteObservation as removeObservation,
  recordObservation,
} from '../domain/observations'
import { createEmptyPortfolio } from '../domain/portfolio'
import type {
  Instrument,
  Listing,
  ObservationKind,
  Portfolio,
  RecordCategory,
} from '../domain/types'
import { portfolioRepository } from '../persistence/repository'

interface AccountDraft {
  id?: string
  expectedPortfolioEpoch: string
  effectiveDate?: string
  name: string
  cash: string
}

interface RecordDraft {
  id?: string
  expectedPortfolioEpoch: string
  effectiveDate?: string
  name: string
  category: RecordCategory
  amount: string
}

interface HoldingDraft {
  id?: string
  expectedPortfolioEpoch: string
  effectiveDate?: string
  accountId: string
  listingId?: string
  name: string
  kind: 'stock' | 'etf'
  isin: string | null
  symbol: string
  exchange: string
  quantity: string
  price: string
}

interface ObservationDraft {
  id?: string
  expectedPortfolioEpoch: string
  kind: ObservationKind
  subjectId: string
  effectiveDate: string
  amount: string
}

function requiredName(input: string, description: string): string {
  const name = input.trim()
  if (!name) {
    throw new Error(`${description} is required.`)
  }
  return name
}

function requirePortfolio(current: Portfolio | null): Portfolio {
  if (!current) {
    throw new Error('Set up or restore a portfolio before adding records.')
  }
  return current
}

function requireExpectedEpoch(epoch: string): void {
  if (!epoch) {
    throw new Error('Reopen the form to save against the current portfolio.')
  }
}

function sameInstrument(
  instrument: Instrument,
  draft: HoldingDraft,
  name: string,
  isin: string | null,
): boolean {
  return (
    instrument.kind === draft.kind &&
    instrument.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en') &&
    instrument.isin === isin
  )
}

function sameListing(listing: Listing, draft: HoldingDraft, currency: string): boolean {
  return (
    listing.symbol.toLocaleUpperCase('en') === draft.symbol.trim().toLocaleUpperCase('en') &&
    listing.exchange.toLocaleUpperCase('en') === draft.exchange.trim().toLocaleUpperCase('en') &&
    listing.currency === currency
  )
}

function findOrCreateListing(
  portfolio: Portfolio,
  draft: HoldingDraft,
  name: string,
  isin: string | null,
): Listing {
  const currency = portfolio.settings.reportingCurrency
  const selected = draft.listingId
    ? portfolio.listings.find((listing) => listing.id === draft.listingId)
    : undefined
  if (draft.listingId && !selected) {
    throw new Error('The selected listing no longer exists.')
  }
  const matchingListing =
    selected ?? portfolio.listings.find((listing) => sameListing(listing, draft, currency))
  if (matchingListing) {
    const instrument = portfolio.instruments.find(
      (candidate) => candidate.id === matchingListing.instrumentId,
    )
    if (
      !instrument ||
      !sameListing(matchingListing, draft, currency) ||
      !sameInstrument(instrument, draft, name, isin)
    ) {
      throw new Error(
        'Listing details conflict with an existing investment. Select its saved details instead.',
      )
    }
    return matchingListing
  }

  const instrumentByIsin = isin
    ? portfolio.instruments.find((candidate) => candidate.isin === isin)
    : undefined
  const instrumentByName = portfolio.instruments.find(
    (candidate) =>
      candidate.kind === draft.kind &&
      candidate.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'),
  )
  for (const candidate of [instrumentByIsin, instrumentByName]) {
    if (candidate && !sameInstrument(candidate, draft, name, isin)) {
      throw new Error('Instrument details conflict with an existing investment.')
    }
  }

  const now = new Date().toISOString()
  let instrument = instrumentByIsin ?? instrumentByName
  if (!instrument) {
    instrument = {
      id: crypto.randomUUID(),
      name,
      kind: draft.kind,
      isin,
      createdAt: now,
      updatedAt: now,
    }
    portfolio.instruments.push(instrument)
  }
  const listing: Listing = {
    id: crypto.randomUUID(),
    instrumentId: instrument.id,
    symbol: requiredName(draft.symbol, 'Symbol'),
    exchange: requiredName(draft.exchange, 'Exchange'),
    currency,
    createdAt: now,
    updatedAt: now,
  }
  portfolio.listings.push(listing)
  return listing
}

export const usePortfolioStore = defineStore('portfolio', () => {
  const portfolio = shallowRef<Portfolio | null>(null)
  const portfolioEpoch = ref<string | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const overview = computed(() => (portfolio.value ? calculateOverview(portfolio.value) : null))
  let loaded = false
  let pendingSaves = 0
  let unsubscribe: (() => void) | null = null
  onScopeDispose(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  async function load(): Promise<void> {
    loading.value = true
    loaded = false
    unsubscribe?.()
    unsubscribe = null
    try {
      const snapshot = await portfolioRepository.readState()
      portfolio.value = snapshot.portfolio
      portfolioEpoch.value = snapshot.epoch
      error.value = null
      loaded = true
      const subscription = portfolioRepository.observeState().subscribe({
        next: (snapshot) => {
          portfolio.value = snapshot.portfolio
          portfolioEpoch.value = snapshot.epoch
        },
        error: (cause: unknown) => {
          loaded = false
          error.value = messageFor(cause)
        },
      })
      unsubscribe = () => subscription.unsubscribe()
    } catch (cause) {
      portfolio.value = null
      portfolioEpoch.value = null
      error.value = messageFor(cause)
    } finally {
      loading.value = false
    }
  }

  async function save(
    change: (current: Portfolio | null) => Portfolio,
    expectedEpoch?: string | null,
    replace = false,
  ): Promise<void> {
    if (!loaded) {
      const failure = new Error('Portfolio storage has not loaded successfully.')
      error.value = failure.message
      throw failure
    }
    pendingSaves += 1
    saving.value = true
    error.value = null
    try {
      const snapshot = await portfolioRepository.updateState(change, expectedEpoch, replace)
      portfolio.value = snapshot.portfolio
      portfolioEpoch.value = snapshot.epoch
    } catch (cause) {
      error.value = messageFor(cause)
      throw cause
    } finally {
      pendingSaves -= 1
      saving.value = pendingSaves > 0
    }
  }

  async function initialize(currency: string): Promise<void> {
    await save((current) => {
      if (current) {
        throw new Error('A portfolio already exists. Restore a backup to replace it.')
      }
      return createEmptyPortfolio(currency)
    })
  }

  async function saveAccount(draft: AccountDraft): Promise<void> {
    await save((current) => {
      requireExpectedEpoch(draft.expectedPortfolioEpoch)
      const name = requiredName(draft.name, 'Account name')
      const cash = normalizeAmount(draft.cash, true)
      const snapshot = requirePortfolio(current)
      const now = new Date().toISOString()
      if (draft.id) {
        const account = snapshot.accounts.find((candidate) => candidate.id === draft.id)
        if (!account) {
          throw new Error('This account no longer exists.')
        }
        account.name = name
        account.updatedAt = now
        recordObservation(snapshot, 'cash', account.id, cash, draft.effectiveDate)
      } else {
        const id = crypto.randomUUID()
        snapshot.accounts.push({
          id,
          name,
          currency: snapshot.settings.reportingCurrency,
          createdAt: now,
          updatedAt: now,
        })
        recordObservation(snapshot, 'cash', id, cash, draft.effectiveDate)
      }
      return snapshot
    }, draft.expectedPortfolioEpoch)
  }

  async function saveRecord(draft: RecordDraft): Promise<void> {
    await save((current) => {
      requireExpectedEpoch(draft.expectedPortfolioEpoch)
      const name = requiredName(draft.name, 'Record name')
      const amount = normalizeAmount(draft.amount)
      const snapshot = requirePortfolio(current)
      const now = new Date().toISOString()
      if (draft.id) {
        const record = snapshot.records.find((candidate) => candidate.id === draft.id)
        if (!record) {
          throw new Error('This record no longer exists.')
        }
        if (record.category !== draft.category) {
          throw new Error('An existing record’s category cannot be changed.')
        }
        record.name = name
        record.updatedAt = now
        recordObservation(snapshot, 'valuation', record.id, amount, draft.effectiveDate)
      } else {
        const id = crypto.randomUUID()
        snapshot.records.push({
          id,
          name,
          category: draft.category,
          currency: snapshot.settings.reportingCurrency,
          createdAt: now,
          updatedAt: now,
        })
        recordObservation(snapshot, 'valuation', id, amount, draft.effectiveDate)
      }
      return snapshot
    }, draft.expectedPortfolioEpoch)
  }

  async function saveHolding(draft: HoldingDraft): Promise<void> {
    await save((current) => {
      requireExpectedEpoch(draft.expectedPortfolioEpoch)
      const name = requiredName(draft.name, 'Investment name')
      const isin = draft.isin?.trim().toUpperCase() || null
      const quantity = normalizeAmount(draft.quantity)
      const price = draft.price.trim() ? normalizeAmount(draft.price) : null
      const snapshot = requirePortfolio(current)
      if (!snapshot.accounts.some((account) => account.id === draft.accountId)) {
        throw new Error('The selected account no longer exists.')
      }
      let listing: Listing
      let holdingId: string
      if (draft.id) {
        const holding = snapshot.holdings.find((candidate) => candidate.id === draft.id)
        if (!holding) {
          throw new Error('This holding no longer exists.')
        }
        if (
          holding.accountId !== draft.accountId ||
          (draft.listingId && holding.listingId !== draft.listingId)
        ) {
          throw new Error('An existing holding’s account and listing cannot be changed.')
        }
        listing = snapshot.listings.find((candidate) => candidate.id === holding.listingId)!
        const instrument = snapshot.instruments.find(
          (candidate) => candidate.id === listing.instrumentId,
        )!
        if (
          !sameListing(listing, draft, snapshot.settings.reportingCurrency) ||
          !sameInstrument(instrument, draft, name, isin)
        ) {
          throw new Error('An existing holding’s investment details cannot be changed.')
        }
        holdingId = holding.id
        holding.updatedAt = new Date().toISOString()
      } else {
        listing = findOrCreateListing(snapshot, draft, name, isin)
        if (
          snapshot.holdings.some(
            (holding) => holding.accountId === draft.accountId && holding.listingId === listing.id,
          )
        ) {
          throw new Error('This account already contains that listing. Edit its holding instead.')
        }
        const now = new Date().toISOString()
        holdingId = crypto.randomUUID()
        snapshot.holdings.push({
          id: holdingId,
          accountId: draft.accountId,
          listingId: listing.id,
          createdAt: now,
          updatedAt: now,
        })
      }
      recordObservation(snapshot, 'quantity', holdingId, quantity, draft.effectiveDate)
      if (price !== null) {
        recordObservation(snapshot, 'price', listing.id, price, draft.effectiveDate)
      }
      return snapshot
    }, draft.expectedPortfolioEpoch)
  }

  async function saveObservation(draft: ObservationDraft): Promise<void> {
    await save((current) => {
      requireExpectedEpoch(draft.expectedPortfolioEpoch)
      const snapshot = requirePortfolio(current)
      if (draft.id) {
        const observation = snapshot.observations.find((candidate) => candidate.id === draft.id)
        if (!observation) {
          throw new Error('This observation no longer exists.')
        }
        if (observation.kind !== draft.kind || observation.subjectId !== draft.subjectId) {
          throw new Error('An observation’s kind and subject cannot be changed.')
        }
        correctObservation(snapshot, draft.id, draft.effectiveDate, draft.amount)
      } else {
        recordObservation(snapshot, draft.kind, draft.subjectId, draft.amount, draft.effectiveDate)
      }
      return snapshot
    }, draft.expectedPortfolioEpoch)
  }

  async function deleteObservation(id: string, expectedPortfolioEpoch: string): Promise<void> {
    await save((current) => {
      requireExpectedEpoch(expectedPortfolioEpoch)
      const snapshot = requirePortfolio(current)
      removeObservation(snapshot, id)
      return snapshot
    }, expectedPortfolioEpoch)
  }

  async function restore(backup: Backup): Promise<void> {
    await save(() => parseBackup(JSON.stringify(backup)).portfolio, portfolioEpoch.value, true)
  }

  async function exportJson(): Promise<string> {
    if (!loaded) {
      throw new Error('Portfolio storage has not loaded successfully.')
    }
    try {
      const snapshot = await portfolioRepository.read()
      if (!snapshot) {
        throw new Error('Set up or restore a portfolio before exporting.')
      }
      return serializeBackup(snapshot)
    } catch (cause) {
      error.value = messageFor(cause)
      throw cause
    }
  }

  return {
    portfolio,
    portfolioEpoch,
    loading,
    saving,
    error,
    overview,
    load,
    initialize,
    saveAccount,
    saveRecord,
    saveHolding,
    saveObservation,
    deleteObservation,
    restore,
    exportJson,
  }
})

function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Portfolio storage failed.'
}
