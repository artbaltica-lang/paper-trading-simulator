import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPortfolioSeries, checkPriceSeries, checkProfitLossSeries } from '../src/contracts/formats.js'
import { historyToValueSeries, pricesToPriceSeries, profitLossToSeries, quoteToPriceSeries } from '../src/charts/series.js'

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

test('GET /api/prices tampa PriceChart serija', () => {
  const series = pricesToPriceSeries({
    symbol: 'AAPL',
    currency: 'USD',
    points: [
      { time: '2026-10-15', price: 188.1 },
      { time: '2026-10-16', price: 189.25 },
    ],
  })

  assert.equal(checkPriceSeries(series).ok, true)
  assert.equal(series.points[0].time, '2026-10-15T00:00:00.000Z')
  assert.equal(pricesToPriceSeries({ symbol: 'AAPL', currency: 'USD', points: [{ time: '2026-10-16', price: 0 }] }), null)
})

test('GET /api/history/profit-loss tampa P/L serija', () => {
  const series = profitLossToSeries({
    currency: 'USD',
    points: [
      { time: '2026-10-19T18:00:00.000Z', value: 0 },
      { time: '2026-10-19T19:00:00.000Z', value: -40.5 },
    ],
  })

  assert.equal(checkProfitLossSeries(series).ok, true)
  assert.equal(checkPortfolioSeries(series).ok, false)
  assert.equal(profitLossToSeries({ currency: 'USD', points: [{ time: 'bad', value: 1 }] }), null)
})
