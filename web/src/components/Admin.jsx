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
  const [broadcasts, setBroadcasts] = useState([]) // null = table missing
  const [bSubject, setBSubject] = useState('')
  const [bBody, setBBody] = useState('')
  const [queuing, setQueuing] = useState(false)

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
    // broadcasts table may not exist until broadcasts.sql is run
    const { data: bc, error: bcErr } = await supabase
      .from('broadcasts')
      .select('id,created_at,subject,sent_at')
      .order('created_at', { ascending: false })
      .limit(8)
    setGames(g ?? [])
    setPlayers(pl ?? [])
    setPicks(pk ?? [])
    setBalances(bal ?? [])
    setBroadcasts(bcErr ? null : (bc ?? []))
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
  async function setPartnerEmail(p) {
    const v = window.prompt(
      `Partner email for ${p.display_name} (two people sharing one entry — ` +
      `reminders and recaps go to both inboxes; leave blank to remove):`,
      p.partner_email ?? ''
    )
    if (v == null) return
    updatePlayer(p.id, { partner_email: v.trim() || null })
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

  // ----- broadcasts -----
  async function queueBroadcast() {
    if (!bSubject.trim() || !bBody.trim()) return
    if (!window.confirm('Send this email to ALL active players?')) return
    setQueuing(true)
    const { error } = await supabase.from('broadcasts').insert({
      subject: bSubject.trim(),
      body: bBody.trim(),
      created_by: session.user.id,
    })
    setQueuing(false)
    if (error) flash(error.message)
    else {
      setBSubject('')
      setBBody('')
      flash('Queued! Goes out within 30 minutes.')
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
        Players — {week === 0 ? 'Test Week' : `Week ${week}`}
      </h2>
      <p className="muted">
        {
          active.filter(p =>
            nGames > 0 &&
            picks.filter(k => k.user_id === p.id && k.confidence != null).length >= nGames
          ).length
        }/{active.length} picked in
        {balances.length === 0 && ' — run payments.sql in Supabase to enable dues tracking'}
        . Deactivated players keep their history but stop getting reminders and owing dues.
      </p>
      {players.map(p => {
        const done = picks.filter(
          k => k.user_id === p.id && k.confidence != null
        ).length
        const complete = nGames > 0 && done >= nGames
        const b = balances.find(x => x.user_id === p.id)
        return (
          <div
            key={p.id}
            className={`player-card${p.active === false ? ' inactive' : ''}`}
          >
            <div className="pc-id">
              <b>{p.display_name}</b>
              {p.welcomed_at == null && (
                <span className="badge" style={{ marginLeft: 6 }}>new</span>
              )}
              <div className="muted small">
                {p.email}
                {p.partner_email && <> + {p.partner_email}</>}
              </div>
              <div className="muted small">
                joined {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
              </div>
            </div>
            <div className="pc-status">
              <span className={`badge ${complete ? 'win' : 'loss'}`}>
                {done}/{nGames} picks
              </span>
              {b && (
                <span className={`badge ${b.balance < 0 ? 'loss' : 'win'}`}>
                  {b.balance < 0
                    ? `owes $${Math.abs(b.balance).toFixed(0)}`
                    : b.balance > 0
                      ? `+$${Number(b.balance).toFixed(0)}`
                      : 'paid up'}
                </span>
              )}
            </div>
            <div className="pc-actions">
              <button className="link" onClick={() => setEditPlayer(p)}>picks</button>
              {b && (
                <button className="link" onClick={() => recordPayment(b)}>record $</button>
              )}
              <button className="link" onClick={() => rename(p)}>rename</button>
              <button className="link" onClick={() => setPartnerEmail(p)}>partner</button>
              <label className="pc-check">
                <input
                  type="checkbox"
                  checked={p.active !== false}
                  onChange={ev => updatePlayer(p.id, { active: ev.target.checked })}
                />
                active
              </label>
              <label className="pc-check">
                <input
                  type="checkbox"
                  checked={!!p.is_admin}
                  disabled={p.id === session.user.id} // can't un-admin yourself
                  onChange={ev => updatePlayer(p.id, { is_admin: ev.target.checked })}
                />
                admin
              </label>
            </div>
          </div>
        )
      })}

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

      <h2 className="admin-h">Email all players</h2>
      {broadcasts === null ? (
        <p className="muted">
          Run <b>broadcasts.sql</b> in Supabase to enable pool-wide emails.
        </p>
      ) : (
        <div className="broadcast-form">
          <input
            placeholder="Subject"
            value={bSubject}
            maxLength={200}
            onChange={e => setBSubject(e.target.value)}
          />
          <textarea
            placeholder="Your message — plain text; a blank line starts a new paragraph"
            rows={6}
            value={bBody}
            maxLength={10000}
            onChange={e => setBBody(e.target.value)}
          />
          <button
            disabled={queuing || !bSubject.trim() || !bBody.trim()}
            onClick={queueBroadcast}
          >
            {queuing ? 'Queuing…' : 'Send to all active players'}
          </button>
          <p className="muted small">
            Sends from pool@wapitismith.com to every active player (partner
            emails included). Goes out within ~30 minutes — or run the
            <b> Send broadcast</b> workflow in GitHub Actions to push it now.
          </p>
          {broadcasts.length > 0 && (
            <div className="broadcast-log">
              {broadcasts.map(b => (
                <div key={b.id} className="broadcast-row">
                  <span className={`badge ${b.sent_at ? 'win' : ''}`}>
                    {b.sent_at ? 'sent' : 'queued'}
                  </span>
                  <span className="broadcast-subj">{b.subject}</span>
                  <span className="muted small">
                    {new Date(b.sent_at ?? b.created_at).toLocaleString([], {
                      month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
