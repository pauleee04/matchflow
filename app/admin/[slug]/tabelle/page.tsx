'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
}

type Group = {
  id: number
  name: string
}

type GroupMember = {
  group_id: number
  team_id: number
}

type Match = {
  id: number
  tournament_id: number
  group_id: number | null
  team1_id: number
  team2_id: number
  team1_score: number | null
  team2_score: number | null
  status: 'scheduled' | 'live' | 'finished'
  phase: string
}

type TournamentSettings = {
  qualifiers_per_group: number | null
  direct_qualifiers: number | null
}

type TournamentData = {
  id: number
  name: string
  slug: string
  primary_color: string | null
}

type TeamStanding = {
  teamId: number
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

type GroupStanding = {
  group: Group
  standings: TeamStanding[]
}

export default function AdminTabellePage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''
  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState<number>(2)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError('')

    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, primary_color')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      setTournament(tourneyData as TournamentData)

      const [groupsRes, teamsRes, membersRes, matchesRes, settingsRes] = await Promise.all([
        supabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('name', { ascending: true }),

        supabase
          .from('teams')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('name', { ascending: true }),

        supabase
          .from('group_members')
          .select('group_id, team_id')
          .eq('tournament_id', tourneyData.id),

        supabase
          .from('matches')
          .select('*')
          .eq('tournament_id', tourneyData.id),

        supabase
          .from('tournament_settings')
          .select('qualifiers_per_group, direct_qualifiers')
          .eq('tournament_id', tourneyData.id)
          .maybeSingle(),
      ])

      if (groupsRes.error) throw groupsRes.error
      if (teamsRes.error) throw teamsRes.error
      if (membersRes.error) throw membersRes.error
      if (matchesRes.error) throw matchesRes.error

      setGroups((groupsRes.data || []) as Group[])
      setTeams((teamsRes.data || []) as Team[])
      setMembers((membersRes.data || []) as GroupMember[])
      setMatches((matchesRes.data || []) as Match[])

      if (settingsRes.data) {
        const settings = settingsRes.data as TournamentSettings
        setQualifiersPerGroup(settings.direct_qualifiers ?? settings.qualifiers_per_group ?? 2)
      }
    } catch (err: any) {
      console.error('Ladefehler Tabellen:', err)
      setError(err?.message || 'Fehler beim Laden der Tabellendaten.')
    } finally {
      setLoading(false)
    }
  }, [slug, rawSlug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Realtime Listener für automatische Aktualisierung
  useEffect(() => {
    if (!tournament?.id) return

    const channel = supabase
      .channel(`admin_tabelle_${tournament.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournament?.id, loadData])

  // --- TABELLEN-BERECHNUNG ANHAND DER SPIELERGEBNISSE ---
  const groupStandings = useMemo<GroupStanding[]>(() => {
    const teamMap = new Map<number, Team>(teams.map((t) => [t.id, t]))

    return groups.map((group) => {
      const groupTeamIds = members
        .filter((m) => m.group_id === group.id)
        .map((m) => m.team_id)

      const standingsMap = new Map<number, TeamStanding>()

      groupTeamIds.forEach((teamId) => {
        const teamObj = teamMap.get(teamId)
        standingsMap.set(teamId, {
          teamId,
          teamName: teamObj?.name || `Team #${teamId}`,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDiff: 0,
          points: 0,
        })
      })

      // Nur beendeteGruppenspiele berücksichtigten
      const groupMatches = matches.filter(
        (m) =>
          m.group_id === group.id &&
          m.status === 'finished' &&
          m.team1_score !== null &&
          m.team2_score !== null
      )

      groupMatches.forEach((match) => {
        const t1 = standingsMap.get(match.team1_id)
        const t2 = standingsMap.get(match.team2_id)

        const score1 = match.team1_score!
        const score2 = match.team2_score!

        if (t1) {
          t1.played += 1
          t1.goalsFor += score1
          t1.goalsAgainst += score2

          if (score1 > score2) {
            t1.won += 1
            t1.points += 3
          } else if (score1 === score2) {
            t1.drawn += 1
            t1.points += 1
          } else {
            t1.lost += 1
          }
        }

        if (t2) {
          t2.played += 1
          t2.goalsFor += score2
          t2.goalsAgainst += score1

          if (score2 > score1) {
            t2.won += 1
            t2.points += 3
          } else if (score2 === score1) {
            t2.drawn += 1
            t2.points += 1
          } else {
            t2.lost += 1
          }
        }
      })

      const standingsList = Array.from(standingsMap.values()).map((s) => ({
        ...s,
        goalDiff: s.goalsFor - s.goalsAgainst,
      }))

      // Sortierung: 1. Punkte -> 2. Tordifferenz -> 3. Eigene Tore -> 4. Name
      standingsList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
        return a.teamName.localeCompare(b.teamName)
      })

      return {
        group,
        standings: standingsList,
      }
    })
  }, [groups, teams, members, matches])

  const totalFinishedGroupGames = matches.filter((m) => m.phase === 'group' && m.status === 'finished').length
  const totalGroupGames = matches.filter((m) => m.phase === 'group').length

  const primaryColor = tournament?.primary_color || '#22c55e'

  if (loading) {
    return <div className="p-8 text-center font-bold text-slate-400 text-xs">Lade Gruppentabellen …</div>
  }

  return (
    <div className="space-y-8 w-full">
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/20 p-4 text-xs font-extrabold text-red-300 backdrop-blur-md">
          {error}
        </div>
      )}

      {/* HEADER CARDS */}
      <section className="grid gap-4 sm:grid-cols-3 w-full">
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Gruppen Gesamt</p>
          <p className="mt-2 text-3xl font-black text-white">{groups.length}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Absolvierte Gruppenspiele</p>
          <p className="mt-2 text-3xl font-black text-emerald-400">
            {totalFinishedGroupGames} <span className="text-xs text-slate-500">/ {totalGroupGames}</span>
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Qualifikation pro Gruppe</p>
          <p className="mt-2 text-3xl font-black" style={{ color: primaryColor }}>
            Top {qualifiersPerGroup} <span className="text-xs text-slate-400 font-bold">K.-o.-Einzug</span>
          </p>
        </div>
      </section>

      {/* GRUPPENTABELLEN GRID */}
      {groupStandings.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-8 text-center text-xs font-bold text-slate-500">
          Noch keine Gruppen oder Teams zugewiesen.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 w-full">
          {groupStandings.map(({ group, standings }) => (
            <div
              key={group.id}
              className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-lg backdrop-blur-xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-lg font-black text-white">{group.name}</h3>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black text-slate-400 border border-white/10">
                  {standings.length} Teams
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-2.5 px-2 text-center">#</th>
                      <th className="py-2.5 px-2">Team</th>
                      <th className="py-2.5 px-2 text-center" title="Spiele">Sp</th>
                      <th className="py-2.5 px-2 text-center" title="Siege">S</th>
                      <th className="py-2.5 px-2 text-center" title="Unentschieden">U</th>
                      <th className="py-2.5 px-2 text-center" title="Niederlagen">N</th>
                      <th className="py-2.5 px-2 text-center" title="Tore / Becher">Tore</th>
                      <th className="py-2.5 px-2 text-center" title="Differenz">Diff</th>
                      <th className="py-2.5 px-2 text-center font-black text-white">Pkt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-bold">
                    {standings.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-4 text-center text-slate-500">
                          Keine Teams in dieser Gruppe.
                        </td>
                      </tr>
                    ) : (
                      standings.map((team, idx) => {
                        const isQualified = idx < qualifiersPerGroup

                        return (
                          <tr
                            key={team.teamId}
                            className={`transition ${
                              isQualified
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20'
                                : 'hover:bg-white/5'
                            }`}
                          >
                            <td className="py-3 px-2 text-center font-mono">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                                  isQualified
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-950 text-slate-400 border border-white/10'
                                }`}
                              >
                                {idx + 1}
                              </span>
                            </td>

                            <td className="py-3 px-2">
                              <div className="font-black text-white truncate max-w-[140px] sm:max-w-none">
                                {team.teamName}
                              </div>
                            </td>

                            <td className="py-3 px-2 text-center font-mono text-slate-300">
                              {team.played}
                            </td>

                            <td className="py-3 px-2 text-center font-mono text-emerald-400">
                              {team.won}
                            </td>

                            <td className="py-3 px-2 text-center font-mono text-amber-400">
                              {team.drawn}
                            </td>

                            <td className="py-3 px-2 text-center font-mono text-red-400">
                              {team.lost}
                            </td>

                            <td className="py-3 px-2 text-center font-mono text-slate-300">
                              {team.goalsFor}:{team.goalsAgainst}
                            </td>

                            <td className="py-3 px-2 text-center font-mono font-black">
                              <span
                                className={
                                  team.goalDiff > 0
                                    ? 'text-emerald-400'
                                    : team.goalDiff < 0
                                    ? 'text-red-400'
                                    : 'text-slate-400'
                                }
                              >
                                {team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}
                              </span>
                            </td>

                            <td className="py-3 px-2 text-center font-mono text-sm font-black text-white">
                              {team.points}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 text-[10px] text-slate-500 font-bold flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>Grüne Ränge = Qualifikation für K.-o.-Phase</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}