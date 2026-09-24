import { isLocalDate, localToday } from './dates'
import { normalizeAmount } from './decimal'
import type { Observation, ObservationKind, Portfolio } from './types'

export function latestObservation(
  portfolio: Portfolio,
  kind: ObservationKind,
  subjectId: string,
  onDate = localToday(),
): Observation | undefined {
  let latest: Observation | undefined
  for (const observation of portfolio.observations) {
    if (
      observation.kind !== kind ||
      observation.subjectId !== subjectId ||
      observation.effectiveDate > onDate
    ) {
      continue
    }
    if (!latest || observation.effectiveDate > latest.effectiveDate) {
      latest = observation
    }
  }
  return latest
}

function requireEffectiveDate(effectiveDate: string): void {
  if (!isLocalDate(effectiveDate) || effectiveDate > localToday()) {
    throw new Error('Choose a valid past or present observation date.')
  }
}

function requireSubject(portfolio: Portfolio, kind: ObservationKind, subjectId: string): void {
  const subjects =
    kind === 'cash'
      ? portfolio.accounts
      : kind === 'quantity'
        ? portfolio.holdings
        : kind === 'price'
          ? portfolio.listings
          : portfolio.records
  if (!subjects.some((subject) => subject.id === subjectId)) {
    throw new Error('The observation’s account, holding, listing, or record no longer exists.')
  }
}

export function recordObservation(
  portfolio: Portfolio,
  kind: ObservationKind,
  subjectId: string,
  amount: string,
  effectiveDate = localToday(),
): Observation {
  requireEffectiveDate(effectiveDate)
  requireSubject(portfolio, kind, subjectId)
  const normalizedAmount = normalizeAmount(amount, kind === 'cash')
  const existing = portfolio.observations.find(
    (observation) =>
      observation.kind === kind &&
      observation.subjectId === subjectId &&
      observation.effectiveDate === effectiveDate,
  )
  if (existing) {
    existing.amount = normalizedAmount
    existing.recordedAt = new Date().toISOString()
    return existing
  }
  const observation: Observation = {
    id: crypto.randomUUID(),
    kind,
    subjectId,
    effectiveDate,
    amount: normalizedAmount,
    recordedAt: new Date().toISOString(),
  }
  portfolio.observations.push(observation)
  return observation
}

export function correctObservation(
  portfolio: Portfolio,
  id: string,
  effectiveDate: string,
  amount: string,
): Observation {
  const observation = portfolio.observations.find((candidate) => candidate.id === id)
  if (!observation) {
    throw new Error('This observation no longer exists.')
  }
  requireEffectiveDate(effectiveDate)
  const normalizedAmount = normalizeAmount(amount, observation.kind === 'cash')
  if (portfolio.observations.some(
    (candidate) =>
      candidate.id !== id &&
      candidate.kind === observation.kind &&
      candidate.subjectId === observation.subjectId &&
      candidate.effectiveDate === effectiveDate,
  )) {
    throw new Error('An observation already exists on that date. Edit that entry instead.')
  }
  observation.effectiveDate = effectiveDate
  observation.amount = normalizedAmount
  observation.recordedAt = new Date().toISOString()
  return observation
}

export function deleteObservation(portfolio: Portfolio, id: string): void {
  const observation = portfolio.observations.find((candidate) => candidate.id === id)
  if (!observation) {
    throw new Error('This observation no longer exists.')
  }
  portfolio.observations = portfolio.observations.filter((candidate) => candidate.id !== id)
}
