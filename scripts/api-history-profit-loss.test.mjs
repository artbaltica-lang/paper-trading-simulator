import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mock } from 'node:test'

const authUrl = new URL('../api/_lib/supabase.js', import.meta.url).href
const endpointUrl = new URL('../api/history/profit-loss.js', import.meta.url).href
const user = { id: 'profit-loss-test-user' }

function makeHarness({ authError = null, profile = { initial_balance: 10000 }, profileError = null, rows = [], snapshotsError = null, throwOnAuth = false } = {}) {
  const calls = { auth: 0, profileFilters: [], snapshotFilters: [], selectedSnapshotColumns: null, snapshotOrder: null }
  const profileQuery = {
    select(columns) { assert.equal(columns, 'initial_balance'); return this },
    eq(column, value) { calls.profileFilters.push([column, value]); return this },
    async maybeSingle() { return { data: profileError ? null : profile, error: profileError } },
  }
  const snapshotQuery = {
    select(columns) { calls.selectedSnapshotColumns = columns; return this },
    eq(column, value) { calls.snapshotFilters.push([column, value]); return this },
    order(column, options) {
      calls.snapshotOrder = [column, options]
      return Promise.resolve({ data: snapshotsError ? null : rows, error: snapshotsError })
    },
  }
  const supabase = {
    from(table) { assert.equal(table, 'profiles'); return profileQuery },
    schema(name) {
      assert.equal(name, 'public')
      return { from(table) { assert.equal(table, 'snapshots'); return snapshotQuery } }
    },
  }

  mock.module(authUrl, { namedExports: { authenticateUser: async () => {
    calls.auth += 1
    if (throwOnAuth) throw new Error('sensitive authentication detail')
    if (authError) return { error: authError }
    return { supabase, user }
  } } })

  return {
    calls,
    loadHandler: async () => (await import(`${endpointUrl}?case=${Math.random()}`)).default,
  }
}

function responseRecorder() {
  return {
    statusCode: null, headers: {}, body: null,
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value },
    json(body) { this.body = body; return this },
  }
}

async function invoke(harness, method = 'GET') {
  const handler = await harness.loadHandler()
  const res = responseRecorder()
  await handler({ method, headers: { authorization: 'Bearer mocked-token' } }, res)
  return res
}

afterEach(() => mock.restoreAll())

test('returns P/L points calculated from snapshot total value and initial balance', async () => {
  const harness = makeHarness({ rows: [
    { created_at: '2026-10-20T12:34:56.000Z', total_value: 10123.45 },
    { created_at: '2026-10-21T12:34:56.000Z', total_value: 9987.6 },
  ] })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { currency: 'USD', points: [
    { time: '2026-10-20T12:34:56.000Z', value: 123.45 },
    { time: '2026-10-21T12:34:56.000Z', value: -12.4 },
  ] })
  assert.equal(harness.calls.selectedSnapshotColumns, 'created_at, total_value')
})

test('returns an empty points array when no snapshots exist', async () => {
  const res = await invoke(makeHarness({ rows: [] }))
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { currency: 'USD', points: [] })
})

test('filters both profile and snapshots by the authenticated user', async () => {
  const harness = makeHarness()
  await invoke(harness)
  assert.deepEqual(harness.calls.profileFilters, [['id', user.id]])
  assert.deepEqual(harness.calls.snapshotFilters, [['user_id', user.id]])
})

test('requests snapshots in ascending chronological order and normalizes ISO timestamps', async () => {
  const harness = makeHarness({ rows: [
    { created_at: '2026-10-21T12:00:00Z', total_value: 10001 },
    { created_at: '2026-10-20T15:00:00+03:00', total_value: 10002 },
  ] })
  const res = await invoke(harness)
  assert.deepEqual(harness.calls.snapshotOrder, ['created_at', { ascending: true }])
  assert.deepEqual(res.body.points.map((point) => point.time), [
    '2026-10-20T12:00:00.000Z', '2026-10-21T12:00:00.000Z',
  ])
})

test('rounds calculated P/L to cents and supports zero P/L', async () => {
  const res = await invoke(makeHarness({
    profile: { initial_balance: '1000.105' },
    rows: [
      { created_at: '2026-10-20T12:00:00Z', total_value: 1000.105 },
      { created_at: '2026-10-21T12:00:00Z', total_value: 1000.215 },
    ],
  }))
  assert.deepEqual(res.body.points.map((point) => point.value), [0, 0.11])
})

test('returns authentication error without querying profile or snapshots', async () => {
  const harness = makeHarness({ authError: { status: 401, code: 'UNAUTHORIZED', message: 'mock unauthorized' } })
  const res = await invoke(harness)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error.code, 'UNAUTHORIZED')
  assert.deepEqual(harness.calls.profileFilters, [])
  assert.deepEqual(harness.calls.snapshotFilters, [])
})

test('returns 404 when profile is missing', async () => {
  const res = await invoke(makeHarness({ profile: null }))
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error.code, 'PROFILE_NOT_FOUND')
})

test('maps profile and snapshot query failures to safe server errors', async () => {
  const res = await invoke(makeHarness({ profileError: new Error('sensitive database detail') }))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'HISTORY_QUERY_FAILED')
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive/)
})

test('maps snapshot query failure to a safe server error', async () => {
  const res = await invoke(makeHarness({ snapshotsError: new Error('sensitive database detail') }))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'HISTORY_QUERY_FAILED')
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive/)
})

test('maps unexpected authentication exception to safe HTTP 500 JSON', async () => {
  const res = await invoke(makeHarness({ throwOnAuth: true }))
  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, {
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Įvyko vidinė serverio klaida.' },
  })
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive/)
})

test('rejects invalid initial balance', async () => {
  const res = await invoke(makeHarness({ profile: { initial_balance: 'not-a-number' } }))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INVALID_HISTORY_DATA')
})

test('rejects invalid snapshot timestamp', async () => {
  const res = await invoke(makeHarness({ rows: [{ created_at: 'not-a-date', total_value: 10000 }] }))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INVALID_HISTORY_DATA')
})

test('rejects invalid snapshot value', async () => {
  const res = await invoke(makeHarness({ rows: [{ created_at: '2026-10-20T12:00:00Z', total_value: 'invalid' }] }))
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error.code, 'INVALID_HISTORY_DATA')
})

test('non-GET method returns 405 and Allow GET', async () => {
  const harness = makeHarness()
  const res = await invoke(harness, 'POST')
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.Allow, 'GET')
  assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED')
  assert.equal(harness.calls.auth, 0)
})
