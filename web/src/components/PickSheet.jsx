import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, SEASON } from '../supabase.js'
import { TEAM_NAMES, teamLabel, helmetSrc, espnLogo } from '../teams.js'

// Google's live game panel (score, plays, highlights) for a matchup.
// "nfl" disambiguates shared mascots (MLB Cardinals/Giants, NHL Panthers...).
const gameSearchUrl = (away, home) =>
  'https://www.google.com/search?q=' +
  encodeURIComponent(
    `${TEAM_NAMES[away] ?? away} vs ${TEAM_NAMES[home] ?? home} nfl`
  )

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
        .select('game_id,picked_team,confidence,tiebreaker_guess')
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
        tiebreaker_guess: next.tiebreaker_guess ?? null,
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

  // Change/swap confidence. If the chosen number is already on another
  // game, trade the two rankings (in three steps, because each number can
  // only be used once per week: free it, take it, hand mine back).
  async function setConfidence(gameId, value) {
    const otherEntry = Object.entries(picks).find(
      ([id, p]) =>
        id !== gameId &&
        p.confidence === value &&
        games.some(g => g.game_id === id)
    )
    if (!otherEntry) return save(gameId, { confidence: value })

    const [otherId, otherPick] = otherEntry
    const otherGame = games.find(g => g.game_id === otherId)
    if (locked(otherGame)) {
      setError(
        `Can't take ${value} — that number belongs to a game that has already locked.`
      )
      return
    }
    const myOld = picks[gameId]?.confidence ?? null
    setError(null)
    setSaving(gameId)
    // 1) free the number
    let res = await supabase
      .from('picks')
      .update({ confidence: null })
      .eq('user_id', userId)
      .eq('game_id', otherId)
    if (res.error) {
      setSaving(null)
      setError(res.error.message)
      return
    }
    // 2) take it
    res = await supabase
      .from('picks')
      .upsert(
        {
          user_id: userId,
          game_id: gameId,
          picked_team: picks[gameId]?.picked_team,
          confidence: value,
          tiebreaker_guess: picks[gameId]?.tiebreaker_guess ?? null,
        },
        { onConflict: 'user_id,game_id' }
      )
    if (res.error) {
      // put the other game back the way it was
      await supabase
        .from('picks')
        .update({ confidence: value })
        .eq('user_id', userId)
        .eq('game_id', otherId)
      setSaving(null)
      setError(
        /kickoff|policy/i.test(res.error.message)
          ? 'That game has locked — pick not saved.'
          : res.error.message
      )
      return
    }
    // 3) hand my old number to the other game (stays blank if I had none)
    if (myOld != null) {
      res = await supabase
        .from('picks')
        .update({ confidence: myOld })
        .eq('user_id', userId)
        .eq('game_id', otherId)
    }
    setSaving(null)
    setPicks(cur => ({
      ...cur,
      [gameId]: { ...cur[gameId], confidence: value },
      [otherId]: { ...otherPick, confidence: myOld },
    }))
  }

  const nPicked = games.filter(
    g => picks[g.game_id]?.picked_team && picks[g.game_id]?.confidence != null
  ).length

  // Tiebreaker game = last kickoff of the week (normally late MNF)
  const tbGameId = games.length
    ? games.reduce((a, b) => (new Date(a.kickoff) > new Date(b.kickoff) ? a : b)).game_id
    : null

  // One-page printable sheet: this week's games with the player's picks and
  // confidence. Opens a clean window and fires the print dialog, where
  // "Save as PDF" produces the file on any phone or computer.
  async function printSheet() {
    let name = forUser?.display_name
    if (!name) {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .single()
      name = data?.display_name ?? session.user.email
    }
    const esc = s =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    const weekLabel = week === 0 ? 'Test Week' : `Week ${week}`
    const tbGuess = tbGameId ? picks[tbGameId]?.tiebreaker_guess : null
    const rows = games
      .map(g => {
        const m = picks[g.game_id] ?? {}
        return `<tr>
          <td>${esc(fmtKick(g.kickoff))}</td>
          <td>${esc(teamLabel(g.away_team))} @ ${esc(teamLabel(g.home_team))}${
            g.game_id === tbGameId ? ' <span class="tb">TB</span>' : ''
          }</td>
          <td class="pick">${m.picked_team ? esc(teamLabel(m.picked_team)) : '&mdash;'}</td>
          <td class="num">${m.confidence ?? '&mdash;'}</td>
        </tr>`
      })
      .join('')
    const w = window.open('', '_blank')
    if (!w) {
      setError('Pop-up blocked. Allow pop-ups for this site to print the sheet.')
      return
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>Guffey Pick'Em ${esc(weekLabel)} - ${esc(name)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #16202e; margin: 0; }
  h1 { font-size: 18px; color: #0b2545; margin: 0; }
  .sub { color: #666; font-size: 12px; margin: 2px 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #0b2545; color: #fff; font-size: 11px; }
  .pick { font-weight: 700; }
  .num { text-align: center; font-weight: 700; width: 60px; }
  .tb { font-size: 9px; font-weight: 700; color: #b3313c; }
  .tbline { margin-top: 10px; font-size: 12px; }
  .foot { margin-top: 16px; color: #999; font-size: 10px; }
</style></head><body>
<h1>Guffey Pick'Em &middot; ${esc(weekLabel)} &middot; ${esc(name)}</h1>
<p class="sub">Printed ${esc(new Date().toLocaleString())}</p>
<table>
  <tr><th>Kickoff</th><th>Game</th><th>Pick</th><th>Conf</th></tr>
  ${rows}
</table>
<p class="tbline"><b>Tiebreaker</b> (combined final score of the TB game):
  ${tbGuess ?? '&mdash;'}</p>
<p class="foot">wapitismith.com/pickem &middot; picks lock at each game's kickoff</p>
<script>window.onload = function () { window.print() }<\/script>
</body></html>`)
    w.document.close()
  }

  return (
    <div>
      <p className="muted center">
        {nPicked}/{games.length} picks complete · tap a team, then set confidence
        ({games.length} = most confident). Picking a number another game
        already has swaps the two.{' '}
        <button className="link" onClick={printSheet}>
          Print / save PDF
        </button>
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
              {new Date(g.kickoff) <= new Date() && (
                <a
                  className="game-link"
                  href={gameSearchUrl(g.away_team, g.home_team)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Game center ↗
                </a>
              )}
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
                  className={`team team-tile ${mine.picked_team === team ? 'picked' : ''}`}
                  disabled={isLocked || saving === g.game_id}
                  onClick={() => save(g.game_id, { picked_team: team })}
                >
                  <img
                    className="team-img"
                    src={helmetSrc(team)}
                    alt=""
                    loading="lazy"
                    onError={e => {
                      const fb = espnLogo(team)
                      if (!e.currentTarget.src.endsWith(fb.split('/').pop())) {
                        e.currentTarget.src = fb
                      }
                    }}
                  />
                  <span className="team-name">{teamLabel(team)}</span>
                  {team === g.home_team && <span className="muted">home</span>}
                </button>
              ))}
              <select
                className="confidence"
                value={mine.confidence ?? ''}
                disabled={isLocked || !mine.picked_team || saving === g.game_id}
                onChange={e =>
                  setConfidence(g.game_id, Number(e.target.value))
                }
                aria-label="Confidence points"
              >
                <option value="" disabled>pts</option>
                {Array.from({ length: games.length }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>
                    {n}
                    {usedConfidence.has(n) && n !== mine.confidence
                      ? ' ⇄ swap'
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            {g.game_id === tbGameId && (
              <div className="tiebreak">
                <span className="tb-label">
                  Tiebreaker — combined final score of this game:
                </span>
                <input
                  key={`${g.game_id}-${mine.tiebreaker_guess ?? ''}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="150"
                  placeholder="e.g. 45"
                  disabled={isLocked || !mine.picked_team || saving === g.game_id}
                  defaultValue={mine.tiebreaker_guess ?? ''}
                  onBlur={e => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    if (v !== (mine.tiebreaker_guess ?? null)) {
                      save(g.game_id, { tiebreaker_guess: v })
                    }
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
