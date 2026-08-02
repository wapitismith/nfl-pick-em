import { useCallback, useEffect, useState } from 'react'
import { supabase, SEASON } from '../supabase.js'
import PickSheet from './PickSheet.jsx'

export default function Admin({ session, week }) {
  const [players, setPlayers] = useState([])
  const [games, setGames] = useState([])
  const [picks, setPicks] = useState([]) // all picks for this week's games
  const [balances, setBalances] = useState([])
  const [editPlayer, setEditPlayer] = useState(null)
  const [gameEdits, setGameEdits] = useState({})
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data: g } = await supabase
      .from('games')
      .select('*')
      .eq('season', SEASON)
      .eq('week', week)
      .order('kickoff')
    const gameIds = (g ?? []).map(x => x.game_id)
    const [{ data: pl }, { data: pk }, { data: bal }] = await Promise.all([
      supabase.from('profiles').select('*').order('display_name'),
      gameIds.length
        ? supabase.from('picks').select('user_id,game_id,confidence').in('game_id', gameIds)
        : Promise.resolve({ data: [] }),
      supabase.from('player_balances').select('*').order('display_name'),
    ])
    setGames(g ?? [])
    setPlayers(pl ?? [])
    setPicks(pk ?? [])
    setBalances(bal ?? [])
  }, [week])

  useEffect(() => { load() }, [load])

  function flash(text) {
    setMsg(text)
    setTimeout(() => setMsg(null), 3000)
  }

  // ----- player management -----
  async function updatePlayer(id, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) flash(error.message)
    else load()
  }
  async function rename(p) {
    const name = window.prompt(`New name for ${p.display_name}:`, p.display_name)
    if (name && name.trim()) updatePlayer(p.id, { display_name: name.trim() })
  }

  // ----- game overrides -----
  async function saveGame(g) {
    const e = gameEdits[g.game_id] ?? {}
    const home = e.home_score ?? g.home_score
    const away = e.away_score ?? g.away_score
    const status = e.status ?? g.status
    const winner =
      status !== 'final' || home == null || away == null
        ? null
        : Number(home) > Number(away)
          ? g.home_team
          : Number(away) > Number(home)
            ? g.away_team
            : 'TIE'
    const { error } = await supabase
      .from('games')
      .update({
        home_score: home === '' || home == null ? null : Number(home),
        away_score: away === '' || away == null ? null : Number(away),
        status,
        winner,
      })
      .eq('game_id', g.game_id)
    if (error) flash(error.message)
    else {
      flash(`${g.away_team} @ ${g.home_team} saved`)
      setGameEdits(cur => ({ ...cur, [g.game_id]: undefined }))
      load()
    }
  }

  // ----- payments -----
  async function recordPayment(b) {
    const amt = window.prompt(
      `Record payment from ${b.display_name} ($ — use a negative number to correct a mistake):`,
      '5'
    )
    if (amt == null || amt.trim() === '' || isNaN(Number(amt))) return
    const { error } = await supabase.from('payments').insert({
      user_id: b.user_id,
      season: SEASON,
      amount: Number(amt),
      method: 'manual',
    })
    if (error) flash(error.message)
    else {
      flash(`Recorded $${amt} from ${b.display_name}`)
      load()
    }
  }

  if (editPlayer) {
    return (
      <div>
        <div className="admin-banner">
          Editing picks for <b>{editPlayer.display_name}</b> (admin override —
          locks don't apply)
          <button className="link" onClick={() => { setEditPlayer(null); load() }}>
            ← back to admin
          </button>
        </div>
        <PickSheet session={session} week={week} forUser={editPlayer} admin />
      </div>
    )
  }

  const nGames = games.length
  const active = players.filter(p => p.active !== false)

  return (
    <div>
      {msg && <p className="center"><span className="badge win">{msg}</span></p>}

      <h2 className="admin-h">
        Who's picked — {week === 0 ? 'Test Week' : `Week ${week}`}
      </h2>
      <table className="standings">
        <thead>
          <tr><th>Player</th><th>Picks in</th><th></th></tr>
        </thead>
        <tbody>
          {active.map(p => {
            const done = picks.filter(
              k => k.user_id === p.id && k.confidence != null
            ).length
            const complete = nGames > 0 && done >= nGames
            return (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td>
                  <span className={`badge ${complete ? 'win' : 'loss'}`}>
                    {done}/{nGames}
                  </span>
                </td>
                <td>
                  <button className="link" onClick={() => setEditPlayer(p)}>
                    edit picks
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 className="admin-h">Game overrides</h2>
      <p className="muted">
        Fix a wrong score or force a game final. Winner is set automatically
        from the scores when status is final.
      </p>
      {games.map(g => {
        const e = gameEdits[g.game_id] ?? {}
        const set = patch =>
          setGameEdits(cur => ({ ...cur, [g.game_id]: { ...e, ...patch } }))
        return (
          <div key={g.game_id} className="game">
            <div className="game-meta">
              <span><b>{g.away_team} @ {g.home_team}</b></span>
              <span className="badge">{g.status}</span>
            </div>
            <div className="teams">
              <input
                type="number" inputMode="numeric" placeholder={g.away_team}
                value={e.away_score ?? g.away_score ?? ''}
                onChange={ev => set({ away_score: ev.target.value })}
              />
              <input
                type="number" inputMode="numeric" placeholder={g.home_team}
                value={e.home_score ?? g.home_score ?? ''}
                onChange={ev => set({ home_score: ev.target.value })}
              />
              <select
                value={e.status ?? g.status}
                onChange={ev => set({ status: ev.target.value })}
              >
                <option value="scheduled">scheduled</option>
                <option value="in_progress">live</option>
                <option value="final">final</option>
              </select>
              <button onClick={() => saveGame(g)}>Save</button>
            </div>
          </div>
        )
      })}

      <h2 className="admin-h">Pool dues ($5/week played)</h2>
      <table className="standings">
        <thead>
          <tr><th>Player</th><th>Weeks</th><th>Owed</th><th>Paid</th><th>Balance</th><th></th></tr>
        </thead>
        <tbody>
          {balances
            .filter(b => b.active !== false || b.weeks_played > 0)
            .map(b => (
              <tr key={b.user_id}>
                <td>{b.display_name}</td>
                <td>{b.weeks_played}</td>
                <td>${Number(b.owed).toFixed(0)}</td>
                <td>${Number(b.paid).toFixed(0)}</td>
                <td>
                  <span className={`badge ${b.balance < 0 ? 'loss' : 'win'}`}>
                    {b.balance < 0
                      ? `owes $${Math.abs(b.balance).toFixed(0)}`
                      : b.balance > 0
                        ? `+$${Number(b.balance).toFixed(0)}`
                        : 'even'}
                  </span>
                </td>
                <td>
                  <button className="link" onClick={() => recordPayment(b)}>
                    record $
                  </button>
                </td>
              </tr>
            ))}
          {balances.length === 0 && (
            <tr>
              <td colSpan="6" className="muted center">
                Run payments.sql in Supabase to enable dues tracking.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="admin-h">Players</h2>
      <table className="standings">
        <thead>
          <tr><th>Name</th><th>Joined</th><th>Active</th><th>Admin</th><th></th></tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id} className={p.active === false ? 'inactive' : ''}>
              <td>{p.display_name}<div className="muted small">{p.email}</div></td>
              <td className="muted small">
                {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                {p.welcomed_at == null && <div className="badge">new</div>}
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={p.active !== false}
                  onChange={ev => updatePlayer(p.id, { active: ev.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={!!p.is_admin}
                  disabled={p.id === session.user.id} // can't un-admin yourself
                  onChange={ev => updatePlayer(p.id, { is_admin: ev.target.checked })}
                />
              </td>
              <td><button className="link" onClick={() => rename(p)}>rename</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted center">
        Deactivated players keep their history but stop getting reminder emails.
      </p>
    </div>
  )
}
