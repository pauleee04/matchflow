'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
}

type TournamentMatch = {
  id: number
  tournament_id?: number
  group_id?: number | null
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
  secondary_color?: string | null
  background_style?: string | null
}

type TeamStat = {
  teamId: number
  teamName: string
  played: number
  wins: number
  draws: number
  losses: number
  scored: number
  conceded: number
  diff: number
  avgScored: number
  avgConceded: number
  winRate: number
}

// HELPER FÜR FARBANPASSUNGEN UND KONTRASTE
function hexToRgba(hex: string | null | undefined, alpha: number, fallback: string = '#22c55e'): string {
  let c = (hex || fallback).trim()
  if (!c.startsWith('#')) return `rgba(34, 197, 94, ${alpha})`
  if (c.length === 4) {
    c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
  }
  if (c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16)
    const g = parseInt(c.slice(3, 5), 16)
    const b = parseInt(c.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `rgba(34, 197, 94, ${alpha})`
}

function getContrastTextColor(hexColor: string | null | undefined): string {
  if (!hexColor || !hexColor.startsWith('#')) return '#ffffff'
  let hex = hexColor.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (hex.length !== 6) return '#ffffff'
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 135 ? '#090d16' : '#ffffff'
}

function getPageBackgroundStyle(primary?: string | null, secondary?: string | null) {
  const p1 = hexToRgba(primary, 0.22, '#22c55e')
  const p2 = hexToRgba(secondary || primary, 0.1, '#10b981')
  return `radial-gradient(circle at 50% 5%, ${p1} 0%, ${p2} 45%, #030712 90%)`
}

function isMatchFinished(match: TournamentMatch): boolean {
  const status = (match.status || '').toLowerCase()
  if (status === 'live' || status === 'playing' || status === 'in_progress') {
    return false
  }
  if (status === 'finished' || status === 'completed') {
    return true
  }
  return (
    status !== 'scheduled' &&
    status !== 'pending' &&
    match.team1_score !== null &&
    match.team2_score !== null
  )
}

function formatPhaseName(phase?: string | null): string {
  if (!phase) return 'Gruppenphase'
  switch (phase.toLowerCase().trim()) {
    case 'group':
    case 'gruppenphase':
      return 'Gruppenphase'
    case 'round_of_32':
      return 'Sechzehntelfinale'
    case 'round_of_16':
      return 'Achtelfinale'
    case 'quarter_final':
      return 'Viertelfinale'
    case 'semi_final':
      return 'Halbfinale'
    case 'final':
      return 'Finale'
    default:
      return phase
  }
}

function HighlightCard({
  icon,
  title,
  match,
  getTeamName,
  primaryColor,
}: {
  icon: string
  title: string
  match: TournamentMatch
  getTeamName: (id: number | null) => string
  primaryColor: string
}) {
  return (
    <article className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-3.5">
      <div className="flex items-center gap-2.5">
        <span className="text-xl">{icon}</span>
        <h2 className="text-sm font-black uppercase tracking-wider text-white">
          {title}
        </h2>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-white">
            <span className="truncate max-w-[42%]">{getTeamName(match.team1_id)}</span>
            <span className="shrink-0 text-[10px] font-bold text-slate-400">vs.</span>
            <span className="truncate max-w-[42%]">{getTeamName(match.team2_id)}</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {formatPhaseName(match.phase)}
          </p>
        </div>
        <div className="shrink-0 font-mono text-lg sm:text-xl font-black" style={{ color: primaryColor }}>
          {match.team1_score ?? 0} : {match.team2_score ?? 0}
        </div>
      </div>
    </article>
  )
}

function EmptyHighlightCard({ text }: { text: string }) {
  return (
    <article className="flex min-h-[120px] items-center justify-center rounded-[32px] border border-dashed border-white/15 bg-slate-900/50 p-6 text-center text-xs sm:text-sm font-bold text-slate-300 backdrop-blur-xl">
      {text}
    </article>
  )
}

export default function StatsPage() {
  const params = useParams()
  const rawParam = params?.slug

  const rawSlug = useMemo(() => {
    return Array.isArray(rawParam) ? rawParam[0] : rawParam || ''
  }, [rawParam])

  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!slug) return

    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, secondary_color, background_style')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      const t = tourneyData as TournamentInfo
      setTournament(t)

      const [teamsRes, matchesRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name')
          .eq('tournament_id', t.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('matches')
          .select('*')
          .eq('tournament_id', t.id),
      ])

      if (teamsRes.error) throw teamsRes.error
      if (matchesRes.error) throw matchesRes.error

      setTeams((teamsRes.data as Team[]) ?? [])
      setMatches((matchesRes.data as TournamentMatch[]) ?? [])
      setError('')
    } catch (err) {
      console.error('STATS PAGE LOAD ERROR:', err)
      setError('Die Statistiken konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [slug, rawSlug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Realtime Supabase Sync
  useEffect(() => {
    if (!tournament?.id) return

    const channel = supabase
      .channel(`stats_tournament_${tournament.id}`)
      .on('broadcast', { event: 'refresh' }, () => {
        void loadData()
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` },
        () => {
          void loadData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `tournament_id=eq.${tournament.id}` },
        () => {
          void loadData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournament?.id, loadData])

  const teamsMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])

  const getTeamName = useCallback(
    (id: number | null): string => {
      if (id === null) return 'Unbekannt'
      return teamsMap.get(id) || `Team ${id}`
    },
    [teamsMap]
  )

  // Statistiken berechnen
  const stats = useMemo(() => {
    const finishedMatches = matches.filter(
      (m) => isMatchFinished(m) && m.team1_score !== null && m.team2_score !== null
    )

    const totalMatches = matches.length
    const totalFinished = finishedMatches.length
    let totalScored = 0

    const map = new Map<number, TeamStat>()

    teams.forEach((t) => {
      map.set(t.id, {
        teamId: t.id,
        teamName: t.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scored: 0,
        conceded: 0,
        diff: 0,
        avgScored: 0,
        avgConceded: 0,
        winRate: 0,
      })
    })

    let highestScoringMatch: TournamentMatch | null = null
    let highestTotal = 0

    let biggestBlowoutMatch: TournamentMatch | null = null
    let biggestDiff = 0

    finishedMatches.forEach((m) => {
      const s1 = m.team1_score ?? 0
      const s2 = m.team2_score ?? 0
      const sum = s1 + s2
      const diff = Math.abs(s1 - s2)

      totalScored += sum

      if (sum > highestTotal) {
        highestTotal = sum
        highestScoringMatch = m
      }

      if (diff > 0 && diff > biggestDiff) {
        biggestDiff = diff
        biggestBlowoutMatch = m
      }

      const t1 = m.team1_id !== null ? map.get(m.team1_id) : null
      const t2 = m.team2_id !== null ? map.get(m.team2_id) : null

      if (t1) {
        t1.played++
        t1.scored += s1
        t1.conceded += s2
        if (s1 > s2) t1.wins++
        else if (s1 < s2) t1.losses++
        else t1.draws++
      }

      if (t2) {
        t2.played++
        t2.scored += s2
        t2.conceded += s1
        if (s2 > s1) t2.wins++
        else if (s2 < s1) t2.losses++
        else t2.draws++
      }
    })

    const teamStatsList = Array.from(map.values()).map((st) => {
      st.diff = st.scored - st.conceded
      st.avgScored = st.played > 0 ? Number((st.scored / st.played).toFixed(1)) : 0
      st.avgConceded = st.played > 0 ? Number((st.conceded / st.played).toFixed(1)) : 0
      st.winRate = st.played > 0 ? Math.round((st.wins / st.played) * 100) : 0
      return st
    })

    const topOffense = [...teamStatsList]
      .filter((st) => st.played > 0)
      .sort((a, b) => b.avgScored - a.avgScored || b.scored - a.scored || b.diff - a.diff)

    const topDefense = [...teamStatsList]
      .filter((st) => st.played > 0)
      .sort((a, b) => a.avgConceded - b.avgConceded || a.conceded - b.conceded || b.played - a.played)

    const topTeams = [...teamStatsList]
      .filter((st) => st.played > 0)
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.diff - a.diff || b.scored - a.scored)

    const avgScoredPerMatch =
      totalFinished > 0 ? (totalScored / totalFinished).toFixed(1) : '0'

    return {
      totalMatches,
      totalFinished,
      totalScored,
      avgScoredPerMatch,
      topOffense,
      topDefense,
      topTeams,
      highestScoringMatch,
      highestTotal,
      biggestBlowoutMatch,
      biggestDiff,
    }
  }, [matches, teams])

  const highest = stats.highestScoringMatch
  const highestTotal = stats.highestTotal
  const blowout = stats.biggestBlowoutMatch
  const blowoutDiff = stats.biggestDiff

  const primaryColor = tournament?.primary_color?.trim() || '#22c55e'
  const secondaryColor = tournament?.secondary_color?.trim() || '#10b981'
  const primaryContrastText = getContrastTextColor(primaryColor)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-slate-100 bg-slate-950 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Berechne Statistiken …
          </p>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950 [color-scheme:dark]">
        <div className="mx-auto max-w-lg rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-center backdrop-blur-md">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-slate-100">Fehler beim Laden</h2>
          <p className="mt-1 text-xs font-semibold text-red-300">{error || 'Turnier existiert nicht.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen w-full bg-slate-950 text-slate-100 [color-scheme:dark] px-4 py-6 sm:px-8 sm:py-10"
      style={{ background: getPageBackgroundStyle(primaryColor, secondaryColor) }}
    >
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-16">
        {/* HEADER */}
        <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-4">
            {tournament.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name}
                className="h-12 w-12 rounded-2xl object-contain bg-slate-950/60 p-1 border border-white/10"
              />
            ) : (
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black shadow-lg"
                style={{ backgroundColor: primaryColor, color: primaryContrastText }}
              >
                📊
              </span>
            )}
            <div>
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: primaryColor }}
              >
                Turnierdaten &amp; Analytics
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Statistiken &amp; Kennzahlen
              </h1>
            </div>
          </div>
          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">
            Echtzeit-Auswertung aller beendeten Spiele, Torquoten und Rekorde.
          </p>
        </section>

        {/* KPI KACHELN */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase text-slate-400">Gespielte Spiele</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white">
              {stats.totalFinished} <span className="text-xs text-slate-400 font-sans">/ {stats.totalMatches}</span>
            </p>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase text-slate-400">Treffer Gesamt</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black" style={{ color: primaryColor }}>
              {stats.totalScored}
            </p>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase text-slate-400">Ø Treffer / Spiel</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white">
              {stats.avgScoredPerMatch}
            </p>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase text-slate-400">Teams im Turnier</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white">
              {teams.length}
            </p>
          </div>
        </div>

        {/* HIGHLIGHT MATCHES */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* TORREICHSTES SPIEL */}
          {highest ? (
            <HighlightCard
              icon="🔥"
              title={`Torreichstes Spiel (${highestTotal} Treffer)`}
              match={highest}
              getTeamName={getTeamName}
              primaryColor={primaryColor}
            />
          ) : (
            <EmptyHighlightCard text="Noch keine Spiele beendet" />
          )}

          {/* HÖCHSTER SIEG */}
          {blowout && blowoutDiff > 0 ? (
            <HighlightCard
              icon="⚡"
              title={`Höchster Sieg (${blowoutDiff} Differenz)`}
              match={blowout}
              getTeamName={getTeamName}
              primaryColor={primaryColor}
            />
          ) : (
            <EmptyHighlightCard text="Noch keine Siege gewertet" />
          )}
        </div>

        {/* LEADERBOARDS: OFFENSIVE & DEFENSIVE */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* TOP OFFENSIVE */}
          <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-white">
                  Beste Offensive
                </h2>
              </div>
              <span className="text-[10px] font-black uppercase text-slate-400">Ø Tore / Spiel</span>
            </div>

            {stats.topOffense.length > 0 ? (
              <div className="space-y-2">
                {stats.topOffense.slice(0, 5).map((st, idx) => (
                  <div
                    key={st.teamId}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur-md transition hover:border-white/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-slate-300 bg-slate-900 border border-white/10">
                        #{idx + 1}
                      </span>
                      <span className="truncate text-xs font-extrabold text-white">
                        {st.teamName}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <p className="text-xs font-black" style={{ color: primaryColor }}>Ø {st.avgScored} Tore</p>
                      <p className="text-[10px] font-bold text-slate-400">{st.scored} gesamt ({st.played} Spiele)</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs font-bold text-slate-400 py-4">Noch keine Daten vorhanden</p>
            )}
          </section>

          {/* TOP DEFENSIVE */}
          <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h2 className="text-sm font-black uppercase tracking-wider text-white">
                  Beste Defensive
                </h2>
              </div>
              <span className="text-[10px] font-black uppercase text-slate-400">Wenigste Gegentore / Spiel</span>
            </div>

            {stats.topDefense.length > 0 ? (
              <div className="space-y-2">
                {stats.topDefense.slice(0, 5).map((st, idx) => (
                  <div
                    key={st.teamId}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur-md transition hover:border-white/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-slate-300 bg-slate-900 border border-white/10">
                        #{idx + 1}
                      </span>
                      <span className="truncate text-xs font-extrabold text-white">
                        {st.teamName}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <p className="text-xs font-black text-white">Ø {st.avgConceded} Gegentore</p>
                      <p className="text-[10px] font-bold text-slate-400">{st.conceded} gesamt ({st.played} Spiele)</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs font-bold text-slate-400 py-4">Noch keine Daten vorhanden</p>
            )}
          </section>
        </div>

        {/* TEAM EFFIZIENZ & SIEGQUOTE */}
        <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🥇</span>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Siegquote &amp; Effizienz
              </h2>
            </div>
            <span className="text-[10px] font-black uppercase text-slate-400">Win Rate %</span>
          </div>

          {stats.topTeams.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {stats.topTeams.slice(0, 6).map((st, idx) => (
                <div
                  key={st.teamId}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur-md transition hover:border-white/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-slate-300 bg-slate-900 border border-white/10">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-white">
                        {st.teamName}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">
                        {st.wins}S - {st.draws}U - {st.losses}N
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-xs font-black" style={{ color: primaryColor }}>{st.winRate}% Siegquote</p>
                    <p className="text-[10px] font-bold text-slate-400">Diff {st.diff > 0 ? `+${st.diff}` : st.diff}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs font-bold text-slate-400 py-4">Noch keine Daten vorhanden</p>
          )}
        </section>
      </div>
    </div>
  )
}