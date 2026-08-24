import { useEffect, useMemo, useState } from 'react'
import { supabase, SEASON } from '../supabase.js'

// Stats & reporting: the raw weekly pick grid everyone loved last year,
// plus consensus/upsets, a confidence report, streaks & records, and
// team tendencies. Everything is computed client-side from pick_results
// (which respects RLS, so unrevealed picks simply aren't in the data).

export default function Stats({ session, week }) {
  const [games, setGames] = useState([])       // all season games
  const [results, setResults] = useState([])   // pick_results rows (visible ones)
  const [weekly, setWeekly] = useState([])     // weekly_standings rows
  const me = session.user.id

  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: r }, { data: w }] = await Promise.all([
        supabase.from('games').select('*').eq('season', SEASON)
          .eq('game_type', 'REG').order('kickoff'),
        supabase.from('pick_results').select('*').eq('season', SEASON),
        supabase.from('weekly_standings').select('*').eq('season', SEASON),
      ])
      setGames(g ?? [])
      setResults(r ?? [])
      setWeekly(w ?? [])
    }
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [week])

  const weekGames = useMemo(
    () => games.filter(g => g.week === week),
    [games, week]
  )
  const weekResults = useMemo(
    () => results.filter(r => r.week === week),
    [results, week]
  )

  // Every player who has at least one visible pick this season
  const players = useMemo(() => {
    const m = new Map()
    for (const r of results) m.set(r.user_id, r.display_name)
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results])

  const weekLabel = week === 0 ? 'Test Week' : `Week ${week}`
  const started = g => new Date(g.kickoff) <= new Date()

  // ---------- 1) Raw pick grid ----------
  const byUserGame = useMemo(() => {
    const m = {}
    for (const r of weekResults) m[`${r.user_id}|${r.game_id}`] = r
    return m
  }, [weekResults])

  const weekPlayers = useMemo(() => {
    const ids = new Set(weekResults.map(r => r.user_id))
    ids.add(me) // always show your own row
    return players.filter(p => ids.has(p.id))
  }, [players, weekResults, me])

  // Weekly totals for the grid's right-hand column
  const weekTotals = useMemo(() => {
    const m = {}
    for (const w of weekly.filter(x => x.week === week)) m[w.user_id] = w
    return m
  }, [weekly, week])

  // ---------- 2) Consensus & upsets ----------
  const consensus = useMemo(() =>
    weekGames.filter(started).map(g => {
      const rows = weekResults.filter(r => r.game_id === g.game_id)
      const away = rows.filter(r => r.picked_team === g.away_team).length
      const home = rows.filter(r => r.picked_team === g.home_team).length
      const total = away + home
      const graded = g.status === 'final'
      const rightPct = graded && total
        ? Math.round(100 * rows.filter(r => r.correct).length / total)
        : null
      return { g, away, home, total, rightPct }
    }), [weekGames, weekResults])

  const mostFooled = useMemo(() => {
    const graded = consensus.filter(c => c.rightPct != null && c.total > 0)
    if (!graded.length) return null
    return graded.reduce((a, b) => (b.rightPct < a.rightPct ? b : a))
  }, [consensus])

  const loneWolves = useMemo(() => {
    const out = []
    for (const c of consensus) {
      if (c.rightPct == null) continue
      const right = weekResults.filter(r => r.game_id === c.g.game_id && r.correct)
      if (right.length === 1 && c.total >= 3) {
        out.push({ name: right[0].display_name, g: c.g })
      }
    }
    return out
  }, [consensus, weekResults])

  // ---------- 3) Confidence report (season, graded picks) ----------
  const confReport = useMemo(() => {
    const rows = []
    for (const p of players) {
      const graded = results.filter(r => r.user_id === p.id && r.correct != null && r.confidence != null)
      if (!graded.length) continue
      const weeksOf = {}
      for (const r of graded) (weeksOf[r.week] ??= []).push(r)
      let hi = [0, 0], lo = [0, 0] // [wins, total]
      for (const wk of Object.values(weeksOf)) {
        const cut = Math.max(...wk.map(r => r.confidence)) / 2
        for (const r of wk) {
          const bucket = r.confidence > cut ? hi : lo
          bucket[1]++
          if (r.correct) bucket[0]++
        }
      }
      const lost = graded.filter(r => !r.correct)
        .reduce((s, r) => s + r.confidence, 0)
      rows.push({
        name: p.name,
        hiPct: hi[1] ? Math.round(100 * hi[0] / hi[1]) : null,
        loPct: lo[1] ? Math.round(100 * lo[0] / lo[1]) : null,
        lost,
      })
    }
    return rows.sort((a, b) => (b.hiPct ?? -1) - (a.hiPct ?? -1))
  }, [players, results])

  // ---------- 4) Streaks & records (season) ----------
  const records = useMemo(() => {
    // weekly titles: top confidence_points per week (ties share the title)
    const titles = {}
    const byWeek = {}
    for (const w of weekly) (byWeek[w.week] ??= []).push(w)
    for (const rows of Object.values(byWeek)) {
      const max = Math.max(...rows.map(r => r.confidence_points))
      if (max <= 0) continue
      rows.filter(r => r.confidence_points === max)
        .forEach(r => { titles[r.user_id] = (titles[r.user_id] ?? 0) + 1 })
    }
    return players.map(p => {
      const graded = results
        .filter(r => r.user_id === p.id && r.correct != null)
        .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
      let streak = 0
      for (let i = graded.length - 1; i >= 0; i--) {
        if (graded[i].correct) streak++
        else break
      }
      const mine = weekly.filter(w => w.user_id === p.id && w.graded > 0)
      const best = mine.length
        ? mine.reduce((a, b) => (b.confidence_points > a.confidence_points ? b : a))
        : null
      return {
        name: p.name,
        streak,
        best: best ? `${best.confidence_points} (Wk ${best.week})` : '—',
        titles: titles[p.id] ?? 0,
      }
    }).sort((a, b) => b.streak - a.streak)
  }, [players, results, weekly])

  // ---------- 5) Team tendencies (season) ----------
  const tendencies = useMemo(() =>
    players.map(p => {
      const mine = results.filter(r => r.user_id === p.id)
      if (!mine.length) return null
      const counts = {}
      let homePicks = 0
      for (const r of mine) {
        counts[r.picked_team] = (counts[r.picked_team] ?? 0) + 1
        if (r.picked_team === r.home_team) homePicks++
      }
      const [favTeam, favN] = Object.entries(counts)
        .reduce((a, b) => (b[1] > a[1] ? b : a))
      return {
        name: p.name,
        fav: `${favTeam} ×${favN}`,
        homer: Math.round(100 * favN / mine.length),
        homePct: Math.round(100 * homePicks / mine.length),
      }
    }).filter(Boolean), [players, results])

  if (!games.length) {
    return <p className="muted center">No games loaded yet.</p>
  }

  return (
    <div>
      {/* ---------- Raw pick grid ---------- */}
      <h2 className="admin-h">Pick grid — {weekLabel}</h2>
      <p className="muted small">
        Picks appear as each game kicks off (🔒 = not revealed yet,
        — = no pick). Green won, red lost.
      </p>
      <div className="grid-scroll">
        <table className="standings pickgrid">
          <thead>
            <tr>
              <th>Player</th>
              {weekGames.map(g => (
                <th key={g.game_id} title={`${g.away_team} @ ${g.home_team}`}>
                  {g.away_team}<br />@{g.home_team}
                </th>
              ))}
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {weekPlayers.map(p => (
              <tr key={p.id} className={p.id === me ? 'me' : ''}>
                <td>{p.name}</td>
                {weekGames.map(g => {
                  const r = byUserGame[`${p.id}|${g.game_id}`]
                  if (!r) {
                    return (
                      <td key={g.game_id} className="center muted">
                        {started(g) ? '—' : p.id === me ? '—' : '🔒'}
                      </td>
                    )
                  }
                  const cls =
                    r.correct === true ? 'cell-win'
                    : r.correct === false ? 'cell-loss'
                    : ''
                  return (
                    <td key={g.game_id} className={`center ${cls}`}>
                      {r.picked_team}
                      <span className="muted small"> {r.confidence ?? '·'}</span>
                    </td>
                  )
                })}
                <td><b>{weekTotals[p.id]?.confidence_points ?? 0}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Consensus & upsets ---------- */}
      <h2 className="admin-h">Consensus — {weekLabel}</h2>
      {consensus.length === 0 ? (
        <p className="muted">Shows once this week's games start kicking off.</p>
      ) : (
        <>
          {mostFooled && (
            <p className="pot-banner">
              🤡 <b>Most fooled:</b> only {mostFooled.rightPct}% of the pool got{' '}
              {mostFooled.g.away_team} @ {mostFooled.g.home_team} right.
            </p>
          )}
          {loneWolves.map((lw, i) => (
            <p key={i} className="pot-banner">
              🐺 <b>Lone wolf:</b> {lw.name} was the ONLY one right on{' '}
              {lw.g.away_team} @ {lw.g.home_team}.
            </p>
          ))}
          <table className="standings">
            <thead>
              <tr><th>Game</th><th>Pool split</th><th>Got it right</th></tr>
            </thead>
            <tbody>
              {consensus.map(c => (
                <tr key={c.g.game_id}>
                  <td>{c.g.away_team} @ {c.g.home_team}</td>
                  <td>
                    {c.total === 0 ? '—' : (
                      <>
                        {c.g.away_team} {Math.round(100 * c.away / c.total)}% ·{' '}
                        {c.g.home_team} {Math.round(100 * c.home / c.total)}%
                      </>
                    )}
                  </td>
                  <td>{c.rightPct == null ? '…' : `${c.rightPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ---------- Confidence report ---------- */}
      <h2 className="admin-h">Confidence report — season</h2>
      <p className="muted small">
        High = a pick ranked in the top half of your numbers that week.
        "Pts burned" = confidence spent on losers.
      </p>
      <table className="standings">
        <thead>
          <tr><th>Player</th><th>High-conf W%</th><th>Low-conf W%</th><th>Pts burned</th></tr>
        </thead>
        <tbody>
          {confReport.map(r => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.hiPct == null ? '—' : `${r.hiPct}%`}</td>
              <td>{r.loPct == null ? '—' : `${r.loPct}%`}</td>
              <td>{r.lost}</td>
            </tr>
          ))}
          {confReport.length === 0 && (
            <tr><td colSpan="4" className="muted center">Shows once games go final.</td></tr>
          )}
        </tbody>
      </table>

      {/* ---------- Streaks & records ---------- */}
      <h2 className="admin-h">Streaks & records — season</h2>
      <table className="standings">
        <thead>
          <tr><th>Player</th><th>Current streak</th><th>Best week</th><th>Weekly titles</th></tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.streak > 0 ? `${r.streak} ✓${r.streak >= 5 ? ' 🔥' : ''}` : '—'}</td>
              <td>{r.best}</td>
              <td>{r.titles > 0 ? '🏆'.repeat(Math.min(r.titles, 8)) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- Team tendencies ---------- */}
      <h2 className="admin-h">Team tendencies — season</h2>
      <p className="muted small">
        Homer index = share of all your picks spent on your most-picked team.
      </p>
      <table className="standings">
        <thead>
          <tr><th>Player</th><th>Most picked</th><th>Homer index</th><th>Picks home team</th></tr>
        </thead>
        <tbody>
          {tendencies.map(r => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.fav}</td>
              <td>{r.homer}%</td>
              <td>{r.homePct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted center small">
        Stats include only picks that have been revealed (your own always count).
      </p>
    </div>
  )
}
