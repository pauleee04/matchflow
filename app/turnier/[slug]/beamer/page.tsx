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
const BRACKET_CARD_HEIGHT = 100
const BRACKET_ROW_HEIGHT = 62
const BRACKET_HEADER_HEIGHT = 36

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
  if (!value) return 'Zeit offen'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Zeit offen'
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function getPhaseName(phase: string) {
  switch (phase) {
    case 'round_of_32':
      return 'Sechzehntelfinale'
    case 'round_of_16':
      return 'Achtelfinale'
    case 'quarter_final':
      return 'Viertelfinale'
    case 'semi_final':
      return 'Halbfinale'
    case 'third_place':
      return 'Spiel um Platz 3'
    case 'final':
      return 'Finale'
    default:
      return phase
  }
}

function getPreviousPhaseName(phase: string) {
  switch (phase) {
    case 'round_of_16':
      return 'Sechzehntelfinale'
    case 'quarter_final':
      return 'Achtelfinale'
    case 'semi_final':
      return 'Viertelfinale'
    case 'final':
    case 'third_place':
      return 'Halbfinale'
    default:
      return 'Vorherige Runde'
  }
}

function getMatchesLayoutConfig(matchCount: number, hasKOStarted: boolean) {
  if (hasKOStarted || matchCount <= 2) {
    return {
      gridClass: 'grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto w-full',
      cardPadding: 'p-4 sm:p-5 min-h-[130px]',
      fontSize: 'text-xs sm:text-sm',
      teamNameWidth: 'max-w-[140px]',
    }
  }
  if (matchCount <= 4) {
    return {
      gridClass: 'grid grid-cols-2 gap-4 max-w-5xl mx-auto w-full',
      cardPadding: 'p-4 min-h-[120px]',
      fontSize: 'text-xs',
      teamNameWidth: 'max-w-[130px]',
    }
  }
  if (matchCount <= 6) {
    return {
      gridClass: 'grid grid-cols-2 sm:grid-cols-3 gap-3.5 max-w-6xl mx-auto w-full',
      cardPadding: 'p-3 min-h-[110px]',
      fontSize: 'text-xs',
      teamNameWidth: 'max-w-[120px]',
    }
  }
  if (matchCount <= 8) {
    return {
      gridClass: 'grid grid-cols-2 sm:grid-cols-4 gap-3 w-full',
      cardPadding: 'p-3 min-h-[105px]',
      fontSize: 'text-xs',
      teamNameWidth: 'max-w-[110px]',
    }
  }
  if (matchCount <= 12) {
    return {
      gridClass: 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 w-full',
      cardPadding: 'p-2.5 min-h-[98px]',
      fontSize: 'text-[11px]',
      teamNameWidth: 'max-w-[100px]',
    }
  }
  if (matchCount <= 16) {
    return {
      gridClass: 'grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2 w-full',
      cardPadding: 'p-2 min-h-[90px]',
      fontSize: 'text-[10.5px]',
      teamNameWidth: 'max-w-[90px]',
    }
  }
  if (matchCount <= 24) {
    return {
      gridClass: 'grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 w-full',
      cardPadding: 'p-2 min-h-[85px]',
      fontSize: 'text-[10px]',
      teamNameWidth: 'max-w-[85px]',
    }
  }
  return {
    gridClass: 'grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5 w-full',
    cardPadding: 'p-1.5 min-h-[80px]',
    fontSize: 'text-[9.5px]',
    teamNameWidth: 'max-w-[75px]',
  }
}

function useSmoothAutoScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active: boolean,
  matchCount: number = 0
) {
  const directionRef = useRef<number>(1)
  const posRef = useRef<number>(0)
  const isPausedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!active) return

    const el = containerRef.current
    if (!el) return

    posRef.current = el.scrollTop
    isPausedRef.current = false

    let animationId: number
    let lastTimestamp: number | null = null
    let pauseTimer: NodeJS.Timeout | null = null

    const step = (timestamp: number) => {
      const currentEl = containerRef.current
      if (!currentEl) return

      if (lastTimestamp === null) lastTimestamp = timestamp
      const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, 0.1)
      lastTimestamp = timestamp

      const maxScroll = currentEl.scrollHeight - currentEl.clientHeight
      const baseSpeed = maxScroll > 0 ? Math.max(25, Math.min(85, maxScroll / 5)) : 30

      if (maxScroll > 15 && !isPausedRef.current) {
        posRef.current += directionRef.current * baseSpeed * deltaTime

        if (directionRef.current === 1 && posRef.current >= maxScroll) {
          posRef.current = maxScroll
          currentEl.scrollTop = maxScroll
          directionRef.current = -1
          isPausedRef.current = true

          pauseTimer = setTimeout(() => {
            isPausedRef.current = false
            lastTimestamp = null
            animationId = requestAnimationFrame(step)
          }, 1200)
          return
        }

        if (directionRef.current === -1 && posRef.current <= 0) {
          posRef.current = 0
          currentEl.scrollTop = 0
          directionRef.current = 1
          isPausedRef.current = true

          pauseTimer = setTimeout(() => {
            isPausedRef.current = false
            lastTimestamp = null
            animationId = requestAnimationFrame(step)
          }, 1200)
          return
        }

        currentEl.scrollTop = posRef.current
      }

      animationId = requestAnimationFrame(step)
    }

    pauseTimer = setTimeout(() => {
      animationId = requestAnimationFrame(step)
    }, 1000)

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (pauseTimer) clearTimeout(pauseTimer)
    }
  }, [active, containerRef, matchCount])
}

export default function BeamerPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''
  const containerRef = useRef<HTMLDivElement>(null)
  const standingsContainerRef = useRef<HTMLDivElement>(null)
  const matchesContainerRef = useRef<HTMLDivElement>(null)

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
  const [activeSlide, setActiveSlide] = useState<'matches' | 'standings' | 'bracket'>('matches')

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => {
        if (hasKOStarted) {
          return prev === 'bracket' ? 'matches' : 'bracket'
        } else {
          return prev === 'matches' ? 'standings' : 'matches'
        }
      })
    }, 18000)
    return () => clearInterval(interval)
  }, [hasKOStarted])

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
    const now = new Date().getTime()

    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i]
      const allFinished = slot.matches.length > 0 && slot.matches.every(isFinished)
      const nextSlot = timeSlots[i + 1]

      if (!allFinished) {
        return i
      }

      if (nextSlot && nextSlot.timeKey !== 'unscheduled') {
        const nextTime = new Date(nextSlot.timeKey).getTime()
        const fiveMinBeforeNext = nextTime - 5 * 60 * 1000

        if (!Number.isNaN(nextTime) && now >= fiveMinBeforeNext) {
          continue
        } else {
          return i
        }
      }
    }

    return Math.max(0, timeSlots.length - 1)
  }, [timeSlots, currentTime])

  const activeRound = timeSlots[activeSlotIndex] || null
  const nextRound = timeSlots[activeSlotIndex + 1] || null

  useSmoothAutoScroll(matchesContainerRef, activeSlide === 'matches', activeRound?.matches.length || 0)
  useSmoothAutoScroll(standingsContainerRef, activeSlide === 'standings', groups.length)

  const groupStandings = useMemo(() => {
    return groups.map((group) => {
      const gTeamIds = members.filter((m) => m.group_id === group.id).map((m) => m.team_id)
      const rows = new Map<number, Standing>()

      gTeamIds.forEach((id) => {
        const team = teamsById.get(id)
        if (team) {
          rows.set(id, {
            team,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            diff: 0,
            points: 0,
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

        if (s1 > s2) {
          t1.wins++
          t1.points += 3
          t2.losses++
        } else if (s2 > s1) {
          t2.wins++
          t2.points += 3
          t1.losses++
        } else {
          t1.draws++
          t2.draws++
          t1.points++
          t2.points++
        }
      })

      const standings = Array.from(rows.values()).sort(
        (a, b) => b.points - a.points || b.diff - a.diff || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name)
      )
      return { group, standings }
    })
  }, [groups, members, matches, teamsById])

  const primaryColor = tournament?.primary_color || '#22c55e'
  const secondaryColor = tournament?.secondary_color || '#10b981'
  const primaryContrastText = getContrastTextColor(primaryColor)

  const bgStyle = useMemo(() => {
    if (tournament?.background_style?.startsWith('http') || tournament?.background_style?.startsWith('url')) {
      return {
        backgroundImage: tournament.background_style.startsWith('url') ? tournament.background_style : `url(${tournament.background_style})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
    if (tournament?.background_style) {
      return { background: tournament.background_style }
    }
    return {
      background: `radial-gradient(circle at 50% 20%, ${hexToRgba(primaryColor, 0.22)} 0%, transparent 65%), radial-gradient(circle at 85% 85%, ${hexToRgba(secondaryColor, 0.15)} 0%, transparent 55%), #090d16`,
    }
  }, [tournament?.background_style, primaryColor, secondaryColor])

  function getTeamName(teamId: number | null) {
    if (!teamId) return null
    return teamsById.get(teamId)?.name || null
  }

  function getPhaseMatches(phase: string) {
    return knockoutMatches
      .filter((m) => m.phase === phase)
      .sort((a, b) => (a.knockout_position ?? a.bracket_position ?? 0) - (b.knockout_position ?? b.bracket_position ?? 0))
  }

  function getKOSize() {
    if (matches.some((m) => m.phase === 'round_of_32')) return 32
    if (matches.some((m) => m.phase === 'round_of_16')) return 16
    return 8
  }

  function getExpectedMatchCount(phase: string) {
    const size = getKOSize()
    switch (phase) {
      case 'round_of_32':
        return size === 32 ? 16 : 0
      case 'round_of_16':
        return size === 32 ? 8 : size === 16 ? 8 : 0
      case 'quarter_final':
        return 4
      case 'semi_final':
        return 2
      case 'third_place':
        return tournament?.has_third_place_match || matches.some((m) => m.phase === 'third_place') ? 1 : 0
      case 'final':
        return 1
      default:
        return 0
    }
  }

  function getBracketSideCount(phase: string) {
    return Math.max(1, Math.ceil(getExpectedMatchCount(phase) / 2))
  }

  function getBracketRowSpan(phase: string, phases: string[]) {
    const level = phases.indexOf(phase)
    if (level < 0) return 2
    return Math.pow(2, level + 1)
  }

  function getBracketTeamLabel(match: Match | null, team: 1 | 2, phase: string, position: number) {
    if (!match) {
      const prevName = getPreviousPhaseName(phase)
      const sourceNum = position * 2 - (team === 1 ? 1 : 0)
      return phase === 'third_place' ? `Verlierer ${prevName} ${team}` : `Sieger ${prevName} ${sourceNum}`
    }
    const teamId = team === 1 ? match.team1_id : match.team2_id
    const name = getTeamName(teamId)
    if (!name) {
      const prevName = getPreviousPhaseName(phase)
      const sourceNum = position * 2 - (team === 1 ? 1 : 0)
      return phase === 'third_place' ? `Verlierer ${prevName} ${team}` : `Sieger ${prevName} ${sourceNum}`
    }
    return name
  }

  function BracketMatchCard({ phase, position }: { phase: string; position: number }) {
    const match = getPhaseMatches(phase).find((m) => (m.knockout_position ?? m.bracket_position) === position) || null
    const finished = match ? isFinished(match) : false
    const live = match ? isLive(match) : false

    const t1Winner = finished && match?.team1_score != null && match?.team2_score != null && match.team1_score > match.team2_score
    const t2Winner = finished && match?.team1_score != null && match?.team2_score != null && match.team2_score > match.team1_score

    const t1Name = getBracketTeamLabel(match, 1, phase, position)
    const t2Name = getBracketTeamLabel(match, 2, phase, position)

    const isFinal = phase === 'final'
    const isThirdPlace = phase === 'third_place'

    return (
      <div className="relative w-full" style={{ height: BRACKET_CARD_HEIGHT }}>
        <div
          className={[
            'h-full overflow-hidden rounded-xl border shadow-xl backdrop-blur-md transition flex flex-col justify-between',
            isFinal
              ? 'border-2 border-amber-400/80 bg-slate-950/70 shadow-amber-500/10'
              : isThirdPlace
              ? 'border border-amber-600/50 bg-slate-950/70'
              : finished
              ? 'border border-white/20 bg-slate-950/60'
              : live
              ? 'border-2 border-red-500/80 bg-red-950/40 animate-pulse'
              : match
              ? 'border border-white/10 bg-slate-950/50'
              : 'border-dashed border-white/10 bg-slate-950/30',
          ].join(' ')}
          style={{
            borderColor: finished && !isFinal && !isThirdPlace ? hexToRgba(primaryColor, 0.5) : undefined,
          }}
        >
          <div
            className={[
              'flex h-6 items-center justify-between border-b px-2.5 text-[8.5px] font-black uppercase tracking-wider',
              isFinal
                ? 'border-amber-500/30 bg-amber-500/20 text-amber-300'
                : isThirdPlace
                ? 'border-amber-600/30 bg-amber-600/20 text-amber-300'
                : finished
                ? 'border-white/10 text-white'
                : live
                ? 'border-red-500/20 bg-red-500/20 text-red-300'
                : 'border-white/10 bg-black/40 text-slate-400',
            ].join(' ')}
            style={{
              backgroundColor: finished && !isFinal && !isThirdPlace ? hexToRgba(primaryColor, 0.2) : undefined,
              color: finished && !isFinal && !isThirdPlace ? primaryColor : undefined,
            }}
          >
            <span>{isThirdPlace ? 'Platz 3' : `Spiel #${position}`}</span>
            {live ? (
              <span className="text-red-300 font-extrabold flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
              </span>
            ) : finished ? (
              <span className="font-extrabold" style={{ color: primaryColor }}>✓ Fertig</span>
            ) : (
              <span>{getPhaseName(phase)}</span>
            )}
          </div>

          <div className="space-y-1 p-1.5">
            <div
              className={[
                'flex h-6 items-center justify-between gap-1.5 rounded-lg px-2 text-[10.5px]',
                t1Winner
                  ? 'font-black ring-1'
                  : match
                  ? 'bg-black/50 text-slate-100 font-bold'
                  : 'bg-black/30 text-slate-400 font-semibold',
              ].join(' ')}
              style={
                t1Winner
                  ? {
                      backgroundColor: hexToRgba(primaryColor, 0.25),
                      color: '#ffffff',
                      borderColor: hexToRgba(primaryColor, 0.5),
                    }
                  : undefined
              }
            >
              <span title={t1Name} className="truncate min-w-0">{t1Name}</span>
              <span className="shrink-0 font-mono text-[11.5px] font-black tabular-nums">
                {match ? match.team1_score ?? '-' : '-'}
              </span>
            </div>

            <div
              className={[
                'flex h-6 items-center justify-between gap-1.5 rounded-lg px-2 text-[10.5px]',
                t2Winner
                  ? 'font-black ring-1'
                  : match
                  ? 'bg-black/50 text-slate-100 font-bold'
                  : 'bg-black/30 text-slate-400 font-semibold',
              ].join(' ')}
              style={
                t2Winner
                  ? {
                      backgroundColor: hexToRgba(primaryColor, 0.25),
                      color: '#ffffff',
                      borderColor: hexToRgba(primaryColor, 0.5),
                    }
                  : undefined
              }
            >
              <span title={t2Name} className="truncate min-w-0">{t2Name}</span>
              <span className="shrink-0 font-mono text-[11.5px] font-black tabular-nums">
                {match ? match.team2_score ?? '-' : '-'}
              </span>
            </div>
          </div>

          <div className="flex h-4 items-center justify-between border-t border-white/10 px-2.5 text-[8px] font-bold text-slate-400">
            <span>{match?.table_number ? `Tisch ${match.table_number}` : 'Tisch -'}</span>
            <span>{match && formatTime(match.scheduled_time)}</span>
          </div>
        </div>
      </div>
    )
  }

  function BracketConnector({
    outerPhase,
    innerPhase,
    phases,
    direction,
    totalRows,
  }: {
    outerPhase: string
    innerPhase: string
    phases: string[]
    direction: 'left' | 'right'
    totalRows: number
  }) {
    const outerCount = getBracketSideCount(outerPhase)
    const innerCount = getBracketSideCount(innerPhase)
    if (outerCount <= 0 || innerCount <= 0) return null

    const outerSpan = getBracketRowSpan(outerPhase, phases)
    const innerSpan = getBracketRowSpan(innerPhase, phases)
    const bodyHeight = totalRows * BRACKET_ROW_HEIGHT
    const height = bodyHeight + BRACKET_HEADER_HEIGHT

    const isCenterConnector = outerPhase === innerPhase

    if (isCenterConnector) {
      return (
        <div className="relative w-4 shrink-0" style={{ height }} aria-hidden="true">
          <svg
            className="absolute left-0 right-0 w-full text-slate-500"
            style={{ top: BRACKET_HEADER_HEIGHT, height: bodyHeight }}
            viewBox={`0 0 28 ${bodyHeight}`}
            preserveAspectRatio="none"
          >
            {Array.from({ length: outerCount }).map((_, index) => {
              const outerCenter = ((index * outerSpan + outerSpan / 2) / totalRows) * bodyHeight
              const centerLine = bodyHeight / 2
              const xOuter = direction === 'left' ? 0 : 28
              const xMiddle = 14
              const xInner = direction === 'left' ? 28 : 0

              return (
                <g key={index}>
                  <line x1={xOuter} y1={outerCenter} x2={xMiddle} y2={outerCenter} stroke="currentColor" strokeWidth="1.4" />
                  <line x1={xMiddle} y1={outerCenter} x2={xMiddle} y2={centerLine} stroke="currentColor" strokeWidth="1.4" />
                  {index === 0 && (
                    <line x1={xMiddle} y1={centerLine} x2={xInner} y2={centerLine} stroke="currentColor" strokeWidth="1.4" />
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      )
    }

    return (
      <div className="relative w-4 shrink-0" style={{ height }} aria-hidden="true">
        <svg
          className="absolute inset-0 w-full text-slate-500"
          style={{ top: BRACKET_HEADER_HEIGHT, height: bodyHeight }}
          viewBox={`0 0 28 ${bodyHeight}`}
          preserveAspectRatio="none"
        >
          {Array.from({ length: innerCount }).map((_, index) => {
            const outerA = index * 2
            const outerB = Math.min(outerCount - 1, outerA + 1)

            const outerCenterA = ((outerA * outerSpan + outerSpan / 2) / totalRows) * bodyHeight
            const outerCenterB = ((outerB * outerSpan + outerSpan / 2) / totalRows) * bodyHeight
            const innerCenter = ((index * innerSpan + innerSpan / 2) / totalRows) * bodyHeight

            const xOuter = direction === 'left' ? 0 : 28
            const xMiddle = 14
            const xInner = direction === 'left' ? 28 : 0

            return (
              <g key={index}>
                <line x1={xOuter} y1={outerCenterA} x2={xMiddle} y2={outerCenterA} stroke="currentColor" strokeWidth="1.4" />
                <line x1={xOuter} y1={outerCenterB} x2={xMiddle} y2={outerCenterB} stroke="currentColor" strokeWidth="1.4" />
                <line x1={xMiddle} y1={outerCenterA} x2={xMiddle} y2={outerCenterB} stroke="currentColor" strokeWidth="1.4" />
                <line x1={xMiddle} y1={innerCenter} x2={xInner} y2={innerCenter} stroke="currentColor" strokeWidth="1.4" />
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  function BracketColumn({
    phase,
    side,
    phases,
    totalRows,
  }: {
    phase: string
    side: 'left' | 'right'
    phases: string[]
    totalRows: number
  }) {
    const count = getBracketSideCount(phase)
    const fullCount = getExpectedMatchCount(phase)
    if (count <= 0 || fullCount <= 0) return null

    const leftCount = Math.ceil(fullCount / 2)
    const positions = Array.from({ length: count }, (_, idx) =>
      side === 'left' ? idx + 1 : leftCount + idx + 1
    )
    const rowSpan = getBracketRowSpan(phase, phases)

    return (
      <div
        className="flex min-w-[160px] max-w-[220px] flex-1 flex-col"
        style={{ height: BRACKET_HEADER_HEIGHT + totalRows * BRACKET_ROW_HEIGHT }}
      >
        <div
          className="flex shrink-0 items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-300"
          style={{ height: BRACKET_HEADER_HEIGHT }}
        >
          {getPhaseName(phase)}
        </div>
        <div
          className="grid flex-1 px-0.5"
          style={{ gridTemplateRows: `repeat(${totalRows}, ${BRACKET_ROW_HEIGHT}px)` }}
        >
          {positions.map((pos, idx) => {
            const rowStart = idx * rowSpan + 1
            return (
              <div
                key={`${side}-${phase}-${pos}`}
                className="flex items-center"
                style={{ gridRow: `${rowStart} / span ${rowSpan}` }}
              >
                <BracketMatchCard phase={phase} position={pos} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function getBracketLayoutPhases() {
    const size = getKOSize()
    if (size >= 32) return ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final']
    if (size >= 16) return ['round_of_16', 'quarter_final', 'semi_final']
    return ['quarter_final', 'semi_final']
  }

  function KnockoutBracket() {
    const phases = getBracketLayoutPhases()
    const finalMatch = getPhaseMatches('final')[0] || null
    const thirdPlaceMatch = getPhaseMatches('third_place')[0] || null
    const showThirdPlace = tournament?.has_third_place_match || thirdPlaceMatch || matches.some((m) => m.phase === 'third_place')

    if (phases.length === 0 && !finalMatch) return null

    const firstPhase = phases[0] ?? null
    const baseSideCount = firstPhase ? getBracketSideCount(firstPhase) : 1
    const totalRows = Math.max(2, baseSideCount * 2)

    const bracketBodyHeight = totalRows * BRACKET_ROW_HEIGHT
    const bracketHeight = BRACKET_HEADER_HEIGHT + bracketBodyHeight

    const leftPhases = phases
    const rightPhases = [...phases].reverse()
    const lastLeftPhase = leftPhases[leftPhases.length - 1] ?? null

    return (
      <div className="relative w-full h-full overflow-x-auto custom-scrollbar flex items-center justify-center py-2">
        <div className="min-w-[900px] max-w-[1400px] w-full px-2">
          <div className="flex items-start justify-center gap-1">
            {/* LINKE BRACKET-HÄLFTE */}
            <div className="flex min-w-0 flex-1 items-start">
              {leftPhases.map((phase, index) => {
                const nextPhase = leftPhases[index + 1]
                return (
                  <div key={`left-${phase}`} className="flex min-w-0 flex-1 items-start">
                    <BracketColumn phase={phase} side="left" phases={phases} totalRows={totalRows} />
                    {nextPhase && (
                      <BracketConnector
                        outerPhase={phase}
                        innerPhase={nextPhase}
                        phases={phases}
                        direction="left"
                        totalRows={totalRows}
                      />
                    )}
                  </div>
                )
              })}
              {lastLeftPhase && (
                <BracketConnector
                  outerPhase={lastLeftPhase}
                  innerPhase={lastLeftPhase}
                  phases={phases}
                  direction="left"
                  totalRows={totalRows}
                />
              )}
            </div>

            {/* MITTELSPALTE (FINALE & PLATZ 3) */}
            <div
              className="relative min-w-[190px] max-w-[240px] flex-1"
              style={{ height: bracketHeight }}
            >
              <div
                className="flex shrink-0 items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-300"
                style={{ height: BRACKET_HEADER_HEIGHT }}
              >
                ENTSCHEIDUNG
              </div>

              <div
                className="absolute left-1 right-1"
                style={{
                  top: BRACKET_HEADER_HEIGHT + bracketBodyHeight / 2 - (showThirdPlace ? BRACKET_CARD_HEIGHT + 15 : BRACKET_CARD_HEIGHT / 2),
                }}
              >
                <div className="relative w-full">
                  <div className="absolute -top-6 left-0 right-0 flex justify-center">
                    <span
                      className="rounded-lg px-3 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-md"
                      style={{ backgroundColor: primaryColor, color: primaryContrastText }}
                    >
                      🏆 FINALE
                    </span>
                  </div>
                  <BracketMatchCard phase="final" position={1} />
                </div>
              </div>

              {showThirdPlace && (
                <div
                  className="absolute left-1 right-1"
                  style={{
                    top: BRACKET_HEADER_HEIGHT + bracketBodyHeight / 2 + 25,
                  }}
                >
                  <div className="relative w-full">
                    <div className="absolute -top-6 left-0 right-0 flex justify-center">
                      <span className="rounded-lg px-3 py-0.5 text-[9px] font-black uppercase tracking-widest bg-amber-600/30 text-amber-300 border border-amber-600/40 shadow-sm">
                        🥉 SPIEL UM PLATZ 3
                      </span>
                    </div>
                    <BracketMatchCard phase="third_place" position={1} />
                  </div>
                </div>
              )}
            </div>

            {/* RECHTE BRACKET-HÄLFTE */}
            <div className="flex min-w-0 flex-1 items-start">
              {rightPhases.map((phase, index) => {
                const innerPhase = rightPhases[index - 1] ?? phase
                return (
                  <div key={`right-${phase}`} className="flex min-w-0 flex-1 items-start">
                    <BracketConnector
                      outerPhase={phase}
                      innerPhase={innerPhase}
                      phases={phases}
                      direction="right"
                      totalRows={totalRows}
                    />
                    <BracketColumn phase={phase} side="right" phases={phases} totalRows={totalRows} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const getGridColsClass = () => {
    const count = groups.length
    if (count <= 2) return 'grid-cols-1 sm:grid-cols-2'
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2'
    if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4'
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-white [color-scheme:dark]">
        <div
          className="h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
          style={{ borderTopColor: primaryColor }}
        />
      </div>
    )
  }

  const activeMatchesCount = activeRound?.matches.length || 0
  const layoutConfig = getMatchesLayoutConfig(activeMatchesCount, hasKOStarted)

  return (
    <div
      ref={containerRef}
      style={bgStyle}
      className={`relative w-full overflow-hidden text-white font-sans transition-all flex flex-col justify-between [color-scheme:dark] ${
        isFullscreen
          ? 'fixed inset-0 z-[99999] h-screen w-screen p-8 shadow-2xl backdrop-blur-2xl'
          : 'rounded-[32px] border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-xl h-[calc(100vh-180px)] min-h-[600px]'
      }`}
    >
      {/* GROSSES LOGO-WASSERZEICHEN IN DER MITTE DES HINTERGRUNDS */}
      {tournament?.logo_url && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
          <img
            src={tournament.logo_url}
            alt="Watermark Logo"
            className="w-[55vw] max-w-[650px] h-auto object-contain opacity-[0.07] filter blur-[0.5px] select-none"
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full justify-between space-y-4">
        {/* HEADER BAR */}
        <header className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0 bg-slate-950/40 p-4 rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            {tournament?.logo_url ? (
              <img
                src={tournament.logo_url}
                alt="Logo"
                className="h-12 w-12 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 object-contain shadow-md"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black shadow-md text-slate-950"
                style={{ backgroundColor: primaryColor }}
              >
                🏆
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full animate-ping" style={{ backgroundColor: primaryColor }} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                  Live Beamer Screen
                </span>
              </div>
              <h1 className="text-xl font-black text-white">{tournament?.name || 'Bierpong Turnier'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="font-mono text-2xl font-black tracking-wider" style={{ color: primaryColor }}>
                {currentTime}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/30 px-5 py-2.5 text-xs font-black text-white shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: primaryColor,
                boxShadow: `0 0 20px ${hexToRgba(primaryColor, 0.45)}`,
              }}
            >
              <span>{isFullscreen ? '📺 Vollbild Beenden' : '📺 Vollbild Mode'}</span>
            </button>
          </div>
        </header>

        {/* SLIDE 1: AKTUELLE RUNDE */}
        {activeSlide === 'matches' && (
          <main className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0 px-2">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span>Spielrunde: {activeRound?.timeFormatted || 'Aktuelle Runde'}</span>
                  {activeRound && (
                    <span
                      className="text-xs font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-sm"
                      style={{
                        backgroundColor: hexToRgba(primaryColor, 0.15),
                        borderColor: hexToRgba(primaryColor, 0.4),
                        color: primaryColor,
                      }}
                    >
                      {activeRound.matches.filter(isFinished).length} / {activeRound.matches.length} Fertig
                    </span>
                  )}
                </h2>
              </div>
              {nextRound && (
                <div className="text-xs font-bold text-slate-300">
                  Nächste Runde: <span style={{ color: primaryColor }}>{nextRound.timeFormatted}</span>
                </div>
              )}
            </div>

            {activeRound && activeRound.matches.length > 0 ? (
              <div
                ref={matchesContainerRef}
                className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none] pr-1 flex flex-col"
              >
                <div className={`my-auto ${layoutConfig.gridClass}`}>
                  {activeRound.matches.map((m) => {
                    const finished = isFinished(m)
                    const live = isLive(m)
                    const t1Name = teamsById.get(m.team1_id || -1)?.name || 'TBD'
                    const t2Name = teamsById.get(m.team2_id || -1)?.name || 'TBD'
                    const t1Win = finished && m.team1_score != null && m.team2_score != null && m.team1_score > m.team2_score
                    const t2Win = finished && m.team1_score != null && m.team2_score != null && m.team2_score > m.team1_score
                    const isKOMatch = KO_PHASES.includes(m.phase)

                    const groupName = m.group_id ? groupsById.get(m.group_id)?.name : null
                    const matchLabel = isKOMatch
                      ? getPhaseName(m.phase)
                      : (groupName || 'Gruppe')

                    return (
                      <div
                        key={m.id}
                        className={`rounded-2xl border shadow-xl backdrop-blur-md flex flex-col justify-between transition ${layoutConfig.cardPadding} ${
                          live
                            ? 'border-2 border-red-500/80 bg-red-950/40 animate-pulse'
                            : finished
                            ? 'border-white/10 bg-slate-950/60'
                            : 'border-white/10 bg-slate-950/40'
                        }`}
                        style={{
                          borderColor: finished ? hexToRgba(primaryColor, 0.4) : undefined,
                          backgroundColor: finished ? hexToRgba(primaryColor, 0.12) : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[9.5px] font-black uppercase">
                          <span className="font-mono text-xs" style={{ color: primaryColor }}>
                            {m.table_number ? `Tisch ${m.table_number}` : 'Tisch —'}
                          </span>
                          {live ? (
                            <span className="text-red-300 font-extrabold animate-pulse flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" /> LIVE
                            </span>
                          ) : finished ? (
                            <span className="font-extrabold" style={{ color: primaryColor }}>✓ Fertig</span>
                          ) : (
                            <span className="text-slate-400 truncate max-w-[90px]">{matchLabel}</span>
                          )}
                        </div>

                        <div className={`my-1.5 space-y-1 font-black ${layoutConfig.fontSize}`}>
                          <div
                            className={`flex justify-between items-center rounded-lg px-2 py-0.5 ${
                              t1Win ? 'font-black' : 'bg-slate-900/60 text-white'
                            }`}
                            style={
                              t1Win
                                ? {
                                    backgroundColor: hexToRgba(primaryColor, 0.3),
                                    color: '#ffffff',
                                  }
                                : undefined
                            }
                          >
                            <span className={`truncate ${layoutConfig.teamNameWidth}`} title={t1Name}>
                              {t1Name}
                            </span>
                            <span className="font-mono text-xs ml-1.5 shrink-0">
                              {m.team1_score !== null ? m.team1_score : '-'}
                            </span>
                          </div>
                          <div
                            className={`flex justify-between items-center rounded-lg px-2 py-0.5 ${
                              t2Win ? 'font-black' : 'bg-slate-900/60 text-white'
                            }`}
                            style={
                              t2Win
                                ? {
                                    backgroundColor: hexToRgba(primaryColor, 0.3),
                                    color: '#ffffff',
                                  }
                                : undefined
                            }
                          >
                            <span className={`truncate ${layoutConfig.teamNameWidth}`} title={t2Name}>
                              {t2Name}
                            </span>
                            <span className="font-mono text-xs ml-1.5 shrink-0">
                              {m.team2_score !== null ? m.team2_score : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-[8.5px] font-mono font-bold text-slate-400 border-t border-white/5 pt-0.5">
                          {formatTime(m.scheduled_time)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Keine Spiele für die aktuelle Runde angesetzt.
              </div>
            )}
          </main>
        )}

        {/* SLIDE 2: GRUPPENTABELLEN */}
        {activeSlide === 'standings' && (
          <main className="flex-1 min-h-0 space-y-2 overflow-hidden flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 shrink-0 px-2">
              Gruppentabellen ({groups.length} Gruppen)
            </h2>

            <div
              ref={standingsContainerRef}
              className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none] pr-1"
            >
              <div className={`grid gap-3 ${getGridColsClass()}`}>
                {groupStandings.map(({ group, standings }) => (
                  <div
                    key={group.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-2xl backdrop-blur-md"
                  >
                    <div
                      className="px-2.5 py-1.5 text-center text-xs font-black uppercase flex items-center justify-between"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                        color: primaryContrastText,
                      }}
                    >
                      <span className="truncate max-w-[120px]">{group.name}</span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded opacity-90"
                        style={{
                          backgroundColor: primaryContrastText === '#ffffff' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.3)',
                          color: primaryContrastText,
                        }}
                      >
                        {standings.length} Teams
                      </span>
                    </div>

                    <div className="p-2">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-white/10 text-[8px] font-black uppercase text-slate-400">
                            <th className="py-0.5 px-0.5 text-center">#</th>
                            <th className="py-0.5 px-0.5">Team</th>
                            <th className="py-0.5 px-0.5 text-center" title="Spiele">Sp</th>
                            <th className="py-0.5 px-0.5 text-center" style={{ color: primaryColor }} title="Siege">S</th>
                            <th className="py-0.5 px-0.5 text-center text-amber-300" title="Unentschieden">U</th>
                            <th className="py-0.5 px-0.5 text-center text-red-300" title="Niederlagen">N</th>
                            <th className="py-0.5 px-0.5 text-center" title="Tore">Tore</th>
                            <th className="py-0.5 px-0.5 text-center" title="Differenz">Diff</th>
                            <th className="py-0.5 px-0.5 text-right font-black text-white" title="Punkte">Pkt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 font-bold">
                          {standings.map((st, idx) => {
                            const isQualified = idx < 2
                            return (
                              <tr
                                key={st.team.id}
                                className="transition"
                                style={
                                  isQualified
                                    ? {
                                        backgroundColor: hexToRgba(primaryColor, 0.15),
                                      }
                                    : undefined
                                }
                              >
                                <td className="py-1 px-0.5 text-center font-mono">
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-black"
                                    style={
                                      isQualified
                                        ? {
                                            backgroundColor: primaryColor,
                                            color: primaryContrastText,
                                          }
                                        : {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            color: 'rgba(255, 255, 255, 0.7)',
                                          }
                                    }
                                  >
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="py-1 px-0.5 truncate max-w-[85px] font-extrabold text-white">
                                  {st.team.name}
                                </td>
                                <td className="py-1 px-0.5 text-center font-mono text-slate-300">{st.played}</td>
                                <td className="py-1 px-0.5 text-center font-mono" style={{ color: primaryColor }}>
                                  {st.wins}
                                </td>
                                <td className="py-1 px-0.5 text-center font-mono text-amber-300">{st.draws}</td>
                                <td className="py-1 px-0.5 text-center font-mono text-red-300">{st.losses}</td>
                                <td className="py-1 px-0.5 text-center font-mono text-slate-300">
                                  {st.goalsFor}:{st.goalsAgainst}
                                </td>
                                <td className="py-1 px-0.5 text-center font-mono font-black">
                                  <span
                                    className={
                                      st.diff > 0 ? 'text-emerald-400' : st.diff < 0 ? 'text-red-400' : 'text-slate-400'
                                    }
                                  >
                                    {st.diff > 0 ? `+${st.diff}` : st.diff}
                                  </span>
                                </td>
                                <td className="py-1 px-0.5 text-right font-mono font-black text-xs text-white">
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
          </main>
        )}

        {/* SLIDE 3: KO-BRACKET */}
        {activeSlide === 'bracket' && (
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-2 px-2">
              K.-o.-Phase Bracket
            </h2>
            <div className="flex-1 min-h-0 overflow-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none] border border-white/10 rounded-2xl bg-slate-950/60 p-4 sm:p-6 backdrop-blur-md flex items-center justify-center">
              <KnockoutBracket />
            </div>
          </main>
        )}

        {/* FOOTER BAR */}
        <footer className="border-t border-white/10 pt-3 flex justify-between items-center text-[10px] font-bold text-slate-400 shrink-0 bg-slate-950/40 p-3 rounded-2xl backdrop-blur-md">
          <span>{tournament?.name || 'Bierpong Tournament'} Beamer Live Screen</span>
          <span className="flex items-center gap-1.5">
            <span>
              Ansicht: {activeSlide === 'matches' ? 'Spiele & Ergebnisse' : activeSlide === 'standings' ? 'Gruppentabellen' : 'K.-o.-Baum'} (Auto-Wechsel)
            </span>
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
          </span>
        </footer>
      </div>
    </div>
  )
}