import { createClient } from '@supabase/supabase-js'

export function getBearerToken(req) {
  const authorization = req.headers?.authorization
  if (typeof authorization !== 'string') return null

  const match = authorization.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

export async function authenticateUser(req) {
  const token = getBearerToken(req)
  if (!token) {
    return {
      error: {
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Pateikite galiojantį Bearer prieigos tokeną.',
      },
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: {
        status: 500,
        code: 'SERVER_CONFIGURATION_ERROR',
        message: 'Supabase serverio aplinka nesukonfigūruota.',
      },
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) {
    return {
      error: {
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Prieigos tokenas negaliojantis arba pasibaigęs.',
      },
    }
  }

  return { supabase, user: data.user }
}
