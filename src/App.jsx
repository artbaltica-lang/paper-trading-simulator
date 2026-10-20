import { useEffect, useState } from 'react'
import './App.css'
import History from './components/History'
import Portfolio from './components/Portfolio'
import Trade from './components/Trade'
import Auth from './components/Auth'
import { supabase } from './lib/supabaseClient'
import { loadHistory, loadPortfolio } from './db/account.js'

const screens = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Your portfolio, at a glance. Keep track of your virtual investments in one place.',
    emptyTitle: 'Your portfolio starts here',
    emptyDescription: 'Your portfolio overview and holdings will appear here as the simulator takes shape.',
    label: 'Portfolio overview',
  },
  {
    id: 'trade',
    title: 'Trade',
    description: 'A space to explore the market and practice your trading decisions.',
    emptyTitle: 'A place to practice',
    emptyDescription: 'Your trading workspace will appear here. Trading features are coming later.',
    label: 'Trading workspace',
  },
  {
    id: 'history',
    title: 'History / Stats',
    description: 'Look back at your activity and follow your progress over time.',
    emptyTitle: 'Every decision tells a story',
    emptyDescription: 'Your transaction history and performance statistics will appear here.',
    label: 'Activity & performance',
  },
]

function Icon({ name, ...props }) {
  const paths = {
    portfolio: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v3h4v-3" /></>,
    trade: <><path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4" /></>,
    history: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6M12 7v5l3 2" /></>,
    brand: <><path d="M4 17V12M10 17V8M16 17V4M3 21h18" /><path d="m3 8 6-5 5 2 7-3" /></>,
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [authError, setAuthError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true
    let sessionChanged = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      sessionChanged = true
      setSession(nextSession)
      setAuthError('')
      setCheckingSession(false)
    })

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!active || sessionChanged) return
        if (error) setAuthError('Unable to restore your session. Please sign in again.')
        else setSession(data.session)
      } catch {
        if (active && !sessionChanged) setAuthError('Unable to check your session. Please sign in again.')
      } finally {
        if (active) setCheckingSession(false)
      }
    }
    checkSession()
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setAuthError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) setAuthError('Unable to log out. Please try again.')
      else setSession(null)
    } catch {
      setAuthError('Unable to log out. Check your connection and try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  if (checkingSession) {
    return <main className="session-screen" aria-busy="true"><p role="status">Checking your session…</p></main>
  }
  if (!session) {
    return (
      <main className="session-screen">
        {authError && <p className="session-error" role="alert">{authError}</p>}
        <Auth onAuthenticated={(nextSession) => {
          setSession(nextSession)
          setAuthError('')
        }} />
      </main>
    )
  }
  return <Workspace key={session.user.id} session={session} onLogout={handleLogout} loggingOut={loggingOut} authError={authError} />
}

function PortfolioRequest({ accessToken, onStartTrading }) {
  const [result, setResult] = useState({ loading: true, data: null, error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadPortfolio({ accessToken, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setResult({ loading: false, data, error: '' })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ loading: false, data: null, error: error.message || 'Unable to load your portfolio. Please try again.' })
    })
    return () => controller.abort()
  }, [accessToken, attempt])

  if (result.loading) return <p role="status" aria-busy="true">Loading portfolio…</p>
  if (result.error) {
    return (
      <section>
        <p className="session-error" role="alert">{result.error}</p>
        <button className="logout-button" type="button" onClick={() => {
          setResult({ loading: true, data: null, error: '' })
          setAttempt((value) => value + 1)
        }}>Try again</button>
      </section>
    )
  }
  return <Portfolio accessToken={accessToken} onStartTrading={onStartTrading} portfolio={result.data} note="Your account · Backend data · Virtual funds · USD" />
}

function HistoryRequest({ accessToken }) {
  const [result, setResult] = useState({ loading: true, data: null, error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadHistory({ accessToken, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setResult({ loading: false, data, error: '' })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ loading: false, data: null, error: error.message || 'Unable to load your history. Please try again.' })
    })
    return () => controller.abort()
  }, [accessToken, attempt])

  if (result.loading) return <p role="status" aria-busy="true">Loading history…</p>
  if (result.error) {
    return (
      <section>
        <p className="session-error" role="alert">{result.error}</p>
        <button className="logout-button" type="button" onClick={() => {
          setResult({ loading: true, data: null, error: '' })
          setAttempt((value) => value + 1)
        }}>Try again</button>
      </section>
    )
  }
  return <History accessToken={accessToken} data={result.data.history} />
}

function Workspace({ session, onLogout, loggingOut, authError }) {
  const [activeScreen, setActiveScreen] = useState('portfolio')
  const [tradeRevision, setTradeRevision] = useState(0)
  const screen = screens.find((item) => item.id === activeScreen)

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon"><Icon name="brand" /></span>
            <span className="brand-name">Paper Trading Simulator</span>
          </div>
          <div className="header-actions">
            <span className="simulation-badge"><span />SIMULATION</span>
            <button className="logout-button" type="button" disabled={loggingOut} onClick={onLogout}>
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </div>
        <nav className="navigation" aria-label="Main navigation">
          <div className="navigation-inner">
            {screens.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${activeScreen === item.id ? ' is-active' : ''}`}
                aria-current={activeScreen === item.id ? 'page' : undefined}
                onClick={() => setActiveScreen(item.id)}
              >
                <Icon name={item.id} />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main id="main-content" className="main-content">
        {authError && <p className="session-error" role="alert">{authError}</p>}
        <div className="page-heading" aria-live="polite" aria-atomic="true">
          <p className="eyebrow">YOUR PRACTICE WORKSPACE</p>
          <h1>{screen.title}</h1>
          <p className="page-description">{screen.description}</p>
        </div>
        {activeScreen === 'portfolio' ? (
          <PortfolioRequest
            key={`${session.access_token}:${tradeRevision}`}
            accessToken={session.access_token}
            onStartTrading={() => setActiveScreen('trade')}
          />
        ) : activeScreen === 'history' ? (
          <HistoryRequest key={`${session.access_token}:${tradeRevision}`} accessToken={session.access_token} />
        ) : null}
        <div hidden={activeScreen !== 'trade'}>
          <Trade userId={session.user.id} accessToken={session.access_token} onTradeSuccess={() => setTradeRevision((value) => value + 1)} />
        </div>
        <footer className="workspace-footer">
          <span className="footer-dot" />
          <p>Practice with confidence. This is a simulation environment.</p>
        </footer>
      </main>
    </div>
  )
}

export default App
