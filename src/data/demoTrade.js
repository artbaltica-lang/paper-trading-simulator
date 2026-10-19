// Illustrative prices only: these are not live market quotes.
// Quote shape matches GET /api/quote?symbol=AAPL.
export const tradeStocks = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
]

export const demoQuotes = {
  AAPL: { symbol: 'AAPL', price: 343.46, latestTradingDay: '2026-10-16' },
  MSFT: { symbol: 'MSFT', price: 512.75, latestTradingDay: '2026-10-16' },
  TSLA: { symbol: 'TSLA', price: 428.20, latestTradingDay: '2026-10-16' },
}
