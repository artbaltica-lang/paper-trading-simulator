import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mock } from 'node:test'

const authUrl = new URL('../api/_lib/supabase.js', import.meta.url).href
const historyUrl = new URL('../api/history.js', import.meta.url).href
const user = { id: 'history-test-user' }

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
    schema(name) {
      assert.equal(name, 'public')
      return {
        from(table) {
          assert.equal(table, 'snapshots')
          return query
        },
      }
    },
  }

  mock.module(authUrl, { namedExports: { authenticateUser: async () => {
    calls.auth += 1
    if (authError) return { error: authError }
    return { supabase, user }
  } } })

  return {
    calls,
    loadHandler: async () => (await import(`${historyUrl}?case=${Math.random()}`)).default,
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

test('returns authenticated portfolio history points in API format', async () => {
  const harness = makeHarness({ rows: [
    { created_at: '2026-10-20T12:34:56.000Z', total_value: 10123.45 },
    { created_at: '2026-10-19T08:00:00-04:00', total_value: 9987.6 },
  ] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    currency: 'USD',
    points: [
      { time: '2026-10-20T12:34:56.000Z', value: 10123.45 },
      { time: '2026-10-19T12:00:00.000Z', value: 9987.6 },
    ],
  })
  assert.equal(harness.calls.selectedColumns, 'created_at, total_value')
})

test('returns an empty history', async () => {
  const harness = makeHarness({ rows: [] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { currency: 'USD', points: [] })
})

test('filters snapshots by authenticated user ID', async () => {
  const harness = makeHarness()
  await invoke(harness)
  assert.deepEqual(harness.calls.filters, [['user_id', user.id]])
})

test('orders snapshots by created_at ascending', async () => {
  const harness = makeHarness()
  await invoke(harness)
  assert.deepEqual(harness.calls.order, ['created_at', { ascending: true }])
})

test('normalizes parseable dates to ISO UTC format', async () => {
  const harness = makeHarness({ rows: [
    { created_at: '2026-10-20T15:45:30+03:00', total_value: 123.45 },
  ] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.points[0].time, '2026-10-20T12:45:30.000Z')
})

test('rounds portfolio values to two decimal places', async () => {
  const harness = makeHarness({ rows: [
    { created_at: '2026-10-20T12:00:00Z', total_value: '123.456' },
    { created_at: '2026-10-20T12:05:00Z', total_value: 0.105 },
  ] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.points.map((point) => point.value), [123.46, 0.11])
})

test('unauthenticated request returns auth error without querying snapshots', async () => {
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
  const harness = makeHarness({ queryError: new Error('mock snapshots query failure') })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'HISTORY_QUERY_FAILED')
})

const invalidRows = [
  ['missing created_at', [{ total_value: 100 }]],
  ['invalid created_at', [{ created_at: 'not-a-date', total_value: 100 }]],
  ['missing total_value', [{ created_at: '2026-10-20T12:00:00Z' }]],
  ['negative total_value', [{ created_at: '2026-10-20T12:00:00Z', total_value: -1 }]],
  ['non-numeric total_value', [{ created_at: '2026-10-20T12:00:00Z', total_value: 'not-a-number' }]],
]

for (const [label, rows] of invalidRows) {
  test(`invalid or missing snapshot data: ${label}`, async () => {
    const harness = makeHarness({ rows })
    const res = await invoke(harness)
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.error.code, 'INVALID_HISTORY_DATA')
  })
}

test('missing query data is treated as an empty history', async () => {
  const harness = makeHarness({ rows: null })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { currency: 'USD', points: [] })
})

test('unexpected non-array snapshot data produces generic HTTP 500', async () => {
  const harness = makeHarness({ rows: { created_at: '2026-10-20T12:00:00Z', total_value: 100 } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INTERNAL_SERVER_ERROR')
})
