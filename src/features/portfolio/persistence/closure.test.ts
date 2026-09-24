import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { parseBackup } from '../../backup/backup'
import { usePortfolioStore } from '../application/store'
import { calculateOverview } from '../domain/calculations'
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

async function createClosedAccount() {
  const expectedPortfolioEpoch = store.portfolioEpoch!
  await store.saveAccount({
    expectedPortfolioEpoch, name: 'Broker', cash: '100', effectiveDate: '2020-01-01',
  })
  const accountId = store.portfolio!.accounts[0]!.id
  await store.saveHolding({
    expectedPortfolioEpoch, accountId, name: 'Example Fund', kind: 'etf', isin: null,
    symbol: 'EXMP', exchange: 'XETRA', quantity: '2', price: '10', effectiveDate: '2020-01-01',
  })
  const holdingId = store.portfolio!.holdings[0]!.id
  for (const [kind, subjectId] of [['cash', accountId], ['quantity', holdingId]] as const) {
    await store.saveObservation({
      expectedPortfolioEpoch, kind, subjectId, amount: '0', effectiveDate: '2020-02-01',
    })
  }
  await store.saveClosure('account', accountId, '2020-02-01', expectedPortfolioEpoch)
  return { expectedPortfolioEpoch, accountId, holdingId }
}

it('preserves history and closures across database reopen and backup restore', async () => {
  const { accountId } = await createClosedAccount()
  const saved = (await portfolioRepository.read())!
  expect(calculateOverview(saved, '2020-01-31').assets).toBe('120')
  expect(calculateOverview(saved, '2020-02-01').accounts).toEqual([])
  const backup = parseBackup(await store.exportJson())
  expect(backup.version).toBe(3)
  await store.restore(backup)
  store.$dispose()
  portfolioRepository.close()
  await portfolioRepository.database.open()
  store = usePortfolioStore(createPinia())
  await store.load()
  expect(store.portfolio).toEqual(saved)
  expect(store.portfolio!.accounts.find((account) => account.id === accountId)?.closedOn)
    .toBe('2020-02-01')
})

it('rolls back deletion, correction and movement of zeros required by account closure', async () => {
  const { expectedPortfolioEpoch } = await createClosedAccount()
  const original = (await portfolioRepository.read())!
  const closingObservations = original.observations.filter(
    (observation) => observation.effectiveDate === '2020-02-01',
  )
  for (const observation of closingObservations) {
    await expect(store.deleteObservation(observation.id, expectedPortfolioEpoch))
      .rejects.toThrow(/recorded zero/)
    await expect(store.saveObservation({
      ...observation, expectedPortfolioEpoch, amount: '1',
    })).rejects.toThrow(/recorded zero/)
    await expect(store.saveObservation({
      ...observation, expectedPortfolioEpoch, effectiveDate: '2020-02-02',
    })).rejects.toThrow(/recorded zero/)
    expect(await portfolioRepository.read()).toEqual(original)
    expect(store.portfolio).toEqual(original)
  }
})

it('rejects later account updates atomically and accepts them after removing the closure', async () => {
  const { expectedPortfolioEpoch, accountId } = await createClosedAccount()
  const original = (await portfolioRepository.read())!
  const laterDraft = {
    expectedPortfolioEpoch, id: accountId, name: 'Changed name', cash: '30',
    effectiveDate: '2020-03-01',
  }
  await expect(store.saveAccount(laterDraft)).rejects.toThrow(/after closure/)
  expect(await portfolioRepository.read()).toEqual(original)
  await store.saveClosure('account', accountId, null, expectedPortfolioEpoch)
  await store.saveAccount(laterDraft)
  expect(store.portfolio!.accounts[0]).not.toHaveProperty('closedOn')
  expect(calculateOverview(store.portfolio!, '2020-03-01').assets).toBe('30')
})

it('rejects stale closure changes without modifying the restored portfolio', async () => {
  const { expectedPortfolioEpoch, accountId } = await createClosedAccount()
  await store.restore(parseBackup(await store.exportJson()))
  const restored = await portfolioRepository.read()
  await expect(store.saveClosure('account', accountId, null, expectedPortfolioEpoch))
    .rejects.toThrow(/replaced in another tab/)
  await expect(store.saveClosure('account', accountId, null, ''))
    .rejects.toThrow(/Reopen the form/)
  expect(await portfolioRepository.read()).toEqual(restored)
})

it('rejects imported closure violations without replacing the current portfolio', async () => {
  const { accountId } = await createClosedAccount()
  const original = await portfolioRepository.read()
  const backup = parseBackup(await store.exportJson())
  const zeroCash = backup.portfolio.observations.find(
    (observation) => observation.kind === 'cash' && observation.subjectId === accountId &&
      observation.effectiveDate === '2020-02-01',
  )!
  zeroCash.amount = '1'
  await expect(store.restore(backup)).rejects.toThrow(/recorded zero/)
  expect(await portfolioRepository.read()).toEqual(original)
})
