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
  background_style: string | null
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
}: {
  icon: string
  title: string
  match: TournamentMatch
  getTeamName: (id: number | null) => string
}) {
  return (
    <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h2 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
          {title}
        </h2>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-gray-200/60 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-gray-900 dark:text-white">
            <span className="truncate max-w-[42%]">{getTeamName(match.team1_id)}</span>
            <span className="shrink-0 text-[10px] font-bold text-gray-400">vs.</span>
            <span className="truncate max-w-[42%]">{getTeamName(match.team2_id)}</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {formatPhaseName(match.phase)}
          </p>
        </div>
        <div className="shrink-0 font-mono text-lg font-black text-gray-900 dark:text-white">
          {match.team1_score ?? 0} : {match.team2_score ?? 0}
        </div>
      </div>
    </article>
  )
}

function EmptyHighlightCard({ text }: { text: string }) {
  return (
    <article className="flex min-h-[120px] items-center justify-center rounded-3xl border border-gray-200/80 bg-white/90 p-6 text-center text-xs font-bold text-gray-400 dark:border-gray-800/80 dark:bg-gray-900/90">
      {text}
    </article>
  )
}

export default function StatsPage() {
  const params = useParams()
  const rawParam = params?.slug

  const slug = useMemo(() => {
    const str = Array.isArray(rawParam) ? rawParam[0] : rawParam || ''
    try {
      return decodeURIComponent(str)
    } catch {
      return str
    }
  }, [rawParam])

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
        .select('id, name, slug, logo_url, primary_color, background_style')
        .eq('slug', slug)
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
  }, [slug])

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

  const primaryColor = tournament?.primary_color?.trim() || '#2563eb'

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-gray-900 dark:text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 dark:border-gray-800 dark:border-t-blue-400" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">
            Berechne Statistiken …
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-red-50/90 p-6 text-center shadow-sm backdrop-blur-md dark:border-red-900/40 dark:bg-red-950/20">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xl dark:bg-red-900/40">
          ⚠️
        </div>
        <h2 className="text-lg font-black text-red-900 dark:text-red-200">
          Fehler beim Laden
        </h2>
        <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
      {/* HEADER */}
      <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90 sm:p-8">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            📊
          </span>
          <div>
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ color: primaryColor }}
            >
              Turnierdaten {"&"} Analytics
            </span>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              Statistiken {"&"} Kennzahlen
            </h1>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:text-sm">
          Echtzeit-Auswertung aller beendeten Spiele, Torquoten und Rekorde.
        </p>
      </section>

      {/* KPI KACHELN */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
          <p className="text-[10px] font-black uppercase text-gray-400">Gespielte Spiele</p>
          <p className="mt-2 font-mono text-2xl font-black text-gray-900 dark:text-white sm:text-3xl">
            {stats.totalFinished} <span className="text-xs text-gray-400 font-sans">/ {stats.totalMatches}</span>
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
          <p className="text-[10px] font-black uppercase text-gray-400">Treffer Gesamt</p>
          <p className="mt-2 font-mono text-2xl font-black text-gray-900 dark:text-white sm:text-3xl">
            {stats.totalScored}
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
          <p className="text-[10px] font-black uppercase text-gray-400">Ø Treffer / Spiel</p>
          <p className="mt-2 font-mono text-2xl font-black text-gray-900 dark:text-white sm:text-3xl">
            {stats.avgScoredPerMatch}
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
          <p className="text-[10px] font-black uppercase text-gray-400">Teams im Turnier</p>
          <p className="mt-2 font-mono text-2xl font-black text-gray-900 dark:text-white sm:text-3xl">
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
          />
        ) : (
          <EmptyHighlightCard text="Noch keine Siege gewertet" />
        )}
      </div>

      {/* LEADERBOARDS: OFFENSIVE & DEFENSIVE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* TOP OFFENSIVE */}
        <section className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Beste Offensive
              </h2>
            </div>
            <span className="text-[10px] font-black uppercase text-gray-400">Ø Tore / Spiel</span>
          </div>

          {stats.topOffense.length > 0 ? (
            <div className="mt-3 space-y-2">
              {stats.topOffense.slice(0, 5).map((st, idx) => (
                <div
                  key={st.teamId}
                  className="flex items-center justify-between rounded-2xl border border-gray-200/60 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-gray-500 bg-gray-200/80 dark:bg-gray-800 dark:text-gray-400">
                      #{idx + 1}
                    </span>
                    <span className="truncate text-xs font-extrabold text-gray-900 dark:text-white">
                      {st.teamName}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-xs font-black text-gray-900 dark:text-white">Ø {st.avgScored} Tore</p>
                    <p className="text-[10px] font-bold text-gray-400">{st.scored} gesamt ({st.played} Spiele)</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-center text-xs font-bold text-gray-400 py-4">Noch keine Daten vorhanden</p>
          )}
        </section>

        {/* TOP DEFENSIVE */}
        <section className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Beste Defensive
              </h2>
            </div>
            <span className="text-[10px] font-black uppercase text-gray-400">Wenigste Gegentore / Spiel</span>
          </div>

          {stats.topDefense.length > 0 ? (
            <div className="mt-3 space-y-2">
              {stats.topDefense.slice(0, 5).map((st, idx) => (
                <div
                  key={st.teamId}
                  className="flex items-center justify-between rounded-2xl border border-gray-200/60 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-gray-500 bg-gray-200/80 dark:bg-gray-800 dark:text-gray-400">
                      #{idx + 1}
                    </span>
                    <span className="truncate text-xs font-extrabold text-gray-900 dark:text-white">
                      {st.teamName}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-xs font-black text-gray-900 dark:text-white">Ø {st.avgConceded} Gegentore</p>
                    <p className="text-[10px] font-bold text-gray-400">{st.conceded} gesamt ({st.played} Spiele)</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-center text-xs font-bold text-gray-400 py-4">Noch keine Daten vorhanden</p>
          )}
        </section>
      </div>

      {/* TEAM EFFIZIENZ & SIEGQUOTE */}
      <section className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🥇</span>
            <h2 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Siegquote {"&"} Effizienz
            </h2>
          </div>
          <span className="text-[10px] font-black uppercase text-gray-400">Win Rate %</span>
        </div>

        {stats.topTeams.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {stats.topTeams.slice(0, 6).map((st, idx) => (
              <div
                key={st.teamId}
                className="flex items-center justify-between rounded-2xl border border-gray-200/60 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black text-gray-500 bg-gray-200/80 dark:bg-gray-800 dark:text-gray-400">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-gray-900 dark:text-white">
                      {st.teamName}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400">
                      {st.wins}S - {st.draws}U - {st.losses}N
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{st.winRate}% Siegquote</p>
                  <p className="text-[10px] font-bold text-gray-400">Diff {st.diff > 0 ? `+${st.diff}` : st.diff}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-center text-xs font-bold text-gray-400 py-4">Noch keine Daten vorhanden</p>
        )}
      </section>
    </div>
  )
}