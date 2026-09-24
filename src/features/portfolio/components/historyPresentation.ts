import type { HistoryPoint } from '../domain/history'
import type { Overview } from '../domain/types'

export type HistorySeries = 'netWorth' | 'assets' | 'liabilities'
export const carriedStepMode = 'before' as const

export interface CanvasHistoryPoint {
  x: number
  y: number | null
  date: string
  exact: string | null
  synthetic: boolean
}

export function calendarMonthsBefore(date: string, months: number): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const targetMonthIndex = year * 12 + month - 1 - months
  const targetYear = Math.floor(targetMonthIndex / 12)
  const targetMonth = (targetMonthIndex % 12) + 1
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const targetDay = Math.min(day, daysInMonth)
  const yearPart = String(targetYear).padStart(4, '0')
  const monthPart = String(targetMonth).padStart(2, '0')
  const dayPart = String(targetDay).padStart(2, '0')
  return `${yearPart}-${monthPart}-${dayPart}`
}

export function dateToUtcMillis(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`)
}

export function formatExactNumber(amount: string): string {
  const negative = amount.startsWith('-')
  const absolute = negative ? amount.slice(1) : amount
  const [whole, fraction] = absolute.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}

export function formatExactMoney(amount: string, currency: string): string {
  const negative = amount.startsWith('-')
  const magnitude = negative ? amount.slice(1) : amount
  return `${negative ? '-' : ''}${currency} ${formatExactNumber(magnitude)}`
}

function exactValue(overview: Overview, series: HistorySeries): string | null {
  if (overview.incomplete && series !== 'liabilities') return null
  return overview[series]
}

export function canvasHistorySeries(
  points: HistoryPoint[],
  series: HistorySeries,
): CanvasHistoryPoint[] {
  const canvasPoints: CanvasHistoryPoint[] = []
  let previous: CanvasHistoryPoint | undefined
  for (const point of points) {
    const exact = exactValue(point.overview, series)
    const x = dateToUtcMillis(point.date)
    if (exact === null && previous && previous.exact !== null) {
      canvasPoints.push({
        x: x - 1,
        y: previous.y,
        date: point.date,
        exact: previous.exact,
        synthetic: true,
      })
    }
    const canvasPoint: CanvasHistoryPoint = {
      x,
      y: exact === null ? null : Number(exact),
      date: point.date,
      exact,
      synthetic: false,
    }
    canvasPoints.push(canvasPoint)
    previous = canvasPoint
  }
  return canvasPoints
}
