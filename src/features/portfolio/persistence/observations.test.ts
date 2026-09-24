import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { parseBackup } from '../../backup/backup'
import { usePortfolioStore } from '../application/store'
import { calculateOverview, holdingValue, latestObservation } from '../domain/calculations'
import { portfolioRepository } from './repository'

let store: ReturnType<typeof usePortfolioStore>

beforeEach(async () => {
  setActivePinia(createPinia())
  store = usePortfolioStore()
  await portfolioRepository.database.open()
  await store.load()
  await store.initialize('EUR')
})

afterEach(async () => {
  store.$dispose()
  portfolioRepository.close()
  await Dexie.delete('valore')
})

it('persists every kind of backdated update and round trips complete history', async () => {
  const expectedPortfolioEpoch = store.portfolioEpoch!
  await store.saveAccount({
    expectedPortfolioEpoch,
    name: 'Broker',
    cash: '100',
    effectiveDate: '2020-01-01',
  })
  const accountId = store.portfolio!.accounts[0]!.id
  await store.saveAccount({
    expectedPortfolioEpoch,
    id: accountId,
    name: 'Broker',
    cash: '200',
    effectiveDate: '2020-03-01',
  })
  await store.saveRecord({
    expectedPortfolioEpoch,
    name: 'House',
    category: 'property',
    amount: '1000',
    effectiveDate: '2020-01-01',
  })
  await store.saveHolding({
    expectedPortfolioEpoch,
    accountId,
    name: 'Example Fund',
    kind: 'etf',
    isin: null,
    symbol: 'EXMP',
    exchange: 'XETRA',
    quantity: '1.5',
    price: '10',
    effectiveDate: '2020-02-01',
  })
  const holding = store.portfolio!.holdings[0]!
  const quantitiesBeforePrice = structuredClone(
    store.portfolio!.observations.filter((observation) => observation.kind === 'quantity'),
  )
  await store.saveObservation({
    expectedPortfolioEpoch,
    kind: 'price',
    subjectId: holding.listingId,
    amount: '12',
    effectiveDate: '2020-02-15',
  })
  expect(
    store.portfolio!.observations.filter((observation) => observation.kind === 'quantity'),
  ).toEqual(quantitiesBeforePrice)
  await store.saveObservation({
    expectedPortfolioEpoch,
    kind: 'quantity',
    subjectId: holding.id,
    amount: '2',
    effectiveDate: '2020-03-01',
  })
  await store.saveObservation({
    expectedPortfolioEpoch,
    kind: 'cash',
    subjectId: accountId,
    amount: '125',
    effectiveDate: '2020-02-01',
  })
  const saved = (await portfolioRepository.read())!
  expect(latestObservation(saved, 'cash', accountId, '2020-02-15')?.amount).toBe('125')
  expect(latestObservation(saved, 'cash', accountId, '2020-03-15')?.amount).toBe('200')
  expect(holdingValue(saved, holding.id, '2020-01-15')).toBe('0')
  expect(holdingValue(saved, holding.id, '2020-02-15')).toBe('18')
  expect(calculateOverview(saved, '2020-03-15').assets).toBe('1224')
  const backup = parseBackup(await store.exportJson())
  expect(backup.portfolio).toEqual(saved)
  await store.restore(backup)
  expect(await portfolioRepository.read()).toEqual(saved)
})

it('rejects collisions atomically and persists date corrections and deletion', async () => {
  const expectedPortfolioEpoch = store.portfolioEpoch!
  await store.saveAccount({
    expectedPortfolioEpoch,
    name: 'Checking',
    cash: '10',
    effectiveDate: '2020-01-01',
  })
  const subjectId = store.portfolio!.accounts[0]!.id
  const id = store.portfolio!.observations[0]!.id
  await store.saveObservation({
    expectedPortfolioEpoch,
    kind: 'cash',
    subjectId,
    amount: '30',
    effectiveDate: '2020-03-01',
  })
  const original = await portfolioRepository.read()
  await expect(store.saveObservation({
    expectedPortfolioEpoch,
    id,
    kind: 'cash',
    subjectId,
    amount: '99',
    effectiveDate: '2020-03-01',
  })).rejects.toThrow(/already exists/)
  expect(await portfolioRepository.read()).toEqual(original)
  await store.saveObservation({
    expectedPortfolioEpoch,
    id,
    kind: 'cash',
    subjectId,
    amount: '-15',
    effectiveDate: '2020-02-01',
  })
  expect(latestObservation(store.portfolio!, 'cash', subjectId, '2020-01-15')).toBeUndefined()
  expect(latestObservation(store.portfolio!, 'cash', subjectId, '2020-02-15')?.amount).toBe('-15')
  await store.deleteObservation(id, expectedPortfolioEpoch)
  expect((await portfolioRepository.read())!.observations).toHaveLength(1)
  expect(latestObservation(store.portfolio!, 'cash', subjectId)?.amount).toBe('30')
})

it('rejects stale history saves and deletions after a portfolio replacement', async () => {
  const expectedPortfolioEpoch = store.portfolioEpoch!
  await store.saveAccount({
    expectedPortfolioEpoch,
    name: 'Checking',
    cash: '10',
    effectiveDate: '2020-01-01',
  })
  const observation = store.portfolio!.observations[0]!
  await store.restore(parseBackup(await store.exportJson()))
  const replaced = await portfolioRepository.read()
  await expect(store.saveObservation({
    ...observation,
    amount: '20',
    expectedPortfolioEpoch,
  })).rejects.toThrow(/replaced in another tab/)
  await expect(store.deleteObservation(observation.id, expectedPortfolioEpoch)).rejects.toThrow(
    /replaced in another tab/,
  )
  await expect(store.deleteObservation(observation.id, '')).rejects.toThrow(/Reopen the form/)
  expect(await portfolioRepository.read()).toEqual(replaced)
})

it('persists empty histories while preserving records and backup compatibility', async () => {
  const expectedPortfolioEpoch = store.portfolioEpoch!
  await store.saveAccount({
    expectedPortfolioEpoch,
    name: 'Broker',
    cash: '0',
    effectiveDate: '2020-01-01',
  })
  await store.saveRecord({
    expectedPortfolioEpoch,
    name: 'House',
    category: 'property',
    amount: '1000',
    effectiveDate: '2020-01-01',
  })
  await store.saveHolding({
    expectedPortfolioEpoch,
    accountId: store.portfolio!.accounts[0]!.id,
    name: 'Example Fund',
    kind: 'etf',
    isin: null,
    symbol: 'EXMP',
    exchange: 'XETRA',
    quantity: '1',
    price: '10',
    effectiveDate: '2020-01-01',
  })
  const original = structuredClone(store.portfolio!)
  for (const observation of original.observations) {
    await store.deleteObservation(observation.id, expectedPortfolioEpoch)
  }
  expect(await portfolioRepository.read()).toEqual({ ...original, observations: [] })
  const backup = parseBackup(await store.exportJson())
  await store.restore(backup)
  expect(await portfolioRepository.read()).toEqual({ ...original, observations: [] })
})
