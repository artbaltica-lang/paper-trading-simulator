import ChartFrame from './ChartFrame.jsx'
import SeriesLine from './SeriesLine.jsx'
import { checkProfitLossSeries } from '../../contracts/formats.js'

export default function ProfitLossChart({ series }) {
  const check = checkProfitLossSeries(series)
  const hasPoints = check.ok && series.points.length > 0

  return (
    <ChartFrame
      title="Profit / Loss"
      note={check.ok ? series.currency : 'Shared format'}
      empty={!hasPoints}
      emptyText={check.ok ? 'Profit and loss history will appear here.' : check.errors[0]}
    >
      {hasPoints ? (
        <SeriesLine points={series.points} valueKey="value" label="Profit and loss" />
      ) : null}
    </ChartFrame>
  )
}
