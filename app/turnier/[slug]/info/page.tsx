'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = {
  id: number
  tournament_id: number
  name: string
  captain_name?: string | null
}

type Group = {
  id: number
  name: string
}

type GroupMember = {
  group_id: number
  team_id: number
}

type TournamentMatch = {
  id: number
  tournament_id?: number
  group_id?: number | null
  round?: number | null
  phase?: string | null
  team1_id: number | null
  team2_id: number | null
  team1_score: number | null
  team2_score: number | null
  status: string
  scheduled_time?: string | null
  table_number?: number | null
}

type TournamentInfo = {
  id: number
  name: string
  slug?: string | null
  logo_url: string | null
  primary_color: string | null
  background_style: string | null
}

type GroupStanding = {
  teamId: number
  teamName: string
  points: number
  played: number
  wins: number
  draws: number
  losses: number
  scored: number
  conceded: number
  diff: number
}

function isFinished(match: TournamentMatch) {
  return (
    match.status === 'finished' ||
    match.status === 'completed' ||
    (match.team1_score !== null && match.team2_score !== null)
  )
}

function isLive(match: TournamentMatch) {
  const status = (match.status ?? '').toLowerCase()
  return status === 'live' || status === 'playing' || status === 'in_progress'
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return null
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calculateStandings(
  groupId: number,
  teams: Team[],
  members: GroupMember[],
  matches: TournamentMatch[]
): GroupStanding[] {
  const groupTeamIds = new Set(
    members.filter((m) => m.group_id === groupId).map((m) => m.team_id)
  )
  const groupTeams = teams.filter((t) => groupTeamIds.has(t.id))
  const groupMatches = matches.filter(
    (m) =>
      isFinished(m) &&
      m.group_id === groupId &&
      m.team1_id !== null &&
      m.team2_id !== null &&
      m.team1_score !== null &&
      m.team2_score !== null
  )

  const statsMap = new Map<number, GroupStanding>()
  groupTeams.forEach((t) => {
    statsMap.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      diff: 0,
    })
  })

  groupMatches.forEach((m) => {
    const t1 = statsMap.get(m.team1_id!)
    const t2 = statsMap.get(m.team2_id!)
    if (!t1 || !t2) return

    const score1 = m.team1_score!
    const score2 = m.team2_score!

    t1.played++
    t1.scored += score1
    t1.conceded += score2

    t2.played++
    t2.scored += score2
    t2.conceded += score1

    if (score1 > score2) {
      t1.wins++
      t1.points += 3
      t2.losses++
    } else if (score2 > score1) {
      t2.wins++
      t2.points += 3
      t1.losses++
    } else {
      t1.draws++
      t1.points += 1
      t2.draws++
      t2.points += 1
    }
  })

  return Array.from(statsMap.values())
    .map((s) => ({
      ...s,
      diff: s.scored - s.conceded,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.diff !== a.diff) return b.diff - a.diff
      if (b.scored !== a.scored) return b.scored - a.scored
      return a.teamName.localeCompare(b.teamName)
    })
}

export default function PublicTeamInfoPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''
  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)

  // Sync `#team-[id]` Hash in der URL
  useEffect(() => {
    const parseHash = () => {
      if (typeof window === 'undefined') return
      const hash = window.location.hash
      if (hash.startsWith('#team-')) {
        const parsedId = parseInt(hash.replace('#team-', ''), 10)
        if (!isNaN(parsedId)) {
          setSelectedTeamId(parsedId)
        }
      }
    }

    parseHash()
    window.addEventListener('hashchange', parseHash)
    return () => window.removeEventListener('hashchange', parseHash)
  }, [])

  const loadData = useCallback(async () => {
    if (!slug) return
    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, background_style')
        .or(`slug.eq.${slug},slug.eq.${rawSlug}`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      const t = tourneyData as TournamentInfo
      setTournament(t)

      const [teamsRes, groupsRes, membersRes, matchesRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, tournament_id, name')
          .eq('tournament_id', t.id)
          .order('name', { ascending: true }),
        supabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', t.id)
          .order('id', { ascending: true }),
        supabase
          .from('group_members')
          .select('group_id, team_id')
          .eq('tournament_id', t.id),
        supabase
          .from('matches')
          .select('*')
          .eq('tournament_id', t.id)
          .order('scheduled_time', { ascending: true }),
      ])

      if (teamsRes.error) throw teamsRes.error
      if (groupsRes.error) throw groupsRes.error
      if (membersRes.error) throw membersRes.error
      if (matchesRes.error) throw matchesRes.error

      const loadedTeams = (teamsRes.data as Team[]) ?? []
      setTeams(loadedTeams)
      setGroups((groupsRes.data as Group[]) ?? [])
      setMembers((membersRes.data as GroupMember[]) ?? [])
      setMatches((matchesRes.data as TournamentMatch[]) ?? [])

      // Team aus Hash oder erstes Team wählen
      setSelectedTeamId((prev) => {
        if (prev !== null && loadedTeams.some((tm) => tm.id === prev)) {
          return prev
        }
        if (typeof window !== 'undefined') {
          const hash = window.location.hash
          if (hash.startsWith('#team-')) {
            const parsedId = parseInt(hash.replace('#team-', ''), 10)
            if (!isNaN(parsedId) && loadedTeams.some((tm) => tm.id === parsedId)) {
              return parsedId
            }
          }
        }
        return loadedTeams[0]?.id ?? null
      })

      setError('')
    } catch (err: any) {
      console.error('TEAM INFO LOAD ERROR:', err?.message || err)
      setError('Fehler beim Laden der Team-Informationen.')
    } finally {
      setLoading(false)
    }
  }, [slug, rawSlug])

  useEffect(() => {
    void loadData()
    const interval = window.setInterval(() => void loadData(), 10000)
    return () => window.clearInterval(interval)
  }, [loadData])

  const teamsMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  )

  function getTeamName(id: number | null) {
    if (id === null) return 'Unbekannt'
    return teamsMap.get(id) || 'Unbekannt'
  }

  // Ausgewähltes Team
  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  )

  // Gruppe des ausgewählten Teams
  const teamGroupId = useMemo(() => {
    if (!selectedTeamId) return null
    const member = members.find((m) => m.team_id === selectedTeamId)
    return member ? member.group_id : null
  }, [members, selectedTeamId])

  const teamGroup = useMemo(() => {
    if (!teamGroupId) return null
    return groups.find((g) => g.id === teamGroupId) || null
  }, [groups, teamGroupId])

  // Gruppentabelle des ausgewählten Teams
  const teamStandings = useMemo(() => {
    if (!teamGroupId) return []
    return calculateStandings(teamGroupId, teams, members, matches)
  }, [teamGroupId, teams, members, matches])

  // Spiele des ausgewählten Teams
  const teamMatches = useMemo(() => {
    if (!selectedTeamId) return []
    return matches.filter(
      (m) => m.team1_id === selectedTeamId || m.team2_id === selectedTeamId
    )
  }, [matches, selectedTeamId])

  const liveMatches = useMemo(() => teamMatches.filter(isLive), [teamMatches])
  const upcomingMatches = useMemo(
    () => teamMatches.filter((m) => !isLive(m) && !isFinished(m)),
    [teamMatches]
  )
  const finishedMatches = useMemo(
    () => teamMatches.filter(isFinished),
    [teamMatches]
  )

  // Team-Rang in der Tabelle
  const teamRank = useMemo(() => {
    if (!selectedTeamId || teamStandings.length === 0) return null
    const index = teamStandings.findIndex((s) => s.teamId === selectedTeamId)
    return index !== -1 ? index + 1 : null
  }, [selectedTeamId, teamStandings])

  const primaryColor = tournament?.primary_color?.trim() || '#2563eb'

  const handleSelectTeam = (id: number) => {
    setSelectedTeamId(id)
    if (typeof window !== 'undefined') {
      window.location.hash = `team-${id}`
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-gray-900 dark:text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 dark:border-gray-800 dark:border-t-blue-400" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">
            Lade Team-Cockpit …
          </p>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-red-50/90 p-6 text-center shadow-sm backdrop-blur-md dark:border-red-900/40 dark:bg-red-950/20">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xl dark:bg-red-900/40">
          ⚠️
        </div>
        <h2 className="text-lg font-black text-red-900 dark:text-red-200">
          Fehler beim Laden
        </h2>
        <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
          {error || 'Turnierdaten konnten nicht geladen werden.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12 px-2 sm:px-4">
      {/* TURNIER-KOPF & TEAM-AUSWAHL */}
      <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              🎯
            </span>
            <div>
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: primaryColor }}
              >
                {tournament.name}
              </span>
              <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white sm:text-2xl">
                Team Cockpit
              </h1>
            </div>
          </div>

          <Link
            href={`/turnier/${encodeURIComponent(slug)}/live`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black text-white shadow-md transition hover:opacity-90 shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            <span>📺 Live Arena &amp; K.o.-Baum</span>
            <span>↗</span>
          </Link>
        </div>

        {/* TEAM-DROP-DOWN PROMINENT */}
        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
            Wähle dein Team:
          </label>
          <select
            value={selectedTeamId ?? ''}
            onChange={(e) => handleSelectTeam(Number(e.target.value))}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-900 outline-none focus:border-blue-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white transition"
          >
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* TEAM OVERVIEW CARD */}
      {selectedTeam && (
        <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                  {selectedTeam.name}
                </h2>
                {teamGroup && (
                  <span className="rounded-lg bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[10px] font-black text-gray-600 dark:text-gray-300 uppercase">
                    {teamGroup.name}
                  </span>
                )}
              </div>
            </div>

            {teamRank !== null && (
              <div className="text-right shrink-0">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Rang</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  #{teamRank}
                </span>
              </div>
            )}
          </div>

          {/* QUICK STATS METRICS */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-950/60 p-3">
              <p className="text-[9px] font-black uppercase text-gray-400">Gespielt</p>
              <p className="text-base font-black text-gray-900 dark:text-white font-mono mt-0.5">
                {finishedMatches.length} / {teamMatches.length}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-950/60 p-3">
              <p className="text-[9px] font-black uppercase text-gray-400">Nächstes Spiel</p>
              <p className="text-base font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                {liveMatches.length > 0 ? '🔴 LIVE' : upcomingMatches.length > 0 ? formatTime(upcomingMatches[0].scheduled_time) || 'Demnächst' : 'Keins'}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-950/60 p-3">
              <p className="text-[9px] font-black uppercase text-gray-400">Punkte</p>
              <p className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                {teamStandings.find((s) => s.teamId === selectedTeam.id)?.points ?? 0}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* LAUFENDE & ANSTEHENDE SPIELE */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-lg">⏳</span>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            Anstehende Begegnungen
          </h2>
        </div>

        {liveMatches.length === 0 && upcomingMatches.length === 0 ? (
          <div className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 text-center text-xs font-bold text-gray-400 dark:border-gray-800/80 dark:bg-gray-900/90">
            Keine weiteren Spiele für dieses Team angesetzt.
          </div>
        ) : (
          <div className="space-y-2">
            {/* LIVE MATCH */}
            {liveMatches.map((m) => {
              const isTeam1 = m.team1_id === selectedTeamId
              const opponentId = isTeam1 ? m.team2_id : m.team1_id

              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 shadow-sm animate-pulse flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-red-600 dark:text-red-400 uppercase">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                      <span>JETZT LIVE</span>
                      {m.table_number && <span className="font-mono">• Tisch {m.table_number}</span>}
                    </div>
                    <p className="mt-1 text-sm font-black text-gray-900 dark:text-white">
                      vs. {getTeamName(opponentId)}
                    </p>
                  </div>
                  <div className="text-right font-mono font-black text-lg text-red-600 dark:text-red-400">
                    {m.team1_score ?? 0} : {m.team2_score ?? 0}
                  </div>
                </div>
              )
            })}

            {/* UPCOMING MATCHES */}
            {upcomingMatches.map((m) => {
              const isTeam1 = m.team1_id === selectedTeamId
              const opponentId = isTeam1 ? m.team2_id : m.team1_id
              const timeStr = formatTime(m.scheduled_time)

              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm dark:border-gray-800/80 dark:bg-gray-900/90 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase">
                      <span>{timeStr ? `${timeStr} Uhr` : 'Anstehend'}</span>
                      {m.table_number && <span className="font-mono text-gray-500">• Tisch {m.table_number}</span>}
                    </div>
                    <p className="mt-1 text-sm font-black text-gray-900 dark:text-white">
                      vs. {getTeamName(opponentId)}
                    </p>
                  </div>
                  <span className="rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-black text-gray-500">
                    Anstehend
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* EIGENE GRUPPENTABELLE */}
      {teamGroup && teamStandings.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h2 className="text-base font-black text-gray-900 dark:text-white">
                Tabelle {teamGroup.name}
              </h2>
            </div>
            <span className="text-[10px] font-bold text-gray-400">
              {teamStandings.length} Teams
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 dark:border-gray-800">
                    <th className="py-2 px-1 text-center">#</th>
                    <th className="py-2 px-1">Team</th>
                    <th className="py-2 px-1 text-center">Sp</th>
                    <th className="py-2 px-1 text-center">Diff</th>
                    <th className="py-2 px-1 text-right font-black text-gray-900 dark:text-white">Pkt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold dark:divide-gray-800/60">
                  {teamStandings.map((st, idx) => {
                    const isSelf = st.teamId === selectedTeamId
                    return (
                      <tr
                        key={st.teamId}
                        className={`transition ${
                          isSelf
                            ? 'bg-emerald-500/15 dark:bg-emerald-500/20 font-black text-emerald-700 dark:text-emerald-300'
                            : ''
                        }`}
                      >
                        <td className="py-2.5 px-1 text-center font-mono">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black ${
                              isSelf
                                ? 'bg-emerald-500 text-white'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-1 font-extrabold text-gray-900 dark:text-white truncate max-w-[140px]">
                          {st.teamName} {isSelf && ' (Du)'}
                        </td>
                        <td className="py-2.5 px-1 text-center font-mono text-gray-500 dark:text-gray-400">
                          {st.played}
                        </td>
                        <td className="py-2.5 px-1 text-center font-mono">
                          <span
                            className={
                              st.diff > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : st.diff < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-gray-400'
                            }
                          >
                            {st.diff > 0 ? `+${st.diff}` : st.diff}
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-1 text-right font-mono font-black text-sm"
                          style={{ color: primaryColor }}
                        >
                          {st.points}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* BISHERIGE ERGEBNISSE DES TEAMS */}
      {finishedMatches.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-lg">🏁</span>
            <h2 className="text-base font-black text-gray-900 dark:text-white">
              Bisherige Ergebnisse
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {finishedMatches.map((m) => {
              const isTeam1 = m.team1_id === selectedTeamId
              const opponentId = isTeam1 ? m.team2_id : m.team1_id
              const myScore = isTeam1 ? m.team1_score : m.team2_score
              const oppScore = isTeam1 ? m.team2_score : m.team1_score
              const won = myScore != null && oppScore != null && myScore > oppScore
              const draw = myScore != null && oppScore != null && myScore === oppScore

              return (
                <div
                  key={m.id}
                  className={`rounded-2xl border p-4 shadow-sm flex items-center justify-between ${
                    won
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : draw
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-gray-200/80 bg-white/90 dark:border-gray-800/80 dark:bg-gray-900/90'
                  }`}
                >
                  <div>
                    <span className="text-[9px] font-black uppercase text-gray-400 block">
                      vs. {getTeamName(opponentId)}
                    </span>
                    <span className="text-xs font-black text-gray-900 dark:text-white mt-0.5 block">
                      {won ? '✓ Sieg' : draw ? 'Unentschieden' : 'Niederlage'}
                    </span>
                  </div>

                  <div className="text-right font-mono font-black text-base">
                    <span className={won ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}>
                      {myScore ?? 0}
                    </span>
                    <span className="text-gray-400 mx-1">:</span>
                    <span className={!won && !draw ? 'text-red-500' : 'text-gray-900 dark:text-white'}>
                      {oppScore ?? 0}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* QUICK LINKS */}
      <section className="pt-2">
        <div className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90 space-y-3">
          <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
            Nützliche Verlinkungen
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href={`/turnier/${encodeURIComponent(slug)}/live`}
              className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-3 text-xs font-bold text-gray-900 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-800 transition"
            >
              <span>📺 Gesamter Live-Spielplan</span>
              <span>↗</span>
            </Link>
            <Link
              href={`/turnier/${encodeURIComponent(slug)}/rules`}
              className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-3 text-xs font-bold text-gray-900 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-800 transition"
            >
              <span>📜 Turnierregeln &amp; Modus</span>
              <span>↗</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}