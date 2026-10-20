const SYMBOL = /^[A-Z0-9.-]{1,12}$/
const CURRENCY = /^[A-Z]{3}$/

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isIsoTime(value) {
  if (typeof value !== 'string' || value.trim() === '') return false
  return !Number.isNaN(Date.parse(value))
}

function result(errors) {
  return { ok: errors.length === 0, errors }
}

export function checkSymbolChoice(choice) {
  const errors = []
  if (!isObject(choice)) errors.push('Pasirinkimas turi būti objektas { symbol }.')
  else if (typeof choice.symbol !== 'string' || !SYMBOL.test(choice.symbol)) {
    errors.push('symbol: 1–12 simbolių, didžiosios raidės, skaitmenys, taškas arba brūkšnys.')
  }
  return result(errors)
}

export function checkPriceQuote(quote) {
  const errors = []
  if (!isObject(quote)) {
    errors.push('Kainos atsakymas turi būti objektas.')
    return result(errors)
  }
  if (typeof quote.symbol !== 'string' || !SYMBOL.test(quote.symbol)) {
    errors.push('symbol: 1–12 simbolių, didžiosios raidės, skaitmenys, taškas arba brūkšnys.')
  }
  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    errors.push('price: teigiamas skaičius.')
  }
  if (typeof quote.currency !== 'string' || !CURRENCY.test(quote.currency)) {
    errors.push('currency: trys didžiosios raidės, pavyzdžiui USD.')
  }
  if (!isIsoTime(quote.time)) errors.push('time: data, kurią galima perskaityti kaip ISO laiką.')
  return result(errors)
}

function checkPoints(points, valueKey, allowZero, allowNegative = false) {
  const errors = []
  if (!Array.isArray(points)) {
    errors.push('points turi būti masyvas.')
    return errors
  }
  let previous = null
  points.forEach((point, index) => {
    if (!isObject(point)) {
      errors.push(`points[${index}] turi būti objektas.`)
      return
    }
    if (!isIsoTime(point.time)) errors.push(`points[${index}].time: netinkama data.`)
    const value = point[valueKey]
    const valueOk = Number.isFinite(value) && (allowNegative || (allowZero ? value >= 0 : value > 0))
    if (!valueOk) errors.push(`points[${index}].${valueKey}: netinkamas skaičius.`)
    const time = Date.parse(point.time)
    if (previous !== null && time < previous) {
      errors.push(`points[${index}].time eina anksčiau už ankstesnį tašką.`)
    }
    if (!Number.isNaN(time)) previous = time
  })
  return errors
}

export function checkPriceSeries(series) {
  const errors = []
  if (!isObject(series)) return result(['PriceSeries turi būti objektas.'])
  if (typeof series.symbol !== 'string' || !SYMBOL.test(series.symbol)) {
    errors.push('symbol: 1–12 simbolių, didžiosios raidės, skaitmenys, taškas arba brūkšnys.')
  }
  if (typeof series.currency !== 'string' || !CURRENCY.test(series.currency)) {
    errors.push('currency: trys didžiosios raidės.')
  }
  errors.push(...checkPoints(series.points, 'price', false))
  return result(errors)
}

export function checkPortfolioSeries(series) {
  const errors = []
  if (!isObject(series)) return result(['PortfolioSeries turi būti objektas.'])
  if (typeof series.currency !== 'string' || !CURRENCY.test(series.currency)) {
    errors.push('currency: trys didžiosios raidės.')
  }
  errors.push(...checkPoints(series.points, 'value', true))
  return result(errors)
}

export function checkProfitLossSeries(series) {
  const errors = []
  if (!isObject(series)) return result(['P/L serija turi būti objektas.'])
  if (typeof series.currency !== 'string' || !CURRENCY.test(series.currency)) {
    errors.push('currency: trys didžiosios raidės.')
  }
  errors.push(...checkPoints(series.points, 'value', false, true))
  return result(errors)
}

export function priceQuoteToPoint(quote) {
  return { time: quote.time, price: quote.price }
}

export function snapshotToPoint(row) {
  return { time: row.captured_at, value: row.total_value }
}

export const examples = {
  symbolChoice: { symbol: 'AAPL' },
  priceQuote: {
    symbol: 'AAPL',
    price: 189.25,
    currency: 'USD',
    time: '2026-10-19T17:00:00.000Z',
  },
  priceSeries: {
    symbol: 'AAPL',
    currency: 'USD',
    points: [
      { time: '2026-10-19T15:00:00.000Z', price: 188.1 },
      { time: '2026-10-19T16:00:00.000Z', price: 188.8 },
      { time: '2026-10-19T17:00:00.000Z', price: 189.25 },
    ],
  },
  snapshotRow: {
    captured_at: '2026-10-19T17:00:00.000Z',
    total_value: 10000,
  },
  portfolioSeries: {
    currency: 'USD',
    points: [
      { time: '2026-10-18T17:00:00.000Z', value: 10000 },
      { time: '2026-10-19T17:00:00.000Z', value: 10040.5 },
    ],
  },
}
