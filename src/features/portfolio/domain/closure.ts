import { latestObservation } from './observations'
import { isLocalDate, localToday } from './dates'
import { MoneyDecimal } from './decimal'
import type { Account, AssetRecord, Holding, ObservationKind, Portfolio } from './types'

export type ClosureKind = 'account' | 'holding' | 'record'

export function isClosed(
  subject: Account | Holding | AssetRecord,
  onDate = localToday(),
): boolean {
  return subject.closedOn !== undefined && subject.closedOn <= onDate
}

function requireClosureDate(subject: Account | Holding | AssetRecord): void {
  if (!Object.hasOwn(subject, 'closedOn')) return
  if (
    typeof subject.closedOn !== 'string' ||
    !isLocalDate(subject.closedOn) || subject.closedOn > localToday()
  ) {
    throw new Error('Closure date must be a valid past or present date.')
  }
}

function requireNoLaterObservations(
  portfolio: Portfolio,
  kind: ObservationKind,
  subjectId: string,
  closedOn: string,
): void {
  if (portfolio.observations.some((observation) =>
    observation.kind === kind && observation.subjectId === subjectId &&
    observation.effectiveDate > closedOn,
  )) {
    throw new Error(
      'An observation falls after closure. ' +
      'Correct or remove the closure before saving later observations.',
    )
  }
}

function requireRecordedZero(
  portfolio: Portfolio,
  kind: 'cash' | 'quantity',
  subjectId: string,
  closedOn: string,
): void {
  const observation = latestObservation(portfolio, kind, subjectId, closedOn)
  if (!observation || !new MoneyDecimal(observation.amount).isZero()) {
    const requirement = kind === 'cash'
      ? 'Account closure requires a recorded zero cash balance on or before its closure date.'
      : 'Account closure requires a recorded zero quantity for every holding, including archived holdings.'
    throw new Error(
      `${requirement} To change or delete required zeros, first correct or remove the account closure.`,
    )
  }
}

export function validateClosures(portfolio: Portfolio): void {
  for (const subject of [...portfolio.accounts, ...portfolio.holdings, ...portfolio.records]) {
    requireClosureDate(subject)
  }

  for (const account of portfolio.accounts) {
    if (!account.closedOn) continue
    requireRecordedZero(portfolio, 'cash', account.id, account.closedOn)
    requireNoLaterObservations(portfolio, 'cash', account.id, account.closedOn)
    for (const holding of portfolio.holdings) {
      if (holding.accountId !== account.id) continue
      requireRecordedZero(portfolio, 'quantity', holding.id, account.closedOn)
      requireNoLaterObservations(portfolio, 'quantity', holding.id, account.closedOn)
    }
  }

  for (const holding of portfolio.holdings) {
    if (holding.closedOn) {
      requireNoLaterObservations(portfolio, 'quantity', holding.id, holding.closedOn)
    }
  }
  for (const record of portfolio.records) {
    if (record.closedOn) {
      requireNoLaterObservations(portfolio, 'valuation', record.id, record.closedOn)
    }
  }
}

export function setClosure(
  portfolio: Portfolio,
  kind: ClosureKind,
  id: string,
  closedOn: string | null,
): void {
  const collection = kind === 'account' ? 'accounts' : kind === 'holding' ? 'holdings' : 'records'
  const subject = portfolio[collection].find((candidate) => candidate.id === id)
  if (!subject) throw new Error('This account, holding, or record no longer exists.')

  const corrected = { ...subject }
  if (closedOn === null) delete corrected.closedOn
  else corrected.closedOn = closedOn
  const candidate = {
    ...portfolio,
    [collection]: portfolio[collection].map((subject) => subject.id === id ? corrected : subject),
  }
  validateClosures(candidate)
  if (closedOn === null) delete subject.closedOn
  else subject.closedOn = closedOn
  subject.updatedAt = new Date().toISOString()
}
