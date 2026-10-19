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

function sendTradeSuccess(res, data, expectedOrder) {
  const transaction = data?.transaction
  const cashBalance = data?.cashBalance
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
    Number(cashBalance) < 0
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
    replayed: data.replayed,
  })
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
      .select('id, symbol, type, quantity, price, total, created_at, cash_balance_after')
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

      if (priorTransaction.cash_balance_after === null || priorTransaction.cash_balance_after === undefined) {
        return sendError(
          res,
          500,
          'IDEMPOTENCY_RESULT_UNAVAILABLE',
          'Ankstesnio sandorio balanso rezultatas nepasiekiamas.',
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
        replayed: true,
      }, expectedOrder)
    }

    const quoteResult = await getQuote(symbol)
    if (quoteResult.error) {
      const { status, code, message } = quoteResult.error
      return sendError(res, status, code, message)
    }

    // RPC is the only writer: its profile lock, transaction row and saved balance
    // make retries safe even if Alpha Vantage returns a newer price.
    const { data, error } = await authentication.supabase.schema('public').rpc('execute_trade', {
      p_user_id: authentication.user.id,
      p_symbol: symbol,
      p_type: type,
      p_quantity: quantity,
      p_price: quoteResult.quote.price,
      p_idempotency_key: idempotencyKey,
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
