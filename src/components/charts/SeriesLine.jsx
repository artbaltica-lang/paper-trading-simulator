import { useState } from 'react'
import { formatChartTime, formatChartUsd } from './format.js'

function placePoints(points, valueKey) {
  const values = points.map((point) => point[valueKey])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const flat = min === max
  const lastIndex = Math.max(points.length - 1, 1)

  const placed = points.map((point, index) => ({
    point,
    x: points.length === 1 ? 50 : (index / lastIndex) * 100,
    y: flat ? 50 : 14 + (1 - (point[valueKey] - min) / (max - min)) * 72,
  }))

  const path = placed.length < 2
    ? ''
    : placed
      .map((item, index) => `${index === 0 ? 'M' : 'L'} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`)
      .join(' ')

  return { min, max, flat, placed, path }
}

export default function SeriesLine({ points, valueKey, label }) {
  const [active, setActive] = useState(null)
  const { min, max, flat, placed, path } = placePoints(points, valueKey)
  const shown = placed[active] || placed[placed.length - 1]
  const firstTime = formatChartTime(placed[0].point.time)
  const lastTime = formatChartTime(placed[placed.length - 1].point.time)

  return (
    <div className="chart-plot">
      <div className="chart-body">
        <div className={`chart-y${flat ? ' is-flat' : ''}`} aria-hidden="true">
          <span>{formatChartUsd(max)}</span>
          {flat ? null : <span>{formatChartUsd(min)}</span>}
        </div>
        <div
          className="chart-canvas"
          onPointerLeave={() => setActive(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
            {path ? <path d={path} /> : null}
          </svg>
          {placed.map((item, index) => (
            <button
              key={`${item.point.time}-${index}`}
              type="button"
              className={`chart-dot${index === (active ?? placed.length - 1) ? ' is-active' : ''}`}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              aria-label={`${formatChartUsd(item.point[valueKey])} ${formatChartTime(item.point.time)}`}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            />
          ))}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        <span />
        <span className={`chart-x-labels${lastTime === firstTime ? ' is-single' : ''}`}>
          <span>{firstTime}</span>
          {lastTime === firstTime ? null : <span>{lastTime}</span>}
        </span>
      </div>
      <p className="chart-readout">
        <strong>{formatChartUsd(shown.point[valueKey])}</strong>
        <span>{formatChartTime(shown.point.time)}</span>
      </p>
    </div>
  )
}
