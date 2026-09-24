export function localToday(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid date')
  }

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isLocalDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return false
  }

  const parsed = new Date(`${input}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input
}

export function isUtcTimestamp(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input)) {
    return false
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }

  const normalized = parsed.toISOString()
  return normalized.slice(0, 19) === input.slice(0, 19)
}
