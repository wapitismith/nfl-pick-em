import { useState } from 'react'
import { supabase } from '../supabase.js'

export default function Login() {
  const [mode, setMode] = useState('link') // 'link' | 'password'
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function sendLink(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
        data: name ? { display_name: name } : undefined,
      },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function signInPassword(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(
        /invalid/i.test(error.message)
          ? 'Wrong email or password — or no password set yet. Use "Email me a link" first, then set a password from the app.'
          : error.message
      )
    }
  }

  return (
    <div className="app login">
      <img
        src={`${import.meta.env.BASE_URL}logo-512.png`}
        alt="Guffey Pick'Em NFL Pool"
        className="login-logo"
      />
      <h1>Guffey Pick'Em</h1>

      {sent ? (
        <p>
          Check your email — we sent a sign-in link to <b>{email}</b>. Open it on
          this device and you're in. No password needed.
        </p>
      ) : (
        <>
          <div className="scope-toggle">
            <button
              type="button"
              className={mode === 'link' ? 'active' : ''}
              onClick={() => setMode('link')}
            >
              Email me a link
            </button>
            <button
              type="button"
              className={mode === 'password' ? 'active' : ''}
              onClick={() => setMode('password')}
            >
              Password
            </button>
          </div>

          {mode === 'link' ? (
            <form onSubmit={sendLink}>
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Display name <span className="muted">(first time only)</span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Mike"
                />
              </label>
              <button disabled={busy || !email}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          ) : (
            <form onSubmit={signInPassword}>
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
              <button disabled={busy || !email || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="muted" style={{ fontWeight: 400 }}>
                No password yet? Sign in with an email link once, then use
                "Set password" in the app — after that this works on any device.
              </p>
              {error && <p className="error">{error}</p>}
            </form>
          )}
        </>
      )}
    </div>
  )
}
