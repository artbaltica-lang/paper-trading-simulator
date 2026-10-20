import { historyToValueSeries } from '../../charts/series.js'
import ValueChart from './ValueChart.jsx'
import { useSeries } from './useSeries.js'

export default function LiveValueChart({ token }) {
  const { series, message } = useSeries('/api/history', historyToValueSeries, {
    token,
    enabled: Boolean(token),
  })

  if (!token) return <p className="chart-status" role="status">Sign in to see portfolio value.</p>
  if (message) return <p className="chart-status" role="status">{message}</p>
  return <ValueChart series={series || { currency: 'USD', points: [] }} />
}
