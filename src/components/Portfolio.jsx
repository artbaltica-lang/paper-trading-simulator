import { demoPortfolio } from '../data/demoPortfolio'
import { LiveValueChart } from './charts/index.js'
import './Portfolio.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const signedCurrency = (value) => `${value > 0 ? '+' : ''}${currency.format(value)}`
const percent = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const performanceClass = (value) => value > 0 ? 'is-profit' : value < 0 ? 'is-loss' : 'is-neutral'

export default function Portfolio({
  accessToken,
  onStartTrading,
  portfolio = demoPortfolio,
  note = 'Demo portfolio · Virtual funds · USD',
}) {
  const { initialBalance, cashBalance, holdings } = portfolio
  const totalValue = portfolio.totalValue ?? cashBalance + holdings.reduce((total, holding) => total + holding.quantity * holding.currentPrice, 0)
  const profitLoss = portfolio.profitLoss ?? totalValue - initialBalance
  const profitLossPercent = initialBalance > 0 ? profitLoss / initialBalance * 100 : 0

  return (
    <div className="portfolio-screen">
      <p className="portfolio-demo-note">{note}</p>
      <dl className="portfolio-metrics" aria-label="Portfolio overview">
        <div className="portfolio-metric">
          <dt>Cash Balance</dt>
          <dd>{currency.format(cashBalance)}</dd>
          <p>Available to trade</p>
        </div>
        <div className="portfolio-metric portfolio-metric-total">
          <dt>Total Portfolio Value</dt>
          <dd>{currency.format(totalValue)}</dd>
          <p>Cash + holdings value</p>
        </div>
        <div className="portfolio-metric">
          <dt>Profit / Loss</dt>
          <dd className={performanceClass(profitLoss)}>{signedCurrency(profitLoss)}</dd>
          <p className={performanceClass(profitLoss)}>{percent(profitLossPercent)} <span>since starting</span></p>
        </div>
        <div className="portfolio-metric">
          <dt>Holdings</dt>
          <dd>{holdings.length}</dd>
          <p>Stock positions</p>
        </div>
      </dl>

      <section className="workspace-card" aria-labelledby="holdings-title">
        <div className="card-heading">
          <h2 id="holdings-title">My Holdings</h2>
          <span className="portfolio-position-count">{holdings.length} {holdings.length === 1 ? 'position' : 'positions'}</span>
        </div>
        {holdings.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="18" height="14" rx="3" />
                <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v3h4v-3" />
              </svg>
            </span>
            <h3>You don't own any stocks yet</h3>
            <p>Your virtual starting balance is {currency.format(initialBalance)}. Explore the trading workspace to get started.</p>
            <button type="button" className="portfolio-trade-button" onClick={onStartTrading}>Start Trading <span aria-hidden="true">→</span></button>
          </div>
        ) : (
          <div className="portfolio-table-scroll" role="region" aria-label="Stock holdings" tabIndex={0}>
            <table className="portfolio-table">
              <thead><tr><th scope="col">Symbol</th><th scope="col">Name</th><th scope="col">Quantity</th><th scope="col">Current Price</th><th scope="col">Position Value</th><th scope="col">P/L</th></tr></thead>
              <tbody>
                {holdings.map((holding) => {
                  const value = holding.marketValue ?? holding.quantity * holding.currentPrice
                  const cost = holding.quantity * holding.averageCost
                  const change = holding.profitLoss ?? value - cost
                  return (
                    <tr key={holding.symbol}>
                      <th scope="row">{holding.symbol}</th>
                      <td>{holding.name}</td>
                      <td>{quantityFormat.format(holding.quantity)}</td>
                      <td>{currency.format(holding.currentPrice)}</td>
                      <td>{currency.format(value)}</td>
                      <td className={performanceClass(change)}>{signedCurrency(change)}<small>{percent(cost > 0 ? change / cost * 100 : 0)}</small></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <LiveValueChart key={accessToken} token={accessToken} />
    </div>
  )
}
