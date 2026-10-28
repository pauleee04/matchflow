'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = {
  id: number | string
  name: string
  player1: string
  player2: string
  payment_method: string
  payment_status: string
  checkin_status: boolean
}

type Group = {
  id: number | string
  name: string
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
}

type TournamentInfo = {
  id: number | string
  name: string
  slug?: string | null
  logo_url: string | null
  primary_color: string | null
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
  team_summary: string | null
}

function hexToRgba(hex: string, alpha: number) {
  if (!hex || typeof hex !== 'string') return `rgba(0, 230, 118, ${alpha})`
  const cleanHex = hex.replace('#', '')
  let r = 0, g = 0, b = 0
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16)
    g = parseInt(cleanHex[1] + cleanHex[1], 16)
    b = parseInt(cleanHex[2] + cleanHex[2], 16)
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16)
    g = parseInt(cleanHex.substring(2, 4), 16)
    b = parseInt(cleanHex.substring(4, 6), 16)
  } else {
    return `rgba(0, 230, 118, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
): GroupStanding[] {
  const groupTeams = teams.filter((t) => groupTeamIds.has(String(t.id)))
  const groupMatches = matches.filter(
    (m) =>
      ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()) &&
      m.team1_id && m.team2_id &&
      groupTeamIds.has(String(m.team1_id)) &&
      groupTeamIds.has(String(m.team2_id)),
  )

  const statsMap = new Map<string, GroupStanding>()

  groupTeams.forEach((t) => {
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
        if (t1) { t1.wins++; t1.points += 3 }
        if (t2) { t2.losses++ }
      } else if (m.team2_score > m.team1_score) {
        if (t2) { t2.wins++; t2.points += 3 }
        if (t1) { t1.losses++ }
      } else {
        if (t1) { t1.draws++; t1.points += 1 }
        if (t2) { t2.draws++; t2.points += 1 }
      }
    }
  })

  return Array.from(statsMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return b.wins - a.wins
  })
}

export default function CleanPublicTeamPage() {
  const params = useParams()
  const router = useRouter()
  const rawSlug = (params?.slug as string) || ''

  const [team, setTeam] = useState<Team | null>(null)
  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [group, setGroup] = useState<Group | null>(null)
  const [matches, setMatches] = useState<TournamentMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [changingPayment, setChangingPayment] = useState(false)
  const [payingWithPayPal, setPayingWithPayPal] = useState(false)
  const [error, setError] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [teamRulesPreview, setTeamRulesPreview] = useState<TeamRulesPreview | null>(null)

  useEffect(() => {
    document.body.classList.add('hide-nav')
    return () => {
      document.body.classList.remove('hide-nav')
    }
  }, [])

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const queryParams = new URLSearchParams(window.location.search)
    const token = queryParams.get('t')

    if (!token) {
      setError('Kein gültiger Team-Token angegeben.')
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      const { data, error: rpcErr } = await supabase.rpc('get_public_team_page', {
        p_token: token,
      })

      if (rpcErr || !data) {
        setError('Team konnte nicht geladen werden.')
        return
      }

      const pageData = data as PublicTeamPage
      if (!pageData.team) {
        setError('Team nicht gefunden.')
        return
      }

      const currentTeam = pageData.team
      setTournament(pageData.tournament ?? null)
      setTeam(currentTeam)
      setTeams(pageData.teams ?? [])
      setGroup(pageData.group ?? null)
      setError('')

      const matchMap = new Map<string, TournamentMatch>()

      if (pageData.matches) {
        pageData.matches.forEach((m) => {
          const norm = normalizeMatch(m as Record<string, unknown>)
          matchMap.set(String(norm.id), norm)
        })
      }

      if (pageData.tournament?.id) {
        const tId = pageData.tournament.id
        const tablesToTry = ['tournament_matches', 'ko_matches', 'bracket_matches', 'tournament_ko', 'ko_games']

        const settled = await Promise.allSettled(
          tablesToTry.map((tbl) => supabase.from(tbl).select('*').eq('tournament_id', tId))
        )

        settled.forEach((res) => {
          if (res.status === 'fulfilled' && res.value.data) {
            ;(res.value.data as Record<string, unknown>[]).forEach((row) => {
              const norm = normalizeMatch(row)
              matchMap.set(String(norm.id), norm)
            })
          }
        })
      }

      setMatches(Array.from(matchMap.values()))

      if (pageData.tournament?.id) {
        const { data: rules } = await supabase
          .from('tournament_rules')
          .select('show_on_team_page, team_summary')
          .eq('tournament_id', pageData.tournament.id)
          .maybeSingle()

        if (rules?.show_on_team_page === true) {
          setTeamRulesPreview({
            show_on_team_page: true,
            team_summary: typeof rules.team_summary === 'string' ? rules.team_summary : '',
          })
        }
      }
    } catch (err) {
      console.error(err)
      setError('Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

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

  async function changePaymentMethod(method: 'bar' | 'paypal' | 'ueberweisung') {
    if (!team || team.payment_status === 'bezahlt') return
    setChangingPayment(true)
    setPaymentMessage('')

    try {
      const token = new URLSearchParams(window.location.search).get('t')
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
    const token = new URLSearchParams(window.location.search).get('t')
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
    const token = new URLSearchParams(window.location.search).get('t')
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
      if ((t as Record<string, unknown>).group_id && String((t as Record<string, unknown>).group_id) === String(group.id)) {
        groupTeamIds.add(String(t.id))
      }
    })

    matches.forEach((m) => {
      if (m.group_id !== null && m.group_id !== undefined && String(m.group_id) === String(group.id)) {
        if (m.team1_id !== null && m.team1_id !== undefined) groupTeamIds.add(String(m.team1_id))
        if (m.team2_id !== null && m.team2_id !== undefined) groupTeamIds.add(String(m.team2_id))
      }
    })

    return calculateStandings(teams, groupTeamIds, matches)
  }, [group, team, teams, matches])

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
    [team, rankPlaceholders]
  )

  const isMyMatch = useCallback(
    (m: TournamentMatch) => inspectMatchForTeam(m),
    [inspectMatchForTeam]
  )

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
    [team, teams, rankPlaceholders]
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
    [team, rankPlaceholders]
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
    [team, rankPlaceholders]
  )

  const finishedMatches = useMemo(
    () =>
      matches
        .filter((m) => isMyMatch(m) && ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()))
        .sort((a, b) => String(b.id).localeCompare(String(a.id))),
    [matches, isMyMatch]
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
    [matches, isMyMatch]
  )

  const allKoMatches = useMemo(
    () => matches.filter((m) => isKoPhaseMatch(m)),
    [matches]
  )

  const entryFee = Number(tournament?.entry_fee ?? 0)
  const isPaid = team?.payment_status === 'bezahlt'

  const isTournamentFinished = useMemo(() => {
    if (tournament?.status === 'finished') return true
    if (matches.length > 0 && matches.every((m) => ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()))) return true
    return false
  }, [tournament, matches])

  const isWinnerTeam = useMemo(() => {
    if (!isTournamentFinished || !team?.id) return false
    const finalMatch = matches.find((m) => m.phase?.toLowerCase().includes('finale') && ['finished', 'beendet', 'completed'].includes(m.status.toLowerCase()))
    if (!finalMatch) return false
    const t1Win = finalMatch.team1_score !== null && finalMatch.team2_score !== null && finalMatch.team1_score > finalMatch.team2_score
    const winnerId = t1Win ? finalMatch.team1_id : finalMatch.team2_id
    return String(winnerId) === String(team.id)
  }, [isTournamentFinished, matches, team])

  const primaryColor = tournament?.primary_color || '#00e676'
  const primaryRgba15 = hexToRgba(primaryColor, 0.15)
  const primaryRgba25 = hexToRgba(primaryColor, 0.25)
  const primaryRgba40 = hexToRgba(primaryColor, 0.40)
  const tournamentSlugParam = tournament?.slug || tournament?.id || rawSlug || '1'

  // EINMALIGE WEITERLEITUNG FÜR DEN TURNIERSIEGER
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

  const cardStyle = {
    backgroundColor: 'rgba(5, 12, 8, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(12px)',
  }

  const innerBoxStyle = {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center space-y-3">
          <div
            className="w-10 h-10 rounded-full animate-spin mx-auto"
            style={{
              borderWidth: '4px',
              borderStyle: 'solid',
              borderRightColor: primaryColor,
              borderBottomColor: primaryColor,
              borderLeftColor: primaryColor,
              borderTopColor: 'transparent',
            }}
          />
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: primaryColor }}>
            Lade Team-Portal...
          </p>
        </div>
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4 text-white">
        <div className="max-w-md w-full rounded-[24px] p-8 text-center shadow-2xl border" style={cardStyle}>
          <span className="text-4xl">⚠️</span>
          <h1 className="text-xl font-black mt-4">Zugriff verweigert</h1>
          <p className="text-slate-400 text-sm mt-2">{error || 'Team nicht gefunden.'}</p>
          <button
            onClick={() => void loadData(true)}
            className="mt-6 w-full py-3 font-bold rounded-2xl transition text-sm text-black shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <main
      className="min-h-screen text-slate-100 p-4 sm:p-6 relative selection:bg-emerald-500 selection:text-white"
      style={{ background: tournament?.background_style || '#050c07' }}
    >
      <style>{`
        body.hide-nav nav, body.hide-nav header, body.hide-nav .global-navigation-box {
          display: none !important;
        }
      `}</style>

      {/* WASSERZEICHEN */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        {tournament?.logo_url ? (
          <img
            src={tournament.logo_url}
            alt=""
            draggable={false}
            className="select-none object-contain opacity-[0.06] grayscale filter"
            style={{ width: 'min(65vw, 750px)', maxHeight: '75vh' }}
          />
        ) : (
          <span
            className="select-none text-center font-black uppercase tracking-[0.12em] text-7xl sm:text-9xl opacity-5"
            style={{ color: primaryColor, lineHeight: 1 }}
          >
            {team.name}
          </span>
        )}
      </div>

      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6 relative z-10">
        
        {/* GEWINNER BANNER */}
        {isWinnerTeam && (
          <div className="rounded-[24px] p-6 sm:p-8 text-center bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-500/20 border-2 border-amber-400/60 shadow-2xl backdrop-blur-md animate-pulse">
            <span className="text-5xl">🏆 🥇 🏆</span>
            <h2 className="text-2xl sm:text-4xl font-black text-amber-300 mt-2">Herzlichen Glückwunsch zum Turniersieg! 🎉</h2>
            <p className="text-sm sm:text-base font-bold text-amber-100 mt-1">
              Ihr habt euch den 1. Platz gesichert!
            </p>
            <a
              href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/sieger`}
              className="inline-block mt-4 px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-black rounded-xl text-xs uppercase tracking-wider transition shadow-lg"
            >
              Zur offiziellen Siegerseite →
            </a>
          </div>
        )}

        {/* 1. KONTROLLZENTRUM BLOCK */}
        <section className="rounded-[24px] border p-6 sm:p-8 shadow-xl" style={cardStyle}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border flex items-center justify-center text-3xl shadow-inner overflow-hidden shrink-0" style={innerBoxStyle}>
                {tournament?.logo_url ? (
                  <img src={tournament.logo_url} alt={tournament.name || 'Logo'} className="w-full h-full object-contain p-1.5" />
                ) : (
                  '🏆'
                )}
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
                  Kontrollzentrum
                </span>
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight mt-1 text-white">{team.name}</h1>
                <p className="text-sm font-semibold text-slate-300 mt-1">
                  👤 Spieler: {team.player1} &amp; {team.player2}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap md:flex-col gap-2 md:items-end">
              <span className="px-3.5 py-1.5 border rounded-full text-xs font-bold text-slate-200 shadow-sm" style={innerBoxStyle}>
                📌 {group?.name || 'Gruppe offen'}
              </span>
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-black shadow-sm ${isPaid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                {isPaid ? '🟢 Bezahlt' : '🟡 Zahlung offen'}
              </span>
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-black shadow-sm ${team.checkin_status ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 border'}`} style={!team.checkin_status ? innerBoxStyle : undefined}>
                {team.checkin_status ? '🟢 Eingecheckt' : '⚪ Nicht eingecheckt'}
              </span>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <a
                href={`/turnier/${encodeURIComponent(tournamentSlugParam)}`}
                className="px-3.5 py-2 border rounded-xl text-xs font-bold transition shadow-sm text-slate-200 hover:text-white"
                style={innerBoxStyle}
              >
                🌐 Hauptseite
              </a>
              <a
                href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/live`}
                className="px-3.5 py-2 border rounded-xl text-xs font-bold transition shadow-sm text-slate-200 hover:text-white"
                style={innerBoxStyle}
              >
                🔴 Live-Spielplan
              </a>
              <a
                href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/regeln`}
                className="px-3.5 py-2 border rounded-xl text-xs font-bold transition shadow-sm text-slate-200 hover:text-white"
                style={innerBoxStyle}
              >
                📜 Regeln
              </a>
              <a
                href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/stats`}
                className="px-3.5 py-2 border rounded-xl text-xs font-bold transition shadow-sm text-slate-200 hover:text-white"
                style={innerBoxStyle}
              >
                📊 Statistiken
              </a>
              {isTournamentFinished && (
                <a
                  href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/sieger`}
                  className="px-3.5 py-2 bg-amber-500/30 hover:bg-amber-500/40 border border-amber-500/50 rounded-xl text-xs font-black transition shadow-sm text-amber-200 animate-pulse"
                >
                  🥇 Sieger &amp; Platzierungen
                </a>
              )}
            </div>

            <button
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="px-3.5 py-2 border rounded-xl text-xs font-bold transition disabled:opacity-50 text-slate-200 shadow-sm"
              style={innerBoxStyle}
            >
              {refreshing ? '🔄 Lade...' : '🔄 Aktualisieren'}
            </button>
          </div>
        </section>

        {/* 2. TABELLE (NUR EIGENE GRUPPE) */}
        <section className="rounded-[24px] border p-6 shadow-xl" style={cardStyle}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>{group?.name || 'Gruppe'}</p>
              <h2 className="text-xl sm:text-2xl font-black mt-0.5 text-white">Tabelle</h2>
            </div>
            <span className="text-2xl">📈</span>
          </div>

          {group && standings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-2 font-bold w-12">Pl.</th>
                    <th className="py-3 px-3 font-bold">Team</th>
                    <th className="py-3 px-2 text-center font-bold">Sp</th>
                    <th className="py-3 px-2 text-center font-bold">S</th>
                    <th className="py-3 px-2 text-center font-bold">U</th>
                    <th className="py-3 px-2 text-center font-bold">N</th>
                    <th className="py-3 px-2 text-center font-bold">T</th>
                    <th className="py-3 px-2 text-center font-bold">GT</th>
                    <th className="py-3 px-2 text-center font-bold">Diff</th>
                    <th className="py-3 px-3 text-right font-bold w-16">Pkt.</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((st, idx) => {
                    const isMe = String(st.teamId) === String(team.id)
                    const diffText = st.goalDiff > 0 ? `+${st.goalDiff}` : `${st.goalDiff}`
                    return (
                      <tr
                        key={st.teamId}
                        className="border-b border-white/5 last:border-0 transition-colors"
                        style={
                          isMe
                            ? { backgroundColor: primaryRgba15, color: primaryColor, fontWeight: 800 }
                            : { color: '#cbd5e1' }
                        }
                      >
                        <td className="py-3 px-2">
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-black"
                            style={
                              idx === 0
                                ? { backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#fde047', border: '1px solid rgba(234, 179, 8, 0.4)' }
                                : isMe
                                ? { backgroundColor: primaryRgba25, color: primaryColor, border: `1px solid ${primaryRgba40}` }
                                : { backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8' }
                            }
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-sm">
                          {st.teamName}
                        </td>
                        <td className="py-3 px-2 text-center text-slate-300 font-semibold">{st.played}</td>
                        <td className="py-3 px-2 text-center font-semibold" style={{ color: primaryColor }}>{st.wins}</td>
                        <td className="py-3 px-2 text-center text-slate-300 font-semibold">{st.draws}</td>
                        <td className="py-3 px-2 text-center text-[#ff3b5c] font-semibold">{st.losses}</td>
                        <td className="py-3 px-2 text-center text-slate-300 font-semibold">{st.goalsFor}</td>
                        <td className="py-3 px-2 text-center text-slate-400 font-semibold">{st.goalsAgainst}</td>
                        <td className="py-3 px-2 text-center font-bold" style={{ color: st.goalDiff > 0 ? primaryColor : st.goalDiff < 0 ? '#ff3b5c' : '#94a3b8' }}>
                          {diffText}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-base text-white">{st.points}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-[16px] border p-6 text-center text-slate-400 text-sm" style={innerBoxStyle}>
              Tabelle wird nach Auslosung angezeigt.
            </div>
          )}
        </section>

        {/* 3. HISTORIE & AUSBLICK */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* HISTORIE / ERGEBNISSE */}
          <div className="rounded-[24px] border p-6 shadow-xl" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Historie</p>
                <h2 className="text-xl font-black mt-0.5 text-white">Ergebnisse</h2>
              </div>
              <span className="text-2xl">🏆</span>
            </div>

            {finishedMatches.length > 0 ? (
              <div className="space-y-3">
                {finishedMatches.map((m) => {
                  const s1 = getMyScore(m), s2 = getOppScore(m)
                  const won = s1 !== null && s2 !== null && s1 > s2
                  const drawn = s1 !== null && s2 !== null && s1 === s2
                  const isKo = isKoPhaseMatch(m)
                  return (
                    <div key={m.id} className="p-3.5 rounded-[16px] border space-y-2.5" style={innerBoxStyle}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs border shrink-0"
                            style={
                              won
                                ? { backgroundColor: primaryRgba15, color: primaryColor, borderColor: primaryRgba40 }
                                : drawn
                                ? { backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#fde047', borderColor: 'rgba(234, 179, 8, 0.4)' }
                                : { backgroundColor: 'rgba(255, 59, 92, 0.2)', color: '#ff3b5c', borderColor: 'rgba(255, 59, 92, 0.4)' }
                            }
                          >
                            {won ? 'W' : drawn ? '=' : 'L'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-white truncate max-w-[150px]">{getOpponent(m)}</p>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isKo ? 'text-amber-300 font-extrabold' : 'text-slate-400'}`}>
                              {isKo ? `⚡ ${m.phase || 'KO-Spiel'}` : 'Gruppenspiel'}
                            </span>
                          </div>
                        </div>
                        <span className="font-black text-base text-white ml-2">{s1} : {s2}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
                        <span>⏰ {m.scheduled_time ? formatDateTime(m.scheduled_time) : 'Zeit unbekannt'}</span>
                        <span>🏓 {m.table_number ? `Tisch ${m.table_number}` : 'Tisch TBD'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-[16px] border p-6 text-center text-slate-400 text-sm" style={innerBoxStyle}>
                Noch keine beendeten Spiele.
              </div>
            )}
          </div>

          {/* AUSBLICK / KOMMENDE SPIELE */}
          <div className="rounded-[24px] border p-6 shadow-xl" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Ausblick</p>
                <h2 className="text-xl font-black mt-0.5 text-white">Kommende Spiele</h2>
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
                      className="p-3.5 rounded-[16px] border space-y-2.5"
                      style={
                        isKo
                          ? { backgroundColor: 'rgba(234, 179, 8, 0.12)', borderColor: 'rgba(234, 179, 8, 0.4)' }
                          : innerBoxStyle
                      }
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span
                          className="px-2.5 py-0.5 font-black rounded-lg border text-[11px] uppercase tracking-wider"
                          style={
                            isKo
                              ? { backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#fde047', borderColor: 'rgba(234, 179, 8, 0.5)' }
                              : { backgroundColor: primaryRgba15, color: primaryColor, borderColor: primaryRgba40 }
                          }
                        >
                          {isKo ? `⚡ ${m.phase || 'Achtelfinale / KO-Runde'}` : 'Gruppenspiel'}
                        </span>
                        <span className="text-slate-200 font-bold">
                          ⏰ {m.scheduled_time ? formatTimeOnly(m.scheduled_time) : 'Zeit offen'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center font-black text-sm text-white py-0.5">
                        <span className="truncate max-w-[130px]" style={{ color: primaryColor }}>{team.name}</span>
                        <span className="text-xs font-bold text-slate-500 px-2">VS</span>
                        <span className="truncate max-w-[130px] text-slate-200">{getOpponent(m)}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
                        <span>🏓 <strong className="text-slate-200">{m.table_number ? `Tisch ${m.table_number}` : 'Tisch noch nicht zugewiesen'}</strong></span>
                        <span>⏰ Ansetzungszeit: <strong className="text-slate-200">{m.scheduled_time ? formatDateTime(m.scheduled_time) : 'Offen'}</strong></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-[16px] border p-6 text-center text-slate-400 text-sm" style={innerBoxStyle}>
                Keine weiteren Spiele ausstehend.
              </div>
            )}
          </div>
        </div>

        {/* 4. REGELN VORSCHAU (DIREKT UNTER ERGEBNISSE & KOMMENDE SPIELE) */}
        <section className="rounded-[24px] border p-6 shadow-xl" style={cardStyle}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">📜</span>
                <p className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>
                  Wichtige Hinweise
                </p>
              </div>
              <h2 className="text-xl font-black text-white">Turnierregeln &amp; Ablauf</h2>
              <div className="mt-3 rounded-[16px] border p-4 space-y-2" style={innerBoxStyle}>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {teamRulesPreview?.team_summary ? (
                    teamRulesPreview.team_summary.split('\n').map((l, i) => <li key={i}>• {l}</li>)
                  ) : (
                    <>
                      <li>• Bitte seid mindestens 10 Minuten vor eurem Anpfiff am zugewiesenen Tisch.</li>
                      <li>• Spielstände müssen direkt nach Matchende gemeldet werden.</li>
                      <li>• Fairplay und sportlicher Respekt stehen an oberster Stelle.</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
            <a
              href={`/turnier/${encodeURIComponent(tournamentSlugParam)}/regeln`}
              className="px-5 py-3 rounded-xl text-xs font-black shadow transition text-black whitespace-nowrap self-start sm:self-center shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              Hier zu allen Regeln →
            </a>
          </div>
        </section>

        {/* 5. KO-PHASE OVERVIEW */}
        {allKoMatches.length > 0 && (
          <section className="rounded-[24px] border p-6 shadow-xl" style={cardStyle}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Finalrunde</p>
                <h2 className="text-xl font-black mt-0.5 text-white">KO-Phase Übersicht</h2>
              </div>
              <span className="text-2xl">⚡</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allKoMatches.map((m) => {
                const isMe = isMyMatch(m)
                const t1 = m.team1_name || teams.find((t) => String(t.id) === String(m.team1_id))?.name || 'TBD'
                const t2 = m.team2_name || teams.find((t) => String(t.id) === String(m.team2_id))?.name || 'TBD'

                return (
                  <div key={m.id} className="p-4 rounded-[16px] border space-y-2" style={isMe ? { backgroundColor: primaryRgba15, borderColor: primaryRgba40 } : innerBoxStyle}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase" style={{ color: primaryColor }}>{m.phase || 'KO-Spiel'}</span>
                      <span className="text-[11px] text-slate-400">
                        {m.scheduled_time ? formatTimeOnly(m.scheduled_time) : ''} {m.table_number ? `• Tisch ${m.table_number}` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center font-black text-sm text-white pt-1">
                      <span style={isMe && (normalizeName(t1) === normalizeName(team.name) || rankPlaceholders.some((p) => normalizeName(t1).includes(p))) ? { color: primaryColor } : undefined}>{t1}</span>
                      <span className="text-xs font-semibold text-slate-400 px-2">{m.team1_score ?? '-'} : {m.team2_score ?? '-'}</span>
                      <span style={isMe && (normalizeName(t2) === normalizeName(team.name) || rankPlaceholders.some((p) => normalizeName(t2).includes(p))) ? { color: primaryColor } : undefined}>{t2}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 6. ZAHLUNG & CHECKOUT */}
        <section className="rounded-[24px] border p-6 shadow-xl" style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: primaryColor }}>Gebühr</p>
              <h2 className="text-xl font-black mt-0.5 text-white">Zahlung</h2>
              {entryFee > 0 && (
                <p className="text-xs font-semibold text-slate-300 mt-0.5">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(entryFee)} pro Team
                </p>
              )}
            </div>
            <span className="text-2xl">💶</span>
          </div>

          <div className="mt-4 rounded-[16px] border p-4 space-y-4" style={innerBoxStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400">Status</p>
                <p className={`font-black text-sm mt-0.5 ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isPaid ? '🟢 Bezahlt' : '🟡 Zahlung ausstehend'}
                </p>
              </div>
              <span className="text-xl">{isPaid ? '✅' : '⏳'}</span>
            </div>

            <div className="pt-3 border-t border-white/10">
              <p className="text-xs font-bold text-slate-400">Gewählte Methode</p>
              <p className="font-black text-sm mt-0.5 text-white">
                {team.payment_method === 'bar' ? '💶 Barzahlung vor Ort' : team.payment_method === 'paypal' ? '🅿️ PayPal' : team.payment_method === 'ueberweisung' ? '🏦 Banküberweisung' : 'Noch nicht gewählt'}
              </p>
            </div>

            {!isPaid && (
              <div className="pt-3 border-t border-white/10 space-y-3">
                <p className="text-xs font-bold text-slate-300">Zahlungsart ändern:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {tournament?.cash_enabled && (
                    <button
                      disabled={changingPayment}
                      onClick={() => void changePaymentMethod('bar')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition ${team.payment_method === 'bar' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-black/40 hover:bg-white/10 text-slate-200'}`}
                    >
                      Bar vor Ort
                    </button>
                  )}
                  {tournament?.bank_transfer_enabled && (
                    <button
                      disabled={changingPayment}
                      onClick={() => void changePaymentMethod('ueberweisung')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition ${team.payment_method === 'ueberweisung' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-black/40 hover:bg-white/10 text-slate-200'}`}
                    >
                      Überweisung
                    </button>
                  )}
                  {tournament?.paypal_enabled && (
                    <button
                      disabled={changingPayment}
                      onClick={() => void changePaymentMethod('paypal')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition ${team.payment_method === 'paypal' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-black/40 hover:bg-white/10 text-slate-200'}`}
                    >
                      PayPal
                    </button>
                  )}
                </div>

                {team.payment_method === 'paypal' && tournament?.paypal_enabled && process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && (
                  <div className="pt-2">
                    <PayPalScriptProvider options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID, currency: 'EUR' }}>
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
              <p className="text-xs font-semibold p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                {paymentMessage}
              </p>
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="py-6 text-center text-xs text-slate-500 font-semibold">
          <p>{tournament?.name || 'Turnier-Portal'}</p>
        </footer>

      </div>
    </main>
  )
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