import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createBackup } from '../../backup/backup'
import { usePortfolioStore } from '../application/store'
import { localToday } from '../domain/dates'
import { createEmptyPortfolio } from '../domain/portfolio'
import type { Portfolio } from '../domain/types'
import { PortfolioRepository, portfolioRepository } from './repository'

const databases: PortfolioRepository[] = []
const databaseNames: string[] = []

function repository(databaseName = `valore-test-${crypto.randomUUID()}`): PortfolioRepository {
  databaseNames.push(databaseName)
  const portfolioRepository = new PortfolioRepository(databaseName)
  databases.push(portfolioRepository)
  return portfolioRepository
}

function portfolioWithAccount(name = 'Checking'): Portfolio {
  const portfolio = createEmptyPortfolio('EUR')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  portfolio.accounts.push({ id, name, currency: 'EUR', createdAt: now, updatedAt: now })
  portfolio.observations.push({
    id: crypto.randomUUID(),
    kind: 'cash',
    subjectId: id,
    effectiveDate: localToday(),
    amount: '12',
    recordedAt: now,
  })
  return portfolio
}

afterEach(async () => {
  for (const current of databases) current.close()
  await Promise.all(databaseNames.map((name) => Dexie.delete(name)))
  databases.length = 0
  databaseNames.length = 0
})

it('keeps every table and setting after closing and reopening the database', async () => {
  const name = `valore-test-${crypto.randomUUID()}`
  const original = repository(name)
  const portfolio = portfolioWithAccount()
  const now = new Date().toISOString()
  const instrumentId = crypto.randomUUID()
  const listingId = crypto.randomUUID()
  const holdingId = crypto.randomUUID()
  const recordId = crypto.randomUUID()
  portfolio.instruments.push({
    id: instrumentId,
    name: 'Fund',
    kind: 'etf',
    isin: null,
    createdAt: now,
    updatedAt: now,
  })
  portfolio.listings.push({
    id: listingId,
    instrumentId,
    symbol: 'FUND',
    exchange: 'XETRA',
    currency: 'EUR',
    createdAt: now,
    updatedAt: now,
  })
  portfolio.holdings.push({
    id: holdingId,
    accountId: portfolio.accounts[0]!.id,
    listingId,
    createdAt: now,
    updatedAt: now,
  })
  portfolio.records.push({
    id: recordId,
    name: 'Home',
    category: 'property',
    currency: 'EUR',
    createdAt: now,
    updatedAt: now,
  })
  portfolio.observations.push(
    {
      id: crypto.randomUUID(),
      kind: 'quantity',
      subjectId: holdingId,
      effectiveDate: localToday(),
      amount: '1.25',
      recordedAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'price',
      subjectId: listingId,
      effectiveDate: localToday(),
      amount: '40',
      recordedAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'valuation',
      subjectId: recordId,
      effectiveDate: localToday(),
      amount: '200000',
      recordedAt: now,
    },
  )

  await original.replace(portfolio)
  original.close()
  const reopened = repository(name)
  const restored = (await reopened.read())!
  expect({ ...restored, observations: [] }).toEqual({ ...portfolio, observations: [] })
  expect(restored.observations).toHaveLength(portfolio.observations.length)
  expect(restored.observations).toEqual(expect.arrayContaining(portfolio.observations))
})

it('rolls back every earlier table write when a later IndexedDB write fails', async () => {
  const current = repository()
  const original = portfolioWithAccount()
  await current.replace(original)
  const replacement = portfolioWithAccount('Replacement')
  current.database.observations.hook('creating', () => {
    throw new Error('injected write failure')
  })

  await expect(current.replace(replacement)).rejects.toThrow('injected write failure')
  expect(await current.read()).toEqual(original)
})

it('rejects an invalid replacement without touching the saved portfolio', async () => {
  const current = repository()
  const original = portfolioWithAccount()
  await current.replace(original)
  const invalid = structuredClone(original)
  invalid.observations[0]!.subjectId = crypto.randomUUID()

  await expect(current.replace(invalid)).rejects.toThrow(/missing cash subject/)
  expect(await current.read()).toEqual(original)
})

it('merges edits made from separate repository instances against a fresh transaction snapshot', async () => {
  const name = `valore-test-${crypto.randomUUID()}`
  const first = repository(name)
  const second = repository(name)
  await first.replace(createEmptyPortfolio('EUR'))
  const addAccount =
    (accountName: string) =>
    (current: Portfolio | null): Portfolio => {
      if (!current) throw new Error('missing portfolio')
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      current.accounts.push({
        id,
        name: accountName,
        currency: 'EUR',
        createdAt: now,
        updatedAt: now,
      })
      current.observations.push({
        id: crypto.randomUUID(),
        kind: 'cash',
        subjectId: id,
        effectiveDate: localToday(),
        amount: '1',
        recordedAt: now,
      })
      return current
    }

  await Promise.all([first.update(addAccount('First')), second.update(addAccount('Second'))])
  expect((await first.read())?.accounts.map((account) => account.name).sort()).toEqual([
    'First',
    'Second',
  ])
})

it('replaces only today’s observation and retains an earlier dated balance', async () => {
  await Dexie.delete('valore')
  setActivePinia(createPinia())
  const store = usePortfolioStore()
  const now = new Date().toISOString()
  await portfolioRepository.database.accounts.put({
    id: crypto.randomUUID(),
    name: 'Orphaned',
    currency: 'EUR',
    createdAt: now,
    updatedAt: now,
  })
  await store.load()
  expect(store.error).toMatch(/settings are missing/)
  await expect(store.initialize('EUR')).rejects.toThrow(/has not loaded successfully/)
  await portfolioRepository.database.accounts.clear()
  await store.load()
  expect(store.error).toBeNull()
  await expect(store.initialize('BAD')).rejects.toThrow(/Unsupported currency/)
  expect(store.portfolio).toBeNull()
  expect(store.error).toMatch(/Unsupported currency/)
  await store.initialize('EUR')
  expect(store.error).toBeNull()
  await store.saveAccount({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    name: 'Checking',
    cash: '10',
  })
  const original = await portfolioRepository.read()
  const invalidBackup = createBackup(original!)
  invalidBackup.portfolio = structuredClone(original!)
  invalidBackup.portfolio.observations[0]!.subjectId = crypto.randomUUID()
  await expect(store.restore(invalidBackup)).rejects.toThrow(/missing cash subject/)
  expect(await portfolioRepository.read()).toEqual(original)

  const accountId = store.portfolio!.accounts[0]!.id
  const earlierDate = localToday(new Date(Date.now() - 48 * 60 * 60 * 1000))
  await portfolioRepository.update((current) => {
    if (!current) throw new Error('missing portfolio')
    current.observations.push({
      id: crypto.randomUUID(),
      kind: 'cash',
      subjectId: accountId,
      effectiveDate: earlierDate,
      amount: '5',
      recordedAt: new Date().toISOString(),
    })
    return current
  })

  await store.saveAccount({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    id: accountId,
    name: 'Checking',
    cash: '20',
  })
  await store.saveAccount({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    id: accountId,
    name: 'Checking',
    cash: '30',
  })
  const observations = (await portfolioRepository.read())!.observations.filter(
    (observation) => observation.subjectId === accountId,
  )
  expect(observations).toHaveLength(2)
  expect(
    observations.find((observation) => observation.effectiveDate === earlierDate)?.amount,
  ).toBe('5')
  expect(
    observations.find((observation) => observation.effectiveDate === localToday())?.amount,
  ).toBe('30')
  await store.saveAccount({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    name: 'Brokerage',
    cash: '0',
  })
  const brokerageId = store.portfolio!.accounts.find((account) => account.name === 'Brokerage')!.id
  await store.saveHolding({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    accountId,
    name: 'Example Fund',
    kind: 'etf',
    isin: null,
    symbol: 'EXMP',
    exchange: 'XETRA',
    quantity: '1.5',
    price: '40',
  })
  const savedListing = store.portfolio!.listings[0]!
  await store.saveHolding({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    accountId: brokerageId,
    listingId: savedListing.id,
    name: 'Example Fund',
    kind: 'etf',
    isin: null,
    symbol: 'EXMP',
    exchange: 'XETRA',
    quantity: '2',
    price: '',
  })
  await store.saveAccount({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    name: 'Retirement',
    cash: '0',
  })
  const retirementId = store.portfolio!.accounts.find(
    (account) => account.name === 'Retirement',
  )!.id
  await store.saveHolding({
    expectedPortfolioEpoch: store.portfolioEpoch!,
    accountId: retirementId,
    name: 'example fund',
    kind: 'etf',
    isin: null,
    symbol: 'exmp',
    exchange: 'xetra',
    quantity: '3',
    price: '42',
  })
  const saved = (await portfolioRepository.read())!
  expect(saved.instruments).toHaveLength(1)
  expect(saved.listings).toHaveLength(1)
  expect(saved.holdings).toHaveLength(3)
  expect(saved.observations.filter((observation) => observation.kind === 'price')).toHaveLength(1)
  expect(saved.observations.find((observation) => observation.kind === 'price')?.amount).toBe('42')
  const otherTab = new PortfolioRepository('valore')
  await otherTab.update((current) => {
    if (!current) throw new Error('missing portfolio')
    current.accounts.find((account) => account.id === brokerageId)!.name = 'Brokerage updated'
    return current
  })
  await vi.waitFor(() => {
    expect(store.portfolio?.accounts.find((account) => account.id === brokerageId)?.name).toBe(
      'Brokerage updated',
    )
  })
  const staleEpoch = store.portfolioEpoch!
  const replacement = structuredClone((await otherTab.read())!)
  replacement.settings.reportingCurrency = 'USD'
  for (const account of replacement.accounts) account.currency = 'USD'
  for (const listing of replacement.listings) listing.currency = 'USD'
  await otherTab.replace(replacement)
  await vi.waitFor(() => expect(store.portfolioEpoch).not.toBe(staleEpoch))
  await expect(
    store.saveAccount({
      expectedPortfolioEpoch: staleEpoch,
      id: accountId,
      name: 'Checking',
      cash: '100',
    }),
  ).rejects.toThrow(/replaced in another tab/)
  const afterRestore = (await otherTab.read())!
  expect(afterRestore.settings.reportingCurrency).toBe('USD')
  expect(
    afterRestore.observations.find(
      (observation) =>
        observation.kind === 'cash' &&
        observation.subjectId === accountId &&
        observation.effectiveDate === localToday(),
    )?.amount,
  ).toBe('30')
  otherTab.close()
  store.$dispose()
  portfolioRepository.close()
  await Dexie.delete('valore')
})
