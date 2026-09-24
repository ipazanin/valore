import { isUtcTimestamp } from '../portfolio/domain/dates'
import type { Portfolio } from '../portfolio/domain/types'
import { validatePortfolio } from '../portfolio/domain/validation'

const MAX_BACKUP_BYTES = 10 * 1024 * 1024

export interface Backup {
  format: 'valore'
  version: 1
  exportedAt: string
  portfolio: Portfolio
}

function validateBackup(input: unknown): Backup {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Backup must be an object')
  }
  const backup = input as Record<string, unknown>
  const expectedKeys = ['format', 'version', 'exportedAt', 'portfolio']
  if (
    Object.keys(backup).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(backup, key))
  ) {
    throw new Error('Backup has missing or unsupported fields')
  }
  if (backup.format !== 'valore') {
    throw new Error('Unsupported backup format')
  }
  if (backup.version !== 1) {
    throw new Error('Unsupported backup version')
  }
  if (typeof backup.exportedAt !== 'string' || !isUtcTimestamp(backup.exportedAt)) {
    throw new Error('Backup export time must be a UTC ISO timestamp')
  }
  const portfolio = validatePortfolio(backup.portfolio)
  const timestamps = [
    portfolio.settings.createdAt,
    ...portfolio.accounts.flatMap((account) => [account.createdAt, account.updatedAt]),
    ...portfolio.instruments.flatMap((instrument) => [instrument.createdAt, instrument.updatedAt]),
    ...portfolio.listings.flatMap((listing) => [listing.createdAt, listing.updatedAt]),
    ...portfolio.holdings.flatMap((holding) => [holding.createdAt, holding.updatedAt]),
    ...portfolio.records.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...portfolio.observations.map((observation) => observation.recordedAt),
  ]
  if (
    timestamps.some((timestamp) => Date.parse(timestamp) > Date.parse(backup.exportedAt as string))
  ) {
    throw new Error('Backup export time precedes a saved change')
  }
  return input as Backup
}

export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds the 10 MB limit')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('Backup is not valid JSON')
  }
  return validateBackup(parsed)
}

export function createBackup(portfolio: Portfolio, now: Date = new Date()): Backup {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid export time')
  }
  return validateBackup({ format: 'valore', version: 1, exportedAt: now.toISOString(), portfolio })
}

export function serializeBackup(portfolio: Portfolio): string {
  const text = JSON.stringify(createBackup(portfolio), null, 2)
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds the 10 MB limit')
  }
  return text
}
