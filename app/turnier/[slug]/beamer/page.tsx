'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = { id: number; name: string }
type Group = { id: number; name: string }
type GroupMember = { group_id: number; team_id: number }

type Match = {
  id: number
  group_id: number | null
  team1_id: number | null
  team2_id: number | null
  table_number: number | null
  scheduled_time: string | null
  phase: string
  team1_score: number | null
  team2_score: number | null
  status: string
  bracket_position?: number | null
  knockout_position?: number | null
}

type TournamentTheme = {
  id: number
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  background_style: string | null
  has_third_place_match?: boolean | null
}

type Standing = {
  team: Team
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  diff: number
  points: number
}

const KO_PHASES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
const SLIDE_DURATION = 15 // Sekunden pro Folie

function hexToRgba(hex: string | null | undefined, alpha: number, fallback: string = '#22c55e'): string {
  let c = (hex || fallback).trim()
  if (!c.startsWith('#')) return `rgba(34, 197, 94, ${alpha})`
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
  if (c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16)
    const g = parseInt(c.slice(3, 5), 16)
    const b = parseInt(c.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `rgba(34, 197, 94, ${alpha})`
}

function isFinished(match: Match) {
  return (
    match.status === 'finished' ||
    match.status === 'completed' ||
    (match.team1_score !== null && match.team2_score !== null)
  )
}

function isLive(match: Match) {
  const status = (match.status ?? '').toLowerCase()
  return status === 'live' || status === 'playing' || status === 'in_progress'
}

function formatTime(value: string | null) {
  if (!value) return '--:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function getPhaseName(phase: string) {
  switch (phase) {
    case 'round_of_32': return 'Sechzehntelfinale'
    case 'round_of_16': return 'Achtelfinale'
    case 'quarter_final': return 'Viertelfinale'
    case 'semi_final': return 'Halbfinale'
    case 'third_place': return 'Spiel um Platz 3'
    case 'final': return 'Finale'
    default: return phase
  }
}

export default function BeamerPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''
  const containerRef = useRef<HTMLDivElement>(null)

  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentTheme | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  
  // Slide Management & Timer
  const [activeSlide, setActiveSlide] = useState<'matches' | 'standings' | 'bracket'>('matches')
  const [isAutoPlay, setIsAutoPlay] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen().catch(console.error)
    }
  }

  const loadData = useCallback(async () => {
    if (!slug) return
    try {
      const { data: tourneyData } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, secondary_color, background_style, has_third_place_match')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (!tourneyData) return
      setTournament(tourneyData as TournamentTheme)

      const [teamsRes, groupsRes, membersRes, matchesRes] = await Promise.all([
        supabase.from('teams').select('id, name').eq('tournament_id', tourneyData.id),
        supabase.from('groups').select('id, name').eq('tournament_id', tourneyData.id).order('id'),
        supabase.from('group_members').select('group_id, team_id').eq('tournament_id', tourneyData.id),
        supabase.from('matches').select('*').eq('tournament_id', tourneyData.id).order('scheduled_time'),
      ])

      setTeams(teamsRes.data || [])
      setGroups(groupsRes.data || [])
      setMembers(membersRes.data || [])
      setMatches(matchesRes.data || [])
    } catch (err) {
      console.error('Beamer Data Error:', err)
    } finally {
      setLoading(false)
    }
  }, [slug, rawSlug])

  useEffect(() => {
    void loadData()
    const interval = setInterval(() => void loadData(), 8000)
    return () => clearInterval(interval)
  }, [loadData])

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

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const knockoutMatches = useMemo(() => matches.filter((m) => KO_PHASES.includes(m.phase)), [matches])
  const hasKOStarted = knockoutMatches.length > 0

  // Auto-Slide Ticker Logic
  useEffect(() => {
    if (!isAutoPlay) {
      setProgress(0)
      return
    }

    const stepMs = 100
    const totalSteps = (SLIDE_DURATION * 1000) / stepMs

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setActiveSlide((current) => {
            if (hasKOStarted) {
              return current === 'matches' ? 'bracket' : 'matches'
            }
            return current === 'matches' ? 'standings' : 'matches'
          })
          return 0
        }
        return prev + 100 / totalSteps
      })
    }, stepMs)

    return () => clearInterval(timer)
  }, [isAutoPlay, hasKOStarted])

  // Zeitslots ermitteln
  const timeSlots = useMemo(() => {
    const slotsMap = new Map<string, Match[]>()
    matches.forEach((m) => {
      const timeKey = m.scheduled_time ? m.scheduled_time : 'unscheduled'
      if (!slotsMap.has(timeKey)) slotsMap.set(timeKey, [])
      slotsMap.get(timeKey)!.push(m)
    })

    const sortedKeys = Array.from(slotsMap.keys()).sort((a, b) => {
      if (a === 'unscheduled') return 1
      if (b === 'unscheduled') return -1
      return new Date(a).getTime() - new Date(b).getTime()
    })

    return sortedKeys.map((key) => ({
      timeKey: key,
      timeFormatted: key !== 'unscheduled' ? formatTime(key) : 'Offene Ansetzungen',
      matches: slotsMap.get(key)!.sort((a, b) => (a.table_number || 0) - (b.table_number || 0)),
    }))
  }, [matches])

  const activeSlotIndex = useMemo(() => {
    if (timeSlots.length === 0) return 0
    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i]
      const allFinished = slot.matches.length > 0 && slot.matches.every(isFinished)
      if (!allFinished) return i
    }
    return Math.max(0, timeSlots.length - 1)
  }, [timeSlots])

  const activeRound = timeSlots[activeSlotIndex] || null
  const nextRound = timeSlots[activeSlotIndex + 1] || null

  // Tabellenberechnung
  const groupStandings = useMemo(() => {
    return groups.map((group) => {
      const gTeamIds = members.filter((m) => m.group_id === group.id).map((m) => m.team_id)
      const rows = new Map<number, Standing>()

      gTeamIds.forEach((id) => {
        const team = teamsById.get(id)
        if (team) {
          rows.set(id, {
            team, played: 0, wins: 0, draws: 0, losses: 0,
            goalsFor: 0, goalsAgainst: 0, diff: 0, points: 0,
          })
        }
      })

      matches.forEach((m) => {
        if (m.group_id !== group.id || !isFinished(m) || m.team1_id === null || m.team2_id === null) return
        const t1 = rows.get(m.team1_id)
        const t2 = rows.get(m.team2_id)
        if (!t1 || !t2) return

        const s1 = m.team1_score ?? 0
        const s2 = m.team2_score ?? 0

        t1.played++
        t2.played++
        t1.goalsFor += s1
        t1.goalsAgainst += s2
        t1.diff += s1 - s2

        t2.goalsFor += s2
        t2.goalsAgainst += s1
        t2.diff += s2 - s1

        if (s1 > s2) { t1.wins++; t1.points += 3; t2.losses++ }
        else if (s2 > s1) { t2.wins++; t2.points += 3; t1.losses++ }
        else { t1.draws++; t2.draws++; t1.points++; t2.points++ }
      })

      const standings = Array.from(rows.values()).sort(
        (a, b) => b.points - a.points || b.diff - a.diff || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name)
      )
      return { group, standings }
    })
  }, [groups, members, matches, teamsById])

  const primaryColor = tournament?.primary_color || '#22c55e'
  const secondaryColor = tournament?.secondary_color || '#10b981'

  const bgStyle = useMemo(() => {
    if (tournament?.background_style?.startsWith('http') || tournament?.background_style?.startsWith('url')) {
      return {
        backgroundImage: tournament.background_style.startsWith('url') ? tournament.background_style : `url(${tournament.background_style})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
    if (tournament?.background_style) return { background: tournament.background_style }
    return {
      background: `radial-gradient(circle at 50% 10%, ${hexToRgba(primaryColor, 0.35)} 0%, transparent 60%), radial-gradient(circle at 85% 90%, ${hexToRgba(secondaryColor, 0.2)} 0%, transparent 50%), #060911`,
    }
  }, [tournament?.background_style, primaryColor, secondaryColor])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800" style={{ borderTopColor: primaryColor }} />
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Lade Beamer Screen...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={bgStyle}
      className={`relative w-full overflow-hidden text-white font-sans flex flex-col justify-between [color-scheme:dark] ${
        isFullscreen
          ? 'fixed inset-0 z-[99999] h-screen w-screen p-6 sm:p-10'
          : 'rounded-[32px] border border-white/20 p-6 sm:p-8 shadow-2xl h-[calc(100vh-140px)] min-h-[680px]'
      }`}
    >
      {/* BACKGROUND LOGO WATERMARK */}
      {tournament?.logo_url && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
          <img
            src={tournament.logo_url}
            alt="Watermark Logo"
            className="w-[50vw] max-w-[600px] h-auto object-contain opacity-[0.07] filter blur-[0.5px] select-none"
          />
        </div>
      )}

      {/* TOP PROGRESS TIMER BAR */}
      {isAutoPlay && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/40 z-50">
          <div
            className="h-full transition-all duration-100 ease-linear"
            style={{ width: `${progress}%`, backgroundColor: primaryColor }}
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full justify-between gap-6">
        {/* HEADER BAR */}
        <header className="flex items-center justify-between border border-white/15 px-6 py-4 rounded-2xl bg-black/60 backdrop-blur-xl shadow-2xl shrink-0">
          <div className="flex items-center gap-5">
            {tournament?.logo_url ? (
              <img
                src={tournament.logo_url}
                alt="Logo"
                className="h-14 w-14 rounded-2xl border border-white/20 bg-black/80 p-1.5 object-contain shadow-lg"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black shadow-lg"
                style={{ backgroundColor: primaryColor, color: '#000' }}
              >
                🍺
              </div>
            )}
            <div>
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full animate-ping" style={{ backgroundColor: primaryColor }} />
                <span className="text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: primaryColor }}>
                  STAGE BROADCAST SCREEN
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{tournament?.name || 'Bierpong Turnier'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-6 sm:gap-10">
            {/* LIVE UHRZEIT */}
            <div className="text-right">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Uhrzeit</span>
              <p className="font-mono text-3xl font-black tracking-wider text-white" style={{ color: primaryColor }}>
                {currentTime}
              </p>
            </div>

            {/* FULLSCREEN BUTTON */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-xs font-black bg-white/10 hover:bg-white/20 transition shadow-xl active:scale-95"
            >
              <span>{isFullscreen ? '📺 Fenster' : '📺 Vollbild'}</span>
            </button>
          </div>
        </header>

        {/* MAIN DISPLAY AREA */}
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          {/* SLIDE 1: AKTUELLE RUNDE / SCOREBOARD */}
          {activeSlide === 'matches' && (
            <div className="flex-1 flex flex-col justify-between space-y-4">
              {/* SUB-HEADER INFO */}
              <div className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0 px-2">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-xl font-black text-xs uppercase tracking-widest bg-white/10 border border-white/10 text-white">
                    {activeRound?.timeFormatted || 'Aktuelle Runde'}
                  </span>
                  <h2 className="text-lg font-black text-white">
                    {activeRound ? `${activeRound.matches.length} Spiele angesetzt` : 'Keine Spiele'}
                  </h2>
                </div>

                {nextRound && (
                  <div className="text-xs font-black uppercase tracking-wider text-slate-300">
                    Nächste Runde: <span className="font-mono font-bold text-sm" style={{ color: primaryColor }}>{nextRound.timeFormatted} Uhr</span>
                  </div>
                )}
              </div>

              {/* MATCHES GRID (BROADCAST CARDS) */}
              {activeRound && activeRound.matches.length > 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 w-full max-h-full overflow-hidden">
                    {activeRound.matches.map((m) => {
                      const finished = isFinished(m)
                      const live = isLive(m)
                      const t1Name = teamsById.get(m.team1_id || -1)?.name || 'TBD'
                      const t2Name = teamsById.get(m.team2_id || -1)?.name || 'TBD'
                      const t1Win = finished && m.team1_score != null && m.team2_score != null && m.team1_score > m.team2_score
                      const t2Win = finished && m.team1_score != null && m.team2_score != null && m.team2_score > m.team1_score

                      return (
                        <div
                          key={m.id}
                          className={`relative overflow-hidden rounded-3xl border transition-all duration-300 flex flex-col justify-between p-5 shadow-2xl backdrop-blur-xl ${
                            live
                              ? 'border-2 border-red-500 bg-red-950/40 shadow-red-500/20 animate-pulse'
                              : finished
                              ? 'border-white/20 bg-black/70'
                              : 'border-white/15 bg-black/50'
                          }`}
                          style={{
                            borderColor: finished ? hexToRgba(primaryColor, 0.4) : undefined,
                          }}
                        >
                          {/* TOP CARD BAR */}
                          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                            <span className="font-mono text-sm font-black tracking-wider uppercase" style={{ color: primaryColor }}>
                              {m.table_number ? `TISCH ${String(m.table_number).padStart(2, '0')}` : 'TISCH —'}
                            </span>

                            {live ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500 text-white flex items-center gap-1.5 shadow-md animate-bounce">
                                <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" /> LIVE
                              </span>
                            ) : finished ? (
                              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                BEENDET
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 font-mono">
                                {formatTime(m.scheduled_time)} UHR
                              </span>
                            )}
                          </div>

                          {/* TEAMS & BIG SCORES */}
                          <div className="my-4 space-y-2.5">
                            {/* TEAM 1 */}
                            <div
                              className={`flex items-center justify-between p-3 rounded-2xl transition ${
                                t1Win ? 'bg-emerald-500/30 border border-emerald-500/50' : 'bg-black/40 border border-white/5'
                              }`}
                            >
                              <span className="font-extrabold text-sm sm:text-base text-white truncate max-w-[170px]" title={t1Name}>
                                {t1Name}
                              </span>
                              <span className="font-mono text-xl sm:text-2xl font-black text-white tabular-nums">
                                {m.team1_score !== null ? m.team1_score : '-'}
                              </span>
                            </div>

                            {/* TEAM 2 */}
                            <div
                              className={`flex items-center justify-between p-3 rounded-2xl transition ${
                                t2Win ? 'bg-emerald-500/30 border border-emerald-500/50' : 'bg-black/40 border border-white/5'
                              }`}
                            >
                              <span className="font-extrabold text-sm sm:text-base text-white truncate max-w-[170px]" title={t2Name}>
                                {t2Name}
                              </span>
                              <span className="font-mono text-xl sm:text-2xl font-black text-white tabular-nums">
                                {m.team2_score !== null ? m.team2_score : '-'}
                              </span>
                            </div>
                          </div>

                          {/* BOTTOM CARD FOOTER */}
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
                            {m.group_id ? groupsById.get(m.group_id)?.name : getPhaseName(m.phase)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border border-dashed border-white/20 rounded-3xl bg-black/30 text-slate-400 font-bold text-sm">
                  Keine Spiele in diesem Zeitslot angesetzt.
                </div>
              )}
            </div>
          )}

          {/* SLIDE 2: GRUPPENTABELLEN */}
          {activeSlide === 'standings' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0 px-2">
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                  Gruppentabellen Übersicht
                </h2>
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Top 2 qualifizieren sich für die K.O.-Runde
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden flex items-center">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full max-h-full">
                  {groupStandings.map(({ group, standings }) => (
                    <div
                      key={group.id}
                      className="rounded-3xl border border-white/15 bg-black/70 overflow-hidden shadow-2xl backdrop-blur-xl flex flex-col justify-between"
                    >
                      <div
                        className="px-4 py-2.5 text-center font-black text-xs uppercase tracking-wider text-black"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {group.name}
                      </div>

                      <div className="p-3">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/15 text-[9px] font-black uppercase text-slate-400">
                              <th className="py-1 px-1 text-center">#</th>
                              <th className="py-1 px-1">Team</th>
                              <th className="py-1 px-1 text-center">Sp</th>
                              <th className="py-1 px-1 text-center">Diff</th>
                              <th className="py-1 px-1 text-right font-black">Pkt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10 font-bold">
                            {standings.map((st, idx) => {
                              const isQualified = idx < 2
                              return (
                                <tr
                                  key={st.team.id}
                                  className={isQualified ? 'bg-emerald-500/10 text-white' : 'text-slate-300'}
                                >
                                  <td className="py-1.5 px-1 text-center font-mono">
                                    <span
                                      className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${
                                        isQualified ? 'bg-emerald-500 text-black' : 'bg-white/10 text-slate-400'
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-1 truncate max-w-[100px] font-extrabold text-white">
                                    {st.team.name}
                                  </td>
                                  <td className="py-1.5 px-1 text-center font-mono text-slate-400">{st.played}</td>
                                  <td className="py-1.5 px-1 text-center font-mono font-black">
                                    {st.diff > 0 ? `+${st.diff}` : st.diff}
                                  </td>
                                  <td className="py-1.5 px-1 text-right font-mono font-black text-sm text-white" style={{ color: primaryColor }}>
                                    {st.points}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 3: K.O.-BAUM */}
          {activeSlide === 'bracket' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0 px-2">
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                  K.-o.-Phase Bracket
                </h2>
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Finalrunden
                </span>
              </div>

              <div className="flex-1 min-h-0 border border-white/15 rounded-3xl bg-black/70 p-6 backdrop-blur-xl flex items-center justify-center text-center">
                <div>
                  <span className="text-4xl mb-2 block">🏆</span>
                  <h3 className="text-xl font-black text-white uppercase tracking-wider">K.O.-Baum im Stadion-Modus</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Aktuelle Ansetzungen der K.O.-Runden werden hier automatisch groß dargestellt.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM NAVIGATION / FOOTER BAR */}
        <footer className="border border-white/15 px-6 py-3 rounded-2xl bg-black/60 backdrop-blur-xl shadow-2xl flex items-center justify-between text-xs font-black shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsAutoPlay((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition flex items-center gap-2 text-[11px]"
            >
              <span>{isAutoPlay ? '⏸️ Auto-Play Pause' : '▶️ Auto-Play Starten'}</span>
            </button>
          </div>

          {/* SLIDE TABS */}
          <div className="flex items-center gap-2 bg-black/50 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveSlide('matches')}
              className={`px-4 py-1.5 rounded-lg text-[11px] uppercase tracking-wider transition ${
                activeSlide === 'matches'
                  ? 'bg-white text-black font-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Spiele
            </button>

            <button
              type="button"
              onClick={() => setActiveSlide('standings')}
              className={`px-4 py-1.5 rounded-lg text-[11px] uppercase tracking-wider transition ${
                activeSlide === 'standings'
                  ? 'bg-white text-black font-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tabellen
            </button>

            {hasKOStarted && (
              <button
                type="button"
                onClick={() => setActiveSlide('bracket')}
                className={`px-4 py-1.5 rounded-lg text-[11px] uppercase tracking-wider transition ${
                  activeSlide === 'bracket'
                    ? 'bg-white text-black font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                K.O.-Baum
              </button>
            )}
          </div>

          <div className="text-slate-400 text-[10px] font-mono">
            LIVE BROADCAST MODE
          </div>
        </footer>
      </div>
    </div>
  )
}