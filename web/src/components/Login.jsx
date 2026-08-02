import { useState } from 'react'
import { supabase } from '../supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
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

  return (
    <div className="app login">
      <h1>🏈 Pick-Em Pool</h1>
      {sent ? (
        <p>
          Check your email — we sent a sign-in link to <b>{email}</b>. Open it on
          this device and you're in. No password needed.
        </p>
      ) : (
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
      )}
    </div>
  )
}
