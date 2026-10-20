import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPortfolioSeries, checkPriceSeries } from '../src/contracts/formats.js'
import { historyToValueSeries, quoteToPriceSeries } from '../src/charts/series.js'

test('GET /api/quote tampa PriceChart serija', () => {
  const series = quoteToPriceSeries({
    symbol: 'AAPL',
    price: 189.25,
    latestTradingDay: '2026-10-16',
  })

  assert.deepEqual(series, {
    symbol: 'AAPL',
    currency: 'USD',
    points: [{ time: '2026-10-16T00:00:00.000Z', price: 189.25 }],
  })
  assert.equal(checkPriceSeries(series).ok, true)
  assert.equal(quoteToPriceSeries({ symbol: 'AAPL', price: 0, latestTradingDay: '2026-10-16' }), null)
})

test('GET /api/history tampa ValueChart serija', () => {
  const series = historyToValueSeries({
    currency: 'USD',
    points: [
      { time: '2026-10-19T18:00:00.000Z', value: 10000 },
      { time: '2026-10-19T19:00:00.000Z', value: 10100 },
    ],
  })

  assert.equal(checkPortfolioSeries(series).ok, true)
  assert.equal(series.points.length, 2)
  assert.equal(historyToValueSeries({ currency: 'USD' }), null)
})
