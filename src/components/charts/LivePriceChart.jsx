import { pricesToPriceSeries } from '../../charts/series.js'
import PriceChart from './PriceChart.jsx'
import { useSeries } from './useSeries.js'

export default function LivePriceChart({ symbol }) {
  const { series, message } = useSeries(
    `/api/prices?symbol=${encodeURIComponent(symbol)}`,
    pricesToPriceSeries,
  )

  if (message) return <p className="chart-status" role="status">{message}</p>
  return <PriceChart series={series || { symbol, currency: 'USD', points: [] }} />
}
