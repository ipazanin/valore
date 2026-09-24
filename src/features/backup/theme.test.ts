import { describe, expect, it } from 'vitest'
import { createEmptyPortfolio } from '../portfolio/domain/portfolio'
import { recordObservation } from '../portfolio/domain/observations'
import { validatePortfolio } from '../portfolio/domain/validation'
import { createBackup, parseBackup, serializeBackup } from './backup'

describe('theme backup compatibility', () => {
  it.each(['system', 'light', 'dark'] as const)('round trips the %s preference in version 4', (theme) => {
    const portfolio = createEmptyPortfolio('EUR')
    portfolio.settings.theme = theme
    const restored = parseBackup(serializeBackup(portfolio))
    expect(restored.version).toBe(4)
    expect(restored.portfolio).toEqual(portfolio)
  })

  it.each([1, 2, 3])('imports version %i settings without adding a theme', (version) => {
    const portfolio = createEmptyPortfolio('EUR')
    const restored = parseBackup(JSON.stringify({ ...createBackup(portfolio), version }))
    expect(restored.portfolio.settings).toEqual(portfolio.settings)
    expect(restored.portfolio.settings).not.toHaveProperty('theme')
  })

  it.each([1, 2, 3])('rejects theme fields in version %i', (version) => {
    const portfolio = createEmptyPortfolio('EUR')
    portfolio.settings.theme = 'dark'
    expect(() => parseBackup(JSON.stringify({ ...createBackup(portfolio), version })))
      .toThrow('theme is not supported')
  })

  it('retains version 3 closure compatibility while forbidding its new theme field', () => {
    const portfolio = createEmptyPortfolio('EUR')
    const accountId = crypto.randomUUID()
    portfolio.accounts.push({
      id: accountId, name: 'Closed', currency: 'EUR', closedOn: '2020-01-01',
      createdAt: portfolio.settings.createdAt, updatedAt: portfolio.settings.createdAt,
    })
    recordObservation(portfolio, 'cash', accountId, '0', '2020-01-01')
    const legacy = { ...createBackup(portfolio), version: 3 }
    expect(parseBackup(JSON.stringify(legacy)).portfolio).toEqual(portfolio)
    portfolio.settings.theme = 'light'
    expect(() => parseBackup(JSON.stringify(legacy))).toThrow('theme is not supported')
  })

  it.each(['automatic', 'Dark', '', null, 0, true, {}])(
    'rejects invalid theme preferences: %j', (theme) => {
      const backup = createBackup(createEmptyPortfolio('EUR'))
      const invalid = {
        ...backup,
        portfolio: {
          ...backup.portfolio,
          settings: { ...backup.portfolio.settings, theme },
        },
      }
      expect(() => parseBackup(JSON.stringify(invalid))).toThrow('settings.theme must be')
    },
  )

  it('rejects an explicitly undefined theme instead of silently treating it as absent', () => {
    const portfolio = createEmptyPortfolio('EUR')
    expect(() => validatePortfolio({
      ...portfolio, settings: { ...portfolio.settings, theme: undefined },
    })).toThrow('settings.theme must be')
  })
})
