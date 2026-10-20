import { profitLossToSeries } from '../../charts/series.js'
import ProfitLossChart from './ProfitLossChart.jsx'
import { useSeries } from './useSeries.js'

const emptySeries = { currency: 'USD', points: [] }

export default function LiveProfitLossChart({ token }) {
  const { series, message } = useSeries('/api/history/profit-loss', profitLossToSeries, {
    token,
    enabled: Boolean(token),
  })

  if (!token) return <p className="chart-status" role="status">Sign in to see profit and loss.</p>
  if (message) return <p className="chart-status" role="status">{message}</p>
  return <ProfitLossChart series={series || emptySeries} />
}
