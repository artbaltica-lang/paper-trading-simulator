const ALLOWED_SYMBOLS = new Set(['AAPL', 'MSFT', 'TSLA'])
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query'
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function getPrices(symbol) {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return { error: { status: 400, code: 'INVALID_SYMBOL', message: 'Simbolis turi būti AAPL, MSFT arba TSLA.' } }
  }

  const cached = cache.get(symbol)
  if (cached && cached.expiresAt > Date.now()) return { prices: cached.prices }
  if (cached) cache.delete(symbol)

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) {
    return { error: { status: 500, code: 'MISSING_API_KEY', message: 'Serverio aplinkoje nenustatytas Alpha Vantage API raktas.' } }
  }

  const url = new URL(ALPHA_VANTAGE_URL)
  url.search = new URLSearchParams({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact', apikey: apiKey }).toString()

  let response
  let data
  try {
    response = await fetch(url)
    data = await response.json()
  } catch {
    return { error: { status: 502, code: 'PROVIDER_ERROR', message: 'Nepavyko gauti tinkamo atsakymo iš Alpha Vantage.' } }
  }

  if (!response.ok) {
    return { error: { status: 502, code: 'PROVIDER_ERROR', message: 'Alpha Vantage užklausa nepavyko.' } }
  }

  const providerMessage = `${data?.Note ?? ''} ${data?.Information ?? ''} ${data?.['Error Message'] ?? ''}`
  if (/rate limit|call frequency|thank you for using alpha vantage/i.test(providerMessage)) {
    return { error: { status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Viršytas Alpha Vantage užklausų limitas. Bandykite vėliau.' } }
  }

  const series = data?.['Time Series (Daily)']
  if (!series || typeof series !== 'object' || Array.isArray(series)) {
    return { error: { status: 502, code: 'INVALID_PROVIDER_RESPONSE', message: 'Alpha Vantage pateikė neteisingus kainų istorijos duomenis.' } }
  }

  const points = Object.entries(series).map(([time, row]) => {
    const price = typeof row?.['4. close'] === 'string' && row['4. close'].trim() !== ''
      ? Number(row['4. close'])
      : NaN
    if (!validDate(time) || !Number.isFinite(price) || price <= 0) return null
    return { time, price }
  })

  if (points.length === 0 || points.some((point) => point === null)) {
    return { error: { status: 502, code: 'INVALID_PROVIDER_RESPONSE', message: 'Alpha Vantage pateikė neteisingus arba neužbaigtus kainų duomenis.' } }
  }

  points.sort((a, b) => a.time.localeCompare(b.time))
  const prices = { symbol, currency: 'USD', points }
  cache.set(symbol, { prices, expiresAt: Date.now() + CACHE_TTL_MS })
  return { prices }
}

export function clearPricesCache() {
  cache.clear()
}
