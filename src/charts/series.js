const DAY = /^\d{4}-\d{2}-\d{2}$/

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

export function historyToValueSeries(payload) {
  if (!payload || !Array.isArray(payload.points)) return null
  return {
    currency: typeof payload.currency === 'string' && payload.currency.trim() !== '' ? payload.currency : 'USD',
    points: payload.points,
  }
}
