const ALLOWED_SYMBOLS = new Set(['AAPL', 'MSFT', 'TSLA'])
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query'

function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({
    error: { code, message },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Leidžiamas tik GET metodas.')
  }

  const symbol = typeof req.query?.symbol === 'string' ? req.query.symbol : ''
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return sendError(
      res,
      400,
      'INVALID_SYMBOL',
      'Simbolis turi būti AAPL, MSFT arba TSLA.',
    )
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) {
    return sendError(
      res,
      500,
      'MISSING_API_KEY',
      'Serverio aplinkoje nenustatytas Alpha Vantage API raktas.',
    )
  }

  const url = new URL(ALPHA_VANTAGE_URL)
  url.search = new URLSearchParams({
    function: 'GLOBAL_QUOTE',
    symbol,
    apikey: apiKey,
  }).toString()

  let providerResponse
  let providerData
  try {
    providerResponse = await fetch(url)
    providerData = await providerResponse.json()
  } catch {
    return sendError(
      res,
      502,
      'PROVIDER_ERROR',
      'Nepavyko gauti tinkamo atsakymo iš Alpha Vantage.',
    )
  }

  if (!providerResponse.ok) {
    return sendError(
      res,
      502,
      'PROVIDER_ERROR',
      'Alpha Vantage užklausa nepavyko.',
    )
  }

  const providerMessage = `${providerData?.Note ?? ''} ${providerData?.Information ?? ''}`
  if (/rate limit|call frequency|thank you for using alpha vantage/i.test(providerMessage)) {
    return sendError(
      res,
      429,
      'RATE_LIMIT_EXCEEDED',
      'Viršytas Alpha Vantage užklausų limitas. Bandykite vėliau.',
    )
  }

  const quote = providerData?.['Global Quote']
  const returnedSymbol = quote?.['01. symbol']
  const rawPrice = quote?.['05. price']
  const latestTradingDay = quote?.['07. latest trading day']
  const price = typeof rawPrice === 'string' ? Number(rawPrice) : NaN

  if (
    !quote ||
    returnedSymbol !== symbol ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof latestTradingDay !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(latestTradingDay) ||
    Number.isNaN(Date.parse(`${latestTradingDay}T00:00:00Z`))
  ) {
    return sendError(
      res,
      502,
      'INVALID_PROVIDER_RESPONSE',
      'Alpha Vantage pateikė neteisingus arba neužbaigtus kainos duomenis.',
    )
  }

  return res.status(200).json({ symbol, price, latestTradingDay })
}
