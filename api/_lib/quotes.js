const ALLOWED_SYMBOLS = new Set(['AAPL', 'MSFT', 'TSLA'])
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query'

export async function getQuote(symbol) {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return {
      error: {
        status: 400,
        code: 'INVALID_SYMBOL',
        message: 'Simbolis turi būti AAPL, MSFT arba TSLA.',
      },
    }
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) {
    return {
      error: {
        status: 500,
        code: 'MISSING_API_KEY',
        message: 'Serverio aplinkoje nenustatytas Alpha Vantage API raktas.',
      },
    }
  }

  const url = new URL(ALPHA_VANTAGE_URL)
  url.search = new URLSearchParams({
    function: 'GLOBAL_QUOTE',
    symbol,
    apikey: apiKey,
  }).toString()

  let response
  let data
  try {
    response = await fetch(url)
    data = await response.json()
  } catch {
    return {
      error: {
        status: 502,
        code: 'PROVIDER_ERROR',
        message: 'Nepavyko gauti tinkamo atsakymo iš Alpha Vantage.',
      },
    }
  }

  if (!response.ok) {
    return {
      error: {
        status: 502,
        code: 'PROVIDER_ERROR',
        message: 'Alpha Vantage užklausa nepavyko.',
      },
    }
  }

  const providerMessage = `${data?.Note ?? ''} ${data?.Information ?? ''}`
  if (/rate limit|call frequency|thank you for using alpha vantage/i.test(providerMessage)) {
    return {
      error: {
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Viršytas Alpha Vantage užklausų limitas. Bandykite vėliau.',
      },
    }
  }

  const quote = data?.['Global Quote']
  const price = typeof quote?.['05. price'] === 'string'
    ? Number(quote['05. price'])
    : NaN
  const latestTradingDay = quote?.['07. latest trading day']
  if (
    quote?.['01. symbol'] !== symbol ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof latestTradingDay !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(latestTradingDay) ||
    Number.isNaN(Date.parse(`${latestTradingDay}T00:00:00Z`))
  ) {
    return {
      error: {
        status: 502,
        code: 'INVALID_PROVIDER_RESPONSE',
        message: 'Alpha Vantage pateikė neteisingus arba neužbaigtus kainos duomenis.',
      },
    }
  }

  return { quote: { symbol, price, latestTradingDay } }
}
