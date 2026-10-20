import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPendingTrade, readPendingTrade, removePendingTrade, savePendingTrade } from '../src/trading/pendingTrade.js'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}
const record = {
  userId: 'user-a', key: '123e4567-e89b-42d3-a456-426614174000',
  body: '{ "symbol": "AAPL", "type": "BUY", "quantity": 1 }',
}

test('pending order survives a reload with exact UUID and body, isolated by user', () => {
  const store = storage()
  const raw = savePendingTrade(store, { ...record, access_token: 'must-not-be-saved' }, null)
  assert.deepEqual(readPendingTrade(store, 'user-a').pending, record)
  assert.equal(readPendingTrade(store, 'user-b').pending, null)
  assert.equal(raw.includes('must-not-be-saved'), false)
  removePendingTrade(store, 'user-a', raw)
  assert.equal(readPendingTrade(store, 'user-a').pending, null)
})

test('corrupt, foreign and invalid orders fail closed without removing evidence', () => {
  for (const raw of ['{', 'null', JSON.stringify({ ...record, userId: 'user-b' }),
    JSON.stringify({ ...record, key: 'invalid' }),
    JSON.stringify({ ...record, body: '{"symbol":"AAPL","type":"BUY","quantity":2147483648}' })]) {
    const store = storage()
    store.setItem('pending-trade:user-a', raw)
    assert.throws(() => readPendingTrade(store, 'user-a'))
    assert.equal(store.getItem('pending-trade:user-a'), raw)
  }
})

test('a changed or missing record cannot be overwritten, retried or removed blindly', () => {
  const store = storage()
  const raw = savePendingTrade(store, record, null)
  assert.throws(() => savePendingTrade(store, { ...record, body: record.body.replace('BUY', 'SELL') }, null))
  store.setItem('pending-trade:user-a', 'changed')
  assert.throws(() => checkPendingTrade(store, 'user-a', raw))
  assert.throws(() => removePendingTrade(store, 'user-a', raw))
  store.removeItem('pending-trade:user-a')
  assert.throws(() => checkPendingTrade(store, 'user-a', raw))
})

test('storage write failures propagate before a pending order can be sent', () => {
  const store = storage()
  store.setItem = () => { throw new Error('Storage unavailable') }
  assert.throws(() => savePendingTrade(store, record, null), /Storage unavailable/)
})
