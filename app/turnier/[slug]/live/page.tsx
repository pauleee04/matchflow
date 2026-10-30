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

type TournamentMatch = {
  id: number
  tournament_id?: number
  group_id?: number | null
  round?: number | null
  phase?: string | null
  team1_id: number | null
  team2_id: number | null
  team1_score: number | null
  team2_score: number | null
  status: string
  scheduled_time?: string | null
  table_number?: number | null
  bracket_position?: number | null
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
  has_third_place_match?: boolean | null
}

type GroupStanding = {
  teamId: number
  teamName: string
  points: number
  played: number
  wins: number
  draws: number
  losses: number
  scored: number
  conceded: number
  diff: number
}

const KO_PHASES_LIST = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
]

const KO_PHASES_MAP: Record<string, string> = {
  round_of_32: 'Sechzehntelfinale',
  round_of_16: 'Achtelfinale',
  quarter_final: 'Viertelfinale',
  semi_final: 'Halbfinale',
  third_place: 'Spiel um Platz 3',
  final: 'Finale',
}

const KO_CARD_HEIGHT = 88
const KO_ROW_HEIGHT = 46
const KO_HEADER_HEIGHT = 28

// HELPER FÜR FARBUMWANDLUNGEN & KONSTRASTE
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
  const p1 = hexToRgba(primary, 0.25, '#2563eb')
  const p2 = hexToRgba(secondary || primary, 0.12, '#3b82f6')
  return `radial-gradient(circle at 50% 5%, ${p1} 0%, ${p2} 45%, #030712 90%)`
}

function getPhaseName(phase: string | null | undefined, groupId?: number | null) {
  if (!phase) return groupId ? 'Gruppenspiel' : 'Spiel'
  const lower = phase.toLowerCase()
  if (KO_PHASES_MAP[lower]) return KO_PHASES_MAP[lower]
  if (lower === 'group') return 'Gruppenspiel'
  return phase
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

function isFinished(match: TournamentMatch) {
  return (
    match.status === 'finished' ||
    match.status === 'completed' ||
    (match.team1_score !== null && match.team2_score !== null)
  )
}

function isLive(match: TournamentMatch) {
  const status = (match.status ?? '').toLowerCase()
  return status === 'live' || status === 'playing' || status === 'in_progress'
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return null
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function compareMatchesByTime(a: TournamentMatch, b: TournamentMatch) {
  const timeA = a.scheduled_time ? new Date(a.scheduled_time).getTime() : 0
  const timeB = b.scheduled_time ? new Date(b.scheduled_time).getTime() : 0

  if (timeA !== timeB) {
    if (timeA === 0) return 1
    if (timeB === 0) return -1
    return timeA - timeB
  }

  if ((a.round ?? 0) !== (b.round ?? 0)) {
    return (a.round ?? 0) - (b.round ?? 0)
  }
  return a.id - b.id
}

function calculateStandings(
  groupId: number,
  teams: Team[],
  members: GroupMember[],
  matches: TournamentMatch[]
): GroupStanding[] {
  const groupTeamIds = new Set(
    members.filter((m) => m.group_id === groupId).map((m) => m.team_id)
  )
  const groupTeams = teams.filter((t) => groupTeamIds.has(t.id))
  const groupMatches = matches.filter(
    (m) =>
      isFinished(m) &&
      m.group_id === groupId &&
      (!m.phase || m.phase.toLowerCase() === 'group' || !KO_PHASES_LIST.includes(m.phase.toLowerCase())) &&
      m.team1_id !== null &&
      m.team2_id !== null &&
      m.team1_score !== null &&
      m.team2_score !== null
  )

  const statsMap = new Map<number, GroupStanding>()
  groupTeams.forEach((t) => {
    statsMap.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      diff: 0,
    })
  })

  groupMatches.forEach((m) => {
    const t1 = statsMap.get(m.team1_id!)
    const t2 = statsMap.get(m.team2_id!)
    if (!t1 || !t2) return

    const score1 = m.team1_score!
    const score2 = m.team2_score!

    t1.played++
    t1.scored += score1
    t1.conceded += score2

    t2.played++
    t2.scored += score2
    t2.conceded += score1

    if (score1 > score2) {
      t1.wins++
      t1.points += 3
      t2.losses++
    } else if (score2 > score1) {
      t2.wins++
      t2.points += 3
      t1.losses++
    } else {
      t1.draws++
      t1.points += 1
      t2.draws++
      t2.points += 1
    }
  })

  return Array.from(statsMap.values())
    .map((s) => ({
      ...s,
      diff: s.scored - s.conceded,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.diff !== a.diff) return b.diff - a.diff
      if (b.scored !== a.scored) return b.scored - a.scored
      return a.teamName.localeCompare(b.teamName)
    })
}

export default function PublicLivePage() {
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
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const loadData = useCallback(async () => {
    if (!slug) return
    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, secondary_color, background_style, has_third_place_match')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      const t = tourneyData as TournamentInfo
      setTournament(t)

      const [teamsRes, groupsRes, membersRes, matchesRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name')
          .eq('tournament_id', t.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', t.id)
          .order('id', { ascending: true }),
        supabase
          .from('group_members')
          .select('group_id, team_id')
          .eq('tournament_id', t.id),
        supabase
          .from('matches')
          .select('*')
          .eq('tournament_id', t.id)
          .order('scheduled_time', { ascending: true }),
      ])

      if (teamsRes.error) throw teamsRes.error
      if (groupsRes.error) throw groupsRes.error
      if (membersRes.error) throw membersRes.error
      if (matchesRes.error) throw matchesRes.error

      setTeams((teamsRes.data as Team[]) ?? [])
      setGroups((groupsRes.data as Group[]) ?? [])
      setMembers((membersRes.data as GroupMember[]) ?? [])
      setMatches((matchesRes.data as TournamentMatch[]) ?? [])
      setError('')
    } catch (err) {
      console.error('LIVE LOAD ERROR:', err)
      setError('Die Live-Daten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [slug, rawSlug])

  useEffect(() => {
    void loadData()
    const interval = window.setInterval(() => void loadData(), 10000)
    return () => window.clearInterval(interval)
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

  const teamsMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  )

  function getTeamName(id: number | null) {
    if (id === null) return 'Unbekannt'
    return teamsMap.get(id) || 'Unbekannt'
  }

  const liveMatches = useMemo(
    () => matches.filter(isLive),
    [matches]
  )

  const knockoutMatches = useMemo(
    () => matches.filter((m) => m.phase && KO_PHASES_LIST.includes(m.phase.toLowerCase())),
    [matches]
  )
  const hasKOStarted = knockoutMatches.length > 0

  const groupStandings = useMemo(
    () =>
      groups.map((group) => ({
        group,
        standings: calculateStandings(group.id, teams, members, matches),
      })),
    [groups, teams, members, matches]
  )

  const matchesByGroup = useMemo(() => {
    return groups.map((g) => {
      const gMatches = matches
        .filter(
          (m) =>
            m.group_id === g.id &&
            (!m.phase ||
              m.phase.toLowerCase() === 'group' ||
              !KO_PHASES_LIST.includes(m.phase.toLowerCase()))
        )
        .sort(compareMatchesByTime)

      return {
        group: g,
        matches: gMatches,
      }
    })
  }, [groups, matches])

  const matchesByKOPhase = useMemo(() => {
    return KO_PHASES_LIST.map((phase) => {
      const pMatches = knockoutMatches
        .filter((m) => m.phase?.toLowerCase() === phase)
        .sort(compareMatchesByTime)

      return {
        phase,
        phaseName: KO_PHASES_MAP[phase],
        matches: pMatches,
      }
    }).filter((group) => group.matches.length > 0)
  }, [knockoutMatches])

  const primaryColor = tournament?.primary_color?.trim() || '#2563eb'
  const secondaryColor = tournament?.secondary_color?.trim() || '#3b82f6'
  const primaryContrastText = getContrastTextColor(primaryColor)

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

  function getBracketTeamLabel(match: TournamentMatch | null, team: 1 | 2, phase: string, position: number) {
    if (!match) {
      const prevName = getPreviousPhaseName(phase)
      const sourceNum = position * 2 - (team === 1 ? 1 : 0)
      return phase === 'third_place'
        ? `Verlierer ${prevName} ${team}`
        : `Sieger ${prevName} ${sourceNum}`
    }
    const teamId = team === 1 ? match.team1_id : match.team2_id
    const name = getTeamName(teamId)
    if (!name || name === 'Unbekannt') {
      const prevName = getPreviousPhaseName(phase)
      const sourceNum = position * 2 - (team === 1 ? 1 : 0)
      return phase === 'third_place'
        ? `Verlierer ${prevName} ${team}`
        : `Sieger ${prevName} ${sourceNum}`
    }
    return name
  }

  function BracketMatchCard({ phase, position }: { phase: string; position: number }) {
    const match =
      knockoutMatches.find(
        (m) =>
          m.phase?.toLowerCase() === phase &&
          (m.knockout_position ?? m.bracket_position) === position
      ) || null

    const finished = match ? isFinished(match) : false
    const live = match ? isLive(match) : false

    const t1Winner =
      finished &&
      match?.team1_score != null &&
      match?.team2_score != null &&
      match.team1_score > match.team2_score
    const t2Winner =
      finished &&
      match?.team1_score != null &&
      match?.team2_score != null &&
      match.team2_score > match.team1_score

    const t1Name = getBracketTeamLabel(match, 1, phase, position)
    const t2Name = getBracketTeamLabel(match, 2, phase, position)
    const isFinal = phase === 'final'
    const isThirdPlace = phase === 'third_place'

    return (
      <div className="relative w-full min-w-[130px]" style={{ height: KO_CARD_HEIGHT }}>
        <div
          className={`h-full overflow-hidden rounded-2xl border shadow-lg transition flex flex-col justify-between backdrop-blur-md ${
            isFinal
              ? 'border-amber-400/80 bg-slate-900/95 ring-1 ring-amber-400/30'
              : isThirdPlace
              ? 'border-amber-600/50 bg-slate-900/90'
              : finished
              ? 'border-slate-700 bg-slate-900/90'
              : live
              ? 'border-red-500/80 bg-slate-900/95 animate-pulse'
              : match
              ? 'border-slate-700/80 bg-slate-900/80 text-slate-100'
              : 'border-dashed border-white/10 bg-slate-950/40 text-slate-500'
          }`}
          style={{
            borderColor: finished && !isFinal && !isThirdPlace ? hexToRgba(primaryColor, 0.5) : undefined,
          }}
        >
          <div
            className={`flex h-5 items-center justify-between border-b px-2 text-[8px] font-black uppercase tracking-wider whitespace-nowrap ${
              isFinal
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : isThirdPlace
                ? 'border-amber-600/30 bg-amber-600/10 text-amber-300'
                : finished
                ? 'border-slate-800 text-white'
                : live
                ? 'border-red-500/20 bg-red-500/10 text-red-300'
                : 'border-white/10 bg-slate-950/60 text-slate-400'
            }`}
            style={{
              backgroundColor: finished && !isFinal && !isThirdPlace ? hexToRgba(primaryColor, 0.15) : undefined,
              color: finished && !isFinal && !isThirdPlace ? primaryColor : undefined,
            }}
          >
            <span>{isThirdPlace ? 'Platz 3' : `Spiel #${position}`}</span>
            {live ? (
              <span className="text-red-400 font-extrabold flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE
              </span>
            ) : finished ? (
              <span className="font-extrabold" style={{ color: primaryColor }}>✓ Fertig</span>
            ) : (
              <span className="text-slate-400 font-normal">{match && formatTime(match.scheduled_time)}</span>
            )}
          </div>

          <div className="space-y-1 p-1.5">
            <div
              className={`flex h-5 items-center justify-between gap-1 rounded-md px-1.5 text-[10px] ${
                t1Winner
                  ? 'font-black ring-1'
                  : match
                  ? 'bg-slate-800/80 text-slate-200 font-bold'
                  : 'text-slate-500 font-medium'
              }`}
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
              <span className="shrink-0 font-mono font-black">{match ? match.team1_score ?? '-' : '-'}</span>
            </div>

            <div
              className={`flex h-5 items-center justify-between gap-1 rounded-md px-1.5 text-[10px] ${
                t2Winner
                  ? 'font-black ring-1'
                  : match
                  ? 'bg-slate-800/80 text-slate-200 font-bold'
                  : 'text-slate-500 font-medium'
              }`}
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
              <span className="shrink-0 font-mono font-black">{match ? match.team2_score ?? '-' : '-'}</span>
            </div>
          </div>

          <div className="flex h-4 items-center justify-between border-t border-white/10 px-2 text-[7px] font-bold text-slate-400">
            <span>{match?.table_number ? `Tisch ${match.table_number}` : 'Tisch -'}</span>
            <span>{formatTime(match?.scheduled_time) ? `${formatTime(match?.scheduled_time)} Uhr` : ''}</span>
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
    const bodyHeight = totalRows * KO_ROW_HEIGHT
    const height = bodyHeight + KO_HEADER_HEIGHT

    const isCenterConnector = outerPhase === innerPhase

    if (isCenterConnector) {
      return (
        <div className="relative w-3 shrink-0" style={{ height }} aria-hidden="true">
          <svg
            className="absolute inset-0 w-full text-slate-600"
            style={{ top: KO_HEADER_HEIGHT, height: bodyHeight }}
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
                  <line x1={xOuter} y1={outerCenter} x2={xMiddle} y2={outerCenter} stroke="currentColor" strokeWidth="1.5" />
                  <line x1={xMiddle} y1={outerCenter} x2={xMiddle} y2={centerLine} stroke="currentColor" strokeWidth="1.5" />
                  {index === 0 && (
                    <line x1={xMiddle} y1={centerLine} x2={xInner} y2={centerLine} stroke="currentColor" strokeWidth="1.5" />
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      )
    }

    return (
      <div className="relative w-3 shrink-0" style={{ height }} aria-hidden="true">
        <svg
          className="absolute inset-0 w-full text-slate-600"
          style={{ top: KO_HEADER_HEIGHT, height: bodyHeight }}
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
                <line x1={xOuter} y1={outerCenterA} x2={xMiddle} y2={outerCenterA} stroke="currentColor" strokeWidth="1.5" />
                <line x1={xOuter} y1={outerCenterB} x2={xMiddle} y2={outerCenterB} stroke="currentColor" strokeWidth="1.5" />
                <line x1={xMiddle} y1={outerCenterA} x2={xMiddle} y2={outerCenterB} stroke="currentColor" strokeWidth="1.5" />
                <line x1={xMiddle} y1={innerCenter} x2={xInner} y2={innerCenter} stroke="currentColor" strokeWidth="1.5" />
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
        className="flex min-w-[140px] flex-1 flex-col"
        style={{ height: KO_HEADER_HEIGHT + totalRows * KO_ROW_HEIGHT }}
      >
        <div
          className="flex shrink-0 items-center justify-center text-[9px] font-black uppercase tracking-wider text-slate-300 truncate px-1"
          style={{ height: KO_HEADER_HEIGHT }}
        >
          {getPhaseName(phase)}
        </div>
        <div
          className="grid flex-1 px-1"
          style={{ gridTemplateRows: `repeat(${totalRows}, ${KO_ROW_HEIGHT}px)` }}
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
    const finalMatch = knockoutMatches.find((m) => m.phase?.toLowerCase() === 'final') || null
    const thirdPlaceMatch = knockoutMatches.find((m) => m.phase?.toLowerCase() === 'third_place') || null

    if (phases.length === 0 && !finalMatch) return null

    const firstPhase = phases[0] ?? null
    const baseSideCount = firstPhase ? getBracketSideCount(firstPhase) : 1
    const totalRows = Math.max(2, baseSideCount * 2)

    const leftPhases = phases
    const rightPhases = [...phases].reverse()
    const lastLeftPhase = leftPhases[leftPhases.length - 1] ?? null
    const bracketHeight = KO_HEADER_HEIGHT + totalRows * KO_ROW_HEIGHT

    return (
      <div className="relative w-full overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-slate-800">
        <div className="min-w-[850px] w-full px-2">
          <div className="flex items-start justify-center gap-1 w-full">
            {/* LINKE HÄLFTE */}
            <div
              className="flex min-w-0 items-start"
              style={{ flex: leftPhases.length || 1 }}
            >
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

            {/* FINALE & PLATZ 3 (MITTELSPALTE) */}
            <div
              className="flex min-w-[160px] flex-[1.1] flex-col px-1"
              style={{ height: bracketHeight }}
            >
              <div
                className="flex shrink-0 items-center justify-center"
                style={{ height: KO_HEADER_HEIGHT }}
              >
                <span
                  className="rounded-md px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-sm truncate"
                  style={{ backgroundColor: primaryColor, color: primaryContrastText }}
                >
                  🏆 FINALE &amp; PLATZ 3
                </span>
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center gap-4">
                {/* FINALE */}
                <div className="w-full">
                  <div className="mb-1 flex items-center justify-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-300">
                      Das große Finale
                    </span>
                  </div>
                  <BracketMatchCard phase="final" position={1} />
                </div>

                {/* SPIEL UM PLATZ 3 */}
                {(tournament?.has_third_place_match || thirdPlaceMatch) && (
                  <div className="w-full">
                    <div className="mb-1 flex items-center justify-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-300">
                        Spiel um Platz 3
                      </span>
                    </div>
                    {thirdPlaceMatch ? (
                      <BracketMatchCard phase="third_place" position={1} />
                    ) : (
                      <div className="w-full rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-2 text-center">
                        <p className="text-[9px] font-bold text-slate-400">Spiel um Platz 3 (folgt)</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RECHTE HÄLFTE */}
            <div
              className="flex min-w-0 items-start"
              style={{ flex: rightPhases.length || 1 }}
            >
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-slate-100 bg-slate-950 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade Live-Daten …
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950 [color-scheme:dark]">
        <div className="mx-auto max-w-lg rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-center backdrop-blur-md">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-slate-100">Fehler beim Laden</h2>
          <p className="mt-1 text-xs font-semibold text-red-300">{error}</p>
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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {tournament?.logo_url ? (
                <img
                  src={tournament.logo_url}
                  alt={tournament.name}
                  className="h-12 w-12 rounded-2xl object-contain bg-slate-950/60 p-1 border border-white/10"
                />
              ) : (
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black shadow-lg"
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
                  Echtzeit Arena
                </span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {tournament?.name || 'Live-Spielplan & Ergebnisse'}
                </h1>
              </div>
            </div>
            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold"
              style={{
                backgroundColor: hexToRgba(primaryColor, 0.15),
                borderColor: hexToRgba(primaryColor, 0.3),
                color: primaryColor,
              }}
            >
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
              Live Sync
            </span>
          </div>
          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">
            Alle aktuellen Gruppentabellen, Begegnungen und K.-o.-Spiele in Echtzeit.
          </p>
        </section>

        {/* LAUFENDE SPIELE (WENN VORHANDEN) */}
        {liveMatches.length > 0 && (
          <section className="rounded-[32px] border border-red-500/40 bg-red-950/30 p-6 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
              <h2 className="text-lg font-black text-red-400">
                Laufende Spiele ({liveMatches.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveMatches.map((match) => (
                <article
                  key={match.id}
                  className="rounded-2xl border border-red-500/40 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md space-y-3"
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-red-500/20 border border-red-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-red-300">
                        LIVE
                      </span>
                      {formatTime(match.scheduled_time) && (
                        <span className="text-[10px] font-mono font-bold text-red-400">
                          ⏰ {formatTime(match.scheduled_time)} Uhr
                        </span>
                      )}
                    </div>
                    {match.table_number && (
                      <span className="text-slate-300 font-mono">
                        Tisch {match.table_number}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between font-black text-sm text-white">
                      <span className="truncate">{getTeamName(match.team1_id)}</span>
                      <span className="text-base font-mono font-black" style={{ color: primaryColor }}>
                        {match.team1_score ?? '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-black text-sm text-white">
                      <span className="truncate">{getTeamName(match.team2_id)}</span>
                      <span className="text-base font-mono font-black" style={{ color: primaryColor }}>
                        {match.team2_score ?? '-'}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* K.-O.-BRACKET / TURNIERBAUM */}
        {hasKOStarted && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
              <span className="text-2xl">🌳</span>
              <div>
                <h2 className="text-xl font-black text-white">
                  K.-o.-Phase Turnierbaum
                </h2>
                <p className="text-xs text-slate-300 font-medium">Der direkte Weg ins Finale und zum Spiel um Platz 3.</p>
              </div>
            </div>
            <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-2xl backdrop-blur-xl overflow-hidden">
              <KnockoutBracket />
            </div>
          </section>
        )}

        {/* GRUPPENTABELLEN */}
        {groupStandings.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
              <span className="text-xl">📊</span>
              <h2 className="text-xl font-black text-white">
                Gruppentabellen
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {groupStandings.map(({ group, standings }) => (
                <div key={group.id} className="rounded-[32px] border border-white/10 bg-slate-900/80 overflow-hidden shadow-2xl backdrop-blur-xl space-y-4 p-5 sm:p-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      {group.name}
                    </h3>
                    <span className="text-[10px] font-bold text-slate-300">
                      {standings.length} Teams
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-[10px] font-black uppercase text-slate-400">
                          <th className="py-2 px-1 text-center">#</th>
                          <th className="py-2 px-1">Team</th>
                          <th className="py-2 px-1 text-center" title="Spiele">Sp</th>
                          <th className="py-2 px-1 text-center" style={{ color: primaryColor }} title="Siege">S</th>
                          <th className="py-2 px-1 text-center text-amber-300" title="Unentschieden">U</th>
                          <th className="py-2 px-1 text-center text-red-300" title="Niederlagen">N</th>
                          <th className="py-2 px-1 text-center" title="Tore">Tore</th>
                          <th className="py-2 px-1 text-center" title="Differenz">Diff</th>
                          <th className="py-2 px-1 text-right font-black text-white" title="Punkte">Pkt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 font-bold text-slate-200">
                        {standings.map((st, idx) => {
                          const isQualified = idx < 2
                          return (
                            <tr
                              key={st.teamId}
                              className="transition"
                              style={
                                isQualified
                                  ? {
                                      backgroundColor: hexToRgba(primaryColor, 0.12),
                                    }
                                  : undefined
                              }
                            >
                              <td className="py-2.5 px-1 text-center font-mono">
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black"
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
                              <td className="py-2.5 px-1 font-extrabold text-white truncate max-w-[150px]">
                                {st.teamName}
                              </td>
                              <td className="py-2.5 px-1 text-center font-mono text-slate-400">{st.played}</td>
                              <td className="py-2.5 px-1 text-center font-mono" style={{ color: primaryColor }}>
                                {st.wins}
                              </td>
                              <td className="py-2.5 px-1 text-center font-mono text-amber-300">{st.draws}</td>
                              <td className="py-2.5 px-1 text-center font-mono text-red-300">{st.losses}</td>
                              <td className="py-2.5 px-1 text-center font-mono text-slate-300">
                                {st.scored}:{st.conceded}
                              </td>
                              <td className="py-2.5 px-1 text-center font-mono font-black">
                                <span
                                  className={
                                    st.diff > 0 ? 'text-emerald-400' : st.diff < 0 ? 'text-red-400' : 'text-slate-400'
                                  }
                                >
                                  {st.diff > 0 ? `+${st.diff}` : st.diff}
                                </span>
                              </td>
                              <td
                                className="py-2.5 px-1 text-right font-mono font-black text-sm text-white"
                              >
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
          </section>
        )}

        {/* SPIELPLAN UNTERGLIEDERT NACH GRUPPEN */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 px-1">
            <span className="text-xl">📅</span>
            <h2 className="text-xl font-black text-white">
              Spielplan nach Gruppen
            </h2>
          </div>

          <div className="space-y-4">
            {matchesByGroup.map(({ group, matches: gMatches }) => {
              const sectionKey = `group-${group.id}`
              const isCollapsed = collapsedSections[sectionKey] ?? false

              return (
                <div key={group.id} className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-4">
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionKey)}
                    className="flex w-full items-center justify-between text-left transition hover:opacity-80"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black shadow-md"
                        style={{ backgroundColor: primaryColor, color: primaryContrastText }}
                      >
                        {group.name.replace(/gruppe\s*/i, '').trim().charAt(0) || 'G'}
                      </span>
                      <h3 className="text-base font-black text-white">
                        {group.name}
                      </h3>
                      <span className="text-[10px] font-bold text-slate-300">
                        {gMatches.length} {gMatches.length === 1 ? 'Spiel' : 'Spiele'}
                      </span>
                    </div>
                    <span className="text-slate-400 font-bold text-xs">
                      {isCollapsed ? '▼ Ausklappen' : '▲ Einklappen'}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="pt-2 border-t border-white/10">
                      {gMatches.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {gMatches.map((match) => {
                            const finished = isFinished(match)
                            const live = isLive(match)
                            const formattedMatchTime = formatTime(match.scheduled_time)
                            const t1Win = finished && match.team1_score != null && match.team2_score != null && match.team1_score > match.team2_score
                            const t2Win = finished && match.team1_score != null && match.team2_score != null && match.team2_score > match.team1_score

                            return (
                              <article
                                key={match.id}
                                className={`rounded-2xl border p-4 transition shadow-md backdrop-blur-md ${
                                  live
                                    ? 'border-red-500/80 bg-slate-900/95 animate-pulse'
                                    : finished
                                    ? 'bg-slate-900/90'
                                    : 'border-white/10 bg-slate-900/70'
                                }`}
                                style={{
                                  borderColor: finished ? hexToRgba(primaryColor, 0.4) : undefined,
                                  backgroundColor: finished ? hexToRgba(primaryColor, 0.08) : undefined,
                                }}
                              >
                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-300">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-slate-300 font-bold">
                                      ⏰ {formattedMatchTime ? `${formattedMatchTime} Uhr` : 'Zeit k.A.'}
                                    </span>
                                    {live && (
                                      <span className="text-red-400 font-black animate-pulse flex items-center gap-1">
                                        • LIVE
                                      </span>
                                    )}
                                    {finished && (
                                      <span style={{ color: primaryColor }} className="font-bold">
                                        • ✓ Beendet
                                      </span>
                                    )}
                                  </div>
                                  {match.table_number != null && (
                                    <span className="font-mono" style={{ color: primaryColor }}>Tisch {match.table_number}</span>
                                  )}
                                </div>

                                <div className="mt-3 space-y-1.5 text-xs font-extrabold text-white">
                                  <div
                                    className={`flex items-center justify-between rounded-lg px-2 py-1 ${
                                      t1Win ? 'font-black' : 'bg-slate-800/50'
                                    }`}
                                    style={
                                      t1Win
                                        ? {
                                            backgroundColor: hexToRgba(primaryColor, 0.25),
                                            color: '#ffffff',
                                          }
                                        : undefined
                                    }
                                  >
                                    <span className="truncate max-w-[150px]">{getTeamName(match.team1_id)}</span>
                                    <span className="font-mono font-black text-sm">
                                      {match.team1_score ?? '-'}
                                    </span>
                                  </div>
                                  <div
                                    className={`flex items-center justify-between rounded-lg px-2 py-1 ${
                                      t2Win ? 'font-black' : 'bg-slate-800/50'
                                    }`}
                                    style={
                                      t2Win
                                        ? {
                                            backgroundColor: hexToRgba(primaryColor, 0.25),
                                            color: '#ffffff',
                                          }
                                        : undefined
                                    }
                                  >
                                    <span className="truncate max-w-[150px]">{getTeamName(match.team2_id)}</span>
                                    <span className="font-mono font-black text-sm">
                                      {match.team2_score ?? '-'}
                                    </span>
                                  </div>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center text-xs font-bold text-slate-400 py-4">
                          Keine Spiele für diese Gruppe angesetzt.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* SPIELPLAN UNTERGLIEDERT NACH K.-O.-PHASEN */}
        {matchesByKOPhase.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
              <span className="text-xl">⚔️</span>
              <h2 className="text-xl font-black text-white">
                K.-o.-Phase Spiele
              </h2>
            </div>

            <div className="space-y-4">
              {matchesByKOPhase.map(({ phase, phaseName, matches: pMatches }) => {
                const sectionKey = `ko-${phase}`
                const isCollapsed = collapsedSections[sectionKey] ?? false

                return (
                  <div key={phase} className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-4">
                    <button
                      type="button"
                      onClick={() => toggleSection(sectionKey)}
                      className="flex w-full items-center justify-between text-left transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-xs font-black text-amber-400">
                          🏆
                        </span>
                        <h3 className="text-base font-black text-white">
                          {phaseName}
                        </h3>
                        <span className="text-[10px] font-bold text-slate-300">
                          {pMatches.length} {pMatches.length === 1 ? 'Spiel' : 'Spiele'}
                        </span>
                      </div>
                      <span className="text-slate-400 font-bold text-xs">
                        {isCollapsed ? '▼ Ausklappen' : '▲ Einklappen'}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="pt-2 border-t border-white/10">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {pMatches.map((match) => {
                            const finished = isFinished(match)
                            const live = isLive(match)
                            const formattedMatchTime = formatTime(match.scheduled_time)
                            const t1Win = finished && match.team1_score != null && match.team2_score != null && match.team1_score > match.team2_score
                            const t2Win = finished && match.team1_score != null && match.team2_score != null && match.team2_score > match.team1_score

                            return (
                              <article
                                key={match.id}
                                className={`rounded-2xl border p-4 transition shadow-md backdrop-blur-md ${
                                  live
                                    ? 'border-red-500/80 bg-slate-900/95 animate-pulse'
                                    : finished
                                    ? 'bg-slate-900/90'
                                    : 'border-white/10 bg-slate-900/70'
                                }`}
                                style={{
                                  borderColor: finished ? hexToRgba(primaryColor, 0.4) : undefined,
                                  backgroundColor: finished ? hexToRgba(primaryColor, 0.08) : undefined,
                                }}
                              >
                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-300">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-slate-300 font-bold">
                                      ⏰ {formattedMatchTime ? `${formattedMatchTime} Uhr` : 'Zeit k.A.'}
                                    </span>
                                    {live && (
                                      <span className="text-red-400 font-black animate-pulse flex items-center gap-1">
                                        • LIVE
                                      </span>
                                    )}
                                    {finished && (
                                      <span style={{ color: primaryColor }} className="font-bold">
                                        • ✓ Beendet
                                      </span>
                                    )}
                                  </div>
                                  {match.table_number != null && (
                                    <span className="font-mono" style={{ color: primaryColor }}>Tisch {match.table_number}</span>
                                  )}
                                </div>

                                <div className="mt-3 space-y-1.5 text-xs font-extrabold text-white">
                                  <div
                                    className={`flex items-center justify-between rounded-lg px-2 py-1 ${
                                      t1Win ? 'font-black' : 'bg-slate-800/50'
                                    }`}
                                    style={
                                      t1Win
                                        ? {
                                            backgroundColor: hexToRgba(primaryColor, 0.25),
                                            color: '#ffffff',
                                          }
                                        : undefined
                                    }
                                  >
                                    <span className="truncate max-w-[150px]">{getTeamName(match.team1_id)}</span>
                                    <span className="font-mono font-black text-sm">
                                      {match.team1_score ?? '-'}
                                    </span>
                                  </div>
                                  <div
                                    className={`flex items-center justify-between rounded-lg px-2 py-1 ${
                                      t2Win ? 'font-black' : 'bg-slate-800/50'
                                    }`}
                                    style={
                                      t2Win
                                        ? {
                                            backgroundColor: hexToRgba(primaryColor, 0.25),
                                            color: '#ffffff',
                                          }
                                        : undefined
                                    }
                                  >
                                    <span className="truncate max-w-[150px]">{getTeamName(match.team2_id)}</span>
                                    <span className="font-mono font-black text-sm">
                                      {match.team2_score ?? '-'}
                                    </span>
                                  </div>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}