import { useEffect, useState } from 'react'
import { quoteToPriceSeries } from '../../charts/series.js'
import PriceChart from './PriceChart.jsx'

export default function LivePriceChart({ symbol }) {
  const [series, setSeries] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        const next = quoteToPriceSeries(body)
        if (!response.ok || !next) {
          setMessage(body?.error?.message || 'Live price is unavailable.')
          return
        }
        setSeries(next)
      })
      .catch(() => {
        if (active) setMessage('Live price is unavailable.')
      })
    return () => {
      active = false
    }
  }, [symbol])

  if (message) return <p className="trade-error" role="status">{message}</p>
  return <PriceChart series={series || { symbol, currency: 'USD', points: [] }} />
}
