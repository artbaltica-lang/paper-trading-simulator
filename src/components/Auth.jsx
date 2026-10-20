import { useId, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import './Auth.css'

function authErrorMessage(error) {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Incorrect email or password. Please try again.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Try logging in.'
    case 'weak_password':
      return 'Choose a stronger password with at least 6 characters.'
    case 'email_address_invalid':
      return 'Please enter a valid email address.'
    case 'email_not_confirmed':
      return 'Your email is not confirmed. Please contact support.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'signup_disabled':
      return 'Registration is currently unavailable. Please try again later.'
    default:
      return error.status === 429
        ? 'Too many attempts. Please wait a moment and try again.'
        : 'Unable to complete your request. Check your connection and try again.'
  }
}

export default function Auth({ onAuthenticated }) {
  const id = useId()
  const pending = useRef(false)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const isRegister = mode === 'register'

  function changeMode(nextMode) {
    if (pending.current) return
    setMode(nextMode)
    setPassword('')
    setError('')
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setLoading(true)
    setError('')
    setMessage('')

    let session
    try {
      const credentials = { email: email.trim(), password }
      const { data, error: authError } = isRegister
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials)

      if (authError) {
        setError(authErrorMessage(authError))
        return
      }
      session = data?.session
      if (!session) {
        setError('No active session was returned. Please try logging in or contact support.')
        return
      }
      setPassword('')
      setMessage(isRegister ? 'Account created. You are signed in.' : 'You are signed in.')
    } catch {
      setError('Unable to connect. Check your connection and try again.')
      return
    } finally {
      pending.current = false
      setLoading(false)
    }

    onAuthenticated?.(session)
  }

  return (
    <section className="auth-card" aria-labelledby={`${id}-title`}>
      <div className="auth-heading">
        <p className="auth-eyebrow">PAPER TRADING SIMULATOR</p>
        <h2 id={`${id}-title`}>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
        <p>{isRegister ? 'Start your virtual investing journey.' : 'Sign in to your practice workspace.'}</p>
      </div>

      <div className="auth-modes" role="group" aria-label="Account access">
        <button type="button" aria-pressed={!isRegister} disabled={loading} onClick={() => changeMode('login')}>Login</button>
        <button type="button" aria-pressed={isRegister} disabled={loading} onClick={() => changeMode('register')}>Register</button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
        <label htmlFor={`${id}-email`}>Email address</label>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required
          value={email} disabled={loading} onChange={(event) => setEmail(event.target.value)} />

        <label htmlFor={`${id}-password`}>Password</label>
        <input id={`${id}-password`} name="password" type="password" required
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          minLength={isRegister ? 6 : undefined} aria-describedby={isRegister ? `${id}-password-help` : undefined}
          value={password} disabled={loading} onChange={(event) => setPassword(event.target.value)} />
        {isRegister && <p id={`${id}-password-help`} className="auth-help">Use at least 6 characters.</p>}

        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-status" role="status">{loading ? 'Please wait…' : message}</p>
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="auth-footer">Practice investing with virtual funds.</p>
    </section>
  )
}
