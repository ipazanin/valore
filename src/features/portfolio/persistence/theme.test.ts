import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { parseBackup } from '../../backup/backup'
import { usePortfolioStore } from '../application/store'
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

it('persists a selected theme across database reopen without changing observations or epoch', async () => {
  const expectedPortfolioEpoch = store.portfolioEpoch!
  await store.saveAccount({
    expectedPortfolioEpoch, name: 'Checking', cash: '10', effectiveDate: '2020-01-01',
  })
  const original = structuredClone(store.portfolio!)
  expect(original.settings).not.toHaveProperty('theme')
  await store.saveTheme('dark')
  store.$dispose()
  portfolioRepository.close()
  await portfolioRepository.database.open()
  store = usePortfolioStore(createPinia())
  await store.load()
  expect(store.portfolio).toEqual({
    ...original, settings: { ...original.settings, theme: 'dark' },
  })
  expect(store.portfolioEpoch).toBe(expectedPortfolioEpoch)
  await store.saveTheme('system')
  expect((await portfolioRepository.read())!.settings.theme).toBe('system')
})

it('restores the exported preference and restores legacy backups to the absent system default', async () => {
  await store.saveTheme('dark')
  const backup = parseBackup(await store.exportJson())
  expect(backup.version).toBe(4)
  await store.saveTheme('light')
  await store.restore(backup)
  expect((await portfolioRepository.read())!.settings.theme).toBe('dark')
  delete backup.portfolio.settings.theme
  for (const version of [1, 2, 3] as const) {
    await store.saveTheme('dark')
    await store.restore({ ...backup, version })
    expect((await portfolioRepository.read())!.settings).not.toHaveProperty('theme')
  }
})

it('rejects invalid imported preferences without replacing the saved theme or records', async () => {
  await store.saveTheme('dark')
  const original = (await portfolioRepository.read())!
  const invalid = {
    ...original, settings: { ...original.settings, theme: 'unsupported' },
  }
  await expect(portfolioRepository.update(() => invalid as typeof original))
    .rejects.toThrow('settings.theme must be')
  expect(await portfolioRepository.read()).toEqual(original)
  const backup = parseBackup(await store.exportJson())
  await expect(store.restore({ ...backup, portfolio: invalid as typeof original }))
    .rejects.toThrow('settings.theme must be')
  expect(await portfolioRepository.read()).toEqual(original)
})

it('rejects a queued theme save when a preceding restoration replaces its portfolio', async () => {
  const backup = parseBackup(await store.exportJson())
  const restore = store.restore(backup)
  const themeSave = store.saveTheme('dark')
  const outcomes = await Promise.allSettled([restore, themeSave])
  expect(outcomes[0]!.status).toBe('fulfilled')
  expect(outcomes[1]).toMatchObject({ status: 'rejected', reason: expect.any(Error) })
  if (outcomes[1]!.status === 'rejected') {
    expect(outcomes[1].reason.message).toMatch(/replaced in another tab/)
  }
  expect((await portfolioRepository.read())!.settings).not.toHaveProperty('theme')
})

it('rolls back an earlier theme write when a later account write fails', async () => {
  await store.saveAccount({
    expectedPortfolioEpoch: store.portfolioEpoch!, name: 'Checking', cash: '10',
  })
  const original = (await portfolioRepository.read())!
  const failWrite = (): never => { throw new Error('injected write failure') }
  portfolioRepository.database.accounts.hook('creating', failWrite)
  try {
    await expect(store.saveTheme('dark')).rejects.toThrow('injected write failure')
    expect(await portfolioRepository.read()).toEqual(original)
    expect(store.portfolio).toEqual(original)
  } finally {
    portfolioRepository.database.accounts.hook('creating').unsubscribe(failWrite)
  }
})
