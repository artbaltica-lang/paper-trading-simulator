import ChartFrame from './ChartFrame.jsx'
import SeriesLine from './SeriesLine.jsx'
import { checkPriceSeries } from '../../contracts/formats.js'

export default function PriceChart({ series }) {
  const check = checkPriceSeries(series)
  const hasPoints = check.ok && series.points.length > 0

  return (
    <ChartFrame
      title={check.ok ? series.symbol : 'Price'}
      note={check.ok ? series.currency : 'Shared format'}
      empty={!hasPoints}
      emptyText={check.ok ? 'Price history will appear here.' : check.errors[0]}
    >
      {hasPoints ? (
        <SeriesLine points={series.points} valueKey="price" label={`${series.symbol} price`} />
      ) : null}
    </ChartFrame>
  )
}
