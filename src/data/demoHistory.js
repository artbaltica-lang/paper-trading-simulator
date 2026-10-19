// Independent, illustrative history; it is not linked to the demo portfolio or orders.
// Future container: adapt GET /api/transactions and GET /api/portfolio to this
// view model and pass it to <History data={history} /> with isDemo: false.
// Dates are ISO 8601 timestamps; quantity and price are numbers.
// realizedProfitLoss must remain null unless the backend supplies a reliable,
// complete realized result including cost basis and fees, in this currency.
export const demoHistory = {
  isDemo: true,
  currency: 'USD',
  realizedProfitLoss: null,
  transactions: [
    { id: 'demo-5', time: '2026-10-16T14:30:00Z', symbol: 'AAPL', type: 'SELL', quantity: 2, price: 215.50 },
    { id: 'demo-4', time: '2026-10-15T10:15:00Z', symbol: 'MSFT', type: 'BUY', quantity: 1.5, price: 420.00 },
    { id: 'demo-3', time: '2026-10-14T13:45:00Z', symbol: 'TSLA', type: 'SELL', quantity: 1, price: 250.75 },
    { id: 'demo-2', time: '2026-10-13T09:00:00Z', symbol: 'TSLA', type: 'BUY', quantity: 3, price: 245.00 },
    { id: 'demo-1', time: '2026-10-12T14:00:00Z', symbol: 'AAPL', type: 'BUY', quantity: 5, price: 210.00 },
  ],
}
