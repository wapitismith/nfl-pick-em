import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, SEASON } from '../supabase.js'
import { teamLabel } from '../teams.js'

const fmtKick = iso =>
  new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export default function PickSheet({ session, week, forUser = null, admin = false }) {
  const [games, setGames] = useState([])
  const [picks, setPicks] = useState({}) // game_id -> {picked_team, confidence}
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)
  // Admins can edit another player's picks via forUser
  const userId = forUser?.id ?? session.user.id

  const load = useCallback(async () => {
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .eq('season', SEASON)
        .eq('week', week)
        .order('kickoff'),
      supabase
        .from('picks')
        .select('game_id,picked_team,confidence')
        .eq('user_id', userId),
    ])
    setGames(g ?? [])
    const mine = {}
    for (const row of p ?? []) mine[row.game_id] = row
    setPicks(mine)
  }, [week, userId])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // refresh scores every minute
    return () => clearInterval(t)
  }, [load])

  const locked = g => !admin && new Date(g.kickoff) <= new Date()
  const usedConfidence = useMemo(() => {
    const gameIds = new Set(games.map(g => g.game_id))
    return new Set(
      Object.entries(picks)
        .filter(([id, p]) => gameIds.has(id) && p.confidence != null)
        .map(([, p]) => p.confidence)
    )
  }, [picks, games])

  async function save(gameId, patch) {
    setError(null)
    setSaving(gameId)
    const prev = picks[gameId] ?? {}
    const next = { ...prev, ...patch }
    const { error } = await supabase.from('picks').upsert(
      {
        user_id: userId,
        game_id: gameId,
        picked_team: next.picked_team,
        confidence: next.confidence ?? null,
      },
      { onConflict: 'user_id,game_id' }
    )
    setSaving(null)
    if (error) {
      setError(
        /kickoff|policy/i.test(error.message)
          ? 'That game has locked — pick not saved.'
          : error.message
      )
    } else {
      setPicks(cur => ({ ...cur, [gameId]: next }))
    }
  }

  const nPicked = games.filter(
    g => picks[g.game_id]?.picked_team && picks[g.game_id]?.confidence != null
  ).length

  return (
    <div>
      <p className="muted center">
        {nPicked}/{games.length} picks complete · tap a team, then set confidence
        ({games.length} = most confident)
      </p>
      {error && <p className="error center">{error}</p>}

      {games.map(g => {
        const mine = picks[g.game_id] ?? {}
        const isLocked = locked(g)
        const final = g.status === 'final'
        const live = g.status === 'in_progress'
        const won = final && mine.picked_team === g.winner
        return (
          <div key={g.game_id} className={`game ${isLocked ? 'locked' : ''}`}>
            <div className="game-meta">
              <span>
                {fmtKick(g.kickoff)}
                {g.stadium ? ` · ${g.stadium}` : ''}
              </span>
              {live && <span className="badge live">LIVE {g.away_score}–{g.home_score}</span>}
              {final && (
                <span className={`badge ${won ? 'win' : mine.picked_team ? 'loss' : ''}`}>
                  Final {g.away_score}–{g.home_score} {mine.picked_team ? (won ? '✓' : '✗') : ''}
                </span>
              )}
              {isLocked && !final && !live && <span className="badge">Locked</span>}
            </div>
            <div className="teams">
              {[g.away_team, g.home_team].map(team => (
                <button
                  key={team}
                  className={`team ${mine.picked_team === team ? 'picked' : ''}`}
                  disabled={isLocked || saving === g.game_id}
                  onClick={() => save(g.game_id, { picked_team: team })}
                >
                  {teamLabel(team)}
                  {team === g.home_team && <span className="muted"> home</span>}
                </button>
              ))}
              <select
                className="confidence"
                value={mine.confidence ?? ''}
                disabled={isLocked || !mine.picked_team || saving === g.game_id}
                onChange={e =>
                  save(g.game_id, { confidence: Number(e.target.value) })
                }
                aria-label="Confidence points"
              >
                <option value="" disabled>pts</option>
                {Array.from({ length: games.length }, (_, i) => i + 1)
                  .filter(n => !usedConfidence.has(n) || n === mine.confidence)
                  .map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
              </select>
            </div>
          </div>
        )
      })}
    </div>
  )
}
