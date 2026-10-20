import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mock } from 'node:test'

const authUrl = new URL('../api/_lib/supabase.js', import.meta.url).href
const quotesUrl = new URL('../api/_lib/quotes.js', import.meta.url).href
const portfolioUrl = new URL('../api/portfolio.js', import.meta.url).href
const user = { id: 'portfolio-test-user' }

function makeHarness({ authError = null, profile = { initial_balance: 10000, cash_balance: 10000 }, profileError = null, positions = [], positionsError = null, quoteResults = {} } = {}) {
  const calls = { auth: 0, quote: [], profileFilters: [], positionFilters: [] }

  const profileQuery = {
    select(columns) {
      assert.equal(columns, 'initial_balance, cash_balance')
      return this
    },
    eq(column, value) {
      calls.profileFilters.push([column, value])
      return this
    },
    async maybeSingle() {
      return { data: profileError ? null : profile, error: profileError }
    },
  }

  const positionsQuery = {
    select(columns) {
      assert.equal(columns, 'symbol, quantity, avg_price')
      return this
    },
    eq(column, value) {
      calls.positionFilters.push([column, value])
      return this
    },
    gt(column, value) {
      calls.positionFilters.push([column, value])
      return Promise.resolve({ data: positionsError ? null : positions, error: positionsError })
    },
  }

  const supabase = {
    from(table) {
      if (table === 'profiles') return profileQuery
      if (table === 'positions') return positionsQuery
      throw new Error(`Unexpected table: ${table}`)
    },
  }

  mock.module(authUrl, { namedExports: { authenticateUser: async () => {
    calls.auth += 1
    if (authError) return { error: authError }
    return { supabase, user }
  } } })
  mock.module(quotesUrl, { namedExports: { getQuote: async (symbol) => {
    calls.quote.push(symbol)
    return quoteResults[symbol] ?? { quote: { symbol, price: 100, latestTradingDay: '2026-10-20' } }
  } } })

  return {
    calls,
    loadHandler: async () => (await import(`${portfolioUrl}?case=${Math.random()}`)).default,
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

test('empty portfolio returns 10,000 USD cash and total value with no positions', async () => {
  const harness = makeHarness()
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    cashBalance: 10000,
    stocksValue: 0,
    totalValue: 10000,
    profitLoss: 0,
    positions: [],
  })
  assert.deepEqual(harness.calls.quote, [])
})

test('single position market value is quantity multiplied by current price', async () => {
  const harness = makeHarness({
    profile: { initial_balance: 10000, cash_balance: 9500 },
    positions: [{ symbol: 'AAPL', quantity: 5, avg_price: 90 }],
    quoteResults: { AAPL: { quote: { symbol: 'AAPL', price: 100, latestTradingDay: '2026-10-20' } } },
  })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.positions.length, 1)
  assert.equal(res.body.positions[0].marketValue, 500)
  assert.equal(res.body.stocksValue, 500)
  assert.equal(res.body.totalValue, 10000)
})

test('multiple positions produce summed portfolio value and profit/loss', async () => {
  const harness = makeHarness({
    profile: { initial_balance: 10000, cash_balance: 8000 },
    positions: [
      { symbol: 'AAPL', quantity: 3, avg_price: 80 },
      { symbol: 'MSFT', quantity: 4, avg_price: 100 },
    ],
    quoteResults: {
      AAPL: { quote: { symbol: 'AAPL', price: 100, latestTradingDay: '2026-10-20' } },
      MSFT: { quote: { symbol: 'MSFT', price: 120, latestTradingDay: '2026-10-20' } },
    },
  })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.stocksValue, 780)
  assert.equal(res.body.totalValue, 8780)
  assert.equal(res.body.profitLoss, -1220)
  assert.deepEqual(harness.calls.quote.sort(), ['AAPL', 'MSFT'])
})

test('position profit/loss and monetary values are rounded to cents', async () => {
  const harness = makeHarness({
    profile: { initial_balance: 1000, cash_balance: 900.105 },
    positions: [{ symbol: 'AAPL', quantity: 3, avg_price: 99.995 }],
    quoteResults: { AAPL: { quote: { symbol: 'AAPL', price: 100.105, latestTradingDay: '2026-10-20' } } },
  })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.cashBalance, 900.11)
  assert.equal(res.body.positions[0].avgPrice, 100)
  assert.equal(res.body.positions[0].currentPrice, 100.11)
  assert.equal(res.body.positions[0].marketValue, 300.32)
  assert.equal(res.body.positions[0].profitLoss, 0.33)
  assert.equal(res.body.stocksValue, 300.32)
  assert.equal(res.body.totalValue, 1200.43)
  assert.equal(res.body.profitLoss, 200.43)
})

test('unauthenticated request returns the auth error without reading data or quotes', async () => {
  const harness = makeHarness({ authError: { status: 401, code: 'UNAUTHORIZED', message: 'mock unauthorized' } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error.code, 'UNAUTHORIZED')
  assert.deepEqual(harness.calls.quote, [])
  assert.deepEqual(harness.calls.profileFilters, [])
})

test('non-GET method returns 405 and Allow GET', async () => {
  const harness = makeHarness()
  const res = await invoke(harness, 'POST')
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.Allow, 'GET')
  assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED')
  assert.equal(harness.calls.auth, 0)
})

test('profile query error maps to HTTP 500', async () => {
  const harness = makeHarness({ profileError: new Error('mock profile query error') })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'PORTFOLIO_QUERY_FAILED')
  assert.deepEqual(harness.calls.quote, [])
})

test('positions query error maps to HTTP 500', async () => {
  const harness = makeHarness({ positionsError: new Error('mock positions query error') })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'PORTFOLIO_QUERY_FAILED')
  assert.deepEqual(harness.calls.quote, [])
})

test('quote provider error is returned without producing portfolio values', async () => {
  const harness = makeHarness({
    positions: [{ symbol: 'AAPL', quantity: 1, avg_price: 90 }],
    quoteResults: { AAPL: { error: { status: 502, code: 'PROVIDER_ERROR', message: 'mock quote failure' } } },
  })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error.code, 'PROVIDER_ERROR')
})

test('missing profile returns 404', async () => {
  const harness = makeHarness({ profile: null })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error.code, 'PROFILE_NOT_FOUND')
})

const invalidDatabaseCases = [
  ['missing initial balance', { profile: { cash_balance: 10000 } }, [], 'INVALID_PORTFOLIO_DATA'],
  ['missing cash balance', { profile: { initial_balance: 10000 } }, [], 'INVALID_PORTFOLIO_DATA'],
  ['non-numeric cash balance', { profile: { initial_balance: 10000, cash_balance: 'bad' } }, [], 'INVALID_PORTFOLIO_DATA'],
  ['fractional position quantity', { profile: undefined }, [{ symbol: 'AAPL', quantity: 1.5, avg_price: 90 }], 'INVALID_PORTFOLIO_DATA'],
  ['negative average price', { profile: undefined }, [{ symbol: 'AAPL', quantity: 1, avg_price: -1 }], 'INVALID_PORTFOLIO_DATA'],
  ['unsupported database symbol', { profile: undefined }, [{ symbol: 'NOPE', quantity: 1, avg_price: 10 }], 'INVALID_PORTFOLIO_DATA'],
]

for (const [label, profileOptions, positions, errorCode] of invalidDatabaseCases) {
  test(`invalid or missing database data: ${label}`, async () => {
    const profile = profileOptions.profile === undefined
      ? { initial_balance: 10000, cash_balance: 9000 }
      : profileOptions.profile
    const harness = makeHarness({ profile, positions })
    const res = await invoke(harness)
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.error.code, errorCode)
  })
}
