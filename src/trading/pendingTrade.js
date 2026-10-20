const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function pendingTradeKey(userId) {
  if (typeof userId !== 'string' || !userId) throw new Error('Missing user identity.')
  return `pending-trade:${userId}`
}

export function parsePendingTrade(raw, userId) {
  const record = JSON.parse(raw)
  if (!record || Object.keys(record).sort().join(',') !== 'body,key,userId'
    || record.userId !== userId || typeof record.key !== 'string' || !UUID.test(record.key)
    || typeof record.body !== 'string') throw new Error('Invalid pending order.')
  const body = JSON.parse(record.body)
  if (!body || Object.keys(body).sort().join(',') !== 'quantity,symbol,type'
    || !['AAPL', 'MSFT', 'TSLA'].includes(body.symbol) || !['BUY', 'SELL'].includes(body.type)
    || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 2147483647) {
    throw new Error('Invalid pending order body.')
  }
  return record
}

export function readPendingTrade(storage, userId) {
  const raw = storage.getItem(pendingTradeKey(userId))
  return { raw, pending: raw === null ? null : parsePendingTrade(raw, userId) }
}

export function checkPendingTrade(storage, userId, expectedRaw) {
  if (storage.getItem(pendingTradeKey(userId)) !== expectedRaw) {
    throw new Error('Pending order storage changed.')
  }
}

export function savePendingTrade(storage, record, expectedRaw) {
  const raw = JSON.stringify({ userId: record.userId, key: record.key, body: record.body })
  parsePendingTrade(raw, record.userId)
  checkPendingTrade(storage, record.userId, expectedRaw)
  storage.setItem(pendingTradeKey(record.userId), raw)
  checkPendingTrade(storage, record.userId, raw)
  return raw
}

export function removePendingTrade(storage, userId, expectedRaw) {
  checkPendingTrade(storage, userId, expectedRaw)
  storage.removeItem(pendingTradeKey(userId))
  checkPendingTrade(storage, userId, null)
}
