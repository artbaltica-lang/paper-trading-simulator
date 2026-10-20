const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatChartUsd(value) {
  if (!Number.isFinite(value)) return ''
  return moneyFormat.format(value)
}

export function formatChartTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''
  const day = dateFormat.format(date)
  const midnight = date.getUTCHours() === 0
    && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0
    && date.getUTCMilliseconds() === 0
  if (midnight) return day
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${day}, ${hours}:${minutes} UTC`
}
