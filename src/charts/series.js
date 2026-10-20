const DAY = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/

function isoTime(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  if (DAY.test(value)) return `${value}T00:00:00.000Z`
  const time = Date.parse(value)
  if (Number.isNaN(time)) return null
  return new Date(time).toISOString()
}

function currencyOf(payload) {
  return typeof payload.currency === 'string' && CURRENCY.test(payload.currency) ? payload.currency : null
}

export function quoteToPriceSeries(quote) {
  if (!quote || typeof quote.symbol !== 'string' || quote.symbol.trim() === '') return null
  if (!Number.isFinite(quote.price) || quote.price <= 0) return null
  if (typeof quote.latestTradingDay !== 'string' || !DAY.test(quote.latestTradingDay)) return null
  return {
    symbol: quote.symbol,
    currency: 'USD',
    points: [{ time: `${quote.latestTradingDay}T00:00:00.000Z`, price: quote.price }],
  }
}

export function pricesToPriceSeries(payload) {
  if (!payload || typeof payload.symbol !== 'string' || payload.symbol.trim() === '') return null
  if (!Array.isArray(payload.points)) return null
  const currency = currencyOf(payload)
  if (!currency) return null
  const points = []
  for (const point of payload.points) {
    const time = isoTime(point?.time)
    if (!time || !Number.isFinite(point.price) || point.price <= 0) return null
    points.push({ time, price: point.price })
  }
  return { symbol: payload.symbol, currency, points }
}

export function historyToValueSeries(payload) {
  if (!payload || !Array.isArray(payload.points)) return null
  const currency = currencyOf(payload)
  if (!currency) return null
  const points = []
  for (const point of payload.points) {
    const time = isoTime(point?.time)
    if (!time || !Number.isFinite(point.value) || point.value < 0) return null
    points.push({ time, value: point.value })
  }
  return { currency, points }
}

export function profitLossToSeries(payload) {
  if (!payload || !Array.isArray(payload.points)) return null
  const currency = currencyOf(payload)
  if (!currency) return null
  const points = []
  for (const point of payload.points) {
    const time = isoTime(point?.time)
    if (!time || !Number.isFinite(point.value)) return null
    points.push({ time, value: point.value })
  }
  return { currency, points }
}
