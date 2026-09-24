import { calculateOverview } from './calculations'
import { isClosed } from './closure'
import { isLocalDate, localToday } from './dates'
import { MoneyDecimal } from './decimal'
import { latestObservation } from './observations'
import type { Observation, Overview, Portfolio } from './types'

export interface HistorySource {
  kind: Observation['kind']
  subjectId: string
  amount: string
  sourceDate: string
  ageDays: number
}

export interface HistoryPoint {
  date: string
  overview: Overview
  sources: HistorySource[]
}

function appliedSources(portfolio: Portfolio, onDate: string): HistorySource[] {
  const sources = new Map<string, HistorySource>()
  const add = (observation: Observation | undefined): void => {
    if (!observation) return
    sources.set(`${observation.kind}:${observation.subjectId}`, {
      kind: observation.kind,
      subjectId: observation.subjectId,
      amount: observation.amount,
      sourceDate: observation.effectiveDate,
      ageDays: (
        Date.parse(`${onDate}T00:00:00.000Z`) -
        Date.parse(`${observation.effectiveDate}T00:00:00.000Z`)
      ) / 86_400_000,
    })
  }

  for (const account of portfolio.accounts) {
    if (isClosed(account, onDate)) continue
    add(latestObservation(portfolio, 'cash', account.id, onDate))
    for (const holding of portfolio.holdings) {
      if (holding.accountId !== account.id || isClosed(holding, onDate)) continue
      const quantity = latestObservation(portfolio, 'quantity', holding.id, onDate)
      add(quantity)
      if (quantity && new MoneyDecimal(quantity.amount).greaterThan(0)) {
        add(latestObservation(portfolio, 'price', holding.listingId, onDate))
      }
    }
  }
  for (const record of portfolio.records) {
    if (!isClosed(record, onDate)) {
      add(latestObservation(portfolio, 'valuation', record.id, onDate))
    }
  }
  return [...sources.values()]
}

export function buildHistory(
  portfolio: Portfolio,
  range: { startDate?: string; endDate?: string } = {},
): HistoryPoint[] {
  const today = localToday()
  const requestedEnd = range.endDate ?? today
  if (
    !isLocalDate(requestedEnd) ||
    (range.startDate !== undefined && !isLocalDate(range.startDate))
  ) {
    throw new Error('History range must use valid calendar dates.')
  }
  if (range.startDate && range.endDate && range.startDate > range.endDate) {
    throw new Error('History start date must not follow its end date.')
  }
  const endDate = requestedEnd > today ? today : requestedEnd
  const observations = portfolio.observations
    .filter((observation) => observation.effectiveDate <= endDate)
    .sort((first, second) => first.effectiveDate.localeCompare(second.effectiveDate))
  const observationDates = observations.map((observation) => observation.effectiveDate)
  const firstDate = observationDates[0]
  if (!firstDate) return []
  const startDate = range.startDate && range.startDate > firstDate ? range.startDate : firstDate
  if (startDate > endDate) return []

  const closureDates = [...portfolio.accounts, ...portfolio.holdings, ...portfolio.records]
    .flatMap((subject) => subject.closedOn ? [subject.closedOn] : [])
  const dates = [...new Set([...observationDates, ...closureDates, startDate, endDate])]
    .filter((date) => date >= startDate && date <= endDate)
    .sort()
  const latest = new Map<string, Observation>()
  let nextObservation = 0
  return dates.map((date) => {
    while (nextObservation < observations.length) {
      const observation = observations[nextObservation]!
      if (observation.effectiveDate > date) break
      latest.set(`${observation.kind}:${observation.subjectId}`, observation)
      nextObservation += 1
    }
    const snapshot = { ...portfolio, observations: [...latest.values()] }
    return {
      date,
      overview: calculateOverview(snapshot, date),
      sources: appliedSources(snapshot, date),
    }
  })
}
