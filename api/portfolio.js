import { authenticateUser } from './_lib/supabase.js'
import { getQuote } from './_lib/quotes.js'

const COMPANY_NAMES = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  TSLA: 'Tesla, Inc.',
}

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  })
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null
  }
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Leidžiamas tik GET metodas.')
  }

  try {
    const authentication = await authenticateUser(req)
    if (authentication.error) {
      const { status, code, message } = authentication.error
      return sendError(res, status, code, message)
    }

    const userId = authentication.user.id
    const [profileResult, positionsResult] = await Promise.all([
      authentication.supabase
        .from('profiles')
        .select('initial_balance, cash_balance')
        .eq('id', userId)
        .maybeSingle(),
      authentication.supabase
        .from('positions')
        .select('symbol, quantity, avg_price')
        .eq('user_id', userId)
        .gt('quantity', 0),
    ])

    if (profileResult.error || positionsResult.error) {
      return sendError(
        res,
        500,
        'PORTFOLIO_QUERY_FAILED',
        'Nepavyko gauti vartotojo portfolio duomenų.',
      )
    }

    if (!profileResult.data) {
      return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Vartotojo profilis nerastas.')
    }

    const initialBalanceValue = toFiniteNumber(profileResult.data.initial_balance)
    const cashBalanceValue = toFiniteNumber(profileResult.data.cash_balance)
    if (initialBalanceValue === null || cashBalanceValue === null) {
      return sendError(
        res,
        500,
        'INVALID_PORTFOLIO_DATA',
        'Vartotojo balanso duomenys yra neteisingi.',
      )
    }

    const positions = positionsResult.data ?? []
    if (positions.length === 0) {
      const cashBalance = roundMoney(cashBalanceValue)
      const totalValue = roundMoney(cashBalance)
      return res.status(200).json({
        cashBalance,
        stocksValue: 0,
        totalValue,
        profitLoss: roundMoney(totalValue - initialBalanceValue),
        positions: [],
      })
    }

    const symbols = [...new Set(positions.map((position) => position.symbol))]
    const quotes = new Map()
    // Query once per symbol, sequentially, to avoid bursts against Alpha Vantage limits.
    for (const symbol of symbols) {
      const result = await getQuote(symbol)
      if (result.error) {
        return sendError(res, result.error.status, result.error.code, result.error.message)
      }
      quotes.set(symbol, result.quote)
    }

    const portfolioPositions = []
    for (const position of positions) {
      const quantity = toFiniteNumber(position.quantity)
      const avgPrice = toFiniteNumber(position.avg_price)
      const quote = quotes.get(position.symbol)
      const companyName = COMPANY_NAMES[position.symbol]

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        avgPrice === null ||
        avgPrice < 0 ||
        !quote ||
        !companyName
      ) {
        return sendError(
          res,
          500,
          'INVALID_PORTFOLIO_DATA',
          'Vartotojo pozicijos duomenys yra neteisingi arba nepalaikomi.',
        )
      }

      const marketValue = roundMoney(quantity * quote.price)
      portfolioPositions.push({
        symbol: position.symbol,
        companyName,
        quantity,
        avgPrice: roundMoney(avgPrice),
        currentPrice: roundMoney(quote.price),
        marketValue,
        profitLoss: roundMoney((quote.price - avgPrice) * quantity),
      })
    }

    const cashBalance = roundMoney(cashBalanceValue)
    const stocksValue = roundMoney(
      portfolioPositions.reduce((sum, position) => sum + position.marketValue, 0),
    )
    const totalValue = roundMoney(cashBalance + stocksValue)
    const profitLoss = roundMoney(totalValue - initialBalanceValue)

    return res.status(200).json({
      cashBalance,
      stocksValue,
      totalValue,
      profitLoss,
      positions: portfolioPositions,
    })
  } catch {
    return sendError(
      res,
      500,
      'INTERNAL_SERVER_ERROR',
      'Įvyko vidinė serverio klaida.',
    )
  }
}
