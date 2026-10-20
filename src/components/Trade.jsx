import { useEffect, useRef, useState } from 'react'
import { loadPortfolio } from '../db/account.js'
import { LivePriceChart } from './charts/index.js'
import { checkPendingTrade, pendingTradeKey, readPendingTrade, removePendingTrade, savePendingTrade } from '../trading/pendingTrade.js'
import './Trade.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const tradeStocks = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
]
const loadingResult = { loading: true, data: null, error: '' }
const storageWarning = 'Pending order storage is unavailable, invalid or changed. Check your transaction history before placing another order. New orders are blocked.'

export default function Trade({ userId, accessToken, onTradeSuccess }) {
  const [restored] = useState(() => {
    try {
      return { ...readPendingTrade(window.localStorage, userId), error: '' }
    } catch {
      return { raw: null, pending: null, error: storageWarning }
    }
  })
  const restoredBody = restored.pending ? JSON.parse(restored.pending.body) : null
  const [symbol, setSymbol] = useState(restoredBody?.symbol || 'AAPL')
  const [type, setType] = useState(restoredBody?.type || 'BUY')
  const [quantity, setQuantity] = useState(String(restoredBody?.quantity || 1))
  const [account, setAccount] = useState(loadingResult)
  const [accountAttempt, setAccountAttempt] = useState(0)
  const [price, setPrice] = useState(loadingResult)
  const [priceAttempt, setPriceAttempt] = useState(0)
  const [order, setOrder] = useState(() => restored.pending
    ? { ...restored.pending, uncertain: true, status: 'retry' } : null)
  const [storageError, setStorageError] = useState(restored.error)
  const storageBlocked = useRef(Boolean(restored.error))
  const expectedRaw = useRef(restored.raw)
  const busy = useRef(false)
  const lifetime = useRef(null)

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== null && event.key !== pendingTradeKey(userId)) return
      // Even a change followed by a restoration requires manual reconciliation.
      storageBlocked.current = true
      setStorageError(storageWarning)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [userId])

  function verifyStorage() {
    if (storageBlocked.current) return false
    try {
      checkPendingTrade(window.localStorage, userId, expectedRaw.current)
      return true
    } catch {
      storageBlocked.current = true
      setStorageError(storageWarning)
      return false
    }
  }

  function clearStoredOrder() {
    if (!verifyStorage()) return
    try {
      removePendingTrade(window.localStorage, userId, expectedRaw.current)
      expectedRaw.current = null
    } catch {
      storageBlocked.current = true
      setStorageError(storageWarning)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadPortfolio({ accessToken, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setAccount({ loading: false, data, error: '', accessToken })
    }).catch((error) => {
      if (!controller.signal.aborted) setAccount({ loading: false, data: null, error: error.message || 'Unable to load your account.', accessToken })
    })
    return () => controller.abort()
  }, [accessToken, accountAttempt])

  useEffect(() => {
    const controller = new AbortController()
    async function loadQuote() {
      // /api/quote is public; authentication is required only for portfolio data.
      const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || `Unable to load price (HTTP ${response.status}).`)
      if (data?.symbol !== symbol || !Number.isFinite(data.price) || data.price <= 0
        || typeof data.latestTradingDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.latestTradingDay)
        || !Number.isFinite(Date.parse(`${data.latestTradingDay}T00:00:00Z`))) {
        throw new Error('The server returned invalid price data.')
      }
      if (!controller.signal.aborted) setPrice({ loading: false, data, error: '' })
    }
    loadQuote().catch((error) => {
      if (!controller.signal.aborted) setPrice({ loading: false, data: null, error: error.message || 'Unable to load price.' })
    })
    return () => controller.abort()
  }, [symbol, priceAttempt])

  const stock = tradeStocks.find((item) => item.symbol === symbol)
  const quote = price.data
  const currentAccount = account.accessToken === accessToken ? account : loadingResult
  const cashBalance = currentAccount.data?.cashBalance
  const ownedQuantity = currentAccount.data?.holdings.find((holding) => holding.symbol === symbol)?.quantity ?? 0
  const validQuantity = /^[1-9]\d*$/.test(quantity) && Number.isSafeInteger(Number(quantity)) && Number(quantity) <= 2147483647
  const hasPrice = quote?.symbol === symbol && Number.isFinite(quote.price) && quote.price > 0
  const estimate = validQuantity && hasPrice ? Number(quantity) * quote.price : null
  const exceedsBalance = type === 'BUY' && estimate !== null && estimate > cashBalance
  const exceedsShares = type === 'SELL' && validQuantity && Number(quantity) > ownedQuantity
  const locked = Boolean(storageError) || order?.status === 'sending' || order?.status === 'retry'
  const canSubmit = Boolean(accessToken && currentAccount.data && hasPrice && validQuantity
    && !exceedsBalance && !exceedsShares && !locked && order?.status !== 'success')

  async function sendOrder(pending) {
    if (busy.current || pending.userId !== userId || !verifyStorage()) return
    try {
      if (expectedRaw.current === null) {
        expectedRaw.current = savePendingTrade(window.localStorage, pending, null)
      } else {
        const stored = readPendingTrade(window.localStorage, userId).pending
        if (stored?.key !== pending.key || stored?.body !== pending.body) throw new Error('Order changed.')
      }
    } catch {
      storageBlocked.current = true
      setStorageError(storageWarning)
      return
    }
    busy.current = true
    const controller = lifetime.current
    setOrder({ ...pending, status: 'sending', error: '' })
    try {
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': pending.key,
        },
        body: pending.body,
        signal: controller.signal,
      })
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!response.ok) {
        const code = data?.error?.code
        const message = data?.error?.message
        // A prior attempt may have committed even if this response cannot confirm it.
        const uncertain = pending.uncertain || response.status >= 500
          || code === 'PORTFOLIO_CHANGED_RETRY' || code === 'IDEMPOTENCY_RESULT_UNAVAILABLE'
          || code === 'IDEMPOTENCY_KEY_REUSED'
          || ![400, 401, 404, 405, 409, 429].includes(response.status)
          || typeof code !== 'string' || typeof message !== 'string'
        if (!uncertain) clearStoredOrder()
        setOrder({ ...pending, uncertain, status: uncertain ? 'retry' : 'error',
          error: `${response.status === 401 ? 'Authorization error · ' : ''}${code || `HTTP_${response.status}`}: ${message || 'Unable to confirm order result.'}` })
        return
      }
      const transaction = data?.transaction
      const expected = JSON.parse(pending.body)
      if (data?.success !== true || typeof data.replayed !== 'boolean'
        || typeof transaction?.id !== 'string' || transaction.symbol !== expected.symbol
        || transaction.type !== expected.type || transaction.quantity !== expected.quantity
        || !Number.isFinite(transaction.price) || transaction.price <= 0
        || !Number.isFinite(transaction.total) || transaction.total <= 0) {
        throw new Error('Invalid response. The order result is unconfirmed.')
      }
      setOrder({ status: 'success', transaction, replayed: data.replayed })
      clearStoredOrder()
      setAccount(loadingResult)
      setAccountAttempt((value) => value + 1)
      onTradeSuccess?.()
    } catch (error) {
      if (!controller.signal.aborted) setOrder({ ...pending, uncertain: true, status: 'retry',
        error: error.message || 'Network error. The order result is unconfirmed.' })
    } finally {
      busy.current = false
    }
  }

  return (
    <div className="trade-screen">
      <p className="trade-demo-note">Backend data · Virtual funds · USD</p>
      <div className="trade-layout">
        <section className="workspace-card trade-order" aria-labelledby="trade-title">
          <div className="card-heading">
            <h2 id="trade-title">Trading workspace</h2>
            <span className="trade-demo-badge">Order preview</span>
          </div>
          <form className="trade-form" onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit || busy.current) return
            sendOrder({ userId, key: crypto.randomUUID(), body: JSON.stringify({ symbol, type, quantity: Number(quantity) }) })
          }}>
            <label className="trade-label" htmlFor="trade-symbol">Select stock</label>
            <select id="trade-symbol" disabled={locked} value={symbol} onChange={(event) => {
              setPrice(loadingResult)
              setSymbol(event.target.value)
            }}>
              {tradeStocks.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} — {item.name}</option>)}
            </select>

            <div className="trade-quote" aria-live="polite" aria-atomic="true">
              <div><h3>{stock.symbol}</h3><p>{stock.name}</p></div>
              <div className="trade-price"><span>Latest available price · USD</span><strong>{hasPrice ? currency.format(quote.price) : '—'}</strong></div>
            </div>
            {price.loading && <p role="status" aria-busy="true">Loading price…</p>}
            {price.error && <div>
              <p className="trade-error" role="alert">{price.error}</p>
              <button type="button" onClick={() => {
                setPrice(loadingResult)
                setPriceAttempt((value) => value + 1)
              }}>Retry price</button>
            </div>}
            {hasPrice && <p className="trade-price-note">Trading day: {quote.latestTradingDay}. This is the latest available trading-day quote.</p>}

            <fieldset className="trade-side" disabled={locked}>
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
            <input id="trade-quantity" disabled={locked} type="text" inputMode="numeric" pattern="[1-9][0-9]*" required
              value={quantity} aria-invalid={!validQuantity} aria-describedby="trade-quantity-help"
              onChange={(event) => {
                const value = event.target.value
                if (value === '' || (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))) setQuantity(value)
              }} />
            <p id="trade-quantity-help" className={`trade-help${!validQuantity ? ' trade-error' : ''}`}>
              Enter a whole number of shares from 1 to 2147483647.
            </p>

            <dl className="trade-estimate" aria-live="polite" aria-atomic="true">
              <dt>Estimated {type === 'BUY' ? 'cost' : 'proceeds'}</dt>
              <dd>{estimate === null ? '—' : currency.format(estimate)}</dd>
            </dl>
            <p className="trade-price-note">This estimate is indicative. The backend determines the final execution price.</p>
            {exceedsBalance && <p className="trade-error" role="status">Estimated cost exceeds your available cash balance.</p>}
            {exceedsShares && currentAccount.data && <p className="trade-error" role="status">You do not own enough shares for this sale.</p>}
            {order?.status !== 'success' && <>
              <button className="trade-confirm" type="submit" disabled={!canSubmit} aria-describedby="trade-backend-note">{type === 'BUY' ? 'Buy Stock' : 'Sell Stock'}</button>
              <p id="trade-backend-note" className="trade-backend-note">The backend validates your balance, shares and final execution price.</p>
            </>}
            {order?.status === 'sending' && <p className="trade-status" role="status" aria-busy="true">Submitting order… Please wait for confirmation.</p>}
            {order?.error && <p className="trade-feedback trade-feedback-error" role="alert">{order.error}</p>}
            {storageError && <p className="trade-feedback trade-feedback-warning" role="alert">{storageError}</p>}
            {order?.status === 'retry' && <div className="trade-feedback trade-feedback-warning">
              <h3>Order awaiting confirmation</h3>
              <p>The order result is unconfirmed. Retry sends the same order; do not place it again as a new order.</p>
              <button className="trade-secondary" type="button" disabled={Boolean(storageError)} onClick={() => sendOrder(order)}>Retry same order</button>
            </div>}
            {order?.status === 'success' && <div className="trade-result">
              <section className="trade-success" role="status" aria-label="Executed order">
                <div className="trade-success-heading">
                  <span className="trade-success-icon" aria-hidden="true">✓</span>
                  <div><h3>Order confirmed</h3><p>{order.replayed ? 'Previously executed order recovered.' : 'Your trade was executed successfully.'}</p></div>
                </div>
                <div className="trade-executed-stock"><span className={`trade-result-side trade-result-${order.transaction.type.toLowerCase()}`}>{order.transaction.type}</span><strong>{order.transaction.symbol}</strong></div>
                <dl className="trade-execution-details">
                  <div><dt>Shares</dt><dd>{order.transaction.quantity}</dd></div>
                  <div><dt>Execution price</dt><dd>{currency.format(order.transaction.price)}</dd></div>
                  <div className="trade-execution-total"><dt>Total amount</dt><dd>{currency.format(order.transaction.total)}</dd></div>
                </dl>
              </section>
              {currentAccount.loading && <p className="trade-status" role="status" aria-busy="true">Trade complete · Updating your portfolio…</p>}
              {currentAccount.error && <section className="trade-feedback trade-feedback-warning" role="alert">
                <h3>Trade complete · Portfolio update failed</h3>
                <p>Your order succeeded. Refresh your account to see the latest balance. This will not place another order.</p>
                <p className="trade-refresh-error">{currentAccount.error}</p>
                <button className="trade-secondary" type="button" onClick={() => {
                  setAccount(loadingResult)
                  setAccountAttempt((value) => value + 1)
                }}>Retry account refresh</button>
              </section>}
              <button className="trade-secondary trade-new-order" type="button" disabled={!currentAccount.data || Boolean(storageError)} onClick={() => {
                if (verifyStorage()) setOrder(null)
              }}>New order</button>
            </div>}
          </form>
        </section>

        <aside className="trade-account" aria-labelledby="trade-balance-title">
          <h2 id="trade-balance-title">Available virtual cash</h2>
          {currentAccount.loading && <p role="status" aria-busy="true">Loading account…</p>}
          {currentAccount.error && order?.status !== 'success' && <div>
            <p className="trade-error" role="alert">{currentAccount.error}</p>
            <button className="trade-secondary" type="button" onClick={() => {
              setAccount(loadingResult)
              setAccountAttempt((value) => value + 1)
            }}>Retry account</button>
          </div>}
          {currentAccount.data && <>
            <p className="trade-balance">{currency.format(cashBalance)}</p>
            <p>Your account · USD</p>
            <p>Owned {symbol} shares: {ownedQuantity}</p>
          </>}
          <div className="trade-preview-note">
            <h3>Preview your trade</h3>
            <p>Submitting BUY or SELL executes a trade using virtual funds.</p>
            <p>Final prices and order validation will come from the backend.</p>
          </div>
        </aside>
      </div>
      <LivePriceChart key={symbol} symbol={symbol} />
    </div>
  )
}
