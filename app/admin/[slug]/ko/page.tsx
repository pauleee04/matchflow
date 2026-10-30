'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase } from '@/lib/supabase'

type TournamentData = {
  id: number
  name: string
  slug: string
  type: string
  primary_color: string | null
  secondary_color: string | null
  logo_url: string | null
  has_third_place_match: boolean | null
}

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

type Match = {
  id: number
  group_id: number | null
  team1_id: number
  team2_id: number
  table_number: number | null
  scheduled_time: string | null
  phase: string
  team1_score: number | null
  team2_score: number | null
  status: string
  bracket_position: number | null
  source_match1_id: number | null
  source_match2_id: number | null
  bracket_side: string | null
  qualification_source: string | null
  qualification_group_id: number | null
  knockout_round: number | null
  knockout_position: number | null
  knockout_bracket_side: string | null
  team1_source: string | null
  team2_source: string | null
  team1_source_group_id: number | null
  team2_source_group_id: number | null
  team1_source_position: number | null
  team2_source_position: number | null
  round_number: number | null
  next_match_id: number | null
}

type TournamentSettings = {
  id: number
  tournament_id: number
  mode: string
  group_count: number
  qualifiers_per_group: number
  knockout_size: number
  direct_qualifiers: number | null
  additional_qualifiers: number | null
  additional_qualifier_position: number | null
  filler_place: number | null
  filler_qualifiers: number | null
  filler_enabled: boolean | null
  ko_size: number | null
  knockout_avoid_same_group: boolean | null
  knockout_bracket_generated: boolean | null
}

type Standing = {
  position: number
  teamId: number
  teamName: string
  games: number
  wins: number
  draws: number
  losses: number
  points: number
  scoreDifference: number
}

type QualifiedTeam = {
  teamId: number
  teamName: string
  source: string
  groupId: number
  groupName: string
  position: number
}

const KO_PHASES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
const DEFAULT_ROUND_GAP = 10
const DEFAULT_TABLE_COUNT = 16

const BRACKET_CARD_HEIGHT = 82
const BRACKET_ROW_HEIGHT = 48
const BRACKET_HEADER_HEIGHT = 28

function MatchScoreEditor({
  match,
  primaryColor,
  onSave,
}: {
  match: Match
  primaryColor: string
  onSave: (matchId: number, score1: number, score2: number) => void
}) {
  const [score1, setScore1] = useState(match.team1_score ?? 0)
  const [score2, setScore2] = useState(match.team2_score ?? 0)

  useEffect(() => {
    setScore1(match.team1_score ?? 0)
    setScore2(match.team2_score ?? 0)
  }, [match.team1_score, match.team2_score])

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          max="10"
          value={score1}
          onChange={(event) =>
            setScore1(Math.min(10, Math.max(0, Number(event.target.value) || 0)))
          }
          className="h-9 w-12 rounded-xl border border-white/10 bg-slate-950/80 text-center text-xs font-black text-white outline-none focus:border-white/30"
        />
        <span className="font-black text-slate-500">:</span>
        <input
          type="number"
          min="0"
          max="10"
          value={score2}
          onChange={(event) =>
            setScore2(Math.min(10, Math.max(0, Number(event.target.value) || 0)))
          }
          className="h-9 w-12 rounded-xl border border-white/10 bg-slate-950/80 text-center text-xs font-black text-white outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={() => onSave(match.id, score1, score2)}
          className="ml-auto h-9 rounded-xl px-3 text-[10px] font-black text-slate-950 transition hover:opacity-90 shadow-md"
          style={{ backgroundColor: primaryColor }}
        >
          Speichern
        </button>
      </div>
    </div>
  )
}

export default function AdminKOPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''
  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [settings, setSettings] = useState<TournamentSettings | null>(null)

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [savingTime, setSavingTime] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [roundGapMinutes, setRoundGapMinutes] = useState(DEFAULT_ROUND_GAP)
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({})
  const [editingRound, setEditingRound] = useState<string | null>(null)
  const [roundTimes, setRoundTimes] = useState<Record<string, string>>({})

  const primaryColor = tournament?.primary_color || '#22c55e'

  async function loadData() {
    if (!slug) return
    setLoading(true)
    setStatusMessage(null)

    try {
      const { data: tourneyData, error: tourneyError } = await publicSupabase
        .from('tournaments')
        .select('id, name, slug, type, primary_color, secondary_color, logo_url, has_third_place_match')
        .eq('slug', slug)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) return

      setTournament(tourneyData)

      const [teamsRes, groupsRes, membersRes, matchesRes, settingsRes] = await Promise.all([
        publicSupabase
          .from('teams')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('created_at', { ascending: true }),

        publicSupabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('id', { ascending: true }),

        publicSupabase
          .from('group_members')
          .select('group_id, team_id')
          .eq('tournament_id', tourneyData.id),

        publicSupabase
          .from('matches')
          .select('*')
          .eq('tournament_id', tourneyData.id)
          .order('scheduled_time', { ascending: true }),

        publicSupabase
          .from('tournament_settings')
          .select('*')
          .eq('tournament_id', tourneyData.id)
          .maybeSingle(),
      ])

      const loadedMatches = (matchesRes.data || []) as Match[]

      setTeams((teamsRes.data || []) as Team[])
      setGroups((groupsRes.data || []) as Group[])
      setMembers((membersRes.data || []) as GroupMember[])
      setMatches(loadedMatches)
      setSettings(settingsRes.data as TournamentSettings | null)

      initializeRoundTimes(loadedMatches)
      initializeOpenPhases(loadedMatches)
    } catch (err: any) {
      console.error('Fehler beim Laden der KO-Daten:', err)
      setStatusMessage({ type: 'error', text: 'Daten konnten nicht geladen werden.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [slug])

  useEffect(() => {
    if (!tournament?.id) return

    const channel = publicSupabase.channel(`tournament:${tournament.id}`)

    channel
      .on('broadcast', { event: 'refresh' }, () => {
        void loadData()
      })
      .subscribe()

    return () => {
      void publicSupabase.removeChannel(channel)
    }
  }, [tournament?.id])

  async function triggerBroadcast() {
    if (!tournament?.id) return
    const channel = publicSupabase.channel(`tournament:${tournament.id}`)
    await channel.send({
      type: 'broadcast',
      event: 'refresh',
      payload: { updated: Date.now() },
    })
  }

  function initializeRoundTimes(loadedMatches: Match[]) {
    const times: Record<string, string> = {}
    KO_PHASES.forEach((phase) => {
      const phaseMatches = loadedMatches.filter((match) => match.phase === phase)
      if (phaseMatches.length === 0) return
      const firstWithTime = phaseMatches.find((match) => match.scheduled_time)
      if (firstWithTime?.scheduled_time) {
        const date = new Date(firstWithTime.scheduled_time)
        times[phase] = `${String(date.getHours()).padStart(2, '0')}:${String(
          date.getMinutes()
        ).padStart(2, '0')}`
      }
    })
    setRoundTimes(times)
  }

  function initializeOpenPhases(loadedMatches: Match[]) {
    const state: Record<string, boolean> = {}
    KO_PHASES.forEach((phase) => {
      if (loadedMatches.some((match) => match.phase === phase)) {
        state[phase] = true
      }
    })
    setOpenPhases(state)
  }

  function getTeamName(teamId: number) {
    if (!teamId) return 'Unbekannt'
    return teams.find((team) => team.id === teamId)?.name || 'Unbekannt'
  }

  function getGroupTeams(groupId: number) {
    const ids = members.filter((member) => member.group_id === groupId).map((member) => member.team_id)
    return teams.filter((team) => ids.includes(team.id))
  }

  function getStandings(groupId: number): Standing[] {
    const groupTeams = getGroupTeams(groupId)
    const standings = groupTeams.map((team) => {
      let games = 0
      let wins = 0
      let draws = 0
      let losses = 0
      let points = 0
      let scoreDifference = 0

      matches
        .filter(
          (match) =>
            match.group_id === groupId &&
            match.phase === 'group' &&
            match.status === 'finished' &&
            (match.team1_id === team.id || match.team2_id === team.id)
        )
        .forEach((match) => {
          if (match.team1_score === null || match.team2_score === null) return
          const isTeam1 = match.team1_id === team.id
          const ownScore = isTeam1 ? match.team1_score : match.team2_score
          const opponentScore = isTeam1 ? match.team2_score : match.team1_score

          games++
          scoreDifference += ownScore - opponentScore

          if (ownScore > opponentScore) {
            wins++
            points += 3
          } else if (ownScore === opponentScore) {
            draws++
            points += 1
          } else {
            losses++
          }
        })

      return {
        position: 0,
        teamId: team.id,
        teamName: team.name,
        games,
        wins,
        draws,
        losses,
        points,
        scoreDifference,
      }
    })

    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.scoreDifference !== a.scoreDifference) return b.scoreDifference - a.scoreDifference
      if (b.wins !== a.wins) return b.wins - a.wins
      return a.teamName.localeCompare(b.teamName)
    })

    return standings.map((standing, index) => ({
      ...standing,
      position: index + 1,
    }))
  }

  const groupStandings = useMemo(() => {
    return groups.map((group) => ({ group, standings: getStandings(group.id) }))
  }, [groups, teams, members, matches])

  const groupPhaseFinished = useMemo(() => {
    if (groups.length === 0) return false
    return groups.every((group) => {
      const groupMatches = matches.filter(
        (match) => match.group_id === group.id && match.phase === 'group'
      )
      return groupMatches.length > 0 && groupMatches.every((match) => match.status === 'finished')
    })
  }, [groups, matches])

  const directQualifiers = useMemo(() => {
    if (!settings) return []
    const directCount = settings.direct_qualifiers ?? settings.qualifiers_per_group ?? 0
    const result: QualifiedTeam[] = []

    groupStandings.forEach(({ group, standings }) => {
      standings
        .filter((standing) => standing.position <= directCount)
        .forEach((standing) => {
          result.push({
            teamId: standing.teamId,
            teamName: standing.teamName,
            source: 'Direkt',
            groupId: group.id,
            groupName: group.name,
            position: standing.position,
          })
        })
    })
    return result
  }, [groupStandings, settings])

  const fillerEnabled =
    settings?.filler_enabled === true || (settings?.additional_qualifiers ?? 0) > 0
  const fillerCount = settings?.filler_qualifiers ?? settings?.additional_qualifiers ?? 0
  const fillerPosition =
    settings?.filler_place ?? settings?.additional_qualifier_position ?? 0

  const fillerCandidates = useMemo(() => {
    if (!settings || !fillerEnabled || fillerCount <= 0 || fillerPosition <= 0) {
      return []
    }
    return groupStandings
      .flatMap(({ group, standings }) => {
        const standing = standings.find((item) => item.position === fillerPosition)
        if (!standing) return []
        return [
          {
            ...standing,
            groupId: group.id,
            groupName: group.name,
          },
        ]
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.scoreDifference !== a.scoreDifference) return b.scoreDifference - a.scoreDifference
        if (b.wins !== a.wins) return b.wins - a.wins
        return a.teamName.localeCompare(b.teamName)
      })
  }, [settings, fillerEnabled, fillerCount, fillerPosition, groupStandings])

  const additionalQualifiers = useMemo(() => {
    return fillerCandidates.slice(0, fillerCount).map((candidate) => ({
      teamId: candidate.teamId,
      teamName: candidate.teamName,
      source: `Auffüller ${fillerPosition}. Platz`,
      groupId: candidate.groupId,
      groupName: candidate.groupName,
      position: candidate.position,
    }))
  }, [fillerCandidates, fillerCount, fillerPosition])

  const qualifiedTeams = useMemo(() => {
    const map = new Map<number, QualifiedTeam>()
    directQualifiers.forEach((team) => map.set(team.teamId, team))
    additionalQualifiers.forEach((team) => {
      if (!map.has(team.teamId)) {
        map.set(team.teamId, team)
      }
    })
    return Array.from(map.values())
  }, [directQualifiers, additionalQualifiers])

  const knockoutMatches = useMemo(() => {
    return matches.filter((match) => KO_PHASES.includes(match.phase))
  }, [matches])

  const knockoutAlreadyCreated = knockoutMatches.length > 0

  function getKOSize() {
    return settings?.ko_size ?? settings?.knockout_size ?? 0
  }

  function getInitialPhase(size: number) {
    if (size === 32) return 'round_of_32'
    if (size === 16) return 'round_of_16'
    return 'quarter_final'
  }

  function getRoundNumber(phase: string) {
    switch (phase) {
      case 'round_of_32':
        return 1
      case 'round_of_16':
        return 2
      case 'quarter_final':
        return 3
      case 'semi_final':
        return 4
      case 'third_place':
      case 'final':
        return 5
      default:
        return 0
    }
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

  function shuffle<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  function createRandomPairings(input: QualifiedTeam[]) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const shuffled = shuffle(input)
      const pairings: Array<[QualifiedTeam, QualifiedTeam]> = []
      let valid = true

      for (let i = 0; i < shuffled.length; i += 2) {
        const a = shuffled[i]
        const b = shuffled[i + 1]
        if (!a || !b) {
          valid = false
          break
        }
        if (settings?.knockout_avoid_same_group !== false && a.groupId === b.groupId) {
          valid = false
          break
        }
        pairings.push([a, b])
      }
      if (valid) return pairings
    }

    const fallback = shuffle(input)
    const pairings: Array<[QualifiedTeam, QualifiedTeam]> = []
    for (let i = 0; i < fallback.length; i += 2) {
      pairings.push([fallback[i], fallback[i + 1]])
    }
    return pairings
  }

  function getAvailableTableCount() {
    const tableNumbers = matches
      .map((match) => match.table_number)
      .filter((number): number is number => typeof number === 'number' && number > 0)
    if (tableNumbers.length === 0) return DEFAULT_TABLE_COUNT
    return Math.max(DEFAULT_TABLE_COUNT, ...tableNumbers)
  }

  function getParallelTableNumber(index: number) {
    const tableCount = getAvailableTableCount()
    return (index % tableCount) + 1
  }

  function getRoundStartTime(roundMatches: Match[]) {
    const dates = roundMatches
      .map((match) => (match.scheduled_time ? new Date(match.scheduled_time).getTime() : 0))
      .filter((time) => time > 0)
    if (dates.length === 0) return new Date()
    return new Date(Math.max(...dates))
  }

  async function createKnockout() {
    setStatusMessage(null)
    if (!tournament?.id) return

    if (!settings) {
      setStatusMessage({ type: 'error', text: 'Keine Turniereinstellungen gefunden.' })
      return
    }

    const koSize = getKOSize()
    if (![8, 16, 32].includes(koSize)) {
      setStatusMessage({ type: 'error', text: 'Die K.-o.-Größe muss 8, 16 oder 32 sein.' })
      return
    }

    if (!groupPhaseFinished) {
      setStatusMessage({ type: 'error', text: 'Die Gruppenphase muss zuerst vollständig beendet sein.' })
      return
    }

    if (qualifiedTeams.length !== koSize) {
      setStatusMessage({
        type: 'error',
        text: `Es sind ${qualifiedTeams.length} Teams qualifiziert, benötigt werden ${koSize}.`,
      })
      return
    }

    if (knockoutMatches.length > 0) {
      setStatusMessage({ type: 'error', text: 'Die K.-o.-Phase wurde bereits erstellt.' })
      return
    }

    const technicalGroupId = groups[0]?.id
    if (!technicalGroupId) {
      setStatusMessage({ type: 'error', text: 'Es wurde keine Gruppe gefunden.' })
      return
    }

    setCreating(true)

    try {
      const pairings = createRandomPairings(qualifiedTeams)
      if (pairings.length * 2 !== koSize) {
        throw new Error(`Es konnten nicht genügend gültige Paarungen für ${koSize} Teams erstellt werden.`)
      }

      const phase = getInitialPhase(koSize)
      const roundNumber = getRoundNumber(phase)

      const groupMatches = matches.filter((match) => match.phase === 'group')
      const lastGroupTime = groupMatches
        .map((match) => (match.scheduled_time ? new Date(match.scheduled_time).getTime() : 0))
        .filter((time) => time > 0)
        .reduce((max, time) => Math.max(max, time), Date.now())

      const startTime = new Date(lastGroupTime + roundGapMinutes * 60 * 1000)

      const rows = pairings.map(([team1, team2], index) => ({
        tournament_id: tournament.id,
        group_id: technicalGroupId,
        team1_id: team1.teamId,
        team2_id: team2.teamId,
        table_number: getParallelTableNumber(index),
        scheduled_time: startTime.toISOString(),
        phase,
        team1_score: null,
        team2_score: null,
        status: 'scheduled',
        bracket_position: index + 1,
        source_match1_id: null,
        source_match2_id: null,
        bracket_side: index < pairings.length / 2 ? 'left' : 'right',
        qualification_source: 'knockout_qualification',
        qualification_group_id: null,
        knockout_round: roundNumber,
        knockout_position: index + 1,
        knockout_bracket_side: index < pairings.length / 2 ? 'left' : 'right',
        team1_source: team1.source,
        team2_source: team2.source,
        team1_source_group_id: team1.groupId,
        team2_source_group_id: team2.groupId,
        team1_source_position: team1.position,
        team2_source_position: team2.position,
        round_number: roundNumber,
        next_match_id: null,
      }))

      const { data, error } = await publicSupabase.from('matches').insert(rows).select('id')

      if (error) throw new Error(`KO-Spiele konnten nicht gespeichert werden: ${error.message}`)

      if (!data || data.length !== rows.length) {
        throw new Error(`Nur ${data?.length ?? 0} von ${rows.length} KO-Spielen wurden gespeichert.`)
      }

      await publicSupabase
        .from('tournament_settings')
        .update({ knockout_bracket_generated: true })
        .eq('id', settings.id)
        .eq('tournament_id', tournament.id)

      await triggerBroadcast()
      await loadData()
      setStatusMessage({ type: 'success', text: `${pairings.length} KO-Spiele wurden erfolgreich gelost.` })
    } catch (err: any) {
      console.error('CREATE KNOCKOUT ERROR:', err)
      setStatusMessage({
        type: 'error',
        text: err.message || 'Die K.-o.-Phase konnte nicht erstellt werden.',
      })
    } finally {
      setCreating(false)
    }
  }

  function getCurrentRoundMatches() {
    const existingPhases = KO_PHASES.filter(
      (phase) => phase !== 'third_place' && matches.some((match) => match.phase === phase)
    )
    if (existingPhases.length === 0) return []
    const currentPhase = existingPhases[existingPhases.length - 1]
    return matches
      .filter((match) => match.phase === currentPhase)
      .sort(
        (a, b) =>
          (a.knockout_position ?? a.bracket_position ?? 0) -
          (b.knockout_position ?? b.bracket_position ?? 0)
      )
  }

  function getNextPhase(currentPhase: string) {
    switch (currentPhase) {
      case 'round_of_32':
        return 'round_of_16'
      case 'round_of_16':
        return 'quarter_final'
      case 'quarter_final':
        return 'semi_final'
      case 'semi_final':
        return 'final'
      default:
        return null
    }
  }

  async function createNextRound() {
    setStatusMessage(null)
    if (!tournament?.id) return

    const currentMatches = getCurrentRoundMatches()
    if (currentMatches.length === 0) {
      setStatusMessage({ type: 'error', text: 'Keine aktuelle K.-o.-Runde gefunden.' })
      return
    }

    if (currentMatches.some((match) => match.status !== 'finished')) {
      setStatusMessage({ type: 'error', text: 'Alle Spiele der aktuellen Runde müssen beendet sein.' })
      return
    }

    const winners: number[] = []
    const losers: number[] = []

    for (const match of currentMatches) {
      if (match.team1_score === null || match.team2_score === null) {
        setStatusMessage({ type: 'error', text: 'Bei mindestens einem Spiel fehlt das Ergebnis.' })
        return
      }
      if (match.team1_score === match.team2_score) {
        setStatusMessage({
          type: 'error',
          text: `Spiel ${match.knockout_position ?? ''} ist unentschieden. KO-Spiele brauchen einen Sieger.`,
        })
        return
      }
      const team1IsWinner = match.team1_score > match.team2_score
      winners.push(team1IsWinner ? match.team1_id : match.team2_id)
      losers.push(team1IsWinner ? match.team2_id : match.team1_id)
    }

    const currentPhase = currentMatches[0].phase
    const nextPhase = getNextPhase(currentPhase)
    if (!nextPhase) {
      setStatusMessage({ type: 'error', text: 'Das Finale ist bereits die letzte Runde.' })
      return
    }

    const existingNext = matches.filter((match) => match.phase === nextPhase || match.phase === 'third_place')
    if (existingNext.length > 0) {
      setStatusMessage({ type: 'error', text: `${getPhaseName(nextPhase)} wurde bereits erstellt.` })
      return
    }

    const technicalGroupId = groups[0]?.id
    if (!technicalGroupId) {
      setStatusMessage({ type: 'error', text: 'Es wurde keine Gruppe gefunden.' })
      return
    }

    const nextRound = getRoundNumber(nextPhase)
    const previousRoundStart = getRoundStartTime(currentMatches)
    const scheduled = new Date(previousRoundStart.getTime() + roundGapMinutes * 60 * 1000)

    const rows: Array<Record<string, unknown>> = []

    // 1. HAUPTSPIEL(E) (z. B. Finale oder nächste KO-Runde)
    for (let i = 0; i < winners.length; i += 2) {
      const team1Id = winners[i]
      const team2Id = winners[i + 1]
      const source1 = currentMatches[i]
      const source2 = currentMatches[i + 1]
      if (!team1Id || !team2Id || !source1 || !source2) continue

      rows.push({
        tournament_id: tournament.id,
        group_id: technicalGroupId,
        team1_id: team1Id,
        team2_id: team2Id,
        table_number: getParallelTableNumber(i / 2),
        scheduled_time: scheduled.toISOString(),
        phase: nextPhase,
        team1_score: null,
        team2_score: null,
        status: 'scheduled',
        bracket_position: i / 2 + 1,
        source_match1_id: source1.id,
        source_match2_id: source2.id,
        bracket_side: i / 2 < winners.length / 4 ? 'left' : 'right',
        qualification_source: 'previous_round',
        qualification_group_id: null,
        knockout_round: nextRound,
        knockout_position: i / 2 + 1,
        knockout_bracket_side: i / 2 < winners.length / 4 ? 'left' : 'right',
        team1_source: `Sieger ${getPhaseName(currentPhase)} ${i + 1}`,
        team2_source: `Sieger ${getPhaseName(currentPhase)} ${i + 2}`,
        team1_source_group_id: null,
        team2_source_group_id: null,
        team1_source_position: null,
        team2_source_position: null,
        round_number: nextRound,
        next_match_id: null,
      })
    }

    // 2. SPIEL UM PLATZ 3 (Nur nach dem Halbfinale, falls aktiviert)
    if (currentPhase === 'semi_final' && tournament.has_third_place_match && losers.length === 2) {
      rows.push({
        tournament_id: tournament.id,
        group_id: technicalGroupId,
        team1_id: losers[0],
        team2_id: losers[1],
        table_number: getParallelTableNumber(1),
        scheduled_time: scheduled.toISOString(),
        phase: 'third_place',
        team1_score: null,
        team2_score: null,
        status: 'scheduled',
        bracket_position: 1,
        source_match1_id: currentMatches[0].id,
        source_match2_id: currentMatches[1].id,
        bracket_side: 'center',
        qualification_source: 'previous_round_loser',
        qualification_group_id: null,
        knockout_round: nextRound,
        knockout_position: 1,
        knockout_bracket_side: 'center',
        team1_source: `Verlierer Halbfinale 1`,
        team2_source: `Verlierer Halbfinale 2`,
        team1_source_group_id: null,
        team2_source_group_id: null,
        team1_source_position: null,
        team2_source_position: null,
        round_number: nextRound,
        next_match_id: null,
      })
    }

    if (rows.length === 0) {
      setStatusMessage({ type: 'error', text: 'Es konnten keine Spiele für die nächste Runde erstellt werden.' })
      return
    }

    setCreating(true)

    try {
      const { data, error } = await publicSupabase.from('matches').insert(rows).select('id, phase')
      if (error) throw new Error(`Die nächste Runde konnte nicht gespeichert werden: ${error.message}`)

      if (!data || data.length !== rows.length) {
        throw new Error('Die nächste Runde wurde nicht vollständig gespeichert.')
      }

      const insertedMatches = data as { id: number; phase: string }[]
      const finalMatch = insertedMatches.find((m) => m.phase === 'final')

      if (finalMatch) {
        for (let i = 0; i < currentMatches.length; i++) {
          await publicSupabase
            .from('matches')
            .update({ next_match_id: finalMatch.id })
            .eq('id', currentMatches[i].id)
            .eq('tournament_id', tournament.id)
        }
      }

      await triggerBroadcast()
      await loadData()
      setStatusMessage({ type: 'success', text: `${getPhaseName(nextPhase)} wurde erfolgreich erstellt.` })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({
        type: 'error',
        text: err.message || 'Die nächste Runde konnte nicht erstellt werden.',
      })
    } finally {
      setCreating(false)
    }
  }

  function getPhaseMatches(phase: string) {
    return knockoutMatches
      .filter((match) => match.phase === phase)
      .sort(
        (a, b) =>
          (a.knockout_position ?? a.bracket_position ?? 0) -
          (b.knockout_position ?? b.bracket_position ?? 0)
      )
  }

  function getExistingBracketPhases() {
    return KO_PHASES.filter((phase) => knockoutMatches.some((match) => match.phase === phase))
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
        return tournament?.has_third_place_match ? 1 : 0
      case 'final':
        return 1
      default:
        return 0
    }
  }

  function getGlobalMatchNumber(phase: string, position: number) {
    const groupMatchCount = matches.filter((match) => match.phase === 'group').length
    const phaseOrder = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
    const phaseIndex = phaseOrder.indexOf(phase)
    if (phaseIndex < 0) return position

    const previousKOMatches = phaseOrder
      .slice(0, phaseIndex)
      .reduce((total, previousPhase) => total + getExpectedMatchCount(previousPhase), 0)

    return groupMatchCount + previousKOMatches + position
  }

  function getBracketMatch(phase: string, position: number) {
    return getPhaseMatches(phase).find((match) => match.knockout_position === position) || null
  }

  function getMatchWinner(match: Match) {
    if (
      match.status !== 'finished' ||
      match.team1_score === null ||
      match.team2_score === null ||
      match.team1_score === match.team2_score
    ) {
      return null
    }
    return match.team1_score > match.team2_score ? match.team1_id : match.team2_id
  }

  function formatMatchTime(match: Match) {
    if (!match.scheduled_time) return null
    return new Date(match.scheduled_time).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
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

  function getBracketTeamLabel(match: Match | null, team: 1 | 2, phase: string, position: number) {
    if (!match) {
      const previousName = getPreviousPhaseName(phase)
      const sourceNumber = position * 2 - (team === 1 ? 1 : 0)
      return phase === 'third_place'
        ? `Verlierer ${previousName} ${team}`
        : `Sieger ${previousName} ${sourceNumber}`
    }
    const teamId = team === 1 ? match.team1_id : match.team2_id
    if (!teamId) {
      const previousName = getPreviousPhaseName(phase)
      const sourceNumber = position * 2 - (team === 1 ? 1 : 0)
      return phase === 'third_place'
        ? `Verlierer ${previousName} ${team}`
        : `Sieger ${previousName} ${sourceNumber}`
    }
    return getTeamName(teamId)
  }

  function togglePhase(phase: string) {
    setOpenPhases((current) => ({
      ...current,
      [phase]: !(current[phase] ?? true),
    }))
  }

  function getRoundTime(phase: string) {
    const matchesForPhase = getPhaseMatches(phase)
    const match = matchesForPhase.find((item) => item.scheduled_time)
    if (!match?.scheduled_time) return ''
    const date = new Date(match.scheduled_time)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  async function saveRoundTime(phase: string) {
    if (!tournament?.id) return
    const time = roundTimes[phase]
    if (!time) {
      setStatusMessage({ type: 'error', text: 'Bitte eine Uhrzeit eingeben.' })
      return
    }

    const [hours, minutes] = time.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      setStatusMessage({ type: 'error', text: 'Die Uhrzeit ist ungültig.' })
      return
    }

    const phaseMatches = getPhaseMatches(phase)
    if (phaseMatches.length === 0) return

    const reference = phaseMatches.find((match) => match.scheduled_time)?.scheduled_time
    const baseDate = reference ? new Date(reference) : new Date()
    baseDate.setHours(hours, minutes, 0, 0)

    setSavingTime(true)
    setStatusMessage(null)

    try {
      const { error } = await publicSupabase
        .from('matches')
        .update({ scheduled_time: baseDate.toISOString() })
        .eq('phase', phase)
        .eq('tournament_id', tournament.id)

      if (error) throw error

      await triggerBroadcast()
      await loadData()
      setEditingRound(null)
      setStatusMessage({
        type: 'success',
        text: `${getPhaseName(phase)}: Uhrzeit auf ${time} Uhr gesetzt.`,
      })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({ type: 'error', text: 'Die Rundenzeit konnte nicht gespeichert werden.' })
    } finally {
      setSavingTime(false)
    }
  }

  async function saveMatchScore(matchId: number, team1Score: number, team2Score: number) {
    if (!tournament?.id) return
    setStatusMessage(null)

    if (team1Score < 0 || team1Score > 10 || team2Score < 0 || team2Score > 10) {
      setStatusMessage({ type: 'error', text: 'Ergebnisse müssen zwischen 0 und 10 liegen.' })
      return
    }

    const match = matches.find((item) => item.id === matchId)
    if (!match) return

    if (match.phase !== 'group' && team1Score === team2Score) {
      setStatusMessage({ type: 'error', text: 'Ein K.-o.-Spiel kann nicht unentschieden enden.' })
      return
    }

    try {
      const { error } = await publicSupabase
        .from('matches')
        .update({
          team1_score: team1Score,
          team2_score: team2Score,
          status: 'finished',
        })
        .eq('id', matchId)
        .eq('tournament_id', tournament.id)

      if (error) throw error

      await triggerBroadcast()
      await loadData()
      setStatusMessage({ type: 'success', text: 'Ergebnis gespeichert.' })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Fehler beim Speichern: ${err.message}` })
    }
  }

  function BracketMatchCard({
    phase,
    position,
  }: {
    phase: string
    position: number
    side: 'left' | 'right' | 'center'
  }) {
    const match = getBracketMatch(phase, position)
    const winner = match ? getMatchWinner(match) : null
    const finished = match?.status === 'finished'
    const live = match?.status === 'live' || match?.status === 'playing'
    const team1Winner = match ? winner === match.team1_id : false
    const team2Winner = match ? winner === match.team2_id : false
    const team1Name = getBracketTeamLabel(match, 1, phase, position)
    const team2Name = getBracketTeamLabel(match, 2, phase, position)

    return (
      <div className="relative w-full" style={{ height: BRACKET_CARD_HEIGHT }}>
        <div
          className={[
            'h-full overflow-hidden rounded-2xl border shadow-lg backdrop-blur-md transition',
            finished
              ? 'border-emerald-500/40 bg-slate-950/90'
              : live
              ? 'border-red-500/50 bg-slate-950/90'
              : match
              ? 'border-white/10 bg-slate-950/80'
              : 'border-dashed border-white/10 bg-slate-950/40',
          ].join(' ')}
        >
          <div
            className={[
              'flex h-5 items-center justify-between border-b px-1.5',
              finished
                ? 'border-emerald-500/20 bg-emerald-500/10'
                : live
                ? 'border-red-500/20 bg-red-500/10'
                : 'border-white/10 bg-slate-900/80',
            ].join(' ')}
          >
            <span className="truncate text-[7px] font-black uppercase tracking-[0.1em] text-slate-400">
              {phase === 'third_place' ? 'Platz 3' : `Spiel ${getGlobalMatchNumber(phase, position)}`}
            </span>
            {finished ? (
              <span className="rounded-full bg-emerald-400/15 px-1 py-0.5 text-[6px] font-black uppercase text-emerald-300">
                ✓ Fertig
              </span>
            ) : live ? (
              <span className="flex items-center gap-1 rounded-full bg-red-400/15 px-1 py-0.5 text-[6px] font-black uppercase text-red-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                Live
              </span>
            ) : match ? (
              <span className="rounded-full bg-amber-400/15 px-1 py-0.5 text-[6px] font-black uppercase text-amber-300">
                Offen
              </span>
            ) : (
              <span className="text-[6px] font-black uppercase tracking-wider text-slate-500">
                folgt
              </span>
            )}
          </div>

          <div className="space-y-0.5 p-0.5">
            <div
              className={[
                'flex h-5 items-center justify-between gap-1 rounded-lg px-1.5',
                team1Winner
                  ? 'bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/40'
                  : 'bg-slate-900/60',
              ].join(' ')}
            >
              <span
                title={team1Name}
                className={[
                  'min-w-0 truncate text-[8px]',
                  team1Winner
                    ? 'font-black text-emerald-300'
                    : match
                    ? 'font-bold text-white'
                    : 'font-semibold text-slate-400',
                ].join(' ')}
              >
                {team1Name}
              </span>
              <span
                className={[
                  'shrink-0 text-[11px] font-black tabular-nums',
                  team1Winner ? 'text-emerald-300' : 'text-slate-300',
                ].join(' ')}
              >
                {match ? match.team1_score ?? '-' : '-'}
              </span>
            </div>

            <div
              className={[
                'flex h-5 items-center justify-between gap-1 rounded-lg px-1.5',
                team2Winner
                  ? 'bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/40'
                  : 'bg-slate-900/60',
              ].join(' ')}
            >
              <span
                title={team2Name}
                className={[
                  'min-w-0 truncate text-[8px]',
                  team2Winner
                    ? 'font-black text-emerald-300'
                    : match
                    ? 'font-bold text-white'
                    : 'font-semibold text-slate-400',
                ].join(' ')}
              >
                {team2Name}
              </span>
              <span
                className={[
                  'shrink-0 text-[11px] font-black tabular-nums',
                  team2Winner ? 'text-emerald-300' : 'text-slate-300',
                ].join(' ')}
              >
                {match ? match.team2_score ?? '-' : '-'}
              </span>
            </div>
          </div>

          <div className="flex h-4 items-center justify-between border-t border-white/10 px-1.5 text-[6px] font-bold text-slate-400">
            <span>{match?.table_number ? `Tisch ${match.table_number}` : 'Tisch -'}</span>
            <span>
              {match && formatMatchTime(match) ? `${formatMatchTime(match)} Uhr` : 'Zeit -'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  function getBracketSideCount(phase: string) {
    return Math.max(1, Math.ceil(getExpectedMatchCount(phase) / 2))
  }

  function getBracketRowSpan(phase: string, phases: string[]) {
    const level = phases.indexOf(phase)
    if (level < 0) return 2
    return Math.pow(2, level + 1)
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
        <div
          className="relative w-[clamp(3px,0.55vw,8px)] shrink-0"
          style={{ height }}
          aria-hidden="true"
        >
          <svg
            className="absolute left-0 right-0 w-full text-white/20"
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
                  <line
                    x1={xOuter}
                    y1={outerCenter}
                    x2={xMiddle}
                    y2={outerCenter}
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <line
                    x1={xMiddle}
                    y1={outerCenter}
                    x2={xMiddle}
                    y2={centerLine}
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  {index === 0 && (
                    <line
                      x1={xMiddle}
                      y1={centerLine}
                      x2={xInner}
                      y2={centerLine}
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      )
    }

    return (
      <div
        className="relative w-[clamp(3px,0.55vw,8px)] shrink-0"
        style={{ height }}
        aria-hidden="true"
      >
        <svg
          className="absolute left-0 right-0 w-full text-white/20"
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
                <line
                  x1={xOuter}
                  y1={outerCenterA}
                  x2={xMiddle}
                  y2={outerCenterA}
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <line
                  x1={xOuter}
                  y1={outerCenterB}
                  x2={xMiddle}
                  y2={outerCenterB}
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <line
                  x1={xMiddle}
                  y1={outerCenterA}
                  x2={xMiddle}
                  y2={outerCenterB}
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <line
                  x1={xMiddle}
                  y1={innerCenter}
                  x2={xInner}
                  y2={innerCenter}
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
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
    const positions = Array.from({ length: count }, (_, index) =>
      side === 'left' ? index + 1 : leftCount + index + 1
    )
    const rowSpan = getBracketRowSpan(phase, phases)

    return (
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{
          height: BRACKET_HEADER_HEIGHT + totalRows * BRACKET_ROW_HEIGHT,
        }}
      >
        <div
          className="flex shrink-0 items-start justify-center"
          style={{ height: BRACKET_HEADER_HEIGHT }}
        >
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
            {getPhaseName(phase)}
          </span>
        </div>
        <div
          className="grid flex-1"
          style={{
            gridTemplateRows: `repeat(${totalRows}, ${BRACKET_ROW_HEIGHT}px)`,
          }}
        >
          {positions.map((position, index) => {
            const rowStart = index * rowSpan + 1
            return (
              <div
                key={`${side}-${phase}-${position}`}
                className="flex items-center"
                style={{
                  gridRow: `${rowStart} / span ${rowSpan}`,
                }}
              >
                <BracketMatchCard phase={phase} position={position} side={side} />
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
      <div className="relative w-full overflow-hidden bg-transparent">
        <div className="w-full px-1 py-5 sm:px-2 sm:py-7">
          <div className="flex min-w-0 items-start justify-center gap-0">
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

            {/* FINALE & PLATZ 3 */}
            <div
              className="flex min-w-0 flex-[1.05] flex-col px-1 sm:px-2"
              style={{ height: bracketHeight }}
            >
              <div
                className="flex shrink-0 items-start justify-center"
                style={{ height: BRACKET_HEADER_HEIGHT }}
              >
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Finale / Platz 3
                </span>
              </div>
              <div className="relative flex flex-1 flex-col items-center justify-center gap-4">
                {finalMatch ? (
                  <div className="w-full">
                    <div className="mb-2 flex items-center justify-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
                        Das große Finale
                      </span>
                    </div>
                    <BracketMatchCard phase="final" position={1} side="center" />
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-1 py-3 text-center sm:px-2 sm:py-4">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-sm sm:h-9 sm:w-9 border border-white/10">
                      🏆
                    </div>
                    <p className="mt-3 text-xs font-black text-slate-300">Finale</p>
                    <p className="mt-1 text-[10px] text-slate-500">Noch nicht erstellt</p>
                  </div>
                )}

                {/* SPIEL UM PLATZ 3 KARTE */}
                {(tournament?.has_third_place_match || thirdPlaceMatch) && (
                  <div className="w-full">
                    <div className="mb-2 flex items-center justify-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
                        Spiel um Platz 3
                      </span>
                    </div>
                    {thirdPlaceMatch ? (
                      <BracketMatchCard phase="third_place" position={1} side="center" />
                    ) : (
                      <div className="w-full rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-1 py-2 text-center">
                        <p className="text-[10px] font-bold text-slate-500">Spiel um Platz 3 (folgt)</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
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

  const totalKO = knockoutMatches.length
  const finishedKO = knockoutMatches.filter((match) => match.status === 'finished').length
  const progressPercent = totalKO > 0 ? Math.round((finishedKO / totalKO) * 100) : 0

  const currentRoundMatches = getCurrentRoundMatches()
  const currentRoundFinished =
    currentRoundMatches.length > 0 && currentRoundMatches.every((match) => match.status === 'finished')
  const availableTables = getAvailableTableCount()
  const existingPhases = getExistingBracketPhases()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100 bg-slate-950 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade K.-o.-Phase …
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100 bg-slate-950 [color-scheme:dark]">
      {statusMessage && (
        <div
          className={`w-full rounded-2xl border p-4 text-xs font-extrabold backdrop-blur-md ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
              : 'border-red-500/30 bg-red-950/20 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* STATUS CARDS */}
      <section className="grid gap-4 sm:grid-cols-3 w-full">
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">KO-Größe</p>
          <p className="mt-2 text-3xl font-black text-white">{getKOSize()} Teams</p>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Spiele Beendet</p>
          <p className="mt-2 text-3xl font-black text-white">
            {finishedKO} / {totalKO}
          </p>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fortschritt</p>
          <p className="mt-2 text-3xl font-black" style={{ color: primaryColor }}>
            {progressPercent}%
          </p>
        </div>
      </section>

      {/* SETUP & RUNDENPLANUNG */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between border-b border-white/10 pb-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase text-slate-950"
                style={{ backgroundColor: primaryColor }}
              >
                KO Setup
              </span>
              <span className="text-xs font-bold text-slate-400">Spielplanung</span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">Rundenplanung</h2>
            <p className="mt-1 text-xs font-medium text-slate-300">
              Alle Spiele einer Runde können parallel stattfinden. Uhrzeiten können flexibel angepasst werden.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Rundenabstand
              </label>
              <div className="flex min-h-12 items-center rounded-2xl border border-white/10 bg-slate-950/80 p-1.5">
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={roundGapMinutes}
                  onChange={(e) => setRoundGapMinutes(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full min-w-0 bg-transparent px-2 py-1 text-center text-base font-black text-white outline-none sm:w-20"
                />
                <span className="pr-2 text-xs font-bold text-slate-400">Min.</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tische</p>
              <p className="text-xl font-black text-white">{availableTables}</p>
            </div>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-950/80">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: primaryColor,
            }}
          />
        </div>
      </section>

      {/* BRACKET VIEW */}
      {knockoutMatches.length > 0 && (
        <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
          <div className="border-b border-white/10 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Tournament Bracket
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Der Weg ins Finale</h2>
              </div>
              <div
                className="w-fit rounded-full px-3 py-1.5 text-xs font-black border border-white/10 bg-slate-950/80"
                style={{ color: primaryColor }}
              >
                {existingPhases.length} {existingPhases.length === 1 ? 'Runde' : 'Runden'} vorhanden
              </div>
            </div>
          </div>

          <KnockoutBracket />
        </section>
      )}

      {/* QUALIFIED TEAMS POOL */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Qualifizierte Teams</h2>
            <p className="mt-1 text-xs font-medium text-slate-300">Übersicht der Teams in der K.-o.-Phase.</p>
          </div>
          <div
            className="w-fit rounded-full px-4 py-1.5 text-xs font-black text-slate-950 shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            {qualifiedTeams.length} / {getKOSize()} Plätze besetzt
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {qualifiedTeams.map((team, index) => (
            <div
              key={team.teamId}
              className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 shadow-lg"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-slate-500">#{index + 1}</span>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black text-emerald-400">
                  {team.source}
                </span>
              </div>
              <p className="mt-2 truncate text-sm font-black text-white">{team.teamName}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {team.groupName} • {team.position}. Platz
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 text-white shadow-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-black text-sm">K.-o.-Phase starten / auslosen</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {qualifiedTeams.length} von {getKOSize()} Startplätzen besetzt.
              </p>
            </div>
            <button
              type="button"
              onClick={createKnockout}
              disabled={
                creating ||
                knockoutAlreadyCreated ||
                !groupPhaseFinished ||
                qualifiedTeams.length !== getKOSize()
              }
              className="rounded-2xl px-5 py-3 text-xs font-black text-slate-950 shadow-lg transition hover:opacity-90 disabled:opacity-40 shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {creating
                ? 'Verarbeitung …'
                : knockoutAlreadyCreated
                ? 'K.-o. bereits erstellt'
                : '🎲 K.-o. zufällig auslosen'}
            </button>
          </div>
        </div>
      </section>

      {/* MATCH CENTER */}
      {knockoutMatches.length > 0 && (
        <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">K.-o.-Spiele &amp; Live-Ergebnisse</h2>
              <p className="mt-1 text-xs font-medium text-slate-300">Runden verwalten und Ergebnisse direkt eintragen.</p>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {KO_PHASES.map((phase) => {
              const phaseMatches = getPhaseMatches(phase)
              if (phaseMatches.length === 0) return null
              const allFinished = phaseMatches.every((match) => match.status === 'finished')
              const isCurrentRound = phase === currentRoundMatches[0]?.phase
              const isOpen = openPhases[phase] ?? true
              const currentTime = getRoundTime(phase)

              return (
                <div key={phase} className="py-5 space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <button
                      type="button"
                      onClick={() => togglePhase(phase)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-black border ${
                          allFinished
                            ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                            : 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                        }`}
                      >
                        {allFinished ? '✓' : getRoundNumber(phase)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black text-white">{getPhaseName(phase)}</h3>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {phaseMatches.length} Spiele • {allFinished ? 'Alle beendet' : 'Spiele offen'}
                          {currentTime && ` • ${currentTime} Uhr`}
                        </p>
                      </div>
                    </button>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      {editingRound === phase ? (
                        <>
                          <input
                            type="time"
                            value={roundTimes[phase] ?? currentTime}
                            onChange={(event) =>
                              setRoundTimes((current) => ({
                                ...current,
                                [phase]: event.target.value,
                              }))
                            }
                            className="h-10 rounded-2xl border border-white/10 bg-slate-950/80 px-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => saveRoundTime(phase)}
                            disabled={savingTime}
                            className="h-10 rounded-2xl px-4 text-xs font-black text-slate-950 shadow-md transition hover:opacity-90 disabled:opacity-40"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {savingTime ? 'Speichern …' : 'Zeit speichern'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRound(null)}
                            className="h-10 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-xs font-bold text-slate-300 hover:text-white"
                          >
                            Abbrechen
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRoundTimes((current) => ({
                                ...current,
                                [phase]: current[phase] ?? currentTime,
                              }))
                              setEditingRound(phase)
                            }}
                            className="h-10 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-xs font-bold text-slate-300 hover:text-white transition"
                          >
                            ⏰ Zeit ändern
                          </button>

                          {phase !== 'final' && phase !== 'third_place' && isCurrentRound && currentRoundFinished && (
                            <button
                              type="button"
                              onClick={createNextRound}
                              disabled={creating}
                              className="h-10 rounded-2xl bg-emerald-500 px-4 text-xs font-black text-slate-950 shadow-md transition hover:bg-emerald-400 disabled:opacity-40"
                            >
                              {creating ? 'Erstelle …' : '▶ Nächste Runde freischalten'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pt-2">
                      {phaseMatches.map((match) => {
                        const winner = getMatchWinner(match)
                        return (
                          <div
                            key={match.id}
                            className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 space-y-2.5 shadow-lg"
                          >
                            <div className="flex items-center justify-between text-[10px] font-black text-slate-400">
                              <span>
                                {match.phase === 'third_place'
                                  ? 'Spiel um Platz 3'
                                  : `Spiel #${getGlobalMatchNumber(match.phase, match.knockout_position ?? 1)}`}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[8px] font-black border ${
                                  match.status === 'finished'
                                    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                                    : 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                                }`}
                              >
                                {match.status === 'finished' ? 'FERTIG' : 'OFFEN'}
                              </span>
                            </div>

                            <div className="space-y-1">
                              <div
                                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold ${
                                  winner === match.team1_id
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-900/80 text-white border border-white/5'
                                }`}
                              >
                                <span className="truncate">{getTeamName(match.team1_id)}</span>
                                <span className="font-black">{match.team1_score ?? '-'}</span>
                              </div>

                              <div
                                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold ${
                                  winner === match.team2_id
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-900/80 text-white border border-white/5'
                                }`}
                              >
                                <span className="truncate">{getTeamName(match.team2_id)}</span>
                                <span className="font-black">{match.team2_score ?? '-'}</span>
                              </div>
                            </div>

                            <MatchScoreEditor
                              match={match}
                              primaryColor={primaryColor}
                              onSave={saveMatchScore}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}