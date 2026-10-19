import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTrade, createAccount } from '../src/trading/applyTrade.js'

const buy = {
  symbol: 'AAPL',
  side: 'buy',
  quantity: 10,
  price: 100,
  time: '2026-10-19T18:00:00.000Z',
}

test('pirkimas sumažina balansą, sukuria poziciją ir įrašo istoriją', () => {
  const account = createAccount(10000)
  const result = applyTrade(account, buy)

  assert.equal(result.ok, true)
  assert.equal(result.state.balance, 9000)
  assert.deepEqual(result.state.positions, [{ symbol: 'AAPL', quantity: 10, avg_price: 100 }])
  assert.deepEqual(result.state.transactions, [{
    symbol: 'AAPL',
    side: 'buy',
    quantity: 10,
    price: 100,
    total: 1000,
    time: buy.time,
  }])
  assert.equal(account.balance, 10000)
  assert.equal(account.positions.length, 0)
  assert.equal(account.transactions.length, 0)
})

test('antras pirkimas atnaujina vidutinę kainą', () => {
  const first = applyTrade(createAccount(10000), buy)
  const second = applyTrade(first.state, {
    ...buy,
    price: 120,
    time: '2026-10-19T18:05:00.000Z',
  })

  assert.equal(second.state.balance, 7800)
  assert.deepEqual(second.state.positions, [{ symbol: 'AAPL', quantity: 20, avg_price: 110 }])
  assert.equal(second.state.transactions.length, 2)
})

test('per didelis pirkimas nieko nekeičia', () => {
  const account = createAccount(500)
  const result = applyTrade(account, buy)

  assert.equal(result.ok, false)
  assert.equal(result.state, account)
  assert.equal(account.transactions.length, 0)
})

test('pardavimas padidina balansą, sumažina poziciją ir prideda istoriją', () => {
  const bought = applyTrade(createAccount(10000), buy)
  const sold = applyTrade(bought.state, {
    symbol: 'AAPL',
    side: 'sell',
    quantity: 4,
    price: 110,
    time: '2026-10-19T19:00:00.000Z',
  })

  assert.equal(sold.ok, true)
  assert.equal(sold.state.balance, 9440)
  assert.deepEqual(sold.state.positions, [{ symbol: 'AAPL', quantity: 6, avg_price: 100 }])
  assert.equal(sold.state.transactions.length, 2)
  assert.equal(sold.state.transactions[1].side, 'sell')
  assert.equal(sold.state.transactions[1].total, 440)
})

test('visos pozicijos pardavimas ją pašalina', () => {
  const bought = applyTrade(createAccount(10000), buy)
  const sold = applyTrade(bought.state, { ...buy, side: 'sell', price: 105, time: '2026-10-19T19:00:00.000Z' })

  assert.equal(sold.state.balance, 10050)
  assert.deepEqual(sold.state.positions, [])
  assert.equal(sold.state.transactions.length, 2)
})

test('pardavimas be pozicijos nieko nekeičia', () => {
  const account = createAccount(10000)
  const result = applyTrade(account, { ...buy, side: 'sell' })

  assert.equal(result.ok, false)
  assert.equal(result.state, account)
})

test('pilnas kelias: pirkimas ir pardavimas palieka teisingą balansą, poziciją ir istoriją', () => {
  const bought = applyTrade(createAccount(10000), buy)
  const sold = applyTrade(bought.state, {
    symbol: 'AAPL',
    side: 'sell',
    quantity: 4,
    price: 110,
    time: '2026-10-19T19:00:00.000Z',
  })

  assert.equal(sold.state.balance, 9440)
  assert.equal(sold.state.positions[0].quantity, 6)
  assert.deepEqual(
    sold.state.transactions.map((row) => [row.side, row.quantity, row.total]),
    [['buy', 10, 1000], ['sell', 4, 440]],
  )
})
