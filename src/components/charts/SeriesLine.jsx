function linePath(points, valueKey) {
  const values = points.map((point) => point[valueKey])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const lastIndex = Math.max(points.length - 1, 1)

  return points
    .map((point, index) => {
      const x = (index / lastIndex) * 100
      const y = 10 + (1 - (point[valueKey] - min) / span) * 80
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export default function SeriesLine({ points, valueKey, label }) {
  const last = points[points.length - 1]
  const path = linePath(points, valueKey)

  return (
    <div className="chart-plot">
      <svg viewBox="0 0 100 100" role="img" aria-label={label}>
        <path d={path} />
      </svg>
      <p className="chart-last">
        {last[valueKey]}
        <span>{last.time}</span>
      </p>
    </div>
  )
}
