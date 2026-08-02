import { useEffect, useState } from 'react'
import { supabase, SEASON } from './supabase.js'
import Login from './components/Login.jsx'
import PickSheet from './components/PickSheet.jsx'
import Standings from './components/Standings.jsx'
import Admin from './components/Admin.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState('picks')
  const [week, setWeek] = useState(null)
  const [weeks, setWeeks] = useState([])
  const [profile, setProfile] = useState(null)
  const isAdmin = !!profile?.is_admin

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
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
        <h1>🏈 Pick-Em Pool</h1>
        <div className="header-right">
          {week != null && (
            <select
              value={week}
              onChange={e => setWeek(Number(e.target.value))}
              aria-label="Week"
            >
              {weeks.map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          )}
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

      <nav className="tabs">
        <button className={tab === 'picks' ? 'active' : ''} onClick={() => setTab('picks')}>
          My Picks
        </button>
        <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>
          Standings
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
      ) : (
        <Admin session={session} week={week} />
      )}
    </div>
  )
}
