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

function getBackgroundStyle(style: string | null | undefined, primaryColor: string) {
  const s = (style || '').toLowerCase().trim()
  switch (s) {
    case 'festival':
      return '#4c0519'
    case 'biergarten':
      return '#14532d'
    case 'light':
    case 'hell':
      return '#f8fafc'
    case 'blue':
      return '#0f172a'
    case 'dark':
    case 'dunkel':
      return '#020617'
    default:
      return primaryColor || '#14532d'
  }
}

function useSmoothAutoScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active: boolean
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

    const speedPixelsPerSecond = 28

    const step = (timestamp: number) => {
      const currentEl = containerRef.current
      if (!currentEl) return

      if (lastTimestamp === null) lastTimestamp = timestamp
      const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, 0.1)
      lastTimestamp = timestamp

      const maxScroll = currentEl.scrollHeight - currentEl.clientHeight

      if (maxScroll > 15 && !isPausedRef.current) {
        posRef.current += directionRef.current * speedPixelsPerSecond * deltaTime

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
    }, 1200)

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (pauseTimer) clearTimeout(pauseTimer)
    }
  }, [active, containerRef])
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
        .select('id, name, slug, logo_url, primary_color, background_style, has_third_place_match')
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
    }, 15000)
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

  useSmoothAutoScroll(matchesContainerRef, activeSlide === 'matches')
  useSmoothAutoScroll(standingsContainerRef, activeSlide === 'standings')

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

  const primaryColor = tournament?.primary_color || '#2563eb'
  const pageBackground = getBackgroundStyle(tournament?.background_style, primaryColor)

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
              ? 'border-amber-400/80 bg-slate-900/95 ring-2 ring-amber-400/30'
              : isThirdPlace
              ? 'border-amber-600/50 bg-slate-900/90'
              : finished
              ? 'border-emerald-500/40 bg-slate-900/90'
              : live
              ? 'border-red-500/60 bg-slate-900/95 animate-pulse'
              : match
              ? 'border-slate-700 bg-slate-900/85'
              : 'border-dashed border-slate-700/60 bg-slate-950/50',
          ].join(' ')}
        >
          <div
            className={[
              'flex h-6 items-center justify-between border-b px-2.5 text-[8.5px] font-black uppercase tracking-wider',
              isFinal
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : isThirdPlace
                ? 'border-amber-600/30 bg-amber-600/10 text-amber-300'
                : finished
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : live
                ? 'border-red-500/20 bg-red-500/10 text-red-300'
                : 'border-slate-800 bg-slate-800/80 text-slate-400',
            ].join(' ')}
          >
            <span>{isThirdPlace ? 'Platz 3' : `Spiel #${position}`}</span>
            {live ? (
              <span className="text-red-300 font-extrabold flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
              </span>
            ) : finished ? (
              <span className="text-emerald-300 font-extrabold">✓ Fertig</span>
            ) : (
              <span>{getPhaseName(phase)}</span>
            )}
          </div>

          <div className="space-y-1 p-1.5">
            <div
              className={[
                'flex h-6 items-center justify-between gap-1.5 rounded-lg px-2 text-[10.5px]',
                t1Winner
                  ? 'bg-emerald-500/25 text-emerald-300 font-black ring-1 ring-emerald-500/30'
                  : match
                  ? 'bg-slate-800/70 text-slate-100 font-bold'
                  : 'bg-slate-900/40 text-slate-400 font-semibold',
              ].join(' ')}
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
                  ? 'bg-emerald-500/25 text-emerald-300 font-black ring-1 ring-emerald-500/30'
                  : match
                  ? 'bg-slate-800/70 text-slate-100 font-bold'
                  : 'bg-slate-900/40 text-slate-400 font-semibold',
              ].join(' ')}
            >
              <span title={t2Name} className="truncate min-w-0">{t2Name}</span>
              <span className="shrink-0 font-mono text-[11.5px] font-black tabular-nums">
                {match ? match.team2_score ?? '-' : '-'}
              </span>
            </div>
          </div>

          <div className="flex h-4 items-center justify-between border-t border-slate-800/80 px-2.5 text-[8px] font-bold text-slate-400">
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
    const showThirdPlace = tournament?.has_third_place_match || thirdPlaceMatch

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

            {/* MITTELSPALTE (FINALE PERFEKT AUF DER ABSOLUTEN HALBFINAL-HÖHE) */}
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

              {/* FINALE: Mitte des Matchcards liegt EXAKT auf der Halbfinal-Linie */}
              <div
                className="absolute left-1 right-1"
                style={{
                  top: BRACKET_HEADER_HEIGHT + bracketBodyHeight / 2 - BRACKET_CARD_HEIGHT / 2,
                }}
              >
                <div className="relative w-full">
                  <div className="absolute -top-6 left-0 right-0 flex justify-center">
                    <span
                      className="rounded-lg px-3 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-950 shadow-md"
                      style={{ backgroundColor: tournament?.primary_color || '#f59e0b' }}
                    >
                      🏆 FINALE
                    </span>
                  </div>
                  <BracketMatchCard phase="final" position={1} />
                </div>
              </div>

              {/* SPIEL UM PLATZ 3: Direkt und übersichtlich unter dem Finale */}
              {showThirdPlace && (
                <div
                  className="absolute left-1 right-1"
                  style={{
                    top: BRACKET_HEADER_HEIGHT + bracketBodyHeight / 2 + BRACKET_CARD_HEIGHT / 2 + 30,
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
      <div className="flex min-h-[50vh] items-center justify-center text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden text-white font-sans transition-all flex flex-col justify-between ${
        isFullscreen
          ? 'fixed inset-0 z-[99999] h-screen w-screen p-8 shadow-2xl'
          : 'h-[calc(100vh-140px)] rounded-3xl p-6 border border-white/10 shadow-2xl'
      }`}
      style={{ backgroundColor: pageBackground }}
    >
      {/* WASSERZEICHEN */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-10">
        {tournament?.logo_url ? (
          <img src={tournament.logo_url} alt="" className="h-[75vh] w-[75vw] object-contain grayscale" />
        ) : (
          <span className="text-[14rem] font-black uppercase tracking-widest" style={{ color: primaryColor }}>
            BEAMER
          </span>
        )}
      </div>

      <div className="relative z-10 flex flex-col h-full justify-between space-y-4">
        {/* HEADER BAR */}
        <header className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            {tournament?.logo_url ? (
              <img src={tournament.logo_url} alt="Logo" className="h-12 w-12 rounded-2xl bg-white/10 p-1.5 object-contain" />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black text-slate-950"
                style={{ backgroundColor: primaryColor }}
              >
                🏆
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400 animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">
                  Live Beamer Screen
                </span>
              </div>
              <h1 className="text-xl font-black text-white">{tournament?.name || 'Bierpong Turnier'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="font-mono text-2xl font-black text-emerald-300 tracking-wider">{currentTime}</p>
            </div>
            <button
              onClick={toggleFullscreen}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/20 transition backdrop-blur-md"
            >
              {isFullscreen ? 'Vollbild Beenden' : 'Vollbild'}
            </button>
          </div>
        </header>

        {/* SLIDE 1: AKTUELLE RUNDE */}
        {activeSlide === 'matches' && (
          <main className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span>Spielrunde: {activeRound?.timeFormatted || 'Aktuelle Runde'}</span>
                  {activeRound && (
                    <span className="text-xs font-bold text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
                      {activeRound.matches.filter(isFinished).length} / {activeRound.matches.length} Fertig
                    </span>
                  )}
                </h2>
              </div>
              {nextRound && (
                <div className="text-xs font-bold text-white/60">
                  Nächste Runde: <span className="text-amber-300">{nextRound.timeFormatted}</span>
                </div>
              )}
            </div>

            {activeRound && activeRound.matches.length > 0 ? (
              <div
                ref={matchesContainerRef}
                className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none] pr-1 flex flex-col justify-center"
              >
                <div
                  className={
                    activeRound.matches.length <= 4 || hasKOStarted
                      ? 'flex flex-wrap items-center justify-center gap-6 max-w-5xl mx-auto w-full py-2'
                      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 w-full'
                  }
                >
                  {activeRound.matches.map((m) => {
                    const finished = isFinished(m)
                    const live = isLive(m)
                    const t1Name = teamsById.get(m.team1_id || -1)?.name || 'TBD'
                    const t2Name = teamsById.get(m.team2_id || -1)?.name || 'TBD'
                    const t1Win = finished && m.team1_score != null && m.team2_score != null && m.team1_score > m.team2_score
                    const t2Win = finished && m.team1_score != null && m.team2_score != null && m.team2_score > m.team1_score
                    const isKOMatch = KO_PHASES.includes(m.phase)

                    return (
                      <div
                        key={m.id}
                        className={`rounded-2xl border p-4 shadow-xl backdrop-blur-md flex flex-col justify-between transition ${
                          activeRound.matches.length <= 4 || hasKOStarted
                            ? 'w-full max-w-[320px] min-h-[140px]'
                            : ''
                        } ${
                          live
                            ? 'border-red-400/80 bg-red-500/20 animate-pulse'
                            : finished
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-white/20 bg-slate-900/80'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs font-black uppercase">
                          <span className="text-amber-300 font-mono text-sm">
                            {m.table_number ? `Tisch ${m.table_number}` : 'Tisch —'}
                          </span>
                          {live ? (
                            <span className="text-red-300 font-extrabold animate-pulse flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-red-400 animate-ping" /> LIVE
                            </span>
                          ) : finished ? (
                            <span className="text-emerald-300 font-extrabold">✓ Fertig</span>
                          ) : (
                            <span className="text-white/60">{isKOMatch ? getPhaseName(m.phase) : 'Gruppe'}</span>
                          )}
                        </div>

                        <div className="my-3 space-y-1.5 text-sm font-black">
                          <div
                            className={`flex justify-between items-center rounded-xl px-3 py-1.5 ${
                              t1Win ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/5 text-white'
                            }`}
                          >
                            <span className="truncate max-w-[170px]">{t1Name}</span>
                            <span className="font-mono text-base ml-2">
                              {m.team1_score !== null ? m.team1_score : '-'}
                            </span>
                          </div>
                          <div
                            className={`flex justify-between items-center rounded-xl px-3 py-1.5 ${
                              t2Win ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/5 text-white'
                            }`}
                          >
                            <span className="truncate max-w-[170px]">{t2Name}</span>
                            <span className="font-mono text-base ml-2">
                              {m.team2_score !== null ? m.team2_score : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-[10px] font-mono font-bold text-white/50 border-t border-white/5 pt-1.5">
                          Ansetzung: {formatTime(m.scheduled_time)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-white/60">
                Keine Spiele für die aktuelle Runde angesetzt.
              </div>
            )}
          </main>
        )}

        {/* SLIDE 2: GRUPPENTABELLEN */}
        {activeSlide === 'standings' && (
          <main className="flex-1 min-h-0 space-y-2 overflow-hidden flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-wider text-white/80 shrink-0">
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
                    className="rounded-2xl border border-white/20 bg-slate-950/60 overflow-hidden shadow-xl backdrop-blur-md"
                  >
                    <div
                      className="px-2.5 py-1 text-center text-xs font-black uppercase text-slate-950 flex items-center justify-between"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <span className="truncate max-w-[120px]">{group.name}</span>
                      <span className="text-[9px] font-bold bg-slate-950/20 px-1.5 py-0.5 rounded text-slate-950">
                        {standings.length} Teams
                      </span>
                    </div>

                    <div className="p-2">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-white/10 text-[8px] font-black uppercase text-white/60">
                            <th className="py-0.5 px-0.5 text-center">#</th>
                            <th className="py-0.5 px-0.5">Team</th>
                            <th className="py-0.5 px-0.5 text-center" title="Spiele">Sp</th>
                            <th className="py-0.5 px-0.5 text-center text-emerald-300" title="Siege">S</th>
                            <th className="py-0.5 px-0.5 text-center text-amber-300" title="Unentschieden">U</th>
                            <th className="py-0.5 px-0.5 text-center text-red-300" title="Niederlagen">N</th>
                            <th className="py-0.5 px-0.5 text-center" title="Tore">Tore</th>
                            <th className="py-0.5 px-0.5 text-center" title="Differenz">Diff</th>
                            <th className="py-0.5 px-0.5 text-right font-black text-white" title="Punkte">Pkt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-bold">
                          {standings.map((st, idx) => {
                            const isQualified = idx < 2
                            return (
                              <tr
                                key={st.team.id}
                                className={`transition ${
                                  isQualified ? 'bg-emerald-500/10 text-emerald-200' : 'text-white/80'
                                }`}
                              >
                                <td className="py-1 px-0.5 text-center font-mono">
                                  <span
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${
                                      isQualified ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-white/70'
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="py-1 px-0.5 truncate max-w-[85px] font-extrabold text-white">
                                  {st.team.name}
                                </td>
                                <td className="py-1 px-0.5 text-center font-mono text-white/70">{st.played}</td>
                                <td className="py-1 px-0.5 text-center font-mono text-emerald-300">{st.wins}</td>
                                <td className="py-1 px-0.5 text-center font-mono text-amber-300">{st.draws}</td>
                                <td className="py-1 px-0.5 text-center font-mono text-red-300">{st.losses}</td>
                                <td className="py-1 px-0.5 text-center font-mono text-white/70">
                                  {st.goalsFor}:{st.goalsAgainst}
                                </td>
                                <td className="py-1 px-0.5 text-center font-mono font-black">
                                  <span
                                    className={
                                      st.diff > 0 ? 'text-emerald-400' : st.diff < 0 ? 'text-red-400' : 'text-white/50'
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
            <h2 className="text-xs font-black uppercase tracking-wider text-white/80 mb-2">
              K.-o.-Phase Bracket
            </h2>
            <div className="flex-1 min-h-0 overflow-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none] border border-white/15 rounded-2xl bg-slate-950/70 p-4 sm:p-6 backdrop-blur-md flex items-center justify-center">
              <KnockoutBracket />
            </div>
          </main>
        )}

        {/* FOOTER BAR */}
        <footer className="border-t border-white/10 pt-3 flex justify-between items-center text-[10px] font-bold text-white/60 shrink-0">
          <span>{tournament?.name || 'Bierpong Tournament'} Beamer Live Screen</span>
          <span className="flex items-center gap-1.5">
            <span>
              Ansicht: {activeSlide === 'matches' ? 'Spiele & Ergebnisse' : activeSlide === 'standings' ? 'Gruppentabellen' : 'K.-o.-Baum'} (Auto 15s)
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          </span>
        </footer>
      </div>
    </div>
  )
}