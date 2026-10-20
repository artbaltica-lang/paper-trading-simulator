import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mock } from 'node:test'

const authUrl = new URL('../api/_lib/supabase.js', import.meta.url).href
const quotesUrl = new URL('../api/_lib/quotes.js', import.meta.url).href
const tradeUrl = new URL('../api/trade.js', import.meta.url).href
const validKey = '123e4567-e89b-42d3-a456-426614174000'
const user = { id: 'user-test-1' }
const validResponse = (overrides = {}) => ({
  transaction: {
    id: 'transaction-1', symbol: 'AAPL', type: 'BUY', quantity: 1,
    price: 100, total: 100, created_at: '2026-10-20T10:00:00.000Z',
  },
  cashBalance: 9900,
  snapshot: {
    id: 'snapshot-1', cashBalance: 9900, portfolioValue: 100,
    totalValue: 10000, createdAt: '2026-10-20T10:00:00.000Z',
    marketPrices: { AAPL: { price: 100, latestTradingDay: '2026-10-20' } },
  },
  replayed: false,
  ...overrides,
})

function makeHarness({ authResult, quoteResult, priorTransaction = null, priorTransactionsByUser = null, lookupError = null, rpcResult, rpcHandler = null, positionsError = null, throwOnAuth = false, throwOnLookup = false } = {}) {
  const calls = { auth: 0, quote: [], rpc: [], lookup: 0, transactionFilters: [] }
  const authentication = authResult ?? { supabase: null, user }
  let lookupUserId = null
  let lookupKey = null
  const positionsQuery = {
    select() { return this },
    eq() { return this },
    gt() { return Promise.resolve({ data: positionsError ? null : [], error: positionsError }) },
  }
  const transactionQuery = {
    select() { return this },
    eq(column, value) {
      calls.transactionFilters.push([column, value])
      if (column === 'user_id') lookupUserId = value
      if (column === 'idempotency_key') lookupKey = value
      return this
    },
    maybeSingle() {
      calls.lookup += 1
      if (throwOnLookup) throw new Error('sensitive database detail')
      const data = priorTransactionsByUser
        ? priorTransactionsByUser[lookupUserId]?.[lookupKey] ?? null
        : priorTransaction
      return Promise.resolve({ data, error: lookupError })
    },
  }
  const supabase = {
    schema(schema) {
      assert.equal(schema, 'public')
      return {
        from(table) {
          if (table === 'positions') return positionsQuery
          if (table === 'transactions') return transactionQuery
          throw new Error(`Unexpected table: ${table}`)
        },
        rpc(name, args) {
          calls.rpc.push({ name, args })
          if (rpcHandler) return Promise.resolve(rpcHandler(name, args, calls.rpc.length))
          return Promise.resolve(rpcResult ?? { data: validResponse(), error: null })
        },
      }
    },
  }

  mock.module(authUrl, { namedExports: { authenticateUser: async (req) => {
    calls.auth += 1
    if (throwOnAuth) throw new Error('sensitive authentication detail')
    if (authResult?.error) return authResult
    const authenticatedUser = req.headers?.['x-test-user'] === 'second-user'
      ? { id: 'user-test-2' }
      : user
    return { supabase, user: authenticatedUser }
  } } })
  mock.module(quotesUrl, { namedExports: { getQuote: async (symbol) => {
    calls.quote.push(symbol)
    return quoteResult ?? { quote: { symbol, price: 100, latestTradingDay: '2026-10-20' } }
  } } })

  return { calls, loadHandler: async () => (await import(`${tradeUrl}?case=${Math.random()}`)).default }
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

async function invoke(harness, { method = 'POST', headers = { 'idempotency-key': validKey }, body = { symbol: 'AAPL', type: 'BUY', quantity: 1 } } = {}) {
  const handler = await harness.loadHandler()
  const res = responseRecorder()
  await handler({ method, headers, body }, res)
  return res
}

afterEach(() => mock.restoreAll())

test('successful BUY returns validated result and calls RPC with BUY parameters', async () => {
  const harness = makeHarness()
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.transaction.type, 'BUY')
  assert.equal(res.body.cashBalance, 9900)
  assert.equal(harness.calls.rpc[0].args.p_type, 'BUY')
  assert.equal(harness.calls.rpc[0].args.p_user_id, user.id)
})

test('same Idempotency-Key replays a stored SELL without quote or RPC', async () => {
  const prior = {
    id: 'transaction-sell-prior', symbol: 'AAPL', type: 'SELL', quantity: 1,
    price: 100, total: 100, created_at: '2026-10-20T10:00:00.000Z',
    cash_balance_after: 10100, snapshot_id: 'snapshot-sell-prior',
    snapshot_portfolio_value_after: 0, snapshot_total_value_after: 10100,
    snapshot_created_at: '2026-10-20T10:00:00.000Z',
    market_prices_after: { AAPL: { price: 100, latestTradingDay: '2026-10-20' } },
  }
  const harness = makeHarness({ priorTransaction: prior })
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'SELL', quantity: 1 } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.replayed, true)
  assert.equal(res.body.transaction.id, 'transaction-sell-prior')
  assert.equal(res.body.transaction.type, 'SELL')
  assert.equal(harness.calls.quote.length, 0)
  assert.equal(harness.calls.rpc.length, 0)
})

test('same key is scoped to authenticated user and does not expose another user transaction', async () => {
  const firstUserPrior = {
    id: 'user-one-private-transaction', symbol: 'AAPL', type: 'BUY', quantity: 1,
    price: 100, total: 100, created_at: '2026-10-20T10:00:00.000Z',
    cash_balance_after: 9900, snapshot_id: 'snapshot-user-one',
    snapshot_portfolio_value_after: 100, snapshot_total_value_after: 10000,
    snapshot_created_at: '2026-10-20T10:00:00.000Z',
    market_prices_after: { AAPL: { price: 100, latestTradingDay: '2026-10-20' } },
  }
  const harness = makeHarness({ priorTransactionsByUser: { [user.id]: { [validKey]: firstUserPrior } } })
  const firstRes = await invoke(harness)
  const secondRes = await invoke(harness, {
    headers: { 'idempotency-key': validKey, 'x-test-user': 'second-user' },
  })

  assert.equal(firstRes.statusCode, 200)
  assert.equal(firstRes.body.transaction.id, 'user-one-private-transaction')
  assert.equal(firstRes.body.replayed, true)
  assert.equal(secondRes.statusCode, 200)
  assert.notEqual(secondRes.body.transaction.id, 'user-one-private-transaction')
  assert.equal(secondRes.body.replayed, false)
  assert.deepEqual(harness.calls.transactionFilters.filter(([column]) => column === 'user_id'), [
    ['user_id', 'user-test-1'], ['user_id', 'user-test-2'],
  ])
  assert.equal(harness.calls.rpc.length, 1)
  assert.equal(harness.calls.rpc[0].args.p_user_id, 'user-test-2')
})

test('concurrent identical requests that both miss lookup rely on RPC idempotent replay', async () => {
  let rpcCalls = 0
  const harness = makeHarness({
    rpcHandler: (_name, _args, callNumber) => {
      rpcCalls += 1
      return { data: validResponse({ replayed: callNumber > 1 }), error: null }
    },
  })
  const request = {
    headers: { 'idempotency-key': validKey },
    body: { symbol: 'AAPL', type: 'BUY', quantity: 1 },
  }
  const [firstRes, secondRes] = await Promise.all([
    invoke(harness, request),
    invoke(harness, request),
  ])

  assert.equal(harness.calls.lookup, 2)
  assert.equal(harness.calls.rpc.length, 2)
  assert.equal(rpcCalls, 2)
  assert.deepEqual(harness.calls.rpc.map((call) => call.args.p_idempotency_key), [validKey, validKey])
  assert.deepEqual(harness.calls.rpc.map((call) => call.args.p_user_id), [user.id, user.id])
  assert.deepEqual([firstRes, secondRes].map((res) => res.statusCode), [200, 200])
  assert.deepEqual([firstRes, secondRes].map((res) => res.body.transaction.id), ['transaction-1', 'transaction-1'])
  assert.deepEqual([firstRes, secondRes].map((res) => res.body.replayed).sort(), [false, true])
})

test('quantity 1 is accepted and passed to the RPC', async () => {
  const harness = makeHarness()
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'BUY', quantity: 1 } })
  assert.equal(res.statusCode, 200)
  assert.equal(harness.calls.rpc[0].args.p_quantity, 1)
})

test('maximum integer quantity is accepted and passed to the RPC', async () => {
  const quantity = 2_147_483_647
  const total = quantity * 100
  const harness = makeHarness({ rpcResult: { data: validResponse({
    transaction: { ...validResponse().transaction, quantity, total },
    cashBalance: 0,
    snapshot: { ...validResponse().snapshot, cashBalance: 0, portfolioValue: total, totalValue: total },
  }), error: null } })
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'BUY', quantity } })
  assert.equal(res.statusCode, 200)
  assert.equal(harness.calls.rpc[0].args.p_quantity, quantity)
})

test('successful SELL returns validated result and calls RPC with SELL parameters', async () => {
  const harness = makeHarness({ rpcResult: { data: validResponse({
    transaction: { ...validResponse().transaction, type: 'SELL' }, cashBalance: 10100,
    snapshot: { ...validResponse().snapshot, cashBalance: 10100, totalValue: 10200 },
  }), error: null } })
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'SELL', quantity: 1 } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.transaction.type, 'SELL')
  assert.equal(res.body.cashBalance, 10100)
  assert.equal(harness.calls.rpc[0].args.p_type, 'SELL')
})

test('INSUFFICIENT_CASH maps to HTTP 409', async () => {
  const harness = makeHarness({ rpcResult: { data: null, error: { message: 'INSUFFICIENT_CASH' } } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_CASH')
})

test('INSUFFICIENT_SHARES maps to HTTP 409', async () => {
  const harness = makeHarness({ rpcResult: { data: null, error: { message: 'INSUFFICIENT_SHARES' } } })
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'SELL', quantity: 1 } })
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_SHARES')
})

test('same idempotency key replays stored transaction without quote or RPC', async () => {
  const prior = {
    id: 'transaction-prior', symbol: 'AAPL', type: 'BUY', quantity: 1,
    price: 100, total: 100, created_at: '2026-10-20T10:00:00.000Z',
    cash_balance_after: 9900, snapshot_id: 'snapshot-prior',
    snapshot_portfolio_value_after: 100, snapshot_total_value_after: 10000,
    snapshot_created_at: '2026-10-20T10:00:00.000Z',
    market_prices_after: { AAPL: { price: 100, latestTradingDay: '2026-10-20' } },
  }
  const harness = makeHarness({ priorTransaction: prior })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.replayed, true)
  assert.equal(res.body.transaction.id, 'transaction-prior')
  assert.equal(harness.calls.quote.length, 0)
  assert.equal(harness.calls.rpc.length, 0)
})

test('reusing key for a different order returns HTTP 409', async () => {
  const harness = makeHarness({ priorTransaction: { symbol: 'AAPL', type: 'BUY', quantity: 1 } })
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'SELL', quantity: 1 } })
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.error.code, 'IDEMPOTENCY_KEY_REUSED')
  assert.equal(harness.calls.quote.length, 0)
  assert.equal(harness.calls.rpc.length, 0)
})

const invalidRequests = [
  ['wrong method', { method: 'GET' }, 405, 'METHOD_NOT_ALLOWED'],
  ['missing idempotency key', { headers: {} }, 400, 'INVALID_IDEMPOTENCY_KEY'],
  ['malformed idempotency key', { headers: { 'idempotency-key': 'nope' } }, 400, 'INVALID_IDEMPOTENCY_KEY'],
  ['malformed JSON', { body: '{' }, 400, 'INVALID_REQUEST_BODY'],
  ['array body', { body: [] }, 400, 'INVALID_REQUEST_BODY'],
  ['unsupported symbol', { body: { symbol: 'NOPE', type: 'BUY', quantity: 1 } }, 400, 'INVALID_SYMBOL'],
  ['unsupported type', { body: { symbol: 'AAPL', type: 'HOLD', quantity: 1 } }, 400, 'INVALID_TRADE_TYPE'],
  ['nonpositive quantity', { body: { symbol: 'AAPL', type: 'BUY', quantity: 0 } }, 400, 'INVALID_QUANTITY'],
  ['fractional quantity', { body: { symbol: 'AAPL', type: 'BUY', quantity: 1.5 } }, 400, 'INVALID_QUANTITY'],
  ['quantity above maximum', { body: { symbol: 'AAPL', type: 'BUY', quantity: 2_147_483_648 } }, 400, 'INVALID_QUANTITY'],
]

for (const [label, request, status, code] of invalidRequests) {
  test(`invalid request: ${label}`, async () => {
    const harness = makeHarness()
    const res = await invoke(harness, request)
    assert.equal(res.statusCode, status)
    assert.equal(res.body.error.code, code)
    assert.equal(harness.calls.rpc.length, 0)
  })
}

test('invalid RPC success payload maps to HTTP 502', async () => {
  const harness = makeHarness({ rpcResult: { data: { transaction: {} }, error: null } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error.code, 'INVALID_TRADE_RESPONSE')
})

test('authentication dependency error is returned without quote or RPC', async () => {
  const harness = makeHarness({ authResult: { error: { status: 401, code: 'UNAUTHORIZED', message: 'denied' } } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error.code, 'UNAUTHORIZED')
  assert.equal(harness.calls.quote.length, 0)
  assert.equal(harness.calls.rpc.length, 0)
})

test('positions lookup error maps to HTTP 500', async () => {
  const harness = makeHarness({ positionsError: new Error('mock positions failure') })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'POSITIONS_QUERY_FAILED')
  assert.equal(harness.calls.quote.length, 0)
})

test('quote provider error is returned and RPC is not called', async () => {
  const harness = makeHarness({ quoteResult: { error: { status: 502, code: 'PROVIDER_ERROR', message: 'mock provider error' } } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error.code, 'PROVIDER_ERROR')
  assert.equal(harness.calls.rpc.length, 0)
})

test('RPC dependency error maps to generic HTTP 500', async () => {
  const harness = makeHarness({ rpcResult: { data: null, error: { message: 'unclassified mock failure' } } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'TRADE_FAILED')
})

test('negative quantity returns INVALID_QUANTITY without calling RPC', async () => {
  const harness = makeHarness()
  const res = await invoke(harness, { body: { symbol: 'AAPL', type: 'BUY', quantity: -1 } })
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error.code, 'INVALID_QUANTITY')
  assert.equal(harness.calls.rpc.length, 0)
})

test('unexpected authentication exception returns safe HTTP 500 JSON', async () => {
  const harness = makeHarness({ throwOnAuth: true })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INTERNAL_SERVER_ERROR')
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive|database detail/)
})

test('unexpected Supabase lookup exception returns safe HTTP 500 JSON', async () => {
  const harness = makeHarness({ throwOnLookup: true })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INTERNAL_SERVER_ERROR')
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive|database detail/)
})

for (const [providerMessage, expectedStatus, expectedCode] of [
  ['IDEMPOTENCY_KEY_REUSED sensitive database detail', 409, 'IDEMPOTENCY_KEY_REUSED'],
  ['MISSING_MARKET_PRICE sensitive database detail', 409, 'PORTFOLIO_CHANGED_RETRY'],
  ['INVALID_MARKET_PRICE sensitive provider detail', 502, 'INVALID_MARKET_PRICE'],
]) {
  test(`maps RPC error ${expectedCode} without exposing provider details`, async () => {
    const harness = makeHarness({ rpcResult: { data: null, error: { message: providerMessage } } })
    const res = await invoke(harness)
    assert.equal(res.statusCode, expectedStatus)
    assert.equal(res.body.error.code, expectedCode)
    assert.doesNotMatch(JSON.stringify(res.body), /sensitive|database detail|provider detail/)
  })
}
