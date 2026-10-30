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
  knockout_position?: number | null
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

type Placement = {
  rank: number
  teamId: number
  teamName: string
  badge?: string
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

function isFinished(match: TournamentMatch) {
  return (
    match.status === 'finished' ||
    match.status === 'completed' ||
    (match.team1_score !== null && match.team2_score !== null)
  )
}

export default function WinnerPage() {
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
      console.error('WINNER PAGE LOAD ERROR:', err)
      setError('Die Siegerdaten konnten nicht geladen werden.')
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
      .channel(`tournament:${tournament.id}`)
      .on('broadcast', { event: 'refresh' }, () => void loadData())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournament?.id, loadData])

  const teamsMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])

  function getTeamName(id: number | null) {
    if (id === null) return 'Unbekannt'
    return teamsMap.get(id) || `Team ${id}`
  }

  // Platzierungslogik
  const placements = useMemo(() => {
    const list: Placement[] = []

    const finalMatch = matches.find((m) => m.phase?.toLowerCase() === 'final')
    const thirdPlaceMatch = matches.find(
      (m) => m.phase?.toLowerCase() === 'third_place' || m.phase?.toLowerCase() === 'spiel_um_platz_3'
    )

    if (finalMatch && isFinished(finalMatch) && finalMatch.team1_score !== null && finalMatch.team2_score !== null) {
      const winnerId = finalMatch.team1_score > finalMatch.team2_score ? finalMatch.team1_id : finalMatch.team2_id
      const runnerUpId = finalMatch.team1_score > finalMatch.team2_score ? finalMatch.team2_id : finalMatch.team1_id

      if (winnerId) {
        list.push({ rank: 1, teamId: winnerId, teamName: getTeamName(winnerId), badge: '🥇 Turniersieger' })
      }
      if (runnerUpId) {
        list.push({ rank: 2, teamId: runnerUpId, teamName: getTeamName(runnerUpId), badge: '🥈 2. Platz' })
      }
    }

    if (
      thirdPlaceMatch &&
      isFinished(thirdPlaceMatch) &&
      thirdPlaceMatch.team1_score !== null &&
      thirdPlaceMatch.team2_score !== null
    ) {
      const thirdId =
        thirdPlaceMatch.team1_score > thirdPlaceMatch.team2_score
          ? thirdPlaceMatch.team1_id
          : thirdPlaceMatch.team2_id
      const fourthId =
        thirdPlaceMatch.team1_score > thirdPlaceMatch.team2_score
          ? thirdPlaceMatch.team2_id
          : thirdPlaceMatch.team1_id

      if (thirdId) {
        list.push({ rank: 3, teamId: thirdId, teamName: getTeamName(thirdId), badge: '🥉 3. Platz' })
      }
      if (fourthId) {
        list.push({ rank: 4, teamId: fourthId, teamName: getTeamName(fourthId), badge: '4. Platz' })
      }
    }

    return list
  }, [matches, teamsMap])

  const firstPlace = placements.find((p) => p.rank === 1)
  const secondPlace = placements.find((p) => p.rank === 2)
  const thirdPlace = placements.find((p) => p.rank === 3)

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
            Lade Siegerliste …
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
        {/* SEITEN-KOPF */}
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
                🏆
              </span>
            )}
            <div>
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: primaryColor }}
              >
                Hall of Fame
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Sieger &amp; Platzierungen
              </h1>
            </div>
          </div>
          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">
            Die feierliche Übersicht der Champions und finalen Turnierplatzierungen.
          </p>
        </section>

        {/* 🥇 SIEGERTREPPCHEN (PODIUM) */}
        {firstPlace ? (
          <section className="rounded-[32px] border border-amber-500/40 bg-gradient-to-b from-amber-500/15 via-slate-900/90 to-slate-900/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-3.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300 shadow-md">
                👑 Turniersieger
              </span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-black text-white tracking-tight">
                {firstPlace.teamName}
              </h2>
              <p className="mt-1 text-xs font-extrabold text-amber-400">
                Glückwunsch an die Champions des Turniers! 🎉
              </p>
            </div>

            {/* TREPPCHEN VISUALISIERUNG */}
            <div className="mt-8 grid grid-cols-3 items-end gap-3 sm:gap-6 max-w-2xl mx-auto">
              {/* PLATZ 2 */}
              <div className="flex flex-col items-center">
                <span className="text-2xl sm:text-3xl">🥈</span>
                <p className="mt-1 text-center text-xs font-black text-slate-200 truncate w-full">
                  {secondPlace?.teamName || 'Offen'}
                </p>
                <div className="mt-2 w-full h-24 sm:h-32 rounded-t-2xl bg-slate-800/90 border-t-4 border-slate-400 flex items-center justify-center font-black text-slate-200 text-lg shadow-lg">
                  2.
                </div>
              </div>

              {/* PLATZ 1 */}
              <div className="flex flex-col items-center">
                <span className="text-4xl sm:text-5xl animate-bounce">🏆</span>
                <p className="mt-1 text-center text-sm font-black text-amber-400 truncate w-full">
                  {firstPlace.teamName}
                </p>
                <div className="mt-2 w-full h-32 sm:h-44 rounded-t-2xl bg-amber-500/90 border-t-4 border-amber-300 flex items-center justify-center font-black text-slate-950 text-2xl shadow-xl">
                  1.
                </div>
              </div>

              {/* PLATZ 3 */}
              <div className="flex flex-col items-center">
                <span className="text-2xl sm:text-3xl">🥉</span>
                <p className="mt-1 text-center text-xs font-black text-slate-200 truncate w-full">
                  {thirdPlace?.teamName || 'Offen'}
                </p>
                <div className="mt-2 w-full h-20 sm:h-24 rounded-t-2xl bg-amber-950/70 border-t-4 border-amber-700 flex items-center justify-center font-black text-amber-400 text-base shadow-lg">
                  3.
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-2xl">
              🥇
            </div>
            <h2 className="text-lg font-black text-white">
              Das Turnier läuft noch
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Sobald die K.-o.-Phase abgeschlossen ist, wird das finale Siegertreppchen hier angezeigt.
            </p>
          </section>
        )}

        {/* 📊 ALLE ENDPLATZIERUNGEN */}
        {placements.length > 0 && (
          <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🎖️</span>
              <h2 className="text-lg font-black text-white">
                Finale Rangliste
              </h2>
            </div>

            <div className="space-y-2.5">
              {placements.map((p) => (
                <div
                  key={p.teamId}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 backdrop-blur-md transition hover:border-white/20"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl font-mono text-xs font-black text-slate-200 bg-slate-900 border border-white/10">
                      #{p.rank}
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-white">
                      {p.teamName}
                    </span>
                  </div>
                  {p.badge && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[10px] font-black text-amber-300">
                      {p.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}