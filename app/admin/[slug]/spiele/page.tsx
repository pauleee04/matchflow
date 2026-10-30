'use client'

import { useEffect, useMemo, useState } from 'react'
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

type Match = {
  id: number
  tournament_id: number
  group_id: number | null
  team1_id: number
  team2_id: number
  team1_score: number | null
  team2_score: number | null
  status: 'scheduled' | 'live' | 'finished'
  scheduled_time: string | null
  table_number: number | null
  phase: string
}

type TournamentData = {
  id: number
  name: string
  slug: string
  primary_color: string | null
}

// ROUND-ROBIN / BERGER-SYSTEM ALGORITHMUS MIT BYE (SPIELFREI) HANDHABUNG
function generateGroupRounds(teamIds: number[], firstByeTeamId?: number) {
  let list = [...teamIds]
  const isOdd = list.length % 2 !== 0

  if (isOdd) {
    if (firstByeTeamId && list.includes(firstByeTeamId)) {
      list = [firstByeTeamId, ...list.filter((id) => id !== firstByeTeamId)]
    }
    list.push(-1) // -1 markiert das Spielfrei-Freilos
  }

  const numTeams = list.length
  const numRounds = numTeams - 1
  const numMatchesPerRound = numTeams / 2

  const rounds: Array<{
    roundNumber: number
    matches: Array<{ team1_id: number; team2_id: number }>
    byeTeamId: number | null
  }> = []

  for (let r = 0; r < numRounds; r++) {
    const roundMatches: Array<{ team1_id: number; team2_id: number }> = []
    let byeTeamId: number | null = null

    for (let i = 0; i < numMatchesPerRound; i++) {
      const t1 = list[i]
      const t2 = list[numTeams - 1 - i]

      if (t1 === -1) {
        byeTeamId = t2
      } else if (t2 === -1) {
        byeTeamId = t1
      } else {
        if (r % 2 === 0) {
          roundMatches.push({ team1_id: t1, team2_id: t2 })
        } else {
          roundMatches.push({ team1_id: t2, team2_id: t1 })
        }
      }
    }

    rounds.push({
      roundNumber: r + 1,
      matches: roundMatches,
      byeTeamId,
    })

    // Runden-Rotation (Kreis-Methode)
    const last = list.pop()!
    list.splice(1, 0, last)
  }

  return rounds
}

export default function AdminSpielePage() {
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

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Spielplan-Generator Einstellungen
  const [tableCount, setTableCount] = useState<number>(8)
  const [matchDurationMinutes, setMatchDurationMinutes] = useState<number>(10)
  const [startTime, setStartTime] = useState<string>('14:00')

  // Spielfrei in Runde 1 pro Gruppe (GroupId -> TeamId)
  const [firstByeTeamMap, setFirstByeTeamMap] = useState<Record<number, number>>({})

  // Filter States
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Einklappbare Tische State
  const [collapsedTables, setCollapsedTables] = useState<Record<string | number, boolean>>({})

  const primaryColor = tournament?.primary_color || '#22c55e'

  async function loadData() {
    if (!slug && !rawSlug) return
    setLoading(true)
    setStatusMessage(null)

    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, primary_color')
        .or(`slug.eq.${slug},slug.eq.${rawSlug}`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) return

      setTournament(tourneyData as TournamentData)

      const [teamsRes, groupsRes, membersRes, matchesRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('name', { ascending: true }),

        supabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('name', { ascending: true }),

        supabase
          .from('group_members')
          .select('group_id, team_id')
          .eq('tournament_id', tourneyData.id),

        supabase
          .from('matches')
          .select('*')
          .eq('tournament_id', tourneyData.id)
          .order('id', { ascending: true }),
      ])

      const loadedTeams = (teamsRes.data || []) as Team[]
      const loadedGroups = (groupsRes.data || []) as Group[]
      const loadedMembers = (membersRes.data || []) as GroupMember[]

      setTeams(loadedTeams)
      setGroups(loadedGroups)
      setMembers(loadedMembers)
      setMatches((matchesRes.data || []) as Match[])

      // Standard-Spielfrei-Auswahl für ungerade Gruppen initialisieren
      const initialByeMap: Record<number, number> = {}
      loadedGroups.forEach((g) => {
        const gTeamIds = loadedMembers.filter((m) => m.group_id === g.id).map((m) => m.team_id)
        if (gTeamIds.length % 2 !== 0 && gTeamIds.length > 0) {
          initialByeMap[g.id] = gTeamIds[0]
        }
      })
      setFirstByeTeamMap(initialByeMap)
    } catch (err: any) {
      console.error(err)
      setStatusMessage({ type: 'error', text: 'Fehler beim Laden der Spieldaten.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [slug, rawSlug])

  async function triggerBroadcast() {
    if (!tournament?.id) return
    const channel = supabase.channel(`tournament:${tournament.id}`)
    await channel.send({
      type: 'broadcast',
      event: 'refresh',
      payload: { updated: Date.now() },
    })
  }

  function getTeamName(id: number) {
    return teams.find((t) => t.id === id)?.name || `Team #${id}`
  }

  function getGroupName(id: number | null) {
    if (!id) return 'K.-o.-Phase'
    return groups.find((g) => g.id === id)?.name || `Gruppe #${id}`
  }

  // AUTOMATISCHER SPIELPLAN-GENERATOR
  async function handleGenerateGroupSchedule() {
    if (!tournament?.id || groups.length === 0) return

    const groupMatchesCount = matches.filter((m) => m.phase === 'group').length
    if (
      groupMatchesCount > 0 &&
      !confirm('Achtung: Es existieren bereits Gruppen-Spiele. Sollen alle bisherigen Gruppen-Spiele gelöscht und der Spielplan neu generiert werden?')
    ) {
      return
    }

    setSaving(true)
    setStatusMessage(null)

    try {
      // 1. Alle bisherigen Gruppen-Spiele löschen
      await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', tournament.id)
        .eq('phase', 'group')

      // 2. Rundenbasierte Paarungen für jede Gruppe nach Berger-System erstellen
      const groupRoundsMap: Record<number, Array<{ roundNumber: number; matches: Array<{ team1_id: number; team2_id: number }> }>> = {}
      let maxRounds = 0

      groups.forEach((group) => {
        const groupTeamIds = members
          .filter((m) => m.group_id === group.id)
          .map((m) => m.team_id)

        if (groupTeamIds.length < 2) return

        const selectedByeId = firstByeTeamMap[group.id]
        const rounds = generateGroupRounds(groupTeamIds, selectedByeId)
        groupRoundsMap[group.id] = rounds
        if (rounds.length > maxRounds) maxRounds = rounds.length
      })

      // 3. Spiele rundenweise verschachteln (Runde 1 aller Gruppen, dann Runde 2 ...)
      const scheduledQueue: Array<{ group_id: number; team1_id: number; team2_id: number }> = []

      for (let r = 0; r < maxRounds; r++) {
        groups.forEach((g) => {
          const gRounds = groupRoundsMap[g.id]
          if (gRounds && gRounds[r]) {
            gRounds[r].matches.forEach((match) => {
              scheduledQueue.push({
                group_id: g.id,
                team1_id: match.team1_id,
                team2_id: match.team2_id,
              })
            })
          }
        })
      }

      if (scheduledQueue.length === 0) {
        throw new Error('Es wurden keine gültigen Paarungen gefunden. Prüfe, ob den Gruppen ausreichend Teams zugewiesen sind.')
      }

      // 4. Startzeit vorbereiten
      const [startHours, startMinutes] = startTime.split(':').map(Number)
      const baseDate = new Date()
      baseDate.setHours(startHours || 14, startMinutes || 0, 0, 0)

      // 5. Tischen & Uhrzeiten zuweisen
      const rowsToInsert = scheduledQueue.map((pairing, index) => {
        const timeSlotIndex = Math.floor(index / tableCount)
        const tableNumber = (index % tableCount) + 1
        const matchTime = new Date(baseDate.getTime() + timeSlotIndex * matchDurationMinutes * 60 * 1000)

        return {
          tournament_id: tournament.id,
          group_id: pairing.group_id,
          team1_id: pairing.team1_id,
          team2_id: pairing.team2_id,
          team1_score: null,
          team2_score: null,
          status: 'scheduled' as const,
          scheduled_time: matchTime.toISOString(),
          table_number: tableNumber,
          phase: 'group',
        }
      })

      const { error: insertErr } = await supabase.from('matches').insert(rowsToInsert)
      if (insertErr) throw insertErr

      await triggerBroadcast()
      await loadData()
      setStatusMessage({
        type: 'success',
        text: `Spielplan mit ${rowsToInsert.length} Spielen erfolgreich im Round-Robin-System auf ${tableCount} Tische verteilt!`,
      })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({ type: 'error', text: err.message || 'Spielplan konnte nicht erstellt werden.' })
    } finally {
      setSaving(false)
    }
  }

  // SPIELE / SPIELPLAN MANUELL ZURÜCKSETZEN
  async function handleResetMatches() {
    if (!tournament?.id) return

    const confirmStep1 = confirm(
      'Möchtest du wirklich alle erstellten Spiele und den gesamten Spielplan zurücksetzen?'
    )
    if (!confirmStep1) return

    const confirmStep2 = confirm(
      '⚠️ ACHTUNG / SYSTEM-ABFRAGE:\n\nAlle Ansetzungen und bereits eingetragenen Spielergebnisse für dieses Turnier werden unwiderruflich gelöscht!\n\nDie bestehenden Gruppen und zugewiesenen Teams BLEIBEN ERHALTEN.\n\nBist du dir ganz sicher, dass du den Spielplan zurücksetzen willst?'
    )
    if (!confirmStep2) return

    setSaving(true)
    setStatusMessage(null)

    try {
      const { error } = await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', tournament.id)

      if (error) throw error

      await triggerBroadcast()
      await loadData()

      setStatusMessage({
        type: 'success',
        text: 'Der Spielplan und alle eingetragenen Spiele wurden erfolgreich gelöscht. Die Gruppen bleiben bestehen.',
      })
    } catch (err: any) {
      console.error('Reset matches error:', err)
      setStatusMessage({
        type: 'error',
        text: `Fehler beim Zurücksetzen der Spiele: ${err.message || err}`,
      })
    } finally {
      setSaving(false)
    }
  }

  // ERGEBNIS SPEICHERN / STATUS ÄNDERN
  async function handleUpdateMatch(
    matchId: number,
    team1Score: number | null,
    team2Score: number | null,
    newStatus: 'scheduled' | 'live' | 'finished'
  ) {
    if (!tournament?.id) return

    try {
      const { error } = await supabase
        .from('matches')
        .update({
          team1_score: team1Score,
          team2_score: team2Score,
          status: newStatus,
        })
        .eq('id', matchId)
        .eq('tournament_id', tournament.id)

      if (error) throw error

      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? { ...m, team1_score: team1Score, team2_score: team2Score, status: newStatus }
            : m
        )
      )

      await triggerBroadcast()
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Fehler beim Speichern: ${err.message}` })
    }
  }

  // Filter-Logik
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (selectedGroupFilter !== 'all' && String(m.group_id) !== selectedGroupFilter) {
        return false
      }
      if (selectedStatusFilter !== 'all' && m.status !== selectedStatusFilter) {
        return false
      }
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase()
        const t1 = getTeamName(m.team1_id).toLowerCase()
        const t2 = getTeamName(m.team2_id).toLowerCase()
        return t1.includes(query) || t2.includes(query)
      }
      return true
    })
  }, [matches, selectedGroupFilter, selectedStatusFilter, searchQuery, teams])

  // GRUPPIERUNG NACH TISCHEN
  const matchesByTable = useMemo(() => {
    const tableMap = new Map<number | 'unassigned', Match[]>()

    filteredMatches.forEach((match) => {
      const tableKey = match.table_number ?? 'unassigned'
      if (!tableMap.has(tableKey)) {
        tableMap.set(tableKey, [])
      }
      tableMap.get(tableKey)!.push(match)
    })

    const sortedKeys = Array.from(tableMap.keys()).sort((a, b) => {
      if (a === 'unassigned') return 1
      if (b === 'unassigned') return -1
      return a - b
    })

    return sortedKeys.map((key) => ({
      tableKey: key,
      title: key === 'unassigned' ? 'Kein Tisch zugewiesen' : `Tisch ${key}`,
      matches: tableMap.get(key)!,
    }))
  }, [filteredMatches])

  function toggleTable(key: string | number) {
    setCollapsedTables((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const totalMatches = matches.length
  const finishedMatches = matches.filter((m) => m.status === 'finished').length
  const liveMatches = matches.filter((m) => m.status === 'live').length
  const openMatches = matches.filter((m) => m.status === 'scheduled').length

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100 bg-slate-950 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade Spielplan …
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

      {/* METRIK CARDS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 w-full">
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Spiele Gesamt</p>
          <p className="mt-2 text-3xl font-black text-white">{totalMatches}</p>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">🔴 Live / Aktiv</p>
          <p className="mt-2 text-3xl font-black text-red-400">{liveMatches}</p>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Offen</p>
          <p className="mt-2 text-3xl font-black text-amber-400">{openMatches}</p>
        </div>
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Beendet</p>
          <p className="mt-2 text-3xl font-black text-emerald-400">{finishedMatches}</p>
        </div>
      </section>

      {/* AUTOMATISCHER SPIELPLAN GENERATOR */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
        <div className="border-b border-white/10 pb-4">
          <h2 className="text-xl font-black text-white tracking-tight sm:text-2xl">
            Gruppen-Spielplan generieren
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Erstelle automatisch alle Gruppen-Paarungen (Round-Robin / Berger-System) inkl. automatischer Spielfrei-Verteilung bei ungeraden Gruppengrößen.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Anzahl Tische / Plätze
            </label>
            <input
              type="number"
              min="1"
              max="64"
              value={tableCount}
              onChange={(e) => setTableCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Spieldauer inkl. Wechsel (Minuten)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={matchDurationMinutes}
              onChange={(e) => setMatchDurationMinutes(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Startzeit (Uhrzeit)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
            />
          </div>
        </div>

        {/* EINSTELLUNGEN FÜR UNGERADE GRUPPEN */}
        {groups.some((g) => members.filter((m) => m.group_id === g.id).length % 2 !== 0) && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-amber-300">
              <span>⏸️ Ungerade Gruppengröße erkannt</span>
            </div>
            <p className="text-[11px] font-medium text-amber-200/80">
              Bei Gruppen mit ungerader Teamanzahl hat pro Runde jeweils ein Team spielfrei. Wähle hier aus, welches Team in <strong>Runde 1</strong> spielfrei startet:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => {
                const groupTeams = members
                  .filter((m) => m.group_id === group.id)
                  .map((m) => teams.find((t) => t.id === m.team_id))
                  .filter(Boolean) as Team[]

                if (groupTeams.length % 2 === 0 || groupTeams.length === 0) return null

                return (
                  <div key={group.id} className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-300">
                      {group.name} ({groupTeams.length} Teams):
                    </label>
                    <select
                      value={firstByeTeamMap[group.id] || ''}
                      onChange={(e) =>
                        setFirstByeTeamMap((prev) => ({
                          ...prev,
                          [group.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-2 text-xs font-bold text-amber-200 outline-none"
                    >
                      {groupTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          Spielfrei R1: {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* AKTIONEN: GENERIEREN UND ZURÜCKSETZEN */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleResetMatches}
            disabled={saving || matches.length === 0}
            className="w-full sm:w-auto rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs font-black text-red-300 hover:bg-red-900/40 transition disabled:opacity-40"
          >
            🗑️ Spielplan &amp; Spiele zurücksetzen
          </button>

          <button
            type="button"
            onClick={handleGenerateGroupSchedule}
            disabled={saving || groups.length === 0}
            className="w-full sm:w-auto rounded-2xl px-5 py-3 text-xs font-black text-slate-950 shadow-lg transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? 'Generiere Spielplan …' : '⚡ Gruppen-Spielplan automatisch erstellen'}
          </button>
        </div>
      </section>

      {/* FILTER & SEARCH BAR */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-white tracking-tight sm:text-2xl">
            Spiele Übersicht &amp; Live-Eingabe
          </h2>
          <span className="text-xs text-slate-400 font-bold">
            {filteredMatches.length} von {matches.length} Spielen
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="🔍 Nach Team suchen …"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white placeholder-slate-500 outline-none focus:border-white/30"
          />

          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
          >
            <option value="all">Alle Gruppen &amp; Phasen</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
          >
            <option value="all">Alle Status-Arten</option>
            <option value="scheduled">Offen / Angesetzt</option>
            <option value="live">🔴 Live</option>
            <option value="finished">✓ Beendet</option>
          </select>
        </div>
      </section>

      {/* SPIEL-LISTE NACH TISCHEN GEORDNET */}
      {filteredMatches.length === 0 ? (
        <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-8 text-center text-xs font-bold text-slate-400 backdrop-blur-xl">
          Keine Spiele für die aktuelle Filterauswahl gefunden.
        </div>
      ) : (
        <div className="space-y-6">
          {matchesByTable.map(({ tableKey, title, matches: tableMatches }) => {
            const isCollapsed = Boolean(collapsedTables[tableKey])
            const tableLiveMatches = tableMatches.filter((m) => m.status === 'live').length
            const tableFinishedMatches = tableMatches.filter((m) => m.status === 'finished').length

            return (
              <div
                key={tableKey}
                className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur-xl transition w-full"
              >
                {/* TISCH HEADER */}
                <button
                  type="button"
                  onClick={() => toggleTable(tableKey)}
                  className="flex w-full items-center justify-between p-5 sm:p-6 text-left transition hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 font-black text-xs text-white border border-white/10">
                      {tableKey === 'unassigned' ? '?' : `T${tableKey}`}
                    </span>
                    <div>
                      <h3 className="text-base font-black text-white sm:text-lg">{title}</h3>
                      <p className="text-[10px] font-bold text-slate-400">
                        {tableMatches.length} {tableMatches.length === 1 ? 'Spiel' : 'Spiele'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {tableLiveMatches > 0 && (
                      <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-black text-red-400 border border-red-500/30 animate-pulse">
                        🔴 {tableLiveMatches} Live
                      </span>
                    )}
                    <span className="rounded-full bg-slate-950 px-2.5 py-0.5 text-[10px] font-black text-slate-400 border border-white/10">
                      {tableFinishedMatches}/{tableMatches.length} Beendet
                    </span>
                    <span className="ml-2 text-xs font-black text-slate-400">
                      {isCollapsed ? '▼ Ausklappen' : '▲ Einklappen'}
                    </span>
                  </div>
                </button>

                {/* TISCH SPIELE GRID */}
                {!isCollapsed && (
                  <div className="border-t border-white/10 p-5 sm:p-6 bg-slate-950/40">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {tableMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          team1Name={getTeamName(match.team1_id)}
                          team2Name={getTeamName(match.team2_id)}
                          groupName={getGroupName(match.group_id)}
                          primaryColor={primaryColor}
                          onUpdate={handleUpdateMatch}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// EINZELNE SPIEL-KARTE MIT SCHNELLERGEBNIS-EINGABE
function MatchCard({
  match,
  team1Name,
  team2Name,
  groupName,
  primaryColor,
  onUpdate,
}: {
  match: Match
  team1Name: string
  team2Name: string
  groupName: string
  primaryColor: string
  onUpdate: (
    matchId: number,
    s1: number | null,
    s2: number | null,
    status: 'scheduled' | 'live' | 'finished'
  ) => void
}) {
  const [score1, setScore1] = useState<string>(match.team1_score !== null ? String(match.team1_score) : '')
  const [score2, setScore2] = useState<string>(match.team2_score !== null ? String(match.team2_score) : '')

  useEffect(() => {
    setScore1(match.team1_score !== null ? String(match.team1_score) : '')
    setScore2(match.team2_score !== null ? String(match.team2_score) : '')
  }, [match.team1_score, match.team2_score])

  const isFinished = match.status === 'finished'
  const isLive = match.status === 'live'

  const formattedTime = match.scheduled_time
    ? new Date(match.scheduled_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null

  function save(newStatus: 'scheduled' | 'live' | 'finished') {
    const s1 = score1 !== '' ? Number(score1) : null
    const s2 = score2 !== '' ? Number(score2) : null
    onUpdate(match.id, s1, s2, newStatus)
  }

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-4 shadow-lg backdrop-blur-xl transition ${
        isFinished
          ? 'border-emerald-500/30 bg-slate-950/80'
          : isLive
          ? 'border-red-500/50 bg-red-950/20'
          : 'border-white/10 bg-slate-950/80'
      }`}
    >
      <div className="space-y-3">
        {/* HEADER INFOS */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[10px] font-black text-slate-400">
          <span className="truncate">{groupName}</span>
          <div className="flex items-center gap-2">
            {match.table_number && <span>Tisch {match.table_number}</span>}
            {formattedTime && <span>{formattedTime} Uhr</span>}
          </div>
        </div>

        {/* TEAMS & PUNKTE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900/80 px-3 py-2 text-xs font-bold text-white border border-white/5">
            <span className="truncate">{team1Name}</span>
            <input
              type="number"
              min="0"
              max="99"
              value={score1}
              onChange={(e) => setScore1(e.target.value)}
              className="h-8 w-12 rounded-xl border border-white/10 bg-slate-950/80 text-center font-black text-xs text-white outline-none focus:border-white/30"
            />
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900/80 px-3 py-2 text-xs font-bold text-white border border-white/5">
            <span className="truncate">{team2Name}</span>
            <input
              type="number"
              min="0"
              max="99"
              value={score2}
              onChange={(e) => setScore2(e.target.value)}
              className="h-8 w-12 rounded-xl border border-white/10 bg-slate-950/80 text-center font-black text-xs text-white outline-none focus:border-white/30"
            />
          </div>
        </div>
      </div>

      {/* AKTIONEN & STATUS BUTTONS */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => save('scheduled')}
          className={`rounded-lg px-2 py-1 text-[10px] font-black transition ${
            match.status === 'scheduled'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'text-slate-500 hover:text-white'
          }`}
        >
          Offen
        </button>

        <button
          type="button"
          onClick={() => save('live')}
          className={`rounded-lg px-2 py-1 text-[10px] font-black transition ${
            isLive
              ? 'bg-red-500/30 text-red-400 border border-red-500/50 animate-pulse'
              : 'text-slate-500 hover:text-red-400'
          }`}
        >
          🔴 Live
        </button>

        <button
          type="button"
          onClick={() => save('finished')}
          className="rounded-lg px-3 py-1 text-[10px] font-black text-slate-950 transition hover:opacity-90 shadow-md"
          style={{ backgroundColor: isFinished ? '#10b981' : primaryColor }}
        >
          {isFinished ? '✓ Fertig' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}