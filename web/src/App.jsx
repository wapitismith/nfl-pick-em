import { useEffect, useState } from 'react'
import { supabase, SEASON } from './supabase.js'
import Login from './components/Login.jsx'
import PickSheet from './components/PickSheet.jsx'
import Standings from './components/Standings.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState('picks')
  const [week, setWeek] = useState(null)
  const [weeks, setWeeks] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

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

      <nav className="tabs">
        <button className={tab === 'picks' ? 'active' : ''} onClick={() => setTab('picks')}>
          My Picks
        </button>
        <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>
          Standings
        </button>
      </nav>

      {week == null ? (
        <p className="muted center">No games loaded yet — run the schedule sync.</p>
      ) : tab === 'picks' ? (
        <PickSheet session={session} week={week} />
      ) : (
        <Standings session={session} week={week} />
      )}
    </div>
  )
}
