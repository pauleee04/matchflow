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
  const scheduledMatches = matches.filter((m) => m.status === 'scheduled')

  const totalMatchesCount = matches.length
  const progressPercent =
    totalMatchesCount > 0 ? Math.round((finishedMatches.length / totalMatchesCount) * 100) : 0

  const sportConfig = getSportConfig(tournament?.type)
  const primaryColor = tournament?.primary_color || '#f59e0b'
  const adminBaseUrl = `/admin/${slug}`
  const publicBaseUrl = `/turnier/${slug}`

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-bold text-gray-400">
        Lade Turnier-Dashboard …
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* KOPFZEILE UND SCHNELL-STATUS */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-gray-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/80">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase text-gray-950"
              style={{ backgroundColor: primaryColor }}
            >
              {sportConfig.emoji} {sportConfig.name}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                tournament?.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-amber-500/10 text-amber-500'
              }`}
            >
              Status: {tournament?.status}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            {tournament?.name} Dashboard
          </h2>
          <p className="mt-0.5 text-xs text-gray-400 font-mono">URL-Slug: /turnier/{slug}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tournament?.status || 'active'}
            disabled={updatingStatus}
            onChange={(e) => changeTournamentStatus(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="active">🟢 Status: Aktiv (Öffentlich)</option>
            <option value="draft">🟡 Status: Entwurf / Vorbereitung</option>
            <option value="finished">🏁 Status: Beendet</option>
          </select>

          <Link
            href={publicBaseUrl}
            target="_blank"
            className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            Öffentliche Seite ↗
          </Link>
        </div>
      </div>

      {/* KPI KENNZAHLEN CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
          <div className="flex items-center justify-between text-gray-400 text-xs font-bold">
            <span>Angemeldete Teams</span>
            <span>👥</span>
          </div>
          <div className="mt-2 text-3xl font-black">{teams.length}</div>
          <Link
            href={`${adminBaseUrl}/teams`}
            className="mt-2 inline-block text-[11px] font-bold text-amber-500 hover:underline"
          >
            Teams verwalten →
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
          <div className="flex items-center justify-between text-gray-400 text-xs font-bold">
            <span>Live auf den Tischen</span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          </div>
          <div className="mt-2 text-3xl font-black text-red-500">{liveMatches.length}</div>
          <Link
            href={`${adminBaseUrl}/spiele`}
            className="mt-2 inline-block text-[11px] font-bold text-red-400 hover:underline"
          >
            Live-Ergebnisse eintragen →
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
          <div className="flex items-center justify-between text-gray-400 text-xs font-bold">
            <span>Gespiele Matches</span>
            <span>🏆</span>
          </div>
          <div className="mt-2 text-3xl font-black">
            {finishedMatches.length} <span className="text-sm text-gray-400">/ {totalMatchesCount}</span>
          </div>
          <Link
            href={`${adminBaseUrl}/tabelle`}
            className="mt-2 inline-block text-[11px] font-bold text-amber-500 hover:underline"
          >
            Tabelle ansehen →
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
          <div className="flex items-center justify-between text-gray-400 text-xs font-bold">
            <span>Turnier-Fortschritt</span>
            <span>📊</span>
          </div>
          <div className="mt-2 text-3xl font-black">{progressPercent}%</div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
            />
          </div>
        </div>
      </div>

      {/* SCHNELL-AKTIONEN & BRANDING PREVIEW GRID */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* SCHNELL-AKTIONEN (2 SPALTEN) */}
        <div className="lg:col-span-2 space-y-4 rounded-3xl border border-gray-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
          <h3 className="text-base font-black tracking-tight">Schnellzugriff & Steuerung</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={`${adminBaseUrl}/spiele`}
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-amber-500 hover:bg-amber-500/5 dark:border-gray-800 dark:bg-gray-800/50"
            >
              <div>
                <div className="font-black text-sm">⚽ Spiele & Ergebnisse</div>
                <div className="text-xs text-gray-400">Scores eintragen & Tische zuweisen</div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <Link
              href={`${adminBaseUrl}/gruppen`}
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-amber-500 hover:bg-amber-500/5 dark:border-gray-800 dark:bg-gray-800/50"
            >
              <div>
                <div className="font-black text-sm">🔀 Gruppen & Auslosung</div>
                <div className="text-xs text-gray-400">Teams auslosen & Spielplan erstellen</div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <Link
              href={`${adminBaseUrl}/ko`}
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-amber-500 hover:bg-amber-500/5 dark:border-gray-800 dark:bg-gray-800/50"
            >
              <div>
                <div className="font-black text-sm">🏆 K.-o.-Baum Generator</div>
                <div className="text-xs text-gray-400">Viertelfinale, Halbfinale & Finale</div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <Link
              href={`${adminBaseUrl}/einstellungen`}
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-amber-500 hover:bg-amber-500/5 dark:border-gray-800 dark:bg-gray-800/50"
            >
              <div>
                <div className="font-black text-sm">⚙️ Design & Einstellungen</div>
                <div className="text-xs text-gray-400">Farben, Logo-Wasserzeichen & Regeln</div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>
          </div>
        </div>

        {/* DESIGN & BRANDING CARD (1 SPALTE) */}
        <div className="rounded-3xl border border-gray-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black tracking-tight">Aktuelles Branding</h3>
            <Link
              href={`${adminBaseUrl}/einstellungen`}
              className="text-xs font-extrabold text-amber-500 hover:underline"
            >
              Anpassen ⚙️
            </Link>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
              <span className="font-bold text-gray-400">Hauptfarbe:</span>
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-full border border-white/20 shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                />
                <span className="font-mono font-bold">{primaryColor}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
              <span className="font-bold text-gray-400">Hintergrund-Stil:</span>
              <span className="font-bold uppercase">{tournament?.background_style || 'dark'}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
              <span className="font-bold text-gray-400">Logo-Wasserzeichen:</span>
              <span className="font-bold">{tournament?.logo_url ? 'Vorhanden ✓' : 'Keins hinterlegt'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MONITOR AKTUELL LAUFENDE SPIELE */}
      <div className="rounded-3xl border border-gray-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <h3 className="text-base font-black tracking-tight">Tisch-Monitor (Aktuell Live)</h3>
          </div>
          <Link
            href={`${adminBaseUrl}/spiele`}
            className="text-xs font-bold text-amber-500 hover:underline"
          >
            Alle Spiele verwalten →
          </Link>
        </div>

        {liveMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-xs font-bold text-gray-400 dark:border-gray-800">
            Derzeit läuft kein Spiel live. Starte ein Spiel unter „Spiele & Ergebnisse“.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveMatches.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-xs font-bold shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black uppercase text-red-500">
                    {m.table_number ? `Tisch ${m.table_number}` : 'Tisch –'}
                  </span>
                  <div className="mt-1 font-black text-sm">
                    {teamMap.get(m.team1_id ?? 0) ?? 'TBD'}{' '}
                    <span className="text-gray-400 font-normal">vs.</span>{' '}
                    {teamMap.get(m.team2_id ?? 0) ?? 'TBD'}
                  </div>
                </div>

                <div className="rounded-xl bg-white px-3 py-1.5 font-mono text-base font-black tabular-nums dark:bg-gray-800">
                  {m.team1_score ?? 0} : {m.team2_score ?? 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}