import { useState } from 'react'
import { demoPortfolio } from '../data/demoPortfolio'
import { demoQuotes, tradeStocks } from '../data/demoTrade'
import LivePriceChart from './charts/LivePriceChart.jsx'
import './Trade.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// Future container: load quotes and balance through src/services/api.js and pass
// them here. Quotes retain the GET /api/quote response shape. Before enabling
// submission, add loading/error states and POST /api/trade with
// { symbol, type, quantity: Number(quantity) }, then refresh portfolio and quote.
export default function Trade({ quotes = demoQuotes, cashBalance = demoPortfolio.cashBalance }) {
  const [symbol, setSymbol] = useState('AAPL')
  const [type, setType] = useState('BUY')
  const [quantity, setQuantity] = useState('1')
  const stock = tradeStocks.find((item) => item.symbol === symbol)
  const quote = quotes[symbol]
  const validQuantity = /^[1-9]\d*$/.test(quantity) && Number.isSafeInteger(Number(quantity))
  const hasPrice = quote?.symbol === symbol && Number.isFinite(quote.price) && quote.price > 0
  const estimate = validQuantity && hasPrice ? Number(quantity) * quote.price : null
  const exceedsBalance = type === 'BUY' && estimate !== null && estimate > cashBalance

  return (
    <div className="trade-screen">
      <p className="trade-demo-note">Demo data · Illustrative prices · Virtual funds · USD</p>
      <div className="trade-layout">
        <section className="workspace-card trade-order" aria-labelledby="trade-title">
          <div className="card-heading">
            <h2 id="trade-title">Trading workspace</h2>
            <span className="trade-demo-badge">Demo preview</span>
          </div>
          <form className="trade-form" onSubmit={(event) => event.preventDefault()}>
            <label className="trade-label" htmlFor="trade-symbol">Select stock</label>
            <select id="trade-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)}>
              {tradeStocks.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} — {item.name}</option>)}
            </select>

            <div className="trade-quote" aria-live="polite" aria-atomic="true">
              <div><h3>{stock.symbol}</h3><p>{stock.name}</p></div>
              <div className="trade-price"><span>Demo price · USD</span><strong>{hasPrice ? currency.format(quote.price) : 'Unavailable'}</strong></div>
            </div>
            <p className="trade-price-note">Illustrative quote{hasPrice ? ` · Trading day: ${quote.latestTradingDay}` : ''}. Prices are not live.</p>

            <fieldset className="trade-side">
              <legend className="trade-label">Order type</legend>
              <div className="trade-side-options">
                {['BUY', 'SELL'].map((side) => (
                  <label key={side} className={`trade-side-option trade-side-${side.toLowerCase()}`}>
                    <input type="radio" name="trade-type" value={side} checked={type === side} onChange={() => setType(side)} />
                    <span>{side}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="trade-label" htmlFor="trade-quantity">Quantity</label>
            <input id="trade-quantity" type="text" inputMode="numeric" pattern="[1-9][0-9]*" required
              value={quantity} aria-invalid={!validQuantity} aria-describedby="trade-quantity-help"
              onChange={(event) => {
                const value = event.target.value
                if (value === '' || (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))) setQuantity(value)
              }} />
            <p id="trade-quantity-help" className={`trade-help${!validQuantity ? ' trade-error' : ''}`}>
              {validQuantity ? 'Enter a positive whole number of shares.' : 'Enter at least 1 whole share.'}
            </p>

            <dl className="trade-estimate" aria-live="polite" aria-atomic="true">
              <dt>Estimated {type === 'BUY' ? 'cost' : 'proceeds'}</dt>
              <dd>{estimate === null ? '—' : currency.format(estimate)}</dd>
            </dl>
            {exceedsBalance && <p className="trade-error" role="status">Estimated cost exceeds your demo cash balance.</p>}
            <button className="trade-confirm" type="submit" disabled aria-describedby="trade-backend-note">{type === 'BUY' ? 'Buy Stock' : 'Sell Stock'}</button>
            <p id="trade-backend-note" className="trade-backend-note">Trading will be available when the backend is connected.</p>
          </form>
        </section>

        <aside className="trade-account" aria-labelledby="trade-balance-title">
          <h2 id="trade-balance-title">Available virtual cash</h2>
          <p className="trade-balance">{currency.format(cashBalance)}</p>
          <p>Demo balance · USD</p>
          <div className="trade-preview-note">
            <h3>Preview your trade</h3>
            <p>Explore stocks and estimate an order. No orders are sent and your balance and holdings stay unchanged.</p>
            <p>Final prices and order validation will come from the backend.</p>
          </div>
        </aside>
      </div>
      <LivePriceChart key={symbol} symbol={symbol} />
    </div>
  )
}
