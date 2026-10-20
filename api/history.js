import { authenticateUser } from './_lib/supabase.js'

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  })
}

function parseNonNegativeNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round((number + Number.EPSILON) * 100) / 100
}

function parseIsoTime(value) {
  if (typeof value !== 'string' || value.trim() === '') return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
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
      .schema('public')
      .from('snapshots')
      .select('created_at, total_value')
      .eq('user_id', authentication.user.id)
      .order('created_at', { ascending: true })

    if (error) {
      return sendError(
        res,
        500,
        'HISTORY_QUERY_FAILED',
        'Nepavyko gauti vartotojo portfelio istorijos.',
      )
    }

    const points = (data ?? []).map((snapshot) => {
      const time = parseIsoTime(snapshot.created_at)
      const value = parseNonNegativeNumber(snapshot.total_value)
      if (time === null || value === null) return null
      return { time, value }
    })

    if (points.some((point) => point === null)) {
      return sendError(
        res,
        500,
        'INVALID_HISTORY_DATA',
        'Portfelio istorijoje yra neteisinga data arba vertė.',
      )
    }

    return res.status(200).json({ currency: 'USD', points })
  } catch {
    return sendError(
      res,
      500,
      'INTERNAL_SERVER_ERROR',
      'Įvyko vidinė serverio klaida.',
    )
  }
}
