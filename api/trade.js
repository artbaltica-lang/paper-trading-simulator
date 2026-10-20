import { authenticateUser } from './_lib/supabase.js'
import { getQuote } from './_lib/quotes.js'

const ALLOWED_SYMBOLS = new Set(['AAPL', 'MSFT', 'TSLA'])
const ALLOWED_TYPES = new Set(['BUY', 'SELL'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_INTEGER_QUANTITY = 2_147_483_647

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  })
}

function parseBody(body) {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function isFiniteNumeric(value) {
  return value !== null && value !== undefined &&
    !(typeof value === 'string' && value.trim() === '') &&
    Number.isFinite(Number(value))
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isValidMarketPriceMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  return Object.entries(value).every(([symbol, quote]) => {
    if (!ALLOWED_SYMBOLS.has(symbol) || !quote || typeof quote !== 'object') return false
    if (typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0) return false
    if (typeof quote.latestTradingDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(quote.latestTradingDay)) return false
    const date = new Date(`${quote.latestTradingDay}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === quote.latestTradingDay
  })
}

function sendTradeSuccess(res, data, expectedOrder) {
  const transaction = data?.transaction
  const cashBalance = data?.cashBalance
  const snapshot = data?.snapshot
  if (
    !transaction ||
    typeof transaction.id !== 'string' ||
    transaction.symbol !== expectedOrder.symbol ||
    transaction.type !== expectedOrder.type ||
    transaction.quantity !== expectedOrder.quantity ||
    typeof transaction.created_at !== 'string' ||
    !isFiniteNumeric(transaction.price) ||
    Number(transaction.price) <= 0 ||
    !isFiniteNumeric(transaction.total) ||
    Number(transaction.total) <= 0 ||
    typeof data?.replayed !== 'boolean' ||
    !isFiniteNumeric(cashBalance) ||
    Number(cashBalance) < 0 ||
    !snapshot ||
    typeof snapshot.id !== 'string' ||
    !isFiniteNumeric(snapshot.cashBalance) ||
    Number(snapshot.cashBalance) !== Number(cashBalance) ||
    !isFiniteNumeric(snapshot.portfolioValue) ||
    Number(snapshot.portfolioValue) < 0 ||
    !isFiniteNumeric(snapshot.totalValue) ||
    Number(snapshot.totalValue) < 0 ||
    Number(snapshot.totalValue) !== roundMoney(Number(cashBalance) + Number(snapshot.portfolioValue)) ||
    typeof snapshot.createdAt !== 'string' ||
    Number.isNaN(Date.parse(snapshot.createdAt)) ||
    !isValidMarketPriceMap(snapshot.marketPrices)
  ) {
    return sendError(
      res,
      502,
      'INVALID_TRADE_RESPONSE',
      'Sandorio paslauga grąžino netinkamą atsakymą.',
    )
  }

  return res.status(200).json({
    success: true,
    transaction: {
      id: transaction.id,
      symbol: transaction.symbol,
      type: transaction.type,
      quantity: transaction.quantity,
      price: Number(transaction.price),
      total: Number(transaction.total),
      createdAt: transaction.created_at,
    },
    cashBalance: Number(cashBalance),
    snapshot: {
      id: snapshot.id,
      cashBalance: Number(snapshot.cashBalance),
      portfolioValue: Number(snapshot.portfolioValue),
      totalValue: Number(snapshot.totalValue),
      createdAt: snapshot.createdAt,
      marketPrices: snapshot.marketPrices,
    },
    replayed: data.replayed,
  })
}

async function getMarketPrices(supabase, userId, tradeSymbol) {
  const { data: positions, error } = await supabase
    .schema('public')
    .from('positions')
    .select('symbol')
    .eq('user_id', userId)
    .gt('quantity', 0)

  if (error) {
    return {
      error: {
        status: 500,
        code: 'POSITIONS_QUERY_FAILED',
        message: 'Nepavyko gauti vartotojo pozicijų kainoms nustatyti.',
      },
    }
  }

  // Always include the traded symbol. A concurrent trade can change whether
  // this symbol remains held before execute_trade acquires the profile lock.
  const symbols = new Set((positions ?? []).map((position) => position.symbol))
  symbols.add(tradeSymbol)

  const marketPrices = {}
  // Quote sequentially to avoid bursts against Alpha Vantage request limits.
  for (const symbol of symbols) {
    if (!ALLOWED_SYMBOLS.has(symbol)) {
      return {
        error: {
          status: 500,
          code: 'UNSUPPORTED_POSITION_SYMBOL',
          message: 'Vartotojo pozicijoje yra nepalaikomas akcijos simbolis.',
        },
      }
    }

    const result = await getQuote(symbol)
    if (result.error) return result
    marketPrices[symbol] = {
      price: result.quote.price,
      latestTradingDay: result.quote.latestTradingDay,
    }
  }

  // Alpha Vantage returns the latest available trading-day quote. Weekends
  // and market holidays can make that date older; no hourly cutoff is applied.
  return { marketPrices }
}

function mapRpcError(error) {
  const message = error?.message ?? ''
  if (message.includes('INSUFFICIENT_CASH')) {
    return { status: 409, code: 'INSUFFICIENT_CASH', message: 'Nepakanka lėšų šiam pirkimui.' }
  }
  if (message.includes('INSUFFICIENT_SHARES')) {
    return { status: 409, code: 'INSUFFICIENT_SHARES', message: 'Nepakanka akcijų šiam pardavimui.' }
  }
  if (message.includes('IDEMPOTENCY_KEY_REUSED')) {
    return { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Šis Idempotency-Key jau panaudotas kitam sandoriui.' }
  }
  if (message.includes('IDEMPOTENCY_RESULT_UNAVAILABLE')) {
    return { status: 409, code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', message: 'Ankstesnio sandorio rezultatas nepasiekiamas.' }
  }
  if (message.includes('MISSING_MARKET_PRICE')) {
    return { status: 409, code: 'PORTFOLIO_CHANGED_RETRY', message: 'Pozicijos pasikeitė renkant kainas. Pakartokite užklausą tuo pačiu Idempotency-Key.' }
  }
  if (message.includes('INVALID_MARKET_PRICE') || message.includes('INVALID_MARKET_PRICES')) {
    return { status: 502, code: 'INVALID_MARKET_PRICE', message: 'Nepavyko patvirtinti visų portfelio rinkos kainų.' }
  }
  if (message.includes('PROFILE_NOT_FOUND')) {
    return { status: 404, code: 'PROFILE_NOT_FOUND', message: 'Vartotojo profilis nerastas.' }
  }
  if (message.includes('INVALID_SYMBOL')) {
    return { status: 400, code: 'INVALID_SYMBOL', message: 'Simbolis turi būti AAPL, MSFT arba TSLA.' }
  }
  if (message.includes('INVALID_TRADE_ARGUMENT') || message.includes('INVALID_TRADE_TOTAL')) {
    return { status: 400, code: 'INVALID_TRADE', message: 'Sandorio duomenys netinkami.' }
  }
  return { status: 500, code: 'TRADE_FAILED', message: 'Nepavyko įvykdyti sandorio.' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Leidžiamas tik POST metodas.')
  }

  try {
    const authentication = await authenticateUser(req)
    if (authentication.error) {
      const { status, code, message } = authentication.error
      return sendError(res, status, code, message)
    }

    const idempotencyKey = req.headers?.['idempotency-key']
    if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
      return sendError(
        res,
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'Pateikite Idempotency-Key antraštę su galiojančiu UUID.',
      )
    }

    const body = parseBody(req.body)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendError(res, 400, 'INVALID_REQUEST_BODY', 'Užklausos turinys turi būti JSON objektas.')
    }

    const { symbol, type, quantity } = body
    if (!ALLOWED_SYMBOLS.has(symbol)) {
      return sendError(res, 400, 'INVALID_SYMBOL', 'Simbolis turi būti AAPL, MSFT arba TSLA.')
    }
    if (!ALLOWED_TYPES.has(type)) {
      return sendError(res, 400, 'INVALID_TRADE_TYPE', 'Sandorio tipas turi būti BUY arba SELL.')
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_INTEGER_QUANTITY) {
      return sendError(res, 400, 'INVALID_QUANTITY', 'Kiekis turi būti teigiamas sveikasis skaičius.')
    }

    const expectedOrder = { symbol, type, quantity }
    const { data: priorTransaction, error: lookupError } = await authentication.supabase
      .schema('public')
      .from('transactions')
      .select('id, symbol, type, quantity, price, total, created_at, cash_balance_after, snapshot_id, snapshot_portfolio_value_after, snapshot_total_value_after, snapshot_created_at, market_prices_after')
      .eq('user_id', authentication.user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (lookupError) {
      return sendError(
        res,
        500,
        'IDEMPOTENCY_LOOKUP_FAILED',
        'Nepavyko patikrinti ankstesnio sandorio.',
      )
    }

    if (priorTransaction) {
      if (
        priorTransaction.symbol !== symbol ||
        priorTransaction.type !== type ||
        priorTransaction.quantity !== quantity
      ) {
        return sendError(
          res,
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Šis Idempotency-Key jau panaudotas kitam sandoriui.',
        )
      }

      if (
        priorTransaction.cash_balance_after === null ||
        priorTransaction.cash_balance_after === undefined ||
        priorTransaction.snapshot_id === null ||
        priorTransaction.snapshot_portfolio_value_after === null ||
        priorTransaction.snapshot_total_value_after === null ||
        priorTransaction.snapshot_created_at === null ||
        priorTransaction.market_prices_after === null
      ) {
        return sendError(
          res,
          500,
          'IDEMPOTENCY_RESULT_UNAVAILABLE',
          'Ankstesnio sandorio arba snapshot rezultatas nepasiekiamas.',
        )
      }

      return sendTradeSuccess(res, {
        transaction: {
          id: priorTransaction.id,
          symbol: priorTransaction.symbol,
          type: priorTransaction.type,
          quantity: priorTransaction.quantity,
          price: priorTransaction.price,
          total: priorTransaction.total,
          created_at: priorTransaction.created_at,
        },
        cashBalance: priorTransaction.cash_balance_after,
        snapshot: {
          id: priorTransaction.snapshot_id,
          cashBalance: priorTransaction.cash_balance_after,
          portfolioValue: priorTransaction.snapshot_portfolio_value_after,
          totalValue: priorTransaction.snapshot_total_value_after,
          createdAt: priorTransaction.snapshot_created_at,
          marketPrices: priorTransaction.market_prices_after,
        },
        replayed: true,
      }, expectedOrder)
    }

    const marketPriceResult = await getMarketPrices(
      authentication.supabase,
      authentication.user.id,
      symbol,
    )
    if (marketPriceResult.error) {
      const { status, code, message } = marketPriceResult.error
      return sendError(res, status, code, message)
    }

    const tradeQuote = marketPriceResult.marketPrices[symbol]

    // The RPC validates this map against positions after obtaining the profile
    // lock; a concurrent new symbol therefore aborts the complete transaction.
    const { data, error } = await authentication.supabase.schema('public').rpc('execute_trade', {
      p_user_id: authentication.user.id,
      p_symbol: symbol,
      p_type: type,
      p_quantity: quantity,
      p_price: tradeQuote.price,
      p_idempotency_key: idempotencyKey,
      p_market_prices: marketPriceResult.marketPrices,
    })

    if (error) {
      const mapped = mapRpcError(error)
      return sendError(res, mapped.status, mapped.code, mapped.message)
    }

    return sendTradeSuccess(res, data, expectedOrder)
  } catch {
    return sendError(
      res,
      500,
      'INTERNAL_SERVER_ERROR',
      'Įvyko vidinė serverio klaida.',
    )
  }
}
