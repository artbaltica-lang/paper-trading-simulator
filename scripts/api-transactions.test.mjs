import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mock } from 'node:test'

const authUrl = new URL('../api/_lib/supabase.js', import.meta.url).href
const transactionsUrl = new URL('../api/transactions.js', import.meta.url).href
const user = { id: 'transactions-test-user' }

function makeHarness({ authError = null, rows = [], queryError = null } = {}) {
  const calls = { auth: 0, selectedColumns: null, filters: [], order: null }
  const query = {
    select(columns) {
      calls.selectedColumns = columns
      return this
    },
    eq(column, value) {
      calls.filters.push([column, value])
      return this
    },
    order(column, options) {
      calls.order = [column, options]
      return Promise.resolve({ data: queryError ? null : rows, error: queryError })
    },
  }
  const supabase = {
    from(table) {
      assert.equal(table, 'transactions')
      return query
    },
  }

  mock.module(authUrl, { namedExports: { authenticateUser: async () => {
    calls.auth += 1
    if (authError) return { error: authError }
    return { supabase, user }
  } } })

  return {
    calls,
    loadHandler: async () => (await import(`${transactionsUrl}?case=${Math.random()}`)).default,
  }
}

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value },
    json(body) { this.body = body; return this },
  }
}

async function invoke(harness, method = 'GET') {
  const handler = await harness.loadHandler()
  const res = responseRecorder()
  await handler({ method, headers: {} }, res)
  return res
}

afterEach(() => mock.restoreAll())

test('returns authenticated user transaction history in response format', async () => {
  const rows = [
    { id: 'tx-new', symbol: 'AAPL', type: 'BUY', quantity: 2, price: 100.25, total: 200.5, created_at: '2026-10-20T12:00:00.000Z' },
    { id: 'tx-old', symbol: 'MSFT', type: 'SELL', quantity: 1, price: 90, total: 90, created_at: '2026-10-19T12:00:00.000Z' },
  ]
  const harness = makeHarness({ rows })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    transactions: [
      { id: 'tx-new', symbol: 'AAPL', type: 'BUY', quantity: 2, price: 100.25, total: 200.5, createdAt: '2026-10-20T12:00:00.000Z' },
      { id: 'tx-old', symbol: 'MSFT', type: 'SELL', quantity: 1, price: 90, total: 90, createdAt: '2026-10-19T12:00:00.000Z' },
    ],
  })
  assert.equal(harness.calls.selectedColumns, 'id, symbol, type, quantity, price, total, created_at')
})

test('returns an empty transaction history', async () => {
  const harness = makeHarness({ rows: [] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { transactions: [] })
})

test('filters transactions by the authenticated user ID', async () => {
  const harness = makeHarness()
  await invoke(harness)
  assert.deepEqual(harness.calls.filters, [['user_id', user.id]])
})

test('orders transactions by created_at descending', async () => {
  const harness = makeHarness()
  await invoke(harness)
  assert.deepEqual(harness.calls.order, ['created_at', { ascending: false }])
})

test('unauthenticated request returns auth error without querying Supabase', async () => {
  const harness = makeHarness({ authError: { status: 401, code: 'UNAUTHORIZED', message: 'mock unauthorized' } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error.code, 'UNAUTHORIZED')
  assert.equal(harness.calls.selectedColumns, null)
})

test('non-GET method returns 405 and Allow GET', async () => {
  const harness = makeHarness()
  const res = await invoke(harness, 'POST')
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.Allow, 'GET')
  assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED')
  assert.equal(harness.calls.auth, 0)
})

test('Supabase query error maps to HTTP 500', async () => {
  const harness = makeHarness({ queryError: new Error('mock transactions query error') })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'TRANSACTIONS_QUERY_FAILED')
})

test('missing result data is returned as an empty history', async () => {
  const harness = makeHarness({ rows: null })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { transactions: [] })
})

test('incomplete transaction row returns a generic server error', async () => {
  const harness = makeHarness({ rows: [{ id: 'tx-incomplete' }] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, {
    error: { code: 'INVALID_TRANSACTIONS_DATA', message: 'Sandorių istorijos duomenys netinkami.' },
  })
})

const invalidTransactionRows = [
  ['unsupported symbol', { id: 'tx-1', symbol: 'NOPE', type: 'BUY', quantity: 1, price: 10, total: 10, created_at: '2026-10-20T12:00:00Z' }],
  ['unsupported type', { id: 'tx-1', symbol: 'AAPL', type: 'HOLD', quantity: 1, price: 10, total: 10, created_at: '2026-10-20T12:00:00Z' }],
  ['nonpositive quantity', { id: 'tx-1', symbol: 'AAPL', type: 'BUY', quantity: 0, price: 10, total: 10, created_at: '2026-10-20T12:00:00Z' }],
  ['fractional quantity', { id: 'tx-1', symbol: 'AAPL', type: 'BUY', quantity: 1.5, price: 10, total: 15, created_at: '2026-10-20T12:00:00Z' }],
  ['invalid price', { id: 'tx-1', symbol: 'AAPL', type: 'BUY', quantity: 1, price: 0, total: 10, created_at: '2026-10-20T12:00:00Z' }],
  ['invalid total', { id: 'tx-1', symbol: 'AAPL', type: 'BUY', quantity: 1, price: 10, total: 'bad', created_at: '2026-10-20T12:00:00Z' }],
  ['invalid created_at', { id: 'tx-1', symbol: 'AAPL', type: 'BUY', quantity: 1, price: 10, total: 10, created_at: 'not-a-date' }],
]

for (const [label, row] of invalidTransactionRows) {
  test(`invalid transaction data: ${label}`, async () => {
    const harness = makeHarness({ rows: [row] })
    const res = await invoke(harness)
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.error.code, 'INVALID_TRANSACTIONS_DATA')
  })
}

test('unexpected non-array result data produces generic HTTP 500', async () => {
  const harness = makeHarness({ rows: { id: 'not-an-array' } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INVALID_TRANSACTIONS_DATA')
})
