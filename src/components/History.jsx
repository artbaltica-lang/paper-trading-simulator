import { demoHistory } from '../data/demoHistory'
import { ValueChart } from './charts/index.js'
import './History.css'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
})
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })

function ChartPlaceholder({ id, title, description }) {
  return (
    <section className="workspace-card history-chart" aria-labelledby={id}>
      <div className="card-heading">
        <h2 id={id}>{title}</h2>
        <span className="coming-soon">Coming soon</span>
      </div>
      <div className="history-chart-placeholder">
        <span className="history-chart-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4v16h16M8 15v-3M12 15V8M16 15v-5" />
          </svg>
        </span>
        <h3>Waiting for historical data</h3>
        <p>{description}</p>
      </div>
    </section>
  )
}

// Pass a complete view model when the API is connected; omitting data uses
// explicitly labelled demo fixtures. An empty response uses transactions: [].
// The transactions array must contain the full history for the total count.
// Future charts: backend PortfolioSeries = { currency, points: [{ time, value }] }
// goes to ValueChart from src/components/charts once that export exists.
// P/L needs its own backend time series and an agreed realized/total definition.
// PriceChart's { symbol, currency, points: [{ time, price }] } is a stock price
// series, so it must not be used as portfolio P/L. No random or derived fixtures.
export default function History({ data = demoHistory }) {
export default function History({ data = demoHistory, valueSeries = null }) {
  const { transactions, currency, realizedProfitLoss, isDemo } = data
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency })
  const hasRealizedProfitLoss = Number.isFinite(realizedProfitLoss)

  return (
    <div className="history-screen">
      <p className="history-data-note">
        {isDemo ? `Demo transactions · Illustrative history only · ${currency}. Separate from your demo portfolio and trade preview.` : `Transaction history · ${currency}`}
      </p>

      <dl className="history-metrics" aria-label="Activity overview">
        <div className="history-metric">
          <dt>Total transactions</dt>
          <dd>{quantityFormat.format(transactions.length)}</dd>
          <p>{isDemo ? 'Demonstration trades' : 'Recorded trades'}</p>
        </div>
        {hasRealizedProfitLoss && (
          <div className="history-metric">
            <dt>Realized profit / loss</dt>
            <dd className={realizedProfitLoss > 0 ? 'history-profit' : realizedProfitLoss < 0 ? 'history-loss' : undefined}>
              {realizedProfitLoss > 0 ? '+' : ''}{money.format(realizedProfitLoss)}
            </dd>
            <p>Closed trades, including fees</p>
          </div>
        )}
      </dl>
      {!hasRealizedProfitLoss && <p className="history-data-note">Realized P/L will appear when complete cost basis and fee data are available.</p>}

      <section className="workspace-card" aria-labelledby="history-transactions-title">
        <div className="card-heading">
          <h2 id="history-transactions-title">Transaction history</h2>
          {isDemo && <span className="history-demo-badge">Demo data</span>}
        </div>
        {transactions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6M12 7v5l3 2" />
              </svg>
            </span>
            <h3>No transactions yet</h3>
            <p>Your completed BUY and SELL trades will appear here.</p>
          </div>
        ) : (
          <>
            <p className="history-table-note" id="history-table-note">Times in UTC. Totals are quantity × unit price, before fees.</p>
            <div className="history-table-scroll" role="region" aria-label="Transaction history table" tabIndex={0}>
              <table className="history-table" aria-describedby="history-table-note">
                <thead>
                  <tr>
                    <th scope="col">Date (UTC)</th><th scope="col">Symbol</th><th scope="col">Type</th>
                    <th scope="col">Quantity</th><th scope="col">Unit price ({currency})</th><th scope="col">Total ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td><time dateTime={transaction.time}>{dateFormat.format(new Date(transaction.time))}</time></td>
                      <th scope="row">{transaction.symbol}</th>
                      <td><span className={`history-type history-type-${transaction.type.toLowerCase()}`}>{transaction.type}</span></td>
                      <td>{quantityFormat.format(transaction.quantity)}</td>
                      <td>{money.format(transaction.price)}</td>
                      <td>{money.format(transaction.quantity * transaction.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="history-charts">
        <ChartPlaceholder id="history-value-title" title="Portfolio value" description="Your portfolio value over time will appear here once historical values are available." />
        {valueSeries ? <ValueChart series={valueSeries} /> : <ChartPlaceholder id="history-value-title" title="Portfolio value" description="Your portfolio value over time will appear here once historical values are available." />}
        <ChartPlaceholder id="history-profit-title" title="Profit / Loss" description="Your performance over time will appear here once historical P/L is available." />
      </div>
    </div>
  )
}
