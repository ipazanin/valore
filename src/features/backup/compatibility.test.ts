import { describe, expect, it } from 'vitest'
import { createEmptyPortfolio } from '../portfolio/domain/portfolio'
import { recordObservation } from '../portfolio/domain/observations'
import { createBackup, parseBackup, serializeBackup } from './backup'

function portfolioFixture() {
  const portfolio = createEmptyPortfolio('EUR')
  const accountId = crypto.randomUUID()
  portfolio.accounts.push({
    id: accountId,
    name: 'Checking',
    currency: 'EUR',
    createdAt: portfolio.settings.createdAt,
    updatedAt: portfolio.settings.createdAt,
  })
  recordObservation(portfolio, 'cash', accountId, '0', '2020-01-01')
  return portfolio
}

describe('backup format compatibility', () => {
  it('imports version 2 records with empty histories without inventing amounts', () => {
    const portfolio = portfolioFixture()
    portfolio.observations = []
    const backup = { ...createBackup(portfolio), version: 2 }
    expect(parseBackup(JSON.stringify(backup)).portfolio).toEqual(portfolio)
  })

  it.each([1, 2])('rejects closure fields in version %i', (version) => {
    const portfolio = portfolioFixture()
    portfolio.accounts[0]!.closedOn = '2020-01-01'
    const backup = { ...createBackup(portfolio), version }
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('closedOn is not supported')
  })

  it.each([1, 2])('imports unchanged version %i records as active', (version) => {
    const portfolio = portfolioFixture()
    const backup = { ...createBackup(portfolio), version }
    const restored = parseBackup(JSON.stringify(backup)).portfolio
    expect(restored).toEqual(portfolio)
    expect(restored.accounts[0]).not.toHaveProperty('closedOn')
  })

  it('round trips a dated closure in the current format', () => {
    const portfolio = portfolioFixture()
    portfolio.accounts[0]!.closedOn = '2020-01-01'
    expect(parseBackup(serializeBackup(portfolio)).portfolio).toEqual(portfolio)
  })
})
