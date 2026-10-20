import { authenticateUser } from '../_lib/supabase.js'

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } })
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null
  }
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function parseIsoTime(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
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
    const [profileResult, snapshotsResult] = await Promise.all([
      authentication.supabase
        .from('profiles')
        .select('initial_balance')
        .eq('id', userId)
        .maybeSingle(),
      authentication.supabase
        .schema('public')
        .from('snapshots')
        .select('created_at, total_value')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ])

    if (profileResult.error || snapshotsResult.error) {
      return sendError(res, 500, 'HISTORY_QUERY_FAILED', 'Nepavyko gauti P/L istorijos.')
    }

    if (!profileResult.data) {
      return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Vartotojo profilis nerastas.')
    }

    const initialBalance = parseFiniteNumber(profileResult.data.initial_balance)
    if (initialBalance === null) {
      return sendError(res, 500, 'INVALID_HISTORY_DATA', 'P/L istorijos duomenys netinkami.')
    }

    const snapshots = snapshotsResult.data ?? []
    if (!Array.isArray(snapshots)) {
      return sendError(res, 500, 'INVALID_HISTORY_DATA', 'P/L istorijos duomenys netinkami.')
    }

    const points = snapshots.map((snapshot) => {
      const time = parseIsoTime(snapshot?.created_at)
      const totalValue = parseFiniteNumber(snapshot?.total_value)
      if (time === null || totalValue === null) return null
      return { time, value: roundMoney(totalValue - initialBalance) }
    })

    if (points.some((point) => point === null)) {
      return sendError(res, 500, 'INVALID_HISTORY_DATA', 'P/L istorijos duomenys netinkami.')
    }

    points.sort((a, b) => a.time.localeCompare(b.time))
    return res.status(200).json({ currency: 'USD', points })
  } catch {
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Įvyko vidinė serverio klaida.')
  }
}
