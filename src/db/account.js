export const ACCOUNT_KEY = 'paper-trading-account-v1'

function roundMoney(value) {
  return Math.round(value * 100) / 100
}

export function createMemoryStorage() {
  const items = new Map()
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  }
}

export function emptyAccount(time = '2026-10-19T12:00:00.000Z') {
  return {
    currency: 'USD',
    initialBalance: 10000,
    cashBalance: 10000,
    holdings: [],
    transactions: [],
    snapshots: [{ time, value: 10000 }],
  }
}

export function portfolioValue(account) {
  const holdingsValue = account.holdings.reduce((total, holding) => {
    const price = Number.isFinite(holding.currentPrice) ? holding.currentPrice : holding.avg_price
    return total + holding.quantity * price
  }, 0)
  return roundMoney(account.cashBalance + holdingsValue)
}

export function readAccount(storage) {
  const saved = storage.getItem(ACCOUNT_KEY)
  if (!saved) {
    const account = emptyAccount()
    storage.setItem(ACCOUNT_KEY, JSON.stringify(account))
    return account
  }
  try {
    const account = JSON.parse(saved)
    if (!Number.isFinite(account.cashBalance) || !Array.isArray(account.transactions) || !Array.isArray(account.snapshots)) {
      throw new Error('incomplete account')
    }
    return account
  } catch {
    const account = emptyAccount()
    storage.setItem(ACCOUNT_KEY, JSON.stringify(account))
    return account
  }
}

export function writeAccount(storage, account) {
  storage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  return readAccount(storage)
}

function tradeType(row) {
  return String(row.type || row.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY'
}

export function toPortfolioView(account) {
  return {
    initialBalance: account.initialBalance,
    cashBalance: account.cashBalance,
    holdings: account.holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name || holding.symbol,
      quantity: holding.quantity,
      currentPrice: Number.isFinite(holding.currentPrice) ? holding.currentPrice : holding.avg_price,
      averageCost: holding.avg_price,
    })),
  }
}

export function toHistoryView(account) {
  return {
    isDemo: false,
    currency: account.currency,
    realizedProfitLoss: null,
    transactions: account.transactions.map((row) => ({
      id: row.id,
      time: row.time,
      symbol: row.symbol,
      type: tradeType(row),
      quantity: row.quantity,
      price: row.price,
    })),
  }
}

export function toValueSeries(account) {
  return {
    currency: account.currency,
    points: account.snapshots.map((snapshot) => ({ time: snapshot.time, value: snapshot.value })),
  }
}

export function accountFromApi(portfolio, transactions) {
  const rows = Array.isArray(transactions) ? transactions : transactions?.transactions || []
  const holdings = portfolio.holdings || portfolio.positions || []
  return {
    currency: portfolio.currency || 'USD',
    initialBalance: portfolio.initialBalance ?? portfolio.initial_balance ?? 10000,
    cashBalance: portfolio.cashBalance ?? portfolio.cash_balance ?? portfolio.balance ?? 0,
    holdings: holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name || holding.symbol,
      quantity: holding.quantity,
      avg_price: holding.avg_price ?? holding.averageCost,
      currentPrice: holding.currentPrice,
    })),
    transactions: rows,
    snapshots: portfolio.snapshots || [],
  }
}

export async function loadAccount({ fetchImpl, storage } = {}) {
  const store = storage || globalThis.localStorage
  const request = fetchImpl || globalThis.fetch
  if (request) {
    try {
      const portfolioResponse = await request('/api/portfolio')
      if (portfolioResponse?.ok) {
        const portfolio = await portfolioResponse.json()
        const historyResponse = await request('/api/transactions')
        const transactions = historyResponse?.ok ? await historyResponse.json() : []
        return accountFromApi(portfolio, transactions)
      }
    } catch {
      // The saved account remains available when the API is not ready.
    }
  }
  return readAccount(store)
}
