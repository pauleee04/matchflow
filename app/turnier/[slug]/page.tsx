'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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
  background_style: string | null
  status?: string | null
  event_date?: string | null
  location?: string | null
  description?: string | null
  max_teams?: number | null
}

function hexToRgba(hex: string | null | undefined, alpha: number, fallback: string = '#2563eb'): string {
  let c = (hex || fallback).trim()
  if (!c.startsWith('#')) return `rgba(37, 99, 235, ${alpha})`
  if (c.length === 4) {
    c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
  }
  if (c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16)
    const g = parseInt(c.slice(3, 5), 16)
    const b = parseInt(c.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `rgba(37, 99, 235, ${alpha})`
}

function isMatchFinished(match: TournamentMatch): boolean {
  const status = (match.status || '').toLowerCase()
  if (status === 'live' || status === 'playing' || status === 'in_progress') {
    return false
  }
  return (
    status === 'finished' ||
    status === 'completed' ||
    (status !== 'scheduled' && match.team1_score !== null && match.team2_score !== null)
  )
}

function isMatchLive(match: TournamentMatch): boolean {
  const status = (match.status || '').toLowerCase()
  return status === 'live' || status === 'playing' || status === 'in_progress'
}

function formatTime(value?: string | null): string {
  if (!value) return 'Zeit offen'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Zeit offen'
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function TournamentPage() {
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
        .select('*')
        .or(`slug.eq."${slug}",slug.eq."${rawParam}"`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      const t = tourneyData as TournamentInfo
      setTournament(t)

      const [teamsRes, matchesRes] = await Promise.all([
        supabase.from('teams').select('id, name').eq('tournament_id', t.id),
        supabase.from('matches').select('*').eq('tournament_id', t.id).order('scheduled_time'),
      ])

      if (teamsRes.error) throw teamsRes.error
      if (matchesRes.error) throw matchesRes.error

      setTeams((teamsRes.data as Team[]) ?? [])
      setMatches((matchesRes.data as TournamentMatch[]) ?? [])
      setError('')
    } catch (err) {
      console.error('TOURNAMENT PAGE LOAD ERROR:', err)
      setError('Die Turnierdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [slug, rawParam])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!tournament?.id) return
    const channel = supabase
      .channel(`tournament_landing_${tournament.id}`)
      .on('broadcast', { event: 'refresh' }, () => void loadData())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournament?.id, loadData])

  const teamsMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])

  const getTeamName = useCallback(
    (id: number | null): string => {
      if (id === null) return 'TBD'
      return teamsMap.get(id) || `Team ${id}`
    },
    [teamsMap]
  )

  const liveMatches = useMemo(() => matches.filter(isMatchLive), [matches])
  const upcomingMatches = useMemo(
    () => matches.filter((m) => !isMatchFinished(m) && !isMatchLive(m)),
    [matches]
  )

  const primaryColor = tournament?.primary_color?.trim() || '#2563eb'
  const maxTeams = tournament?.max_teams ?? null
  const isMaxTeamsReached = maxTeams ? teams.length >= maxTeams : false
  const isRegistrationOpen =
    (tournament?.status === 'registration' || (matches.length === 0 && tournament?.status !== 'finished')) &&
    !isMaxTeamsReached
  const isTournamentFinished = tournament?.status === 'finished'

  const spotsProgress = maxTeams ? Math.min(100, Math.round((teams.length / maxTeams) * 100)) : null

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
            <div
              className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: `${primaryColor} transparent transparent transparent` }}
            />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Lade Portal …
          </p>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/30 bg-red-950/20 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-2xl text-red-400">
          ⚠️
        </div>
        <h2 className="text-lg font-black text-slate-100">Turnier nicht gefunden</h2>
        <p className="mt-1 text-xs font-medium text-red-300">
          {error || 'Das angeforderte Turnier existiert nicht.'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl space-y-10 pb-24 text-slate-100">
      {/* DYNAMIC AMBIENT GLOW BACKGROUND */}
      <div
        className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-[550px] w-[800px] -translate-x-1/2 rounded-full opacity-30 blur-[140px] transition-all duration-1000"
        style={{ backgroundColor: primaryColor }}
      />

      {/* HERO SECTION */}
      <section className="relative overflow-hidden rounded-[36px] border border-white/15 bg-slate-900/70 p-8 sm:p-12 shadow-2xl backdrop-blur-2xl">
        <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
          {/* LOGO ODER EMBLEM */}
          {tournament.logo_url ? (
            <div className="relative shrink-0">
              <div
                className="absolute inset-0 rounded-3xl blur-md opacity-50"
                style={{ backgroundColor: primaryColor }}
              />
              <img
                src={tournament.logo_url}
                alt={tournament.name}
                className="relative h-28 w-28 sm:h-36 sm:w-36 rounded-3xl border border-white/20 bg-slate-950/80 p-3 object-contain shadow-2xl"
              />
            </div>
          ) : (
            <div
              className="flex h-28 w-28 sm:h-36 sm:w-36 shrink-0 items-center justify-center rounded-3xl text-4xl sm:text-5xl font-black shadow-2xl border border-white/20"
              style={{
                backgroundColor: hexToRgba(primaryColor, 0.2),
                color: primaryColor,
              }}
            >
              🏆
            </div>
          )}

          {/* TURNIER DETAILS & TITEL */}
          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              {liveMatches.length > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-300 backdrop-blur-md animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-red-400" /> Live Matchday
                </span>
              ) : isTournamentFinished ? (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                  🏆 Turnier Beendet
                </span>
              ) : isRegistrationOpen ? (
                <span
                  className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider"
                  style={{
                    borderColor: hexToRgba(primaryColor, 0.4),
                    backgroundColor: hexToRgba(primaryColor, 0.15),
                    color: primaryColor,
                  }}
                >
                  ⚡ Anmeldung Geöffnet
                </span>
              ) : (
                <span className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300">
                  🔒 Anmeldung Geschlossen
                </span>
              )}

              {tournament.event_date && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-300">
                  📅 {formatDate(tournament.event_date)}
                </span>
              )}
              {tournament.location && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-300">
                  📍 {tournament.location}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              {tournament.name}
            </h1>

            <p className="max-w-2xl text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              {tournament.description ||
                'Willkommen zum offiziellen Turnier-Portal. Hier findest du alle Live-Ergebnisse, Ansetzungen, Tabellen und Anmeldeoptionen.'}
            </p>

            {/* QUICK STATS BAR */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2 border-t border-white/10 text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Teams:</span>
                <span className="text-white font-black text-sm">
                  {teams.length} {maxTeams ? `/ ${maxTeams}` : ''}
                </span>
              </div>
              <div className="h-4 w-px bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Gespielte Matches:</span>
                <span className="text-white font-black text-sm">
                  {matches.filter(isMatchFinished).length} / {matches.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SCHNELLZUGRIFFS-HUB */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-white/10">
          <Link
            href={`/turnier/${slug}/live`}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-3.5 transition hover:bg-white/10 hover:border-white/20"
          >
            <span className="text-xs font-black text-white">Live Arena</span>
            <span className="text-sm">🔥</span>
          </Link>
          <Link
            href={`/turnier/${slug}/regeln`}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-3.5 transition hover:bg-white/10 hover:border-white/20"
          >
            <span className="text-xs font-black text-white">Regelwerk</span>
            <span className="text-sm">📖</span>
          </Link>
          <Link
            href={`/turnier/${slug}/stats`}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-3.5 transition hover:bg-white/10 hover:border-white/20"
          >
            <span className="text-xs font-black text-white">Statistiken</span>
            <span className="text-sm">📊</span>
          </Link>
          {isRegistrationOpen ? (
            <Link
              href={`/turnier/${slug}/anmeldung`}
              className="flex items-center justify-between rounded-2xl p-3.5 transition font-black text-xs text-slate-950 shadow-md hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <span>Anmeldung</span>
              <span>📝</span>
            </Link>
          ) : (
            <Link
              href={`/turnier/${slug}/sieger`}
              className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-300 transition hover:bg-amber-500/20"
            >
              <span className="text-xs font-black">Podium</span>
              <span className="text-sm">🥇</span>
            </Link>
          )}
        </div>
      </section>

      {/* 1. REGISTRIERUNG */}
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-3 text-center lg:text-left flex-1">
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ color: primaryColor }}
            >
              Startplatz Sichern
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              {isRegistrationOpen
                ? 'Melde dich jetzt an und spiele gegen die Besten!'
                : isMaxTeamsReached
                ? 'Das Turnier ist vollständig ausgebucht!'
                : 'Die Anmeldung ist derzeit geschlossen.'}
            </h2>
            <p className="max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">
              {isRegistrationOpen
                ? tournament.description ||
                  'Sichere dir und deinem Partner rechtzeitig einen Startplatz. Nach der Registrierung seid ihr direkt in der Auslosung dabei.'
                : 'Alle Startplätze sind derzeit vergeben oder die Registrierungsphase wurde beendet.'}
            </p>

            {/* BAR NUR ANZEIGEN WENN MAX TEAMS GEGEBEN IST */}
            {maxTeams && spotsProgress !== null && (
              <div className="pt-2 max-w-md mx-auto lg:mx-0 space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-400">Auslastung Startplätze</span>
                  <span className="font-mono" style={{ color: primaryColor }}>
                    {teams.length} / {maxTeams} Teams ({spotsProgress}%)
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-950 p-0.5 border border-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-500 shadow-lg"
                    style={{
                      width: `${spotsProgress}%`,
                      backgroundColor: primaryColor,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0">
            {isRegistrationOpen ? (
              <Link
                href={`/turnier/${slug}/anmeldung`}
                className="inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-xs font-black text-slate-950 shadow-xl transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                <span>Jetzt Team Anmelden</span>
                <span>&rarr;</span>
              </Link>
            ) : (
              <span className="inline-block rounded-2xl border border-white/10 bg-slate-950/60 px-7 py-3.5 text-xs font-bold text-slate-400">
                Anmeldung Geschlossen
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. VORSCHAU: LIVE & MATCH-CENTER */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Matchday Arena
            </span>
            <h2 className="text-2xl font-black text-white">Live &amp; Anstehende Duelle</h2>
          </div>
          <Link
            href={`/turnier/${slug}/live`}
            className="rounded-2xl border border-white/15 bg-slate-800/80 px-6 py-3 text-xs font-black text-white hover:bg-slate-700 transition backdrop-blur-md shadow-md"
          >
            Zur Live Arena &rarr;
          </Link>
        </div>

        <div>
          {liveMatches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveMatches.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="rounded-3xl border border-red-500/40 bg-red-950/20 p-5 backdrop-blur-md shadow-xl"
                >
                  <div className="flex justify-between text-[11px] font-bold border-b border-red-500/20 pb-2.5 mb-3">
                    <span className="text-red-400 font-black flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                      LIVE MATCH
                    </span>
                    {m.table_number && (
                      <span className="font-mono text-amber-400">Tisch {m.table_number}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm font-black text-white">
                    <span className="truncate max-w-[42%]">{getTeamName(m.team1_id)}</span>
                    <span
                      className="font-mono text-base font-black px-4 py-1 rounded-xl border border-white/20"
                      style={{
                        backgroundColor: hexToRgba(primaryColor, 0.3),
                        color: '#ffffff',
                      }}
                    >
                      {m.team1_score ?? 0} : {m.team2_score ?? 0}
                    </span>
                    <span className="truncate max-w-[42%] text-right">{getTeamName(m.team2_id)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingMatches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {upcomingMatches.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="rounded-3xl border border-white/10 bg-slate-950/50 p-5 text-xs font-bold transition-all hover:border-white/20"
                >
                  <div className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 pb-2 mb-3">
                    <span>{m.phase || 'Gruppe'}</span>
                    <span className="font-mono text-amber-400">{formatTime(m.scheduled_time)}</span>
                  </div>
                  <div className="flex justify-between items-center text-white">
                    <span className="truncate max-w-[40%] font-black text-sm">{getTeamName(m.team1_id)}</span>
                    <span className="text-[10px] text-slate-500 font-black">VS</span>
                    <span className="truncate max-w-[40%] text-right font-black text-sm">{getTeamName(m.team2_id)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/5 bg-slate-950/30 p-8 text-center text-xs font-bold text-slate-400">
              Derzeit keine aktiven Ansetzungen. Der Spielplan wird bald veröffentlich.
            </div>
          )}
        </div>
      </section>

      {/* 3. VORSCHAU: REGELWERK */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Regeln &amp; Modus
            </span>
            <h2 className="text-2xl font-black text-white">Offizielle Turnierregeln</h2>
          </div>
          <Link
            href={`/turnier/${slug}/regeln`}
            className="rounded-2xl border border-white/15 bg-slate-800/80 px-6 py-3 text-xs font-black text-white hover:bg-slate-700 transition backdrop-blur-md shadow-md"
          >
            Alle Regeln ansehen &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-slate-300">
          <div className="rounded-3xl border border-white/5 bg-slate-950/40 p-6 space-y-2">
            <span className="text-3xl block mb-2">🍺</span>
            <h3 className="text-sm font-black text-white">10 Becher Aufstellung</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              Klassischer Pyramiden-Aufbau zu Beginn jedes Matches mit offiziellem Distanz-Standard.
            </p>
          </div>
          <div className="rounded-3xl border border-white/5 bg-slate-950/40 p-6 space-y-2">
            <span className="text-3xl block mb-2">🎯</span>
            <h3 className="text-sm font-black text-white">Bringback &amp; Double</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              Treffen beide Spieler in derselben Runde, bekommt das Team die Bälle sofort zurück.
            </p>
          </div>
          <div className="rounded-3xl border border-white/5 bg-slate-950/40 p-6 space-y-2">
            <span className="text-3xl block mb-2">🤝</span>
            <h3 className="text-sm font-black text-white">Fairplay &amp; Respect</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              Sportlicher Anstand an den Tischen steht an oberster Stelle. Entscheidungen der Schiris gelten.
            </p>
          </div>
        </div>
      </section>

      {/* 4. VORSCHAU: STATISTIKEN */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Leaderboards
            </span>
            <h2 className="text-2xl font-black text-white">Statistiken &amp; Rekorde</h2>
          </div>
          <Link
            href={`/turnier/${slug}/stats`}
            className="rounded-2xl border border-white/15 bg-slate-800/80 px-6 py-3 text-xs font-black text-white hover:bg-slate-700 transition backdrop-blur-md shadow-md"
          >
            Zu den Statistiken &rarr;
          </Link>
        </div>

        <p className="text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">
          Wer hat die meisten Treffer versenkt? Verfolge die torreichsten Begegnungen, die stärksten Offensiv-Teams und welche Verteidigung unüberwindbar bleibt.
        </p>
      </section>

      {/* 5. SIEGER (FALLS BEENDET) */}
      {isTournamentFinished && (
        <section className="relative overflow-hidden rounded-[32px] border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900/80 to-slate-900/80 p-8 shadow-2xl backdrop-blur-xl sm:p-10 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-amber-500/20 pb-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                Hall of Fame
              </span>
              <h2 className="text-2xl font-black text-white">Turniersieger &amp; Podium</h2>
            </div>
            <Link
              href={`/turnier/${slug}/sieger`}
              className="rounded-2xl bg-amber-500 px-6 py-3.5 text-xs font-black text-slate-950 shadow-lg hover:bg-amber-400 transition"
            >
              Zum Sieger-Podium &rarr;
            </Link>
          </div>

          <div className="flex items-center gap-4 text-sm font-bold text-amber-200">
            <span className="text-4xl">🥇</span>
            <span>Das Turnier ist offiziell beendet! Schau dir jetzt die Gewinner und das finale Ranking an.</span>
          </div>
        </section>
      )}
    </div>
  )
}