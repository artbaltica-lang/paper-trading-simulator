import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

const quotesUrl = new URL('../api/_lib/quotes.js', import.meta.url).href
const handlerUrl = new URL('../api/quote.js', import.meta.url).href
const originalApiKey = process.env.ALPHA_VANTAGE_API_KEY

async function loadQuotes() {
  return import(`${quotesUrl}?case=${Math.random()}`)
}

function quotePayload(overrides = {}) {
  return { 'Global Quote': {
    '01. symbol': 'AAPL',
    '05. price': '253.14',
    '07. latest trading day': '2026-10-20',
    ...overrides,
  } }
}

afterEach(() => {
  mock.restoreAll()
  if (originalApiKey === undefined) delete process.env.ALPHA_VANTAGE_API_KEY
  else process.env.ALPHA_VANTAGE_API_KEY = originalApiKey
})

for (const [label, symbol] of [
  ['missing', undefined], ['wrong type', ['AAPL']], ['unsupported', 'NOPE'], ['lowercase', 'aapl'],
]) {
  test(`/api/quote rejects ${label} symbol without provider call`, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not call provider') })
    const { getQuote } = await loadQuotes()
    const result = await getQuote(symbol)
    assert.equal(result.error.status, 400)
    assert.equal(result.error.code, 'INVALID_SYMBOL')
    assert.equal(fetchMock.mock.callCount(), 0)
  })
}

test('/api/quote reports missing server API key without provider call', async () => {
  delete process.env.ALPHA_VANTAGE_API_KEY
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not call provider') })
  const { getQuote } = await loadQuotes()
  const result = await getQuote('AAPL')
  assert.equal(result.error.code, 'MISSING_API_KEY')
  assert.equal(fetchMock.mock.callCount(), 0)
})

for (const status of [429, 500, 503]) {
  test(`/api/quote maps provider HTTP ${status} to safe provider error`, async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status, async json() { return { secret: 'provider payload' } } }))
    const { getQuote } = await loadQuotes()
    const result = await getQuote('AAPL')
    assert.equal(result.error.status, 502)
    assert.equal(result.error.code, 'PROVIDER_ERROR')
    assert.doesNotMatch(JSON.stringify(result.error), /secret|provider payload/)
  })
}

test('/api/quote maps invalid JSON to a safe provider error', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  mock.method(globalThis, 'fetch', async () => ({ ok: true, async json() { throw new Error('sensitive parser detail') } }))
  const { getQuote } = await loadQuotes()
  const result = await getQuote('AAPL')
  assert.equal(result.error.status, 502)
  assert.equal(result.error.code, 'PROVIDER_ERROR')
  assert.doesNotMatch(JSON.stringify(result.error), /sensitive/)
})

test('/api/quote rejects empty Global Quote', async () => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
  mock.method(globalThis, 'fetch', async () => ({ ok: true, async json() { return { 'Global Quote': {} } } }))
  const { getQuote } = await loadQuotes()
  const result = await getQuote('AAPL')
  assert.equal(result.error.status, 502)
  assert.equal(result.error.code, 'INVALID_PROVIDER_RESPONSE')
})

for (const [label, price] of [['zero', '0'], ['negative', '-1'], ['non-numeric', 'NaN']]) {
  test(`/api/quote rejects ${label} price`, async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
    mock.method(globalThis, 'fetch', async () => ({ ok: true, async json() { return quotePayload({ '05. price': price }) } }))
    const { getQuote } = await loadQuotes()
    const result = await getQuote('AAPL')
    assert.equal(result.error.status, 502)
    assert.equal(result.error.code, 'INVALID_PROVIDER_RESPONSE')
  })
}

for (const [label, message] of [
  ['Note', { Note: 'Thank you for using Alpha Vantage. Rate limit reached.' }],
  ['Information', { Information: 'Please see call frequency limits.' }],
]) {
  test(`/api/quote handles Alpha Vantage ${label} rate limit`, async () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'test-server-key'
    mock.method(globalThis, 'fetch', async () => ({ ok: true, async json() { return message } }))
    const { getQuote } = await loadQuotes()
    const result = await getQuote('AAPL')
    assert.equal(result.error.status, 429)
    assert.equal(result.error.code, 'RATE_LIMIT_EXCEEDED')
  })
}
