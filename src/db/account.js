import { checkPortfolioSeries } from '../contracts/formats.js'

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

// Portfolio uses authenticated API data only; local accounts remain available
// for the screens that have not yet been integrated.
export async function loadPortfolio({ accessToken, signal, fetchImpl = globalThis.fetch } = {}) {
  if (!accessToken) throw new Error('Your session is unavailable. Please log out and sign in again.')
  const response = await fetchImpl('/api/portfolio', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
    cache: 'no-store',
  })
  if (response.status === 401) {
    throw new Error('Your session has expired or is unauthorized. Please log out and sign in again.')
  }
  if (!response.ok) {
    throw new Error(`Unable to load your portfolio (HTTP ${response.status}). Please try again.`)
  }
  const data = await response.json()
  const validPosition = (position) => position && typeof position.symbol === 'string'
    && typeof position.companyName === 'string'
    && ['quantity', 'avgPrice', 'currentPrice', 'marketValue', 'profitLoss'].every((key) => Number.isFinite(position[key]))
  if (!['cashBalance', 'totalValue', 'profitLoss'].every((key) => Number.isFinite(data?.[key]))
    || !Array.isArray(data.positions) || !data.positions.every(validPosition)) {
    throw new Error('The server returned invalid portfolio data. Please try again.')
  }
  return {
    cashBalance: data.cashBalance,
    totalValue: data.totalValue,
    profitLoss: data.profitLoss,
    initialBalance: roundMoney(data.totalValue - data.profitLoss),
    holdings: data.positions.map((position) => ({
      symbol: position.symbol,
      name: position.companyName,
      quantity: position.quantity,
      currentPrice: position.currentPrice,
      averageCost: position.avgPrice,
      marketValue: position.marketValue,
      profitLoss: position.profitLoss,
    })),
  }
}

export async function loadHistory({ accessToken, signal, fetchImpl = globalThis.fetch } = {}) {
  if (!accessToken) throw new Error('Your session is unavailable. Please log out and sign in again.')

  async function request(path) {
    const response = await fetchImpl(path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
      cache: 'no-store',
    })
    if (response.status === 401) {
      throw new Error('Your session has expired or is unauthorized. Please log out and sign in again.')
    }
    if (!response.ok) {
      throw new Error(`Unable to load ${path} (HTTP ${response.status}). Please try again.`)
    }
    return response.json()
  }

  const [valueSeries, data] = await Promise.all([
    request('/api/history'),
    request('/api/transactions'),
  ])
  const validTransaction = (row) => row
    && (typeof row.id === 'string' || Number.isFinite(row.id))
    && typeof row.symbol === 'string'
    && ['BUY', 'SELL'].includes(row.type)
    && Number.isFinite(row.quantity) && row.quantity > 0
    && Number.isFinite(row.price) && row.price > 0
    && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))

  if (!checkPortfolioSeries(valueSeries).ok
    || !Array.isArray(data?.transactions) || !data.transactions.every(validTransaction)) {
    throw new Error('The server returned invalid history data. Please try again.')
  }

  return {
    valueSeries,
    history: {
      isDemo: false,
      currency: valueSeries.currency,
      realizedProfitLoss: null,
      transactions: data.transactions.map((row) => ({
        id: row.id,
        time: row.createdAt,
        symbol: row.symbol,
        type: row.type,
        quantity: row.quantity,
        price: row.price,
      })),
    },
  }
}
