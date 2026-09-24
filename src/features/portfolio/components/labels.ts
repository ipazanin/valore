import type { RecordCategory } from '../domain/types'

export const recordCategories: Record<RecordCategory, string> = {
  property: 'Property',
  possessions: 'Vehicles & possessions',
  other: 'Other assets',
  lent: 'Money lent',
  debt: 'Debts',
}
export const categoryLabels: Record<string, string> = {
  cash: 'Cash',
  investments: 'Investments',
  ...recordCategories,
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  )
}
