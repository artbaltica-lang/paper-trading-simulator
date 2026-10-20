import { getPrices } from './_lib/prices.js'

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Leidžiamas tik GET metodas.')
  }

  const symbol = typeof req.query?.symbol === 'string' ? req.query.symbol : ''
  try {
    const result = await getPrices(symbol)
    if (result.error) {
      const { status, code, message } = result.error
      return sendError(res, status, code, message)
    }
    return res.status(200).json(result.prices)
  } catch {
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Įvyko vidinė serverio klaida.')
  }
}
