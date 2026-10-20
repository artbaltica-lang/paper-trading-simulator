import { authenticateUser } from './_lib/supabase.js'

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  })
}

function isValidTransaction(row) {
  return row &&
    typeof row.id === 'string' && row.id.trim() !== '' &&
    ['AAPL', 'MSFT', 'TSLA'].includes(row.symbol) &&
    ['BUY', 'SELL'].includes(row.type) &&
    Number.isSafeInteger(row.quantity) && row.quantity > 0 &&
    isFinitePositiveNumber(row.price) &&
    isFinitePositiveNumber(row.total) &&
    typeof row.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at))
}

function isFinitePositiveNumber(value) {
  return value !== null && value !== undefined && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) > 0
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

    const { data, error } = await authentication.supabase
      .from('transactions')
      .select('id, symbol, type, quantity, price, total, created_at')
      .eq('user_id', authentication.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return sendError(
        res,
        500,
        'TRANSACTIONS_QUERY_FAILED',
        'Nepavyko gauti vartotojo sandorių.',
      )
    }

    const rows = data ?? []
    if (!Array.isArray(rows) || rows.some((row) => !isValidTransaction(row))) {
      return sendError(
        res,
        500,
        'INVALID_TRANSACTIONS_DATA',
        'Sandorių istorijos duomenys netinkami.',
      )
    }

    const transactions = rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      type: row.type,
      quantity: row.quantity,
      price: row.price,
      total: row.total,
      createdAt: row.created_at,
    }))

    return res.status(200).json({ transactions })
  } catch {
    return sendError(
      res,
      500,
      'INTERNAL_SERVER_ERROR',
      'Įvyko vidinė serverio klaida.',
    )
  }
}
