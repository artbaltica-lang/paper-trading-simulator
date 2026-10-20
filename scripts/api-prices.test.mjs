import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

const pricesUrl = new URL('../api/_lib/prices.js', import.meta.url).href
const originalApiKey = process.env.ALPHA_VANTAGE_API_KEY

function fakeResponse(data, { ok = true } = {}) {
  return { ok, async json() { return data } }
}

async function loadPrices() {
  return import(`${pricesUrl}?case=${Math.random()}`)
}

afterEach(() => {
  mock.restoreAll()
  if (originalApiKey === undefined) delete process.env.ALPHA_VANTAGE_API_KEY
  else process.env.ALPHA_VANTAGE_API_KEY = originalApiKey
})

test('fetches compact daily close prices and sorts them oldest first', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  const calls = []
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push(new URL(url))
    return fakeResponse({ 'Time Series (Daily)': {
      '2026-10-20': { '4. close': '253.14', '1. open': '999' },
      '2026-10-17': { '4. close': '252.03', '1. open': '888' },
    } })
  })
  const { getPrices } = await loadPrices()
  const result = await getPrices('AAPL')
  assert.deepEqual(result.prices, { symbol: 'AAPL', currency: 'USD', points: [
    { time: '2026-10-17', price: 252.03 }, { time: '2026-10-20', price: 253.14 },
  ] })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].searchParams.get('function'), 'TIME_SERIES_DAILY')
  assert.equal(calls[0].searchParams.get('outputsize'), 'compact')
  assert.equal(calls[0].searchParams.get('symbol'), 'AAPL')
  assert.equal(calls[0].searchParams.get('apikey'), 'test-server-key')
})

test('caches successful results per symbol in server memory', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  let calls = 0
  mock.method(globalThis, 'fetch', async () => {
    calls += 1
    return fakeResponse({ 'Time Series (Daily)': { '2026-10-20': { '4. close': '253.14' } } })
  })
  const { getPrices } = await loadPrices()
  assert.deepEqual(await getPrices('MSFT'), await getPrices('MSFT'))
  assert.equal(calls, 1)
})

test('rejects unsupported symbols without calling the provider', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not call') })
  const { getPrices } = await loadPrices()
  const result = await getPrices('NOPE')
  assert.equal(result.error.status, 400)
  assert.equal(result.error.code, 'INVALID_SYMBOL')
  assert.equal(fetchMock.mock.callCount(), 0)
})

for (const [label, symbol] of [['missing', undefined], ['wrong type', ['AAPL']]]) {
  test(`rejects ${label} symbol without calling the provider`, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not call') })
    const { getPrices } = await loadPrices()
    const result = await getPrices(symbol)
    assert.equal(result.error.status, 400)
    assert.equal(result.error.code, 'INVALID_SYMBOL')
    assert.equal(fetchMock.mock.callCount(), 0)
  })
}

test('requires server API key and does not call the provider without it', async () => {
  delete process.env.ALPHA_VANTAGE_API_KEY
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not call') })
  const { getPrices } = await loadPrices()
  const result = await getPrices('TSLA')
  assert.equal(result.error.code, 'MISSING_API_KEY')
  assert.equal(fetchMock.mock.callCount(), 0)
})

for (const [label, payload] of [
  ['missing daily series', {}],
  ['invalid date', { 'Time Series (Daily)': { '2026-02-30': { '4. close': '10' } } }],
  ['missing close', { 'Time Series (Daily)': { '2026-10-20': { '1. open': '10' } } }],
  ['zero close', { 'Time Series (Daily)': { '2026-10-20': { '4. close': '0' } } }],
  ['negative close', { 'Time Series (Daily)': { '2026-10-20': { '4. close': '-1' } } }],
  ['non-numeric close', { 'Time Series (Daily)': { '2026-10-20': { '4. close': 'bad' } } }],
]) {
  test(`rejects invalid provider response: ${label}`, async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
    mock.method(globalThis, 'fetch', async () => fakeResponse(payload))
    const { getPrices } = await loadPrices()
    const result = await getPrices('TSLA')
    assert.equal(result.error.status, 502)
    assert.equal(result.error.code, 'INVALID_PROVIDER_RESPONSE')
  })
}

test('maps provider rate limits to HTTP 429 result', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  mock.method(globalThis, 'fetch', async () => fakeResponse({ Note: 'Thank you for using Alpha Vantage. Rate limit reached.' }))
  const { getPrices } = await loadPrices()
  const result = await getPrices('TSLA')
  assert.equal(result.error.status, 429)
  assert.equal(result.error.code, 'RATE_LIMIT_EXCEEDED')
})

for (const [label, payload] of [
  ['Note', { Note: 'Thank you for using Alpha Vantage. Rate limit reached.' }],
  ['Information', { Information: 'Please see call frequency limits.' }],
]) {
  test(`maps Alpha Vantage ${label} limit message`, async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
    mock.method(globalThis, 'fetch', async () => fakeResponse(payload))
    const { getPrices } = await loadPrices()
    const result = await getPrices('TSLA')
    assert.equal(result.error.status, 429)
    assert.equal(result.error.code, 'RATE_LIMIT_EXCEEDED')
  })
}

for (const status of [429, 500, 503]) {
  test(`maps provider HTTP ${status} to safe provider error`, async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status, async json() { return { secret: 'provider payload' } } }))
    const { getPrices } = await loadPrices()
    const result = await getPrices('AAPL')
    assert.equal(result.error.status, 502)
    assert.equal(result.error.code, 'PROVIDER_ERROR')
    assert.doesNotMatch(JSON.stringify(result.error), /secret|provider payload/)
  })
}

test('maps invalid JSON to safe provider error', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  mock.method(globalThis, 'fetch', async () => ({ ok: true, async json() { throw new Error('sensitive JSON parser detail') } }))
  const { getPrices } = await loadPrices()
  const result = await getPrices('AAPL')
  assert.equal(result.error.status, 502)
  assert.equal(result.error.code, 'PROVIDER_ERROR')
  assert.doesNotMatch(JSON.stringify(result.error), /sensitive/)
})

test('cache expires after five minutes and fetches a fresh result', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  let calls = 0
  let now = 1_000_000
  mock.method(Date, 'now', () => now)
  mock.method(globalThis, 'fetch', async () => {
    calls += 1
    return fakeResponse({ 'Time Series (Daily)': { '2026-10-20': { '4. close': String(250 + calls) } } })
  })
  const { getPrices } = await loadPrices()
  const first = await getPrices('MSFT')
  now += 5 * 60 * 1000 - 1
  const beforeExpiry = await getPrices('MSFT')
  assert.deepEqual(beforeExpiry, first)
  assert.equal(calls, 1)
  now += 2
  const afterExpiry = await getPrices('MSFT')
  assert.equal(calls, 2)
  assert.equal(afterExpiry.prices.points[0].price, 252)
})

test('parallel cache misses for one symbol currently make separate provider calls', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  let calls = 0
  let releaseFetch
  const gate = new Promise((resolve) => { releaseFetch = resolve })
  mock.method(globalThis, 'fetch', async () => {
    calls += 1
    await gate
    return fakeResponse({ 'Time Series (Daily)': { '2026-10-20': { '4. close': '253.14' } } })
  })
  const { getPrices } = await loadPrices()
  const first = getPrices('TSLA')
  const second = getPrices('TSLA')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 2)
  releaseFetch()
  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.deepEqual(firstResult, secondResult)
})

test('maps network and HTTP provider failures to safe errors', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  mock.method(globalThis, 'fetch', async () => { throw new Error('secret provider details') })
  const { getPrices } = await loadPrices()
  assert.equal((await getPrices('AAPL')).error.code, 'PROVIDER_ERROR')
})

test('clears cache helper for deterministic isolation', async () => {
  const { clearPricesCache } = await loadPrices()
  assert.equal(typeof clearPricesCache, 'function')
})
