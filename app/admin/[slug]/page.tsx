'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { publicSupabase } from '@/lib/supabase'
import { getSportConfig } from '@/lib/sportsConfig'

type Tournament = {
  id: number
  name: string
  slug: string
  type: string
  status: string
  primary_color?: string | null
  background_style?: string | null
  logo_url?: string | null
  created_at: string
}

type Match = {
  id: number
  table_number: number | null
  team1_id: number | null
  team2_id: number | null
  team1_score: number | null
  team2_score: number | null
  status: string | null
  phase: string | null
}

type Team = {
  id: number
  name: string
}

export default function AdminTournamentDashboard() {
  const params = useParams()
  const slug = (params?.slug as string) || ''

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  async function loadDashboardData() {
    if (!slug) return
    try {
      const { data: tourney, error } = await publicSupabase
        .from('tournaments')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (error || !tourney) return
      setTournament(tourney)

      const [teamsRes, matchesRes] = await Promise.all([
        publicSupabase.from('teams').select('id, name').eq('tournament_id', tourney.id),
        publicSupabase
          .from('matches')
          .select('id, table_number, team1_id, team2_id, team1_score, team2_score, status, phase')
          .eq('tournament_id', tourney.id)
          .order('id', { ascending: true }),
      ])

      if (teamsRes.data) setTeams(teamsRes.data)
      if (matchesRes.data) setMatches(matchesRes.data)
    } catch (err) {
      console.error('Dashboard Ladefehler:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboardData()
  }, [slug])

  // Realtime Broadcast Listener für automatische Updates
  useEffect(() => {
    if (!tournament?.id) return

    const channel = publicSupabase.channel(`tournament:${tournament.id}`)
    channel.on('broadcast', { event: 'refresh' }, () => {
      void loadDashboardData()
    })
    channel.subscribe()

    return () => {
      void publicSupabase.removeChannel(channel)
    }
  }, [tournament?.id])

  async function changeTournamentStatus(newStatus: string) {
    if (!tournament) return
    setUpdatingStatus(true)
    try {
      const { error } = await publicSupabase
        .from('tournaments')
        .update({ status: newStatus })
        .eq('id', tournament.id)

      if (error) throw error

      setTournament((prev) => (prev ? { ...prev, status: newStatus } : null))

      // Trigger Broadcast an öffentliche Seiten
      const channel = publicSupabase.channel(`tournament:${tournament.id}`)
      await channel.send({
        type: 'broadcast',
        event: 'refresh',
        payload: { updated: Date.now() },
      })
    } catch (err) {
      alert('Status konnte nicht geändert werden.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams])

  const liveMatches = matches.filter((m) => m.status === 'live' || m.status === 'playing')
  const finishedMatches = matches.filter((m) => m.status === 'finished')

  const totalMatchesCount = matches.length
  const progressPercent =
    totalMatchesCount > 0 ? Math.round((finishedMatches.length / totalMatchesCount) * 100) : 0

  const sportConfig = getSportConfig(tournament?.type)
  const primaryColor = tournament?.primary_color || '#22c55e'
  const adminBaseUrl = `/admin/${slug}`
  const publicBaseUrl = `/turnier/${slug}`

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100 bg-slate-950 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade Turnier-Dashboard …
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100 bg-slate-950 [color-scheme:dark]">
      {/* KOPFZEILE UND SCHNELL-STATUS */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase text-slate-950 shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {sportConfig.emoji} {sportConfig.name}
            </span>
            <span
              className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase border ${
                tournament?.status === 'active'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              Status: {tournament?.status}
            </span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white">
            {tournament?.name} Dashboard
          </h1>
          <p className="mt-1 text-xs font-mono text-slate-400">URL-Slug: /turnier/{slug}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tournament?.status || 'active'}
            disabled={updatingStatus}
            onChange={(e) => changeTournamentStatus(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-white focus:border-white/30 focus:outline-none shadow-lg"
          >
            <option value="active">🟢 Status: Aktiv (Öffentlich)</option>
            <option value="draft">🟡 Status: Entwurf / Vorbereitung</option>
            <option value="finished">🏁 Status: Beendet</option>
          </select>

          <Link
            href={publicBaseUrl}
            target="_blank"
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:text-white backdrop-blur-md"
          >
            Öffentliche Seite ↗
          </Link>
        </div>
      </section>

      {/* KPI KENNZAHLEN CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 w-full">
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>Angemeldete Teams</span>
            <span>👥</span>
          </div>
          <div className="mt-2 text-3xl font-black text-white">{teams.length}</div>
          <Link
            href={`${adminBaseUrl}/teams`}
            className="mt-2 inline-block text-[11px] font-bold text-amber-400 hover:underline"
            style={{ color: primaryColor }}
          >
            Teams verwalten →
          </Link>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>Live auf den Tischen</span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          </div>
          <div className="mt-2 text-3xl font-black text-red-400">{liveMatches.length}</div>
          <Link
            href={`${adminBaseUrl}/spiele`}
            className="mt-2 inline-block text-[11px] font-bold text-red-400 hover:underline"
          >
            Live-Ergebnisse eintragen →
          </Link>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>Gespielte Matches</span>
            <span>🏆</span>
          </div>
          <div className="mt-2 text-3xl font-black text-white">
            {finishedMatches.length} <span className="text-sm text-slate-400 font-normal">/ {totalMatchesCount}</span>
          </div>
          <Link
            href={`${adminBaseUrl}/tabelle`}
            className="mt-2 inline-block text-[11px] font-bold text-amber-400 hover:underline"
            style={{ color: primaryColor }}
          >
            Tabelle ansehen →
          </Link>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>Turnier-Fortschritt</span>
            <span>📊</span>
          </div>
          <div className="mt-2 text-3xl font-black text-white">{progressPercent}%</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-950/80 border border-white/10">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
            />
          </div>
        </div>
      </div>

      {/* SCHNELL-AKTIONEN & BRANDING PREVIEW GRID */}
      <div className="grid gap-6 lg:grid-cols-3 w-full">
        {/* SCHNELL-AKTIONEN (2 SPALTEN) */}
        <div className="lg:col-span-2 space-y-4 rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <h3 className="text-lg font-black tracking-tight text-white">Schnellzugriff &amp; Steuerung</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={`${adminBaseUrl}/spiele`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-4 transition hover:border-white/30 hover:bg-white/5 backdrop-blur-md"
            >
              <div>
                <div className="font-black text-sm text-white">⚽ Spiele &amp; Ergebnisse</div>
                <div className="text-xs text-slate-400 mt-0.5">Scores eintragen &amp; Tische zuweisen</div>
              </div>
              <span className="text-slate-400">→</span>
            </Link>

            <Link
              href={`${adminBaseUrl}/gruppen`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-4 transition hover:border-white/30 hover:bg-white/5 backdrop-blur-md"
            >
              <div>
                <div className="font-black text-sm text-white">🔀 Gruppen &amp; Auslosung</div>
                <div className="text-xs text-slate-400 mt-0.5">Teams auslosen &amp; Spielplan erstellen</div>
              </div>
              <span className="text-slate-400">→</span>
            </Link>

            <Link
              href={`${adminBaseUrl}/ko`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-4 transition hover:border-white/30 hover:bg-white/5 backdrop-blur-md"
            >
              <div>
                <div className="font-black text-sm text-white">🏆 K.-o.-Baum Generator</div>
                <div className="text-xs text-slate-400 mt-0.5">Viertelfinale, Halbfinale &amp; Finale</div>
              </div>
              <span className="text-slate-400">→</span>
            </Link>

            <Link
              href={`${adminBaseUrl}/einstellungen`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-4 transition hover:border-white/30 hover:bg-white/5 backdrop-blur-md"
            >
              <div>
                <div className="font-black text-sm text-white">⚙️ Design &amp; Einstellungen</div>
                <div className="text-xs text-slate-400 mt-0.5">Farben, Logo-Wasserzeichen &amp; Regeln</div>
              </div>
              <span className="text-slate-400">→</span>
            </Link>
          </div>
        </div>

        {/* DESIGN & BRANDING CARD (1 SPALTE) */}
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black tracking-tight text-white">Aktuelles Branding</h3>
            <Link
              href={`${adminBaseUrl}/einstellungen`}
              className="text-xs font-extrabold hover:underline"
              style={{ color: primaryColor }}
            >
              Anpassen ⚙️
            </Link>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-3">
              <span className="font-bold text-slate-400">Hauptfarbe:</span>
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-full border border-white/20 shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                />
                <span className="font-mono font-bold text-white">{primaryColor}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-3">
              <span className="font-bold text-slate-400">Hintergrund-Stil:</span>
              <span className="font-bold uppercase text-white">{tournament?.background_style || 'dark'}</span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 p-3">
              <span className="font-bold text-slate-400">Logo-Wasserzeichen:</span>
              <span className="font-bold text-white">{tournament?.logo_url ? 'Vorhanden ✓' : 'Keins hinterlegt'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MONITOR AKTUELL LAUFENDE SPIELE */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <h3 className="text-lg font-black tracking-tight text-white">Tisch-Monitor (Aktuell Live)</h3>
          </div>
          <Link
            href={`${adminBaseUrl}/spiele`}
            className="text-xs font-bold text-amber-400 hover:underline"
            style={{ color: primaryColor }}
          >
            Alle Spiele verwalten →
          </Link>
        </div>

        {liveMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center text-xs font-bold text-slate-400">
            Derzeit läuft kein Spiel live. Starte ein Spiel unter „Spiele &amp; Ergebnisse“.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveMatches.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-bold shadow-lg backdrop-blur-md"
              >
                <div>
                  <span className="text-[10px] font-black uppercase text-red-400">
                    {m.table_number ? `Tisch ${m.table_number}` : 'Tisch –'}
                  </span>
                  <div className="mt-1 font-black text-sm text-white">
                    {teamMap.get(m.team1_id ?? 0) ?? 'TBD'}{' '}
                    <span className="text-slate-500 font-normal">vs.</span>{' '}
                    {teamMap.get(m.team2_id ?? 0) ?? 'TBD'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 font-mono text-base font-black tabular-nums text-white">
                  {m.team1_score ?? 0} : {m.team2_score ?? 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}