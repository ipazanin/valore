import 'fake-indexeddb/auto'
import Dexie, { type Observer } from 'dexie'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseBackup } from '../../backup/backup'
import { createEmptyPortfolio } from '../domain/portfolio'
import { portfolioRepository, type PortfolioState } from '../persistence/repository'
import { usePortfolioStore } from './store'

let store: ReturnType<typeof usePortfolioStore>

beforeEach(async () => {
  setActivePinia(createPinia())
  store = usePortfolioStore()
  await portfolioRepository.database.open()
})

afterEach(async () => {
  store.$dispose()
  portfolioRepository.close()
  await Dexie.delete('valore')
})

it('ignores old subscription snapshots and errors after a completed restore', async () => {
  const observers: Observer<PortfolioState>[] = []
  const observable = portfolioRepository.observeState()
  vi.spyOn(portfolioRepository, 'observeState').mockReturnValue(observable)
  vi.spyOn(observable, 'subscribe').mockImplementation((
    observer?: Observer<PortfolioState> | ((snapshot: PortfolioState) => void) | null,
  ) => {
    if (observer && typeof observer === 'object') observers.push(observer)
    return { unsubscribe: vi.fn(), closed: false }
  })
  await store.load()
  await store.initialize('EUR')
  const oldObserver = observers.at(-1)!
  const original = await portfolioRepository.readState()
  await store.restore(parseBackup(await store.exportJson()))
  const restored = await portfolioRepository.readState()
  expect(restored.epoch).not.toBe(original.epoch)

  oldObserver.next?.(original)
  oldObserver.error?.(new Error('Late query failure'))
  expect(store.portfolioEpoch).toBe(restored.epoch)
  expect(store.portfolio).toEqual(restored.portfolio)
  expect(store.error).toBeNull()
  await store.saveTheme('dark')
  expect((await portfolioRepository.read())!.settings.theme).toBe('dark')

  const currentObserver = observers.at(-1)!
  await portfolioRepository.replace(createEmptyPortfolio('USD'))
  const externalReplacement = await portfolioRepository.readState()
  currentObserver.next?.(externalReplacement)
  expect(store.portfolioEpoch).toBe(externalReplacement.epoch)
  expect(store.portfolio!.settings.reportingCurrency).toBe('USD')
  currentObserver.error?.(new Error('Current query failure'))
  expect(store.error).toBe('Current query failure')
  await expect(store.saveTheme('light')).rejects.toThrow(/has not loaded successfully/)
})

it('does not restart observation when a pending save completes after disposal', async () => {
  await store.load()
  await store.initialize('EUR')
  const snapshot = await portfolioRepository.readState()
  const observe = vi.spyOn(portfolioRepository, 'observeState')
  let finishWrite!: (saved: PortfolioState) => void
  vi.spyOn(portfolioRepository, 'updateState').mockImplementation(() =>
    new Promise<PortfolioState>((resolve) => { finishWrite = resolve }),
  )
  const save = store.saveTheme('dark')
  store.$dispose()
  finishWrite(snapshot)
  await save
  expect(observe).not.toHaveBeenCalled()
})
