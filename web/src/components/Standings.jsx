import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, SEASON } from '../supabase.js'

export default function Standings({ session, week }) {
  const [scope, setScope] = useState('week')
  const [rows, setRows] = useState([])
  const [updated, setUpdated] = useState(null)
  const [pots, setPots] = useState([])
  const [tiebreaks, setTiebreaks] = useState({})

  useEffect(() => {
    supabase
      .from('weekly_tiebreaks')
      .select('*')
      .eq('season', SEASON)
      .eq('week', week)
      .then(({ data }) => {
        const map = {}
        for (const t of data ?? []) map[t.user_id] = t
        setTiebreaks(map)
      })
  }, [week, updated])

  useEffect(() => {
    supabase
      .from('week_pots')
      .select('*')
      .eq('season', SEASON)
      .then(({ data }) => setPots(data ?? []))
  }, [week])

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

  // Weekly view: break confidence-point ties with the MNF tiebreaker
  const sortedRows = useMemo(() => {
    if (scope !== 'week') return rows
    const diff = id => {
      const d = tiebreaks[id]?.tiebreak_diff
      return d == null ? Infinity : d
    }
    return [...rows].sort(
      (a, b) =>
        (b.confidence_points ?? 0) - (a.confidence_points ?? 0) ||
        (b.wins ?? 0) - (a.wins ?? 0) ||
        diff(a.user_id) - diff(b.user_id)
    )
  }, [scope, rows, tiebreaks])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // live refresh during games
    return () => clearInterval(t)
  }, [load])

  const me = session.user.id
  const fmt$ = n => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`
  const thisPot = pots.find(p => p.week === week)
  const seasonPot = pots
    .filter(p => p.week > 0)
    .reduce((s, p) => s + Number(p.to_season_pot), 0)

  return (
    <div>
      {(thisPot || seasonPot > 0) && week > 0 && (
        <p className="pot-banner">
          {thisPot && (
            <>
              Week {week} pot: <b>{fmt$(thisPot.pot)}</b> · winner takes{' '}
              <b>{fmt$(thisPot.weekly_prize)}</b>
            </>
          )}
          {seasonPot > 0 && (
            <>
              {thisPot ? ' · ' : ''}Season pot: <b>{fmt$(seasonPot)}</b>{' '}
              <span className="muted">(overall winner, end of regular season)</span>
            </>
          )}
        </p>
      )}
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
            {scope === 'week' && <th>TB</th>}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={r.user_id} className={r.user_id === me ? 'me' : ''}>
              <td>{i + 1}</td>
              <td>{r.display_name}</td>
              <td>{r.wins ?? 0}</td>
              <td>{r.confidence_points ?? 0}</td>
              {scope === 'week' && (
                <td className="muted">
                  {tiebreaks[r.user_id]?.tiebreaker_guess ?? '—'}
                  {tiebreaks[r.user_id]?.tiebreak_diff != null
                    ? ` (Δ${tiebreaks[r.user_id].tiebreak_diff})`
                    : ''}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan="5" className="muted center">
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
