import { useEffect, useState } from 'react'

export function useSeries(url, map, { token, enabled = true } = {}) {
  const [series, setSeries] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined
    fetch(url, { headers })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        const next = map(body)
        if (!response.ok || !next) {
          setSeries(null)
          setMessage(body?.error?.message || 'Chart data is unavailable.')
          return
        }
        setMessage('')
        setSeries(next)
      })
      .catch(() => {
        if (!active) return
        setSeries(null)
        setMessage('Chart data is unavailable.')
      })
    return () => {
      active = false
    }
  }, [url, map, token, enabled])

  return { series, message }
}
