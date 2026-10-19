import ChartFrame from './ChartFrame.jsx'
import SeriesLine from './SeriesLine.jsx'
import { checkPortfolioSeries } from '../../contracts/formats.js'

export default function ValueChart({ series }) {
  const check = checkPortfolioSeries(series)
  const hasPoints = check.ok && series.points.length > 0

  return (
    <ChartFrame
      title="Portfolio value"
      note={check.ok ? series.currency : 'Shared format'}
      empty={!hasPoints}
      emptyText={check.ok ? 'Portfolio history will appear here.' : check.errors[0]}
    >
      {hasPoints ? (
        <SeriesLine points={series.points} valueKey="value" label="Portfolio value" />
      ) : null}
    </ChartFrame>
  )
}
