import { useEffect, useState } from 'react'
import { supabase, SEASON, VENMO_USER, venmoLink } from './supabase.js'
import Login from './components/Login.jsx'
import PickSheet from './components/PickSheet.jsx'
import Standings from './components/Standings.jsx'
import Stats from './components/Stats.jsx'
import Admin from './components/Admin.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState('picks')
  const [week, setWeek] = useState(null)
  const [weeks, setWeeks] = useState([])
  const [profile, setProfile] = useState(null)
  const [balance, setBalance] = useState(null)
  const isAdmin = !!profile?.is_admin

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Arrived via an admin-sent (or self-service) password reset link:
      // they're signed in now, so collect the new password right away.
      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(async () => {
          const p = window.prompt(
            'Set your new password (8+ characters):'
          )
          if (p == null) return
          if (p.length < 8) {
            window.alert('Password must be at least 8 characters — ' +
              'use the "Password" link at the top to try again.')
            return
          }
          const { error } = await supabase.auth.updateUser({ password: p })
          window.alert(
            error
              ? 'Could not set password: ' + error.message
              : 'Password updated! Use it with your email on any device.'
          )
        }, 300)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Who am I? (name + admin flag)
  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('display_name,is_admin')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  // Pool dues balance (view may not exist until payments.sql is run)
  useEffect(() => {
    if (!session) return
    supabase
      .from('player_balances')
      .select('*')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => setBalance(data ?? null))
  }, [session, tab])

  // Determine current week: earliest week with a non-final game
  useEffect(() => {
    if (!session) return
    supabase
      .from('games')
      .select('week,status')
      .eq('season', SEASON)
      .eq('game_type', 'REG')
      .then(({ data }) => {
        if (!data?.length) return
        const all = [...new Set(data.map(g => g.week))].sort((a, b) => a - b)
        setWeeks(all)
        const open = data.filter(g => g.status !== 'final').map(g => g.week)
        setWeek(open.length ? Math.min(...open) : Math.max(...all))
      })
  }, [session])

  if (!session) return <Login />

  return (
    <div className="app">
      <header>
        <h1 className="brand">
          <img
            src={`${import.meta.env.BASE_URL}logo-192.png`}
            alt="Guffey Pick'Em NFL Pool"
            className="brand-logo"
          />
          Guffey Pick'Em
        </h1>
        <div className="header-right">
          {week != null && (
            <select
              value={week}
              onChange={e => setWeek(Number(e.target.value))}
              aria-label="Week"
            >
              {weeks.map(w => (
                <option key={w} value={w}>{w === 0 ? 'Test Week' : `Week ${w}`}</option>
              ))}
            </select>
          )}
          <button
            className="link"
            onClick={async () => {
              const p = window.prompt(
                'Set a password (8+ characters). After this you can sign in ' +
                'instantly on any device with email + password:'
              )
              if (p == null) return
              if (p.length < 8) {
                window.alert('Password must be at least 8 characters.')
                return
              }
              const { error } = await supabase.auth.updateUser({ password: p })
              window.alert(
                error
                  ? 'Could not set password: ' + error.message
                  : 'Password set! Use it with your email on any device.'
              )
            }}
          >
            Password
          </button>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <p className="welcome">
        Signed in as <b>{profile?.display_name ?? '…'}</b>{' '}
        <span className="muted">({session.user.email})</span>
        {isAdmin && <span className="badge win" style={{ marginLeft: 6 }}>admin</span>}
      </p>

      {balance && balance.balance < 0 && (
        <p className="pay-banner owe">
          Pool dues: you owe <b>${Math.abs(balance.balance).toFixed(0)}</b>
          {VENMO_USER && (
            <a
              className="venmo-btn"
              href={venmoLink(Math.abs(balance.balance))}
              target="_blank"
              rel="noreferrer"
            >
              Pay with Venmo
            </a>
          )}
        </p>
      )}
      {balance && balance.balance >= 0 && (
        <p className="pay-banner ok">
          {balance.weeks_played > 0
            ? `Dues paid up ✓${balance.balance > 0 ? ` ($${Number(balance.balance).toFixed(0)} credit)` : ''}`
            : balance.balance > 0
              ? `$${Number(balance.balance).toFixed(0)} prepaid ✓ — dues are $5 per week you play`
              : 'Dues: $5 per week you play'}
          {VENMO_USER && (
            <a className="venmo-btn" href={venmoLink(5)} target="_blank" rel="noreferrer">
              {balance.balance > 0 ? 'Add on Venmo' : 'Prepay on Venmo'}
            </a>
          )}
        </p>
      )}

      <nav className="tabs">
        <button className={tab === 'picks' ? 'active' : ''} onClick={() => setTab('picks')}>
          My Picks
        </button>
        <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>
          Standings
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          Stats
        </button>
        {isAdmin && (
          <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
            Admin
          </button>
        )}
      </nav>

      {week == null ? (
        <p className="muted center">
          No games loaded yet. All tabs stay empty until the season schedule is
          synced — run the <b>Sync schedule</b> workflow in GitHub Actions.
        </p>
      ) : tab === 'picks' ? (
        <PickSheet session={session} week={week} />
      ) : tab === 'standings' ? (
        <Standings session={session} week={week} />
      ) : tab === 'stats' ? (
        <Stats session={session} week={week} />
      ) : (
        <Admin session={session} week={week} />
      )}
    </div>
  )
}
