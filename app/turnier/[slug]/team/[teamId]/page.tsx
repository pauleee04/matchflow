'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = {
  id: number | string
  tournament_id?: number | string
  name: string
  player1: string
  player2: string
  payment_method: string
  payment_status: string
  checkin_status: boolean
  access_token?: string
}

type Group = {
  id: number | string
  name: string
}

type GroupMemberData = {
  team_id: number | string
  manual_rank?: number | null
}

type TournamentMatch = {
  id: number | string
  tournament_id?: number | string | null
  group_id?: number | string | null
  round?: number | null
  phase?: string | null
  team1_id?: number | string | null
  team2_id?: number | string | null
  team1_name?: string | null
  team2_name?: string | null
  team1_score: number | null
  team2_score: number | null
  status: string
  scheduled_time?: string | null
  table_number?: number | null
  [key: string]: unknown
}

type GroupStanding = {
  teamId: number | string
  teamName: string
  points: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  manualRank?: number | null
}

type TournamentInfo = {
  id: number | string
  name: string
  slug?: string | null
  logo_url: string | null
  primary_color: string | null
  secondary_color?: string | null
  background_style: string | null
  entry_fee?: number | null
  cash_enabled?: boolean
  bank_transfer_enabled?: boolean
  bank_account_holder?: string | null
  bank_iban?: string | null
  bank_reference?: string | null
  paypal_enabled?: boolean
  paypal_payment_link?: string | null
  status?: string | null
}

type PublicTeamPage = {
  tournament?: TournamentInfo | null
  team?: Team | null
  group?: Group | null
  teams?: Team[] | null
  matches?: TournamentMatch[] | null
}

type TeamRulesPreview = {
  show_on_team_page: boolean
  rules_text: string | null
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
  return yiq >= 170 ? '#090d16' : '#ffffff'
}

function normalizeName(name?: string | null) {
  if (!name) return ''
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeMatch(raw: Record<string, unknown>): TournamentMatch {
  const team1_id = raw.team1_id ?? raw.team_1_id ?? raw.home_team_id ?? raw.team1 ?? null
  const team2_id = raw.team2_id ?? raw.team_2_id ?? raw.away_team_id ?? raw.team2 ?? null

  const team1_name =
    (raw.team1_name as string) ??
    (raw.team_1_name as string) ??
    (raw.home_team_name as string) ??
    (typeof raw.team1 === 'string' ? raw.team1 : null) ??
    null
  const team2_name =
    (raw.team2_name as string) ??
    (raw.team_2_name as string) ??
    (raw.away_team_name as string) ??
    (typeof raw.team2 === 'string' ? raw.team2 : null) ??
    null

  const rawStatus = (raw.status ?? 'scheduled').toString().toLowerCase()

  return {
    ...raw,
    id: (raw.id as number | string) ?? Math.random(),
    tournament_id: (raw.tournament_id as number | string) ?? null,
    group_id: (raw.group_id as number | string) ?? (raw.groupId as number | string) ?? null,
    phase:
      (raw.phase as string) ??
      (raw.round_name as string) ??
      (raw.ko_phase as string) ??
      (raw.group_id ? 'Gruppenspiel' : 'KO-Runde'),
    team1_id: team1_id as number | string | null,
    team2_id: team2_id as number | string | null,
    team1_name,
    team2_name,
    team1_score: (raw.team1_score as number) ?? (raw.score1 as number) ?? null,
    team2_score: (raw.team2_score as number) ?? (raw.score2 as number) ?? null,
    status: rawStatus,
    scheduled_time: (raw.scheduled_time as string) ?? (raw.start_time as string) ?? null,
    table_number: (raw.table_number as number) ?? (raw.table as number) ?? null,
  }
}

function isKoPhaseMatch(m: TournamentMatch): boolean {
  if (m.group_id === null || m.group_id === undefined) return true
  if (!m.phase) return false
  const p = m.phase.toLowerCase()
  return (
    p.includes('ko') ||
    p.includes('final') ||
    p.includes('achtel') ||
    p.includes('viertel') ||
    p.includes('halb') ||
    p.includes('runde') ||
    p.includes('platz')
  )
}

function calculateStandings(
  teams: Team[],
  groupTeamIds: Set<string>,
  matches: TournamentMatch[],
  groupMembers?: GroupMemberData[],
): GroupStanding[] {
  const groupTeams = teams.filter((t) => groupTeamIds.has(String(t.id)))
  const groupMatches = matches.filter(
    (m) =>
      ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()) &&
      m.team1_id &&
      m.team2_id &&
      groupTeamIds.has(String(m.team1_id)) &&
      groupTeamIds.has(String(m.team2_id)),
  )

  const statsMap = new Map<string, GroupStanding>()

  groupTeams.forEach((t) => {
    const member = groupMembers?.find((m) => String(m.team_id) === String(t.id))
    statsMap.set(String(t.id), {
      teamId: t.id,
      teamName: t.name,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      manualRank: member?.manual_rank ?? null,
    })
  })

  groupMatches.forEach((m) => {
    const t1 = statsMap.get(String(m.team1_id))
    const t2 = statsMap.get(String(m.team2_id))

    if (m.team1_score !== null && m.team2_score !== null) {
      if (t1) {
        t1.played++
        t1.goalsFor += m.team1_score
        t1.goalsAgainst += m.team2_score
        t1.goalDiff = t1.goalsFor - t1.goalsAgainst
      }
      if (t2) {
        t2.played++
        t2.goalsFor += m.team2_score
        t2.goalsAgainst += m.team1_score
        t2.goalDiff = t2.goalsFor - t2.goalsAgainst
      }

      if (m.team1_score > m.team2_score) {
        if (t1) {
          t1.wins++
          t1.points += 3
        }
        if (t2) {
          t2.losses++
        }
      } else if (m.team2_score > m.team1_score) {
        if (t2) {
          t2.wins++
          t2.points += 3
        }
        if (t1) {
          t1.losses++
        }
      } else {
        if (t1) {
          t1.draws++
          t1.points += 1
        }
        if (t2) {
          t2.draws++
          t2.points += 1
        }
      }
    }
  })

  // Direkter Vergleich (Head-to-Head)
  const getHeadToHead = (aId: string | number, bId: string | number): number => {
    const directMatches = groupMatches.filter(
      (m) =>
        (String(m.team1_id) === String(aId) && String(m.team2_id) === String(bId)) ||
        (String(m.team1_id) === String(bId) && String(m.team2_id) === String(aId)),
    )
    if (directMatches.length === 0) return 0

    let pA = 0
    let pB = 0
    directMatches.forEach((m) => {
      const s1 = m.team1_score!
      const s2 = m.team2_score!
      if (String(m.team1_id) === String(aId)) {
        if (s1 > s2) pA += 3
        else if (s2 > s1) pB += 3
        else {
          pA += 1
          pB += 1
        }
      } else {
        if (s2 > s1) pA += 3
        else if (s1 > s2) pB += 3
        else {
          pA += 1
          pB += 1
        }
      }
    })
    return pB - pA // Negativ -> A hat mehr Punkte im direkten Vergleich
  }

  return Array.from(statsMap.values()).sort((a, b) => {
    // 1. Punkte
    if (b.points !== a.points) return b.points - a.points
    // 2. Tordifferenz
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
    // 3. Eigene Tore / Becher
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    // 4. Direkter Vergleich
    const h2h = getHeadToHead(a.teamId, b.teamId)
    if (h2h !== 0) return h2h
    // 5. Manueller Admin-Overrule
    const rA = a.manualRank ?? 999
    const rB = b.manualRank ?? 999
    if (rA !== rB) return rA - rB
    // 6. Alphabetisch
    return a.teamName.localeCompare(b.teamName)
  })
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatTimeOnly(dateStr: string) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
}

export default function CleanPublicTeamPage() {
  const params = useParams()
  const router = useRouter()
  const rawSlug = (params?.slug as string) || ''
  const rawTeamId = (params?.teamId as string) || ''

  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [team, setTeam] = useState<Team | null>(null)
  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [group, setGroup] = useState<Group | null>(null)
  const [groupMembers, setGroupMembers] = useState<GroupMemberData[]>([])
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [changingPayment, setChangingPayment] = useState(false)
  const [payingWithPayPal, setPayingWithPayPal] = useState(false)
  const [error, setError] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [teamRulesPreview, setTeamRulesPreview] = useState<TeamRulesPreview | null>(null)

  // EDIT-MODE FÜR SPIELER-NAMEN
  const [isEditing, setIsEditing] = useState(false)
  const [editPlayer1, setEditPlayer1] = useState('')
  const [editPlayer2, setEditPlayer2] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsMessage, setDetailsMessage] = useState('')

  useEffect(() => {
    document.body.classList.add('hide-nav')
    return () => {
      document.body.classList.remove('hide-nav')
    }
  }, [])

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      const queryParams = new URLSearchParams(window.location.search)
      const tokenFromQuery = queryParams.get('t')
      const teamIdOrToken = tokenFromQuery || rawTeamId

      if (!teamIdOrToken) {
        setError('Keine gültige Team-ID oder Token angegeben.')
        setLoading(false)
        setRefreshing(false)
        return
      }

      try {
        let loadedTeam: Team | null = null
        let loadedTournament: TournamentInfo | null = null
        let loadedGroup: Group | null = null
        let loadedTeams: Team[] = []
        let loadedMatches: TournamentMatch[] = []
        let loadedGroupMembers: GroupMemberData[] = []

        // 1. RPC Call
        try {
          const { data: rpcData } = await supabase.rpc('get_public_team_page', {
            p_token: teamIdOrToken,
          })

          if (rpcData && (rpcData as PublicTeamPage).team) {
            const pageData = rpcData as PublicTeamPage
            loadedTeam = pageData.team ?? null
            loadedTournament = pageData.tournament ?? null
            loadedGroup = pageData.group ?? null
            loadedTeams = pageData.teams ?? []
            if (pageData.matches) {
              loadedMatches = pageData.matches.map((m) => normalizeMatch(m as Record<string, unknown>))
            }
          }
        } catch (err) {
          console.warn('RPC Fallback get_public_team_page:', err)
        }

        // 2. Fallback Direct Selects
        if (!loadedTeam) {
          const { data: tourneyData } = await supabase
            .from('tournaments')
            .select('*')
            .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
            .maybeSingle()

          if (tourneyData) {
            loadedTournament = tourneyData as TournamentInfo
          }

          const isNumericId = !isNaN(Number(teamIdOrToken)) && Number(teamIdOrToken) > 0
          let teamRes

          if (isNumericId) {
            teamRes = await supabase.from('teams').select('*').eq('id', Number(teamIdOrToken)).maybeSingle()
          } else {
            teamRes = await supabase
              .from('teams')
              .select('*')
              .or(`access_token.eq."${teamIdOrToken}",id.eq."${teamIdOrToken}"`)
              .maybeSingle()
          }

          if (teamRes?.data) {
            loadedTeam = teamRes.data as Team
          }

          if (loadedTeam) {
            const tournamentId = loadedTeam.tournament_id || loadedTournament?.id

            if (tournamentId) {
              if (!loadedTournament) {
                const { data: tData } = await supabase
                  .from('tournaments')
                  .select('*')
                  .eq('id', tournamentId)
                  .maybeSingle()
                if (tData) loadedTournament = tData as TournamentInfo
              }

              const { data: allTeams } = await supabase.from('teams').select('*').eq('tournament_id', tournamentId)
              loadedTeams = (allTeams || []) as Team[]

              const { data: groupMember } = await supabase
                .from('group_members')
                .select('group_id, manual_rank')
                .eq('team_id', loadedTeam.id)
                .maybeSingle()

              const groupId = groupMember?.group_id || (loadedTeam as Record<string, unknown>).group_id
              if (groupId) {
                const { data: gData } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle()
                if (gData) loadedGroup = gData as Group

                // Alle Members der Gruppe inkl. manual_rank abrufen
                const { data: allGroupMembers } = await supabase
                  .from('group_members')
                  .select('team_id, manual_rank')
                  .eq('group_id', groupId)

                if (allGroupMembers) {
                  loadedGroupMembers = allGroupMembers as GroupMemberData[]
                }
              }

              const { data: matchesData } = await supabase.from('matches').select('*').eq('tournament_id', tournamentId)
              if (matchesData) {
                loadedMatches = matchesData.map((m) => normalizeMatch(m as Record<string, unknown>))
              }
            }
          }
        } else if (loadedGroup?.id) {
          // Falls über RPC geladen, Mitglieder für manual_rank abfragen
          const { data: allGroupMembers } = await supabase
            .from('group_members')
            .select('team_id, manual_rank')
            .eq('group_id', loadedGroup.id)

          if (allGroupMembers) {
            loadedGroupMembers = allGroupMembers as GroupMemberData[]
          }
        }

        if (!loadedTeam) {
          setError('Team konnte nicht gefunden werden.')
          return
        }

        setTeam(loadedTeam)
        setTournament(loadedTournament)
        setGroup(loadedGroup)
        setGroupMembers(loadedGroupMembers)
        setTeams(loadedTeams)
        setMatches(loadedMatches)
        setError('')

        if (!isEditing) {
          setEditPlayer1(loadedTeam.player1 || '')
          setEditPlayer2(loadedTeam.player2 || '')
        }

        // 3. Echte Turnier-Regeln direkt aus tournament_rules abrufen
        if (loadedTournament?.id) {
          const { data: rulesData } = await supabase
            .from('tournament_rules')
            .select('*')
            .eq('tournament_id', loadedTournament.id)
            .maybeSingle()

          if (rulesData) {
            const rulesText =
              rulesData.team_summary ||
              rulesData.rules_summary ||
              rulesData.rules ||
              rulesData.rules_text ||
              rulesData.content ||
              ''

            setTeamRulesPreview({
              show_on_team_page: rulesData.show_on_team_page ?? true,
              rules_text: typeof rulesText === 'string' ? rulesText : '',
            })
          }
        }
      } catch (err) {
        console.error(err)
        setError('Ein Fehler beim Laden der Daten ist aufgetreten.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [slug, rawSlug, rawTeamId, isEditing],
  )

  useEffect(() => {
    void loadData()
    const channel = supabase
      .channel('clean-public-team-channel')
      .on('broadcast', { event: 'refresh' }, () => void loadData(true))
      .subscribe()

    const timer = setInterval(() => void loadData(), 10000)
    return () => {
      clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!team) return
    setSavingDetails(true)
    setDetailsMessage('')

    try {
      const finalP1 = editPlayer1.trim()
      const finalP2 = editPlayer2.trim()

      const { error: updateErr } = await supabase
        .from('teams')
        .update({ player1: finalP1, player2: finalP2 })
        .eq('id', team.id)

      if (updateErr) {
        setDetailsMessage('Fehler beim Speichern: ' + updateErr.message)
      } else {
        setTeam((prev) => (prev ? { ...prev, player1: finalP1, player2: finalP2 } : prev))
        setDetailsMessage('✓ Spieler-Namen erfolgreich aktualisiert!')
        setIsEditing(false)
        await loadData(true)
      }
    } catch {
      setDetailsMessage('Netzwerkfehler beim Speichern.')
    } finally {
      setSavingDetails(false)
    }
  }

  async function changePaymentMethod(method: 'bar' | 'paypal' | 'ueberweisung') {
    if (!team || team.payment_status === 'bezahlt') return
    setChangingPayment(true)
    setPaymentMessage('')

    try {
      const token = new URLSearchParams(window.location.search).get('t') || rawTeamId
      const res = await fetch('/api/team-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, payment_method: method }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setPaymentMessage(json.error || 'Fehler beim Ändern.')
        return
      }

      setTeam((prev) => (prev ? { ...prev, payment_method: method } : prev))
      setPaymentMessage('✓ Zahlungsart aktualisiert.')
      await loadData(true)
    } catch {
      setPaymentMessage('Netzwerkfehler.')
    } finally {
      setChangingPayment(false)
    }
  }

  async function createPayPalOrder() {
    if (!team) throw new Error('Team fehlt')
    const token = new URLSearchParams(window.location.search).get('t') || rawTeamId
    setPayingWithPayPal(true)

    const res = await fetch('/api/paypal/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const json = await res.json()
    if (!res.ok || !json.order_id) throw new Error(json.error || 'PayPal Fehler')
    return json.order_id
  }

  async function capturePayPalOrder(orderId: string) {
    const token = new URLSearchParams(window.location.search).get('t') || rawTeamId
    const res = await fetch('/api/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, order_id: orderId }),
    })
    if (!res.ok) throw new Error('PayPal Abschluss fehlgeschlagen')

    setTeam((prev) => (prev ? { ...prev, payment_status: 'bezahlt', payment_method: 'paypal' } : prev))
    setPaymentMessage('✓ PayPal-Zahlung erfolgreich!')
    setPayingWithPayPal(false)
    await loadData(true)
  }

  const standings = useMemo(() => {
    if (!group || !team) return []

    const groupTeamIds = new Set<string>()
    groupTeamIds.add(String(team.id))

    teams.forEach((t) => {
      if (
        (t as Record<string, unknown>).group_id &&
        String((t as Record<string, unknown>).group_id) === String(group.id)
      ) {
        groupTeamIds.add(String(t.id))
      }
    })

    matches.forEach((m) => {
      if (m.group_id !== null && m.group_id !== undefined && String(m.group_id) === String(group.id)) {
        if (m.team1_id !== null && m.team1_id !== undefined) groupTeamIds.add(String(m.team1_id))
        if (m.team2_id !== null && m.team2_id !== undefined) groupTeamIds.add(String(m.team2_id))
      }
    })

    return calculateStandings(teams, groupTeamIds, matches, groupMembers)
  }, [group, team, teams, matches, groupMembers])

  const myGroupRank = useMemo(() => {
    if (!group || standings.length === 0 || !team) return null
    const idx = standings.findIndex((s) => String(s.teamId) === String(team.id))
    return idx !== -1 ? idx + 1 : null
  }, [group, standings, team])

  const rankPlaceholders = useMemo(() => {
    if (!myGroupRank || !group) return []
    const gName = group.name.trim()
    const cleanGName = gName.replace(/gruppe/i, '').trim()

    return [
      `${myGroupRank}. ${gName}`.toLowerCase(),
      `${myGroupRank}.${gName}`.toLowerCase(),
      `${myGroupRank}. platz ${gName}`.toLowerCase(),
      `${myGroupRank}${cleanGName}`.toLowerCase(),
      `${myGroupRank}. ${cleanGName}`.toLowerCase(),
      `sieger ${gName}`.toLowerCase(),
      `1. gruppe ${cleanGName}`.toLowerCase(),
      `2. gruppe ${cleanGName}`.toLowerCase(),
    ]
  }, [myGroupRank, group])

  const inspectMatchForTeam = useCallback(
    (m: TournamentMatch): boolean => {
      if (!team) return false
      const myIdStr = String(team.id)
      const myNameNorm = normalizeName(team.name)

      const ignoredKeys = new Set([
        'id',
        'tournament_id',
        'group_id',
        'groupid',
        'round',
        'table_number',
        'table',
        'status',
        'scheduled_time',
        'created_at',
        'updated_at',
      ])

      for (const [key, val] of Object.entries(m)) {
        if (val === null || val === undefined || ignoredKeys.has(key.toLowerCase())) continue

        const valStr = String(val).trim()
        const valNorm = normalizeName(valStr)

        if (valStr === myIdStr) return true
        if (valNorm && valNorm === myNameNorm) return true
        if (rankPlaceholders.length > 0 && rankPlaceholders.some((p) => valNorm.includes(p))) return true
      }

      return false
    },
    [team, rankPlaceholders],
  )

  const isMyMatch = useCallback((m: TournamentMatch) => inspectMatchForTeam(m), [inspectMatchForTeam])

  const getOpponent = useCallback(
    (m: TournamentMatch) => {
      if (!team) return 'Unbekannt'
      const myIdStr = String(team.id)
      const myNameNorm = normalizeName(team.name)

      const m1Name = normalizeName(m.team1_name)
      const isT1Me =
        (m.team1_id !== null && m.team1_id !== undefined && String(m.team1_id) === myIdStr) ||
        m1Name === myNameNorm ||
        rankPlaceholders.some((p) => m1Name.includes(p))

      const oppId = isT1Me ? m.team2_id : m.team1_id
      const oppNameField = isT1Me ? m.team2_name : m.team1_name

      if (oppId !== null && oppId !== undefined) {
        const found = teams.find((t) => String(t.id) === String(oppId))
        if (found) return found.name
      }

      if (oppNameField) return oppNameField

      return 'TBD (Gegner offen)'
    },
    [team, teams, rankPlaceholders],
  )

  const getMyScore = useCallback(
    (m: TournamentMatch) => {
      if (!team) return null
      const myIdStr = String(team.id)
      const myNameNorm = normalizeName(team.name)
      const m1Name = normalizeName(m.team1_name)
      const isT1Me =
        (m.team1_id !== null && m.team1_id !== undefined && String(m.team1_id) === myIdStr) ||
        m1Name === myNameNorm ||
        rankPlaceholders.some((p) => m1Name.includes(p))

      return isT1Me ? m.team1_score : m.team2_score
    },
    [team, rankPlaceholders],
  )

  const getOppScore = useCallback(
    (m: TournamentMatch) => {
      if (!team) return null
      const myIdStr = String(team.id)
      const myNameNorm = normalizeName(team.name)
      const m1Name = normalizeName(m.team1_name)
      const isT1Me =
        (m.team1_id !== null && m.team1_id !== undefined && String(m.team1_id) === myIdStr) ||
        m1Name === myNameNorm ||
        rankPlaceholders.some((p) => m1Name.includes(p))

      return isT1Me ? m.team2_score : m.team1_score
    },
    [team, rankPlaceholders],
  )

  const finishedMatches = useMemo(
    () =>
      matches
        .filter((m) => isMyMatch(m) && ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()))
        .sort((a, b) => String(b.id).localeCompare(String(a.id))),
    [matches, isMyMatch],
  )

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((m) => isMyMatch(m) && !['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()))
        .sort((a, b) => {
          if (a.scheduled_time && b.scheduled_time) {
            return new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
          }
          return String(a.id).localeCompare(String(b.id))
        }),
    [matches, isMyMatch],
  )

  const allKoMatches = useMemo(() => matches.filter((m) => isKoPhaseMatch(m)), [matches])

  const rulesList = useMemo(() => {
    if (!teamRulesPreview?.rules_text) return null
    return teamRulesPreview.rules_text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  }, [teamRulesPreview])

  const entryFee = Number(tournament?.entry_fee ?? 0)
  const isPaid = team?.payment_status === 'bezahlt'

  const isTournamentFinished = useMemo(() => {
    if (tournament?.status === 'finished') return true
    if (
      matches.length > 0 &&
      matches.every((m) => ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()))
    )
      return true
    return false
  }, [tournament, matches])

  const isWinnerTeam = useMemo(() => {
    if (!isTournamentFinished || !team?.id) return false
    const finalMatch = matches.find(
      (m) =>
        m.phase?.toLowerCase().includes('finale') &&
        ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()),
    )
    if (!finalMatch) return false
    const t1Win =
      finalMatch.team1_score !== null &&
      finalMatch.team2_score !== null &&
      finalMatch.team1_score > finalMatch.team2_score
    const winnerId = t1Win ? finalMatch.team1_id : finalMatch.team2_id
    return String(winnerId) === String(team.id)
  }, [isTournamentFinished, matches, team])

  const primaryColor = tournament?.primary_color?.trim() || '#22c55e'
  const primaryContrastText = getContrastTextColor(primaryColor)
  const tournamentSlugParam = tournament?.slug || tournament?.id || rawSlug || '1'

  useEffect(() => {
    if (isWinnerTeam && team?.id && tournament?.id) {
      const storageKey = `winner_redirect_${tournament.id}_${team.id}`
      const hasRedirected = sessionStorage.getItem(storageKey)
      if (!hasRedirected) {
        sessionStorage.setItem(storageKey, 'true')
        router.push(`/turnier/${encodeURIComponent(tournamentSlugParam)}/sieger`)
      }
    }
  }, [isWinnerTeam, team?.id, tournament?.id, tournamentSlugParam, router])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Lade Team-Portal …</p>
        </div>
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 [color-scheme:dark]">
        <div className="mx-auto my-12 max-w-lg rounded-[32px] border border-red-500/30 bg-black/40 p-6 text-center backdrop-blur-xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-slate-100">Zugriff verweigert</h2>
          <p className="mt-1 text-xs font-semibold text-red-300">{error || 'Team nicht gefunden.'}</p>
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="mt-6 w-full rounded-2xl py-3 text-xs font-black transition shadow-lg"
            style={{ backgroundColor: primaryColor, color: primaryContrastText }}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100 [color-scheme:dark]">
      <style>{`
        body.hide-nav nav, body.hide-nav header, body.hide-nav .global-navigation-box {
          display: none !important;
        }
      `}</style>

      {/* GEWINNER BANNER */}
      {isWinnerTeam && (
        <section className="rounded-[32px] border border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-500/20 p-6 text-center shadow-2xl backdrop-blur-xl animate-pulse sm:p-8">
          <span className="text-4xl sm:text-5xl">🏆 🥇 🏆</span>
          <h2 className="mt-2 text-2xl font-black text-amber-300 sm:text-3xl">
            Herzlichen Glückwunsch zum Turniersieg! 🎉
          </h2>
          <p className="mt-1 text-xs font-bold text-amber-100 sm:text-sm">Ihr habt euch den 1. Platz gesichert!</p>
          <a
            href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/sieger`}
            className="mt-4 inline-block rounded-2xl bg-amber-400 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 transition shadow-lg hover:bg-amber-300"
          >
            Zur offiziellen Siegerseite →
          </a>
        </section>
      )}

      {/* 1. KONTROLLZENTRUM BLOCK */}
      <section className="rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/50 text-3xl shadow-inner sm:h-20 sm:w-20">
              {tournament?.logo_url ? (
                <img
                  src={tournament.logo_url}
                  alt={tournament.name || 'Logo'}
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                '🏆'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                Kontrollzentrum
              </span>

              {!isEditing ? (
                <>
                  <div className="flex items-center gap-3">
                    <h1 className="mt-0.5 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
                      {team.name}
                    </h1>
                    <button
                      type="button"
                      onClick={() => {
                        setEditPlayer1(team.player1 || '')
                        setEditPlayer2(team.player2 || '')
                        setIsEditing(true)
                        setDetailsMessage('')
                      }}
                      className="shrink-0 rounded-xl border border-white/10 bg-black/50 px-2.5 py-1 text-xs font-bold text-slate-200 transition hover:border-white/20 hover:bg-black/70"
                    >
                      ✏️ Spieler bearbeiten
                    </button>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-300 sm:text-sm">
                    👤 Spieler: {team.player1 || 'Name offen'} &amp; {team.player2 || 'Name offen'}
                  </p>
                </>
              ) : (
                <form onSubmit={handleSaveDetails} className="mt-2 max-w-lg space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Spieler 1 Name
                      </label>
                      <input
                        type="text"
                        value={editPlayer1}
                        onChange={(e) => setEditPlayer1(e.target.value)}
                        placeholder="Name Spieler 1"
                        className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Spieler 2 Name
                      </label>
                      <input
                        type="text"
                        value={editPlayer2}
                        onChange={(e) => setEditPlayer2(e.target.value)}
                        placeholder="Name Spieler 2"
                        className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={savingDetails}
                      className="rounded-xl px-4 py-2 text-xs font-black transition shadow"
                      style={{ backgroundColor: primaryColor, color: primaryContrastText }}
                    >
                      {savingDetails ? 'Speichere...' : '💾 Speichern'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-xl border border-white/10 bg-black/50 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-black/70"
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>
              )}

              {detailsMessage && <p className="mt-2 text-xs font-bold text-emerald-400">{detailsMessage}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
            <span className="rounded-full border border-white/10 bg-black/50 px-3.5 py-1.5 text-xs font-bold text-slate-200">
              📌 {group?.name || 'Gruppe offen'}
            </span>
            <span
              className={`rounded-full px-3.5 py-1.5 text-xs font-black ${
                isPaid
                  ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                  : 'border border-amber-500/30 bg-amber-500/20 text-amber-300'
              }`}
            >
              {isPaid ? '🟢 Bezahlt' : '🟡 Zahlung offen'}
            </span>
            <span
              className={`rounded-full px-3.5 py-1.5 text-xs font-black ${
                team.checkin_status
                  ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                  : 'border border-white/10 bg-black/50 text-slate-400'
              }`}
            >
              {team.checkin_status ? '🟢 Eingecheckt' : '⚪ Nicht eingecheckt'}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <div className="flex flex-wrap gap-2">
            <a
              href={`/turnier/${encodeURIComponent(tournamentSlugParam)}`}
              className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-black/70 hover:text-white"
            >
              🌐 Hauptseite
            </a>
            <a
              href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/live`}
              className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-black/70 hover:text-white"
            >
              🔴 Live-Spielplan
            </a>
            <a
              href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/regeln`}
              className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-black/70 hover:text-white"
            >
              📜 Regeln
            </a>
            <a
              href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/stats`}
              className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-black/70 hover:text-white"
            >
              📊 Statistiken
            </a>
            {isTournamentFinished && (
              <a
                href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/sieger`}
                className="animate-pulse rounded-xl border border-amber-500/40 bg-amber-500/20 px-3.5 py-2 text-xs font-black text-amber-300 transition hover:bg-amber-500/30"
              >
                🥇 Sieger &amp; Platzierungen
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:bg-black/70 disabled:opacity-50"
          >
            {refreshing ? '🔄 Lade...' : '🔄 Aktualisieren'}
          </button>
        </div>
      </section>

      {/* 2. TABELLE (NUR EIGENE GRUPPE) */}
      <section className="space-y-4 rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
              {group?.name || 'Gruppe'}
            </p>
            <h2 className="text-xl font-black text-white sm:text-2xl">Tabelle</h2>
          </div>
          <span className="text-2xl">📈</span>
        </div>

        {group && standings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase text-slate-400">
                  <th className="w-10 py-2.5 px-2 text-center">Pl.</th>
                  <th className="py-2.5 px-3">Team</th>
                  <th className="py-2.5 px-2 text-center">Sp</th>
                  <th className="py-2.5 px-2 text-center text-emerald-400">S</th>
                  <th className="py-2.5 px-2 text-center text-amber-400">U</th>
                  <th className="py-2.5 px-2 text-center text-red-400">N</th>
                  <th className="py-2.5 px-2 text-center">Tore</th>
                  <th className="py-2.5 px-2 text-center">Diff</th>
                  <th className="w-16 py-2.5 px-3 text-right font-black text-white">Pkt.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 font-bold text-slate-200">
                {standings.map((st, idx) => {
                  const isMe = String(st.teamId) === String(team.id)
                  const diffText = st.goalDiff > 0 ? `+${st.goalDiff}` : `${st.goalDiff}`
                  return (
                    <tr
                      key={st.teamId}
                      className={`transition ${isMe ? 'bg-emerald-500/20 font-black text-white' : ''}`}
                    >
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-black ${
                            idx === 0
                              ? 'border border-amber-500/30 bg-amber-500/20 text-amber-300'
                              : isMe
                              ? 'bg-emerald-500 text-slate-950'
                              : 'border border-white/10 bg-black/50 text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-extrabold text-white">{st.teamName}</td>
                      <td className="py-3 px-2 text-center font-mono text-slate-400">{st.played}</td>
                      <td className="py-3 px-2 text-center font-mono text-emerald-400">{st.wins}</td>
                      <td className="py-3 px-2 text-center font-mono text-amber-400">{st.draws}</td>
                      <td className="py-3 px-2 text-center font-mono text-red-400">{st.losses}</td>
                      <td className="py-3 px-2 text-center font-mono text-slate-300">
                        {st.goalsFor}:{st.goalsAgainst}
                      </td>
                      <td className="py-3 px-2 text-center font-mono font-black">
                        <span
                          className={
                            st.goalDiff > 0 ? 'text-emerald-400' : st.goalDiff < 0 ? 'text-red-400' : 'text-slate-400'
                          }
                        >
                          {diffText}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-sm font-black" style={{ color: primaryColor }}>
                        {st.points}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-6 text-center text-xs font-bold text-slate-300 backdrop-blur-md">
            Tabelle wird nach der Auslosung angezeigt.
          </div>
        )}
      </section>

      {/* 3. HISTORIE & AUSBLICK */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* HISTORIE / ERGEBNISSE */}
        <section className="space-y-4 rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                Historie
              </p>
              <h2 className="text-xl font-black text-white">Ergebnisse</h2>
            </div>
            <span className="text-2xl">🏆</span>
          </div>

          {finishedMatches.length > 0 ? (
            <div className="space-y-3">
              {finishedMatches.map((m) => {
                const s1 = getMyScore(m),
                  s2 = getOppScore(m)
                const won = s1 !== null && s2 !== null && s1 > s2
                const drawn = s1 !== null && s2 !== null && s1 === s2
                const isKo = isKoPhaseMatch(m)
                return (
                  <div
                    key={m.id}
                    className="space-y-2.5 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-black ${
                            won
                              ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                              : drawn
                              ? 'border-amber-500/30 bg-amber-500/20 text-amber-300'
                              : 'border-red-500/30 bg-red-500/20 text-red-300'
                          }`}
                        >
                          {won ? 'W' : drawn ? '=' : 'L'}
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[150px] truncate text-xs font-extrabold text-white sm:text-sm">
                            {getOpponent(m)}
                          </p>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isKo ? 'font-black text-amber-400' : 'text-slate-400'
                            }`}
                          >
                            {isKo ? `⚡ ${m.phase || 'KO-Spiel'}` : 'Gruppenspiel'}
                          </span>
                        </div>
                      </div>
                      <span className="ml-2 font-mono text-base font-black text-white">
                        {s1} : {s2}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-bold text-slate-400">
                      <span>⏰ {m.scheduled_time ? formatDateTime(m.scheduled_time) : 'Zeit k.A.'}</span>
                      <span>🏓 {m.table_number ? `Tisch ${m.table_number}` : 'Tisch TBD'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-6 text-center text-xs font-bold text-slate-300 backdrop-blur-md">
              Noch keine beendeten Spiele.
            </div>
          )}
        </section>

        {/* AUSBLICK / KOMMENDE SPIELE */}
        <section className="space-y-4 rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                Ausblick
              </p>
              <h2 className="text-xl font-black text-white">Kommende Spiele</h2>
            </div>
            <span className="text-2xl">📅</span>
          </div>

          {upcomingMatches.length > 0 ? (
            <div className="space-y-3">
              {upcomingMatches.map((m) => {
                const isKo = isKoPhaseMatch(m)
                return (
                  <div
                    key={m.id}
                    className={`space-y-2.5 rounded-2xl border p-4 backdrop-blur-md ${
                      isKo ? 'border-amber-500/30 bg-amber-500/10' : 'border-white/10 bg-black/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          isKo
                            ? 'border-amber-500/30 bg-amber-500/20 text-amber-300'
                            : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {isKo ? `⚡ ${m.phase || 'Achtelfinale / KO-Runde'}` : 'Gruppenspiel'}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-slate-200">
                        ⏰ {m.scheduled_time ? formatTimeOnly(m.scheduled_time) : 'Zeit offen'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-0.5 text-xs font-black text-white sm:text-sm">
                      <span className="max-w-[130px] truncate" style={{ color: primaryColor }}>
                        {team.name}
                      </span>
                      <span className="px-2 text-xs font-bold text-slate-500">VS</span>
                      <span className="max-w-[130px] truncate text-slate-200">{getOpponent(m)}</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-bold text-slate-400">
                      <span>
                        🏓{' '}
                        <strong className="text-slate-200">
                          {m.table_number ? `Tisch ${m.table_number}` : 'Tisch TBD'}
                        </strong>
                      </span>
                      <span>
                        ⏰{' '}
                        <strong className="text-slate-200">
                          {m.scheduled_time ? formatDateTime(m.scheduled_time) : 'Offen'}
                        </strong>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-6 text-center text-xs font-bold text-slate-300 backdrop-blur-md">
              Keine weiteren Spiele ausstehend.
            </div>
          )}
        </section>
      </div>

      {/* 4. REGELN VORSCHAU (ECHTE TURNIERREGELN) */}
      <section className="rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">📜</span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                Wichtige Hinweise
              </p>
            </div>
            <h2 className="text-xl font-black text-white">Turnierregeln &amp; Ablauf</h2>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
              {rulesList && rulesList.length > 0 ? (
                <ul className="list-inside list-disc space-y-2 text-xs font-medium text-slate-300 sm:text-sm">
                  {rulesList.map((line, i) => {
                    const cleanLine = line.replace(/^[•\-\*]\s*/, '')
                    return <li key={i}>{cleanLine}</li>
                  })}
                </ul>
              ) : (
                <p className="text-xs font-medium italic text-slate-400 sm:text-sm">
                  Für dieses Turnier wurden noch keine spezifischen Regel-Hinweise hinterlegt.
                </p>
              )}
            </div>
          </div>
          <a
            href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/regeln`}
            className="shrink-0 self-start whitespace-nowrap rounded-2xl px-5 py-3 text-xs font-black transition shadow-lg sm:self-center sm:text-sm"
            style={{ backgroundColor: primaryColor, color: primaryContrastText }}
          >
            Hier zu allen Regeln →
          </a>
        </div>
      </section>

      {/* 5. KO-PHASE OVERVIEW */}
      {allKoMatches.length > 0 && (
        <section className="space-y-4 rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                Finalrunde
              </p>
              <h2 className="text-xl font-black text-white">KO-Phase Übersicht</h2>
            </div>
            <span className="text-2xl">⚡</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {allKoMatches.map((m) => {
              const isMe = isMyMatch(m)
              const t1 = m.team1_name || teams.find((t) => String(t.id) === String(m.team1_id))?.name || 'TBD'
              const t2 = m.team2_name || teams.find((t) => String(t.id) === String(m.team2_id))?.name || 'TBD'

              return (
                <div
                  key={m.id}
                  className={`space-y-2 rounded-2xl border p-4 backdrop-blur-md ${
                    isMe ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-black/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase" style={{ color: primaryColor }}>
                      {m.phase || 'KO-Spiel'}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-400">
                      {m.scheduled_time ? formatTimeOnly(m.scheduled_time) : ''}{' '}
                      {m.table_number ? `• Tisch ${m.table_number}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-xs font-black text-white sm:text-sm">
                    <span
                      className={
                        isMe &&
                        (normalizeName(t1) === normalizeName(team.name) ||
                          rankPlaceholders.some((p) => normalizeName(t1).includes(p)))
                          ? 'text-emerald-400'
                          : ''
                      }
                    >
                      {t1}
                    </span>
                    <span className="px-2 font-mono text-xs font-bold text-slate-400">
                      {m.team1_score ?? '-'} : {m.team2_score ?? '-'}
                    </span>
                    <span
                      className={
                        isMe &&
                        (normalizeName(t2) === normalizeName(team.name) ||
                          rankPlaceholders.some((p) => normalizeName(t2).includes(p)))
                          ? 'text-emerald-400'
                          : ''
                      }
                    >
                      {t2}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 6. ZAHLUNG & CHECKOUT */}
      <section className="space-y-4 rounded-[32px] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
              Gebühr
            </p>
            <h2 className="text-xl font-black text-white">Zahlung</h2>
            {entryFee > 0 && (
              <p className="mt-0.5 text-xs font-semibold text-slate-300">
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(entryFee)} pro Team
              </p>
            )}
          </div>
          <span className="text-2xl">💶</span>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Status</p>
              <p className={`mt-0.5 text-sm font-black ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isPaid ? '🟢 Bezahlt' : '🟡 Zahlung ausstehend'}
              </p>
            </div>
            <span className="text-xl">{isPaid ? '✅' : '⏳'}</span>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-[10px] font-black uppercase text-slate-400">Gewählte Methode</p>
            <p className="mt-0.5 text-xs font-extrabold text-white sm:text-sm">
              {team.payment_method === 'bar'
                ? '💶 Barzahlung vor Ort'
                : team.payment_method === 'paypal'
                ? '🅿️ PayPal'
                : team.payment_method === 'ueberweisung'
                ? '🏦 Banküberweisung'
                : 'Noch nicht gewählt'}
            </p>
          </div>

          {!isPaid && (
            <div className="space-y-3 border-t border-white/10 pt-3">
              <p className="text-xs font-bold text-slate-300">Zahlungsart ändern:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {tournament?.cash_enabled && (
                  <button
                    type="button"
                    disabled={changingPayment}
                    onClick={() => void changePaymentMethod('bar')}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-black transition ${
                      team.payment_method === 'bar'
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/20 hover:bg-black/70'
                    }`}
                  >
                    Bar vor Ort
                  </button>
                )}
                {tournament?.bank_transfer_enabled && (
                  <button
                    type="button"
                    disabled={changingPayment}
                    onClick={() => void changePaymentMethod('ueberweisung')}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-black transition ${
                      team.payment_method === 'ueberweisung'
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/20 hover:bg-black/70'
                    }`}
                  >
                    Überweisung
                  </button>
                )}
                {tournament?.paypal_enabled && (
                  <button
                    type="button"
                    disabled={changingPayment}
                    onClick={() => void changePaymentMethod('paypal')}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-black transition ${
                      team.payment_method === 'paypal'
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/20 hover:bg-black/70'
                    }`}
                  >
                    PayPal
                  </button>
                )}
              </div>

              {team.payment_method === 'paypal' &&
                tournament?.paypal_enabled &&
                process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && (
                  <div className="pt-2">
                    <PayPalScriptProvider
                      options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID, currency: 'EUR' }}
                    >
                      <PayPalButtons
                        style={{ layout: 'vertical', shape: 'rect' }}
                        disabled={payingWithPayPal}
                        createOrder={async () => await createPayPalOrder()}
                        onApprove={async (data) => {
                          try {
                            await capturePayPalOrder(data.orderID)
                          } catch (err) {
                            setPaymentMessage(err instanceof Error ? err.message : 'Zahlungsfehler')
                          }
                        }}
                      />
                    </PayPalScriptProvider>
                  </div>
                )}
            </div>
          )}

          {paymentMessage && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300">
              {paymentMessage}
            </p>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-6 text-center text-xs font-medium text-slate-400">
        <p>{tournament?.name || 'Turnier-Portal'}</p>
      </footer>
    </div>
  )
}