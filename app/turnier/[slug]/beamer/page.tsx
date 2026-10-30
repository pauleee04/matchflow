'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type Tournament = {
  id: number
  name: string
  slug: string
  primary_color: string | null
  secondary_color: string | null
  background_style: string | null
  logo_url: string | null
  event_date: string | null
  location: string | null
  has_third_place_match?: boolean | null
}

type Team = { id: number; name: string }
type Group = { id: number; name: string }
type GroupMember = { group_id: number; team_id: number }

type Match = {
  id: number
  tournament_id?: number | null
  group_id: number | null
  team1_id: number | null
  team2_id: number | null
  table_number: number | null
  scheduled_time: string | null
  phase: string | null
  team1_score: number | null
  team2_score: number | null
  status: string | null
  bracket_position: number | null
  source_match1_id: number | null
  source_match2_id: number | null
  bracket_side: string | null
  qualification_source: string | null
  team1_source: string | null
  team2_source: string | null
  knockout_round: number | null
  knockout_position: number | null
  knockout_bracket_side: string | null
  round_number: number | null
  next_match_id: number | null
}

type Standing = {
  teamId: number
  teamName: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  scored: number
  conceded: number
  difference: number
}

const REFRESH_MS = 10_000
const SLIDE_MS = 15_000

const PHASES: Record<string, { label: string; order: number }> = {
  round_of_32: { label: 'Sechzehntelfinale', order: 1 },
  round_of_16: { label: 'Achtelfinale', order: 2 },
  quarter_final: { label: 'Viertelfinale', order: 3 },
  semi_final: { label: 'Halbfinale', order: 4 },
  third_place: { label: 'Spiel um Platz 3', order: 4.5 },
  final: { label: 'Finale', order: 5 },
}

function phaseInfo(match: Match) {
  const phase = (match.phase || '').toLowerCase()
  if (PHASES[phase]) return PHASES[phase]

  const round = match.knockout_round ?? match.round_number
  if (round === 1) return { label: 'Sechzehntelfinale', order: 1 }
  if (round === 2) return { label: 'Achtelfinale', order: 2 }
  if (round === 3) return { label: 'Viertelfinale', order: 3 }
  if (round === 4) return { label: 'Halbfinale', order: 4 }
  if (round === 5) return { label: 'Finale', order: 5 }

  return { label: 'K.-o.-Runde', order: 50 }
}

function timeValue(match: Match) {
  if (!match.scheduled_time) return Number.MAX_SAFE_INTEGER
  const time = new Date(match.scheduled_time).getTime()
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time
}

function chronologicalSort(a: Match, b: Match) {
  return (
    timeValue(a) - timeValue(b) ||
    (a.table_number ?? Number.MAX_SAFE_INTEGER) - (b.table_number ?? Number.MAX_SAFE_INTEGER) ||
    a.id - b.id
  )
}

function tableSort(a: Match, b: Match) {
  return (
    (a.table_number ?? Number.MAX_SAFE_INTEGER) - (b.table_number ?? Number.MAX_SAFE_INTEGER) ||
    timeValue(a) - timeValue(b) ||
    a.id - b.id
  )
}

function formatTime(value: string | null) {
  if (!value) return 'Zeit offen'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function BeamerPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''

  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)
  const [darkMode, setDarkMode] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(
    async (showLoading = false) => {
      if (!slug) return
      if (showLoading) setLoading(true)

      try {
        const { data: tourneyData } = await supabase
          .from('tournaments')
          .select('id, name, slug, primary_color, secondary_color, background_style, logo_url, event_date, location, has_third_place_match')
          .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
          .maybeSingle()

        if (!tourneyData) {
          setError('Turnier nicht gefunden.')
          setLoading(false)
          return
        }

        const tId = tourneyData.id

        const [teamsResult, groupsResult, membersResult, matchesResult] = await Promise.all([
          supabase.from('teams').select('id, name').eq('tournament_id', tId).order('created_at', { ascending: true }),
          supabase.from('groups').select('id, name').eq('tournament_id', tId).order('id', { ascending: true }),
          supabase.from('group_members').select('group_id, team_id').eq('tournament_id', tId),
          supabase.from('matches').select('*').eq('tournament_id', tId).order('scheduled_time', { ascending: true }),
        ])

        const firstError = teamsResult.error || groupsResult.error || membersResult.error || matchesResult.error
        if (firstError) throw firstError

        setTournament(tourneyData as Tournament)
        setTeams((teamsResult.data as Team[] | null) ?? [])
        setGroups((groupsResult.data as Group[] | null) ?? [])
        setMembers((membersResult.data as GroupMember[] | null) ?? [])
        setMatches((matchesResult.data as Match[] | null) ?? [])
        setError('')
        setLastUpdated(new Date())
      } catch (e) {
        console.error('Beamer-Daten konnten nicht geladen werden:', e)
        setError('Die Turnierdaten konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    },
    [slug, rawSlug]
  )

  useEffect(() => {
    void loadData(true)
    const interval = window.setInterval(() => void loadData(), REFRESH_MS)

    const channel = supabase
      .channel('beamer-live-refresh')
      .on('broadcast', { event: 'refresh' }, () => void loadData())
      .subscribe()

    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams])

  const isKnockoutMatch = useCallback((match: Match) => {
    const phase = (match.phase ?? '').toLowerCase()
    return Boolean(
      PHASES[phase] ||
        match.knockout_round !== null ||
        match.knockout_position !== null ||
        match.round_number !== null ||
        match.source_match1_id !== null ||
        match.source_match2_id !== null ||
        match.knockout_bracket_side !== null ||
        match.qualification_source === 'knockout_qualification' ||
        (match.group_id === null && phase !== 'group')
    )
  }, [])

  const groupMatchList = useMemo(
    () => matches.filter((match) => !isKnockoutMatch(match) && (match.phase === 'group' || match.group_id !== null)).sort(chronologicalSort),
    [matches, isKnockoutMatch]
  )

  const knockoutMatches = useMemo(() => matches.filter(isKnockoutMatch), [matches, isKnockoutMatch])
  const knockoutCreated = knockoutMatches.length > 0

  const firstKORoundOrder = useMemo(() => {
    const knownOrders = knockoutMatches.map((match) => phaseInfo(match).order).filter((order) => order >= 1 && order <= 5)
    return knownOrders.length > 0 ? Math.min(...knownOrders) : null
  }, [knockoutMatches])

  const displayNumbers = useMemo(() => {
    const result = new Map<number, number>()
    const orderedGroupMatches = [...groupMatchList].sort(chronologicalSort)

    orderedGroupMatches.forEach((match, index) => {
      result.set(match.id, index + 1)
    })

    const roundMatchCounts: Record<number, number> = { 1: 16, 2: 8, 3: 4, 4: 2, 5: 1 }

    const orderedKOMatches = [...knockoutMatches].sort((a, b) => {
      const roundDifference = phaseInfo(a).order - phaseInfo(b).order
      if (roundDifference !== 0) return roundDifference
      const positionA = a.knockout_position ?? a.bracket_position ?? Number.MAX_SAFE_INTEGER
      const positionB = b.knockout_position ?? b.bracket_position ?? Number.MAX_SAFE_INTEGER
      return positionA - positionB || a.id - b.id
    })

    orderedKOMatches.forEach((match, fallbackIndex) => {
      const order = phaseInfo(match).order
      const position = match.knockout_position ?? match.bracket_position ?? fallbackIndex + 1

      if (firstKORoundOrder !== null && order >= firstKORoundOrder && order <= 5) {
        let offset = 0
        for (let priorOrder = firstKORoundOrder; priorOrder < order; priorOrder++) {
          offset += roundMatchCounts[priorOrder] ?? 0
        }
        result.set(match.id, orderedGroupMatches.length + offset + position)
      } else {
        result.set(match.id, orderedGroupMatches.length + fallbackIndex + 1)
      }
    })

    return result
  }, [groupMatchList, knockoutMatches, firstKORoundOrder])

  const standingsByGroup = useMemo(
    () =>
      groups.map((group) => {
        const groupTeamIds = members.filter((member) => member.group_id === group.id).map((member) => member.team_id)
        const standings: Standing[] = groupTeamIds.map((teamId) => ({
          teamId,
          teamName: teamMap.get(teamId) ?? `Team ${teamId}`,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          scored: 0,
          conceded: 0,
          difference: 0,
        }))

        const standingMap = new Map(standings.map((standing) => [standing.teamId, standing]))

        for (const match of groupMatchList) {
          if (
            match.group_id !== group.id ||
            match.status !== 'finished' ||
            match.team1_id == null ||
            match.team2_id == null ||
            match.team1_score == null ||
            match.team2_score == null
          ) {
            continue
          }

          const one = standingMap.get(match.team1_id)
          const two = standingMap.get(match.team2_id)
          if (!one || !two) continue

          one.played += 1
          two.played += 1
          one.scored += match.team1_score
          one.conceded += match.team2_score
          two.scored += match.team2_score
          two.conceded += match.team1_score

          if (match.team1_score > match.team2_score) {
            one.wins += 1
            one.points += 3
            two.losses += 1
          } else if (match.team2_score > match.team1_score) {
            two.wins += 1
            two.points += 3
            one.losses += 1
          } else {
            one.draws += 1
            two.draws += 1
            one.points += 1
            two.points += 1
          }
        }

        for (const standing of standings) {
          standing.difference = standing.scored - standing.conceded
        }

        standings.sort(
          (a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored || a.teamName.localeCompare(b.teamName, 'de')
        )

        return { ...group, standings }
      }),
    [groups, members, groupMatchList, teamMap]
  )

  const upcomingGroupMatches = useMemo(
    () => groupMatchList.filter((match) => match.status !== 'finished').sort(tableSort),
    [groupMatchList]
  )

  const upcomingKOMatches = useMemo(
    () =>
      knockoutMatches
        .filter((match) => match.status !== 'finished')
        .sort((a, b) => {
          const timeDifference = timeValue(a) - timeValue(b)
          if (timeDifference !== 0) return timeDifference
          return (
            (a.table_number ?? Number.MAX_SAFE_INTEGER) - (b.table_number ?? Number.MAX_SAFE_INTEGER) ||
            (displayNumbers.get(a.id) ?? a.id) - (displayNumbers.get(b.id) ?? b.id)
          )
        }),
    [knockoutMatches, displayNumbers]
  )

  const allGroupMatchesFinished = groupMatchList.length > 0 && groupMatchList.every((match) => match.status === 'finished')
  const isGroupStageOnly = !knockoutCreated

  const slides = useMemo(
    () => (isGroupStageOnly ? (['standings', 'groupMatches'] as const) : (['bracket', 'koMatches'] as const)),
    [isGroupStageOnly]
  )

  useEffect(() => {
    setSlideIndex(0)
  }, [isGroupStageOnly, knockoutCreated])

  useEffect(() => {
    const interval = window.setInterval(() => setSlideIndex((current) => (current + 1) % slides.length), SLIDE_MS)
    return () => window.clearInterval(interval)
  }, [slides.length])

  const currentSlide = slides[slideIndex % slides.length]

  const primary = tournament?.primary_color || '#f59e0b'
  const backgroundStyle = tournament?.background_style || 'dark'

  const backgroundClass = darkMode
    ? backgroundStyle === 'festival'
      ? 'bg-gradient-to-br from-fuchsia-950 via-slate-950 to-amber-950'
      : backgroundStyle === 'biergarten'
      ? 'bg-gradient-to-br from-emerald-950 via-green-950 to-amber-950'
      : backgroundStyle === 'blue'
      ? 'bg-gradient-to-br from-blue-950 via-slate-950 to-cyan-950'
      : 'bg-slate-950'
    : backgroundStyle === 'festival'
    ? 'bg-gradient-to-br from-fuchsia-50 via-white to-amber-50'
    : backgroundStyle === 'biergarten'
    ? 'bg-gradient-to-br from-emerald-50 via-white to-amber-50'
    : backgroundStyle === 'blue'
    ? 'bg-gradient-to-br from-blue-50 via-white to-cyan-50'
    : 'bg-slate-100'

  const textMain = darkMode ? 'text-white' : 'text-slate-950'
  const textMuted = darkMode ? 'text-slate-300' : 'text-slate-600'
  const panelClass = darkMode ? 'border-slate-700 bg-slate-900/75' : 'border-slate-300 bg-white/75'
  const panelStyle = { borderColor: darkMode ? 'rgba(148,163,184,.35)' : 'rgba(71,85,105,.25)' }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setFullscreen(true)
      } else {
        await document.exitFullscreen()
        setFullscreen(false)
      }
    } catch (e) {
      console.error('Vollbild-Fehler:', e)
    }
  }

  function teamName(id: number | null) {
    return id == null ? 'Noch offen' : teamMap.get(id) ?? `Team ${id}`
  }

  function MatchCard({ match, knockout = false }: { match: Match; knockout?: boolean }) {
    const finished = match.status === 'finished'
    const live = match.status === 'live' || match.status === 'in_progress'

    const team1Winner = finished && match.team1_score != null && match.team2_score != null && match.team1_score > match.team2_score
    const team2Winner = finished && match.team1_score != null && match.team2_score != null && match.team2_score > match.team1_score
    const number = displayNumbers.get(match.id)

    return (
      <article className={`relative overflow-hidden rounded-2xl border p-3 shadow-lg backdrop-blur-sm ${panelClass}`} style={panelStyle}>
        <div className="relative z-10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-black ${
                live ? 'bg-red-500/20 text-red-500' : finished ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'
              }`}
            >
              {live ? '● LIVE' : finished ? 'BEENDET' : knockout ? phaseInfo(match).label : 'GRUPPENSPIEL'}
            </span>
            <span className={`text-sm font-bold ${textMuted}`}>{match.table_number ? `Tisch ${match.table_number}` : 'Tisch offen'}</span>
          </div>

          <div className={`mb-1 flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${team1Winner ? 'bg-emerald-500/15' : darkMode ? 'bg-slate-800/85' : 'bg-slate-100/85'}`}>
            <span className={`min-w-0 break-words text-lg ${team1Winner ? 'font-black text-emerald-500' : 'font-bold'}`}>
              {teamName(match.team1_id)}
            </span>
            <span className="text-2xl font-black tabular-nums">{match.team1_score ?? '–'}</span>
          </div>

          <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${darkMode ? 'border-white/10' : 'border-slate-100'} ${team2Winner ? 'bg-emerald-500/15' : darkMode ? 'bg-slate-800/85' : 'bg-slate-100/85'}`}>
            <span className={`min-w-0 break-words text-lg ${team2Winner ? 'font-black text-emerald-500' : 'font-bold'}`}>
              {teamName(match.team2_id)}
            </span>
            <span className="text-2xl font-black tabular-nums">{match.team2_score ?? '–'}</span>
          </div>

          <div className={`mt-2 flex items-center justify-between gap-2 text-sm font-semibold ${textMuted}`}>
            <span>{number ? `Spiel ${number}` : 'Spielnummer offen'} · {formatTime(match.scheduled_time)}</span>
            <span>{finished ? 'Beendet' : live ? 'Läuft gerade' : 'Ausstehend'}</span>
          </div>
        </div>
      </article>
    )
  }

  function BracketCard({
    match,
    featured = false,
    team1Label,
    team2Label,
    displayNumber,
  }: {
    match: Match
    featured?: boolean
    team1Label?: string
    team2Label?: string
    displayNumber?: number
  }) {
    const finished = match.status === 'finished'
    const live = match.status === 'live' || match.status === 'in_progress'

    const oneWon = finished && match.team1_score != null && match.team2_score != null && match.team1_score > match.team2_score
    const twoWon = finished && match.team1_score != null && match.team2_score != null && match.team2_score > match.team1_score

    const number = displayNumber ?? displayNumbers.get(match.id)
    const displayedTeam1 = team1Label ?? (match.team1_id == null ? match.team1_source ?? 'Noch offen' : teamName(match.team1_id))
    const displayedTeam2 = team2Label ?? (match.team2_id == null ? match.team2_source ?? 'Noch offen' : teamName(match.team2_id))
    const isThirdPlaceMatch = match.phase === 'third_place'

    return (
      <article
        className={`relative w-full overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm ${darkMode ? 'bg-slate-950/85' : 'bg-white/85'}`}
        style={{
          borderColor: featured ? primary : isThirdPlaceMatch ? '#d97706' : panelStyle.borderColor,
          boxShadow: featured ? `0 0 0 1px ${primary}55, 0 12px 34px ${primary}20` : undefined,
        }}
      >
        <div className={`flex h-6 items-center justify-between gap-1 border-b px-2 text-[9px] font-black uppercase tracking-[.12em] ${darkMode ? 'border-white/10 bg-white/[.045]' : 'border-slate-200 bg-slate-50/80'}`}>
          <span className="truncate">{featured ? '🏆 FINALE' : isThirdPlaceMatch ? '🥉 PLATZ 3' : number ? `SPIEL ${number}` : 'K.-O.-SPIEL'}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {match.table_number ? <span>T{match.table_number}</span> : null}
            {live ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
          </span>
        </div>

        <div className={`flex min-h-[25px] items-center justify-between gap-1 px-2 py-1 ${oneWon ? 'bg-emerald-500/15' : ''}`}>
          <span className={`min-w-0 flex-1 truncate text-[clamp(9px,0.72vw,13px)] leading-tight ${oneWon ? 'font-black text-emerald-500' : 'font-semibold'}`} title={displayedTeam1}>
            {displayedTeam1}
          </span>
          <span className={`min-w-[20px] rounded px-1 py-0.5 text-center text-[clamp(10px,0.8vw,14px)] font-black tabular-nums ${oneWon ? 'bg-emerald-500 text-white' : darkMode ? 'bg-white/10' : 'bg-slate-100'}`}>
            {match.team1_score ?? '–'}
          </span>
        </div>

        <div className={`flex min-h-[25px] items-center justify-between gap-1 border-t px-2 py-1 ${darkMode ? 'border-white/10' : 'border-slate-100'} ${twoWon ? 'bg-emerald-500/15' : ''}`}>
          <span className={`min-w-0 flex-1 truncate text-[clamp(9px,0.72vw,13px)] leading-tight ${twoWon ? 'font-black text-emerald-500' : 'font-semibold'}`} title={displayedTeam2}>
            {displayedTeam2}
          </span>
          <span className={`min-w-[20px] rounded px-1 py-0.5 text-center text-[clamp(10px,0.8vw,14px)] font-black tabular-nums ${twoWon ? 'bg-emerald-500 text-white' : darkMode ? 'bg-white/10' : 'bg-slate-100'}`}>
            {match.team2_score ?? '–'}
          </span>
        </div>
      </article>
    )
  }

  function BracketView() {
    const roundDefinitions = Object.entries(PHASES)
      .map(([phase, info]) => ({ phase, ...info }))
      .sort((a, b) => a.order - b.order)

    const earliestOrder = firstKORoundOrder ?? 3
    const sideRoundDefinitions = roundDefinitions.filter((round) => round.order >= earliestOrder && round.order < 5)

    const expectedMatchCounts: Record<number, number> = { 1: 16, 2: 8, 3: 4, 4: 2 }

    const getBracketNumber = (phase: string, position: number) => {
      const order = PHASES[phase]?.order
      if (order === undefined) return position
      let offset = 0
      for (let roundOrder = earliestOrder; roundOrder < order; roundOrder++) {
        offset += expectedMatchCounts[roundOrder] ?? (roundOrder === 5 ? 1 : 0)
      }
      return groupMatchList.length + offset + position
    }

    const sideRounds = sideRoundDefinitions.map((definition) => {
      const actualMatches = knockoutMatches
        .filter((match) => phaseInfo(match).order === definition.order)
        .sort((a, b) => (a.knockout_position ?? a.bracket_position ?? a.id) - (b.knockout_position ?? b.bracket_position ?? b.id))

      const expectedCount = expectedMatchCounts[definition.order] ?? actualMatches.length
      const actualByPosition = new Map<number, Match>()

      actualMatches.forEach((match, index) => {
        const position = match.knockout_position ?? match.bracket_position ?? index + 1
        actualByPosition.set(position, match)
      })

      const completeMatches: Match[] = Array.from({ length: Math.max(expectedCount, actualMatches.length) }, (_, index) => {
        const position = index + 1
        const existing = actualByPosition.get(position)
        if (existing) return existing

        return {
          id: -(definition.order * 1000 + position),
          group_id: null,
          team1_id: null,
          team2_id: null,
          table_number: null,
          scheduled_time: null,
          phase: definition.phase,
          team1_score: null,
          team2_score: null,
          status: 'scheduled',
          bracket_position: position,
          source_match1_id: null,
          source_match2_id: null,
          bracket_side: position <= Math.ceil(expectedCount / 2) ? 'left' : 'right',
          qualification_source: null,
          team1_source: null,
          team2_source: null,
          knockout_round: definition.order,
          knockout_position: position,
          knockout_bracket_side: position <= Math.ceil(expectedCount / 2) ? 'left' : 'right',
          round_number: definition.order,
          next_match_id: null,
        }
      })

      const left: Match[] = []
      const right: Match[] = []

      completeMatches.forEach((match, index) => {
        const side = (match.knockout_bracket_side ?? match.bracket_side ?? '').toLowerCase().trim()
        const chosenSide = side === 'left' || side === 'right' ? side : index < Math.ceil(completeMatches.length / 2) ? 'left' : 'right'
        if (chosenSide === 'left') left.push(match)
        else right.push(match)
      })

      right.reverse()
      return { ...definition, label: definition.label, matches: completeMatches, left, right }
    })

    const finalMatch = knockoutMatches.find((m) => m.phase === 'final') || null
    const hasThirdPlaceOpt = tournament?.has_third_place_match || knockoutMatches.some((m) => m.phase === 'third_place')
    const thirdPlaceMatch = knockoutMatches.find((m) => m.phase === 'third_place') || (hasThirdPlaceOpt ? {
      id: -999,
      group_id: null,
      team1_id: null,
      team2_id: null,
      table_number: null,
      scheduled_time: null,
      phase: 'third_place',
      team1_score: null,
      team2_score: null,
      status: 'scheduled',
      bracket_position: 1,
      source_match1_id: null,
      source_match2_id: null,
      bracket_side: null,
      qualification_source: null,
      team1_source: 'Verlierer Halbfinale 1',
      team2_source: 'Verlierer Halbfinale 2',
      knockout_round: 4.5,
      knockout_position: 1,
      knockout_bracket_side: null,
      round_number: 4.5,
      next_match_id: null,
    } : null)

    const outerCount = Math.max(sideRounds[0]?.left.length ?? 0, sideRounds[0]?.right.length ?? 0, 1)
    const rowCount = Math.max(2, 2 ** Math.ceil(Math.log2(outerCount)) * 2)

    const sideCount = sideRounds.length
    const columnCount = sideCount * 2 + 1
    const centerColumn = sideCount + 1
    const baseSpan = rowCount / Math.max(1, outerCount)

    const roundSpan = (roundIndex: number) => Math.min(rowCount, baseSpan * 2 ** roundIndex)
    const rowStart = (index: number, roundIndex: number) => Math.min(rowCount - roundSpan(roundIndex) + 1, index * roundSpan(roundIndex) + 1)
    const centerY = (index: number, roundIndex: number) => ((rowStart(index, roundIndex) - 1 + roundSpan(roundIndex) / 2) / rowCount) * 1000
    const columnEdgeX = (column: number, direction: 'left' | 'right') => ((column + (direction === 'right' ? 0.9 : 0.1)) / columnCount) * 1000

    const paths: Array<{ key: string; d: string }> = []
    const addConnector = (key: string, fromColumn: number, fromIndex: number, fromRound: number, toColumn: number, toY: number) => {
      const fromY = centerY(fromIndex, fromRound)
      const rightward = toColumn > fromColumn
      const x1 = columnEdgeX(fromColumn, rightward ? 'right' : 'left')
      const x2 = columnEdgeX(toColumn, rightward ? 'left' : 'right')
      const bendX = (x1 + x2) / 2
      paths.push({ key, d: `M ${x1} ${fromY} H ${bendX} V ${toY} H ${x2}` })
    }

    for (let roundIndex = 0; roundIndex < sideRounds.length - 1; roundIndex++) {
      for (const side of ['left', 'right'] as const) {
        const sources = sideRounds[roundIndex][side]
        const targets = sideRounds[roundIndex + 1][side]
        const sourceColumn = side === 'left' ? roundIndex : columnCount - 1 - roundIndex
        const targetColumn = side === 'left' ? roundIndex + 1 : columnCount - 2 - roundIndex

        targets.forEach((target, targetIndex) => {
          const sourceIds = [target.source_match1_id, target.source_match2_id].filter((id): id is number => id !== null)
          let linked = sources.filter((source) => sourceIds.includes(source.id))
          if (!linked.length) linked = sources.slice(targetIndex * 2, targetIndex * 2 + 2)

          linked.forEach((source) => {
            const sourceIndex = sources.findIndex((candidate) => candidate.id === source.id)
            if (sourceIndex < 0) return
            addConnector(`${side}-${roundIndex}-${source.id}-${target.id}`, sourceColumn, sourceIndex, roundIndex, targetColumn, centerY(targetIndex, roundIndex + 1))
          })
        })
      }
    }

    const gridColumns = `repeat(${columnCount}, minmax(0, 1fr))`
    const gridStyle = {
      gridTemplateColumns: gridColumns,
      gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
      columnGap: '8px',
      rowGap: 0,
    }

    const headingStyle = {
      background: darkMode ? 'rgba(255,255,255,.055)' : 'rgba(15,23,42,.055)',
      borderBottom: `2px solid ${primary}`,
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="grid shrink-0 items-center gap-x-2 pb-2" style={{ gridTemplateColumns: gridColumns }}>
          {sideRounds.map((round, index) => (
            <div key={`left-heading-${round.label}`} className="min-w-0 rounded-lg px-1 py-1.5 text-center text-[clamp(8px,0.68vw,12px)] font-black uppercase tracking-[.08em]" style={{ ...headingStyle, gridColumn: index + 1 }} title={round.label}>
              <span className="block truncate">{round.label}</span>
            </div>
          ))}

          <div
            className="min-w-0 rounded-lg px-1 py-1.5 text-center text-[clamp(9px,0.75vw,13px)] font-black uppercase tracking-[.12em]"
            style={{
              gridColumn: centerColumn,
              background: `${primary}22`,
              borderBottom: `2px solid ${primary}`,
              color: darkMode ? '#fff' : '#111827',
            }}
          >
            ENTSCHEIDUNG
          </div>

          {[...sideRounds].reverse().map((round, index) => (
            <div key={`right-heading-${round.label}`} className="min-w-0 rounded-lg px-1 py-1.5 text-center text-[clamp(8px,0.68vw,12px)] font-black uppercase tracking-[.08em]" style={{ ...headingStyle, gridColumn: sideCount + 2 + index }} title={round.label}>
              <span className="block truncate">{round.label}</span>
            </div>
          ))}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border" style={{ borderColor: darkMode ? 'rgba(148,163,184,.18)' : 'rgba(71,85,105,.18)' }}>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {paths.map((path) => (
              <g key={path.key}>
                <path d={path.d} fill="none" stroke={primary} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity=".10" />
                <path d={path.d} fill="none" stroke={primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={darkMode ? '.78' : '.68'} />
              </g>
            ))}
          </svg>

          <div className="relative z-10 grid h-full min-h-0 w-full px-2 py-2" style={gridStyle}>
            {sideRounds.map((round, roundIndex) =>
              round.left.map((match, matchIndex) => (
                <div key={`left-${match.id}`} className="relative z-10 flex min-h-0 min-w-0 items-center" style={{ gridColumn: roundIndex + 1, gridRow: `${rowStart(matchIndex, roundIndex)} / span ${roundSpan(roundIndex)}` }}>
                  <BracketCard match={match} displayNumber={getBracketNumber(round.phase, match.knockout_position ?? match.bracket_position ?? matchIndex + 1)} />
                </div>
              ))
            )}

            <div className="relative z-20 flex min-h-0 min-w-0 flex-col items-center justify-center px-0.5" style={{ gridColumn: centerColumn, gridRow: `1 / span ${rowCount}` }}>
              <div className="w-full space-y-3">
                <div>
                  <div className="mb-1 text-center text-[clamp(9px,0.75vw,12px)] font-black uppercase tracking-[.16em]" style={{ color: primary }}>
                    ✦ Finale ✦
                  </div>
                  {finalMatch ? <BracketCard match={finalMatch} featured /> : <BracketCard match={{ id: -1, group_id: null, team1_id: null, team2_id: null, table_number: null, scheduled_time: null, phase: 'final', team1_score: null, team2_score: null, status: 'scheduled', bracket_position: 1, source_match1_id: null, source_match2_id: null, bracket_side: null, qualification_source: null, team1_source: 'Sieger Halbfinale 1', team2_source: 'Sieger Halbfinale 2', knockout_round: 5, knockout_position: 1, knockout_bracket_side: null, round_number: 5, next_match_id: null }} featured />}
                </div>

                {thirdPlaceMatch && (
                  <div>
                    <div className="mb-1 text-center text-[clamp(8px,0.65vw,11px)] font-black uppercase tracking-[.14em] text-amber-500">
                      ✦ Spiel um Platz 3 ✦
                    </div>
                    <BracketCard match={thirdPlaceMatch as Match} />
                  </div>
                )}
              </div>
            </div>

            {sideRounds.map((round, roundIndex) =>
              round.right.map((match, matchIndex) => (
                <div key={`right-${match.id}`} className="relative z-10 flex min-h-0 min-w-0 items-center" style={{ gridColumn: columnCount - roundIndex, gridRow: `${rowStart(matchIndex, roundIndex)} / span ${roundSpan(roundIndex)}` }}>
                  <BracketCard match={match} displayNumber={getBracketNumber(round.phase, match.knockout_position ?? match.bracket_position ?? matchIndex + 1)} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  const slideTitle = currentSlide === 'standings' ? 'Gruppentabellen' : currentSlide === 'groupMatches' ? 'Nächste Gruppenspiele' : currentSlide === 'bracket' ? 'K.-o.-Turnierbaum' : 'Nächste K.-o.-Spiele'

  if (loading) {
    return (
      <div className={`flex h-screen items-center justify-center text-2xl font-bold ${backgroundClass} ${textMain}`}>
        Turnierdaten werden geladen …
      </div>
    )
  }

  return (
    <main className={`relative flex h-screen min-h-[600px] flex-col overflow-hidden ${backgroundClass} ${textMain}`}>
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 12% 18%, rgba(245,158,11,.22), transparent 28%), radial-gradient(circle at 88% 82%, rgba(16,185,129,.18), transparent 30%)' }} />

      <header className="relative z-20 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          {tournament?.logo_url ? (
            <img src={tournament.logo_url} alt="Turnierlogo" className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-black text-slate-950" style={{ backgroundColor: primary }}>
              🍺
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black sm:text-2xl lg:text-3xl">{tournament?.name || 'Bierpong-Turnier'}</h1>
            <p className={`truncate text-xs font-semibold sm:text-sm ${textMuted}`}>
              {[formatDate(tournament?.event_date ?? null), tournament?.location].filter(Boolean).join(' · ') || 'Live-Übersicht'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden text-right md:block">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: primary }}>LIVE BEAMER</p>
            <p className={`text-[11px] ${textMuted}`}>
              {lastUpdated ? `Aktualisiert ${lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Verbinde …'}
            </p>
          </div>
          <button onClick={() => setDarkMode((value) => !value)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${darkMode ? 'border-slate-600 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-900'}`} aria-label="Darstellung wechseln">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={() => void toggleFullscreen()} className={`rounded-xl border px-3 py-2 text-sm font-bold ${darkMode ? 'border-slate-600 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-900'}`}>
            {fullscreen ? 'Fenster' : 'Vollbild'}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 py-4 lg:px-8 lg:py-5">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black sm:text-3xl lg:text-4xl">{slideTitle}</h2>
            <p className={`mt-1 text-sm font-medium ${textMuted}`}>
              {knockoutCreated ? 'K.-o.-Phase aktiv' : allGroupMatchesFinished ? 'Gruppenphase abgeschlossen · K.-o.-Auslosung steht noch aus' : 'Gruppenphase'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {slides.map((slide, index) => (
              <span key={slide} className={`h-2.5 w-8 rounded-full transition-all ${index === slideIndex ? '' : darkMode ? 'bg-slate-700' : 'bg-slate-300'}`} style={index === slideIndex ? { backgroundColor: primary } : undefined} />
            ))}
            <span className={`ml-1 text-xs font-bold ${textMuted}`}>{slideIndex + 1}/{slides.length}</span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 rounded-full border" style={{ width: 'min(45vw, 650px)', aspectRatio: '1 / 1', transform: 'translate(-50%, -50%)', borderColor: darkMode ? 'rgba(255,255,255,.055)' : 'rgba(15,23,42,.07)' }} />
            {tournament?.logo_url && (
              <img src={tournament.logo_url} alt="" aria-hidden="true" className="absolute left-1/2 top-1/2 max-w-none object-contain" style={{ width: 'min(38vw, 540px)', maxHeight: '88%', transform: 'translate(-50%, -50%) rotate(-8deg)', opacity: darkMode ? 0.055 : 0.035, filter: 'grayscale(1) contrast(1.35)' }} />
            )}
          </div>

          <div className="relative z-10 h-full min-h-0">
            {error ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-center text-lg font-bold text-red-500">
                {error}
              </div>
            ) : loading ? (
              <div className="flex h-full items-center justify-center text-2xl font-bold">Turnierdaten werden geladen …</div>
            ) : (
              <>
                {currentSlide === 'standings' && (
                  <div className={`grid h-full gap-3 ${standingsByGroup.length <= 4 ? 'grid-cols-2' : 'grid-cols-4'}`}>
                    {standingsByGroup.map((group) => (
                      <section key={group.id} className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border backdrop-blur-sm ${panelClass}`} style={panelStyle}>
                        <h3 className="shrink-0 px-3 py-2 text-center text-base font-black sm:text-lg" style={{ backgroundColor: primary, color: '#111827' }}>
                          {group.name}
                        </h3>
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <table className="w-full table-fixed text-xs sm:text-sm">
                            <thead className={darkMode ? 'bg-slate-800/90 text-slate-300' : 'bg-slate-100/90 text-slate-700'}>
                              <tr>
                                <th className="w-7 px-1 py-1.5 text-center">#</th>
                                <th className="px-1 py-1.5 text-left">Team</th>
                                <th className="w-8 px-1 py-1.5 text-center">Sp</th>
                                <th className="w-8 px-1 py-1.5 text-center">Diff</th>
                                <th className="w-8 px-1 py-1.5 text-center">Pkt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.standings.map((standing, index) => (
                                <tr key={standing.teamId} className={`border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'} ${index < 2 ? (darkMode ? 'bg-emerald-500/10' : 'bg-emerald-50/80') : ''}`}>
                                  <td className="px-1 py-1.5 text-center font-black">{index + 1}</td>
                                  <td className="truncate px-1 py-1.5 font-bold" title={standing.teamName}>{standing.teamName}</td>
                                  <td className="px-1 py-1.5 text-center tabular-nums">{standing.played}</td>
                                  <td className="px-1 py-1.5 text-center tabular-nums">{standing.difference > 0 ? `+${standing.difference}` : standing.difference}</td>
                                  <td className="px-1 py-1.5 text-center font-black tabular-nums">{standing.points}</td>
                                </tr>
                              ))}
                              {group.standings.length === 0 && (
                                <tr>
                                  <td colSpan={5} className={`p-4 text-center ${textMuted}`}>Noch keine Teams zugeordnet</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                {currentSlide === 'groupMatches' && (
                  <div className="grid h-full grid-cols-1 content-start gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
                    {upcomingGroupMatches.slice(0, 9).map((match) => (
                      <MatchCard key={match.id} match={match} />
                    ))}
                    {upcomingGroupMatches.length === 0 && (
                      <div className={`col-span-full flex items-center justify-center rounded-2xl border p-8 text-center ${panelClass}`}>
                        <div>
                          <p className="text-2xl font-black">{allGroupMatchesFinished ? 'Alle Gruppenspiele sind beendet' : 'Noch keine Gruppenspiele geplant'}</p>
                          <p className={`mt-2 ${textMuted}`}>
                            {allGroupMatchesFinished ? 'Die Gruppentabellen bleiben sichtbar, bis die K.-o.-Phase angelegt wurde.' : 'Die Begegnungen erscheinen hier automatisch.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentSlide === 'bracket' && <BracketView />}

                {currentSlide === 'koMatches' && (
                  <div className="grid h-full grid-cols-1 content-start gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
                    {upcomingKOMatches.slice(0, 9).map((match) => (
                      <MatchCard key={match.id} match={match} knockout />
                    ))}
                    {upcomingKOMatches.length === 0 && (
                      <div className={`col-span-full flex items-center justify-center rounded-2xl border p-8 text-center ${panelClass}`}>
                        <div>
                          <p className="text-2xl font-black">Alle K.-o.-Spiele sind beendet</p>
                          <p className={`mt-2 ${textMuted}`}>Der Turnierbaum zeigt weiterhin alle Ergebnisse.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <footer className={`relative z-20 flex shrink-0 items-center justify-between gap-3 border-t px-5 py-2 text-xs font-semibold ${darkMode ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600'}`}>
        <span>Automatische Aktualisierung alle 10 Sekunden</span>
        <span>Ansicht wechselt alle 15 Sekunden</span>
        <span>{tournament?.name || 'Bierpong-Turnier'}</span>
      </footer>
    </main>
  )
}