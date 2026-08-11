const DIVISIONS = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
] as const

/**
 * "3 minutes ago", from an ISO timestamp.
 *
 * Relative rather than absolute so the list stays readable without a timezone
 * or a locale decision, and so a row's age is legible at a glance — which is the
 * only thing the timestamp is doing here.
 */
export function formatRelativeTime(isoTimestamp: string) {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  let duration = (new Date(isoTimestamp).getTime() - Date.now()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit)
    }
    duration = duration / division.amount
  }

  return formatter.format(Math.round(duration), 'year')
}
