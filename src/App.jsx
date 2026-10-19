import { useEffect, useState } from 'react'
import './App.css'
import History from './components/History'
import Portfolio from './components/Portfolio'
import Trade from './components/Trade'
import { loadAccount, readAccount, toHistoryView, toPortfolioView, toValueSeries } from './db/account.js'

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
  const [activeScreen, setActiveScreen] = useState('portfolio')
  const [account, setAccount] = useState(() => readAccount(window.localStorage))
  const screen = screens.find((item) => item.id === activeScreen)

  useEffect(() => {
    let active = true
    loadAccount({ storage: window.localStorage }).then((next) => {
      if (active) setAccount(next)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon"><Icon name="brand" /></span>
            <span className="brand-name">Paper Trading Simulator</span>
          </div>
          <span className="simulation-badge"><span />SIMULATION</span>
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
        <div className="page-heading" aria-live="polite" aria-atomic="true">
          <p className="eyebrow">YOUR PRACTICE WORKSPACE</p>
          <h1>{screen.title}</h1>
          <p className="page-description">{screen.description}</p>
        </div>
        {activeScreen === 'portfolio' ? (
          <Portfolio
            onStartTrading={() => setActiveScreen('trade')}
            portfolio={toPortfolioView(account)}
            note="Saved account · Virtual funds · USD"
          />
        ) : activeScreen === 'trade' ? (
          <Trade />
        ) : (
          <History data={toHistoryView(account)} valueSeries={toValueSeries(account)} />
        )}
        <footer className="workspace-footer">
          <span className="footer-dot" />
          <p>Practice with confidence. This is a simulation environment.</p>
        </footer>
      </main>
    </div>
  )
}

export default App
