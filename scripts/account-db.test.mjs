import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountFromApi,
  createMemoryStorage,
  loadAccount,
  portfolioValue,
  readAccount,
  toHistoryView,
  toPortfolioView,
  toValueSeries,
  writeAccount,
} from '../src/db/account.js'

const savedAccount = {
  currency: 'USD',
  initialBalance: 10000,
  cashBalance: 9000,
  holdings: [{ symbol: 'AAPL', name: 'Apple Inc.', quantity: 10, avg_price: 100, currentPrice: 100 }],
  transactions: [{ id: 'tx-1', time: '2026-10-19T18:00:00.000Z', symbol: 'AAPL', side: 'buy', quantity: 10, price: 100 }],
  snapshots: [{ time: '2026-10-19T18:00:00.000Z', value: 10000 }],
}

test('po perkrovimo grynieji, vertė ir istorija sutampa su įrašu', () => {
  const storage = createMemoryStorage()
  writeAccount(storage, savedAccount)
  const reloaded = readAccount(storage)

  assert.equal(reloaded.cashBalance, 9000)
  assert.equal(portfolioValue(reloaded), 10000)
  assert.equal(toPortfolioView(reloaded).cashBalance, 9000)
  assert.equal(toHistoryView(reloaded).transactions.length, 1)
  assert.equal(toHistoryView(reloaded).transactions[0].type, 'BUY')
  assert.deepEqual(toValueSeries(reloaded).points, [{ time: '2026-10-19T18:00:00.000Z', value: 10000 }])
})

test('API portfelis ir sandoriai tampa tais pačiais rodiniais', async () => {
  const portfolio = {
    currency: 'USD',
    initialBalance: 10000,
    cashBalance: 9440,
    holdings: [{ symbol: 'AAPL', name: 'Apple Inc.', quantity: 6, avg_price: 100, currentPrice: 110 }],
    snapshots: [
      { time: '2026-10-19T18:00:00.000Z', value: 10000 },
      { time: '2026-10-19T19:00:00.000Z', value: 10100 },
    ],
  }
  const transactions = [
    { id: 'tx-1', time: '2026-10-19T18:00:00.000Z', symbol: 'AAPL', side: 'buy', quantity: 10, price: 100 },
    { id: 'tx-2', time: '2026-10-19T19:00:00.000Z', symbol: 'AAPL', type: 'SELL', quantity: 4, price: 110 },
  ]
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () => (url === '/api/portfolio' ? portfolio : transactions),
  })

  const account = await loadAccount({ fetchImpl, storage: createMemoryStorage() })

  assert.equal(account.cashBalance, 9440)
  assert.equal(portfolioValue(account), 10100)
  assert.equal(toHistoryView(account).transactions[1].type, 'SELL')
  assert.equal(toValueSeries(account).points.length, 2)
  assert.deepEqual(accountFromApi(portfolio, transactions).cashBalance, account.cashBalance)
})
