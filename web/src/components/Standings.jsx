import { useCallback, useEffect, useState } from 'react'
import { supabase, SEASON } from '../supabase.js'

export default function Standings({ session, week }) {
  const [scope, setScope] = useState('week')
  const [rows, setRows] = useState([])
  const [updated, setUpdated] = useState(null)

  const load = useCallback(async () => {
    const q =
      scope === 'week'
        ? supabase
            .from('weekly_standings')
            .select('*')
            .eq('season', SEASON)
            .eq('week', week)
        : supabase.from('season_standings').select('*').eq('season', SEASON)
    const { data } = await q
      .order('confidence_points', { ascending: false })
      .order('wins', { ascending: false })
    setRows(data ?? [])
    setUpdated(new Date())
  }, [scope, week])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // live refresh during games
    return () => clearInterval(t)
  }, [load])

  const me = session.user.id

  return (
    <div>
      <div className="scope-toggle">
        <button className={scope === 'week' ? 'active' : ''} onClick={() => setScope('week')}>
          {week === 0 ? 'Test Week' : `Week ${week}`}
        </button>
        <button className={scope === 'season' ? 'active' : ''} onClick={() => setScope('season')}>
          Season
        </button>
      </div>

      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>W</th>
            <th>Conf Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.user_id} className={r.user_id === me ? 'me' : ''}>
              <td>{i + 1}</td>
              <td>{r.display_name}</td>
              <td>{r.wins ?? 0}</td>
              <td>{r.confidence_points ?? 0}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan="4" className="muted center">
                No graded picks yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {updated && (
        <p className="muted center">
          Auto-refreshes every minute · updated {updated.toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
