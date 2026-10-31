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
  table_count?: number | null
  match_duration_minutes?: number | null
  start_time?: string | null
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

  // Spielplan-Generator Einstellungen mit persistentem Speicher
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
      let tourneyData: TournamentData | null = null
      const { data, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, primary_color, table_count, match_duration_minutes, start_time')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (tourneyError) {
        const fallbackRes = await supabase
          .from('tournaments')
          .select('id, name, slug, primary_color')
          .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
          .maybeSingle()
        if (fallbackRes.error) throw fallbackRes.error
        tourneyData = fallbackRes.data as TournamentData | null
      } else {
        tourneyData = data as TournamentData | null
      }

      if (!tourneyData) return

      setTournament(tourneyData)
      if (tourneyData.table_count) setTableCount(tourneyData.table_count)
      if (tourneyData.match_duration_minutes) setMatchDurationMinutes(tourneyData.match_duration_minutes)
      if (tourneyData.start_time) setStartTime(tourneyData.start_time)

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

  // EINSTELLUNGEN IN DER SUPABASE DATENBANK SPEICHERN
  async function persistSettings(newTables: number, newDuration: number, newStart: string) {
    if (!tournament?.id) return
    try {
      await supabase
        .from('tournaments')
        .update({
          table_count: newTables,
          match_duration_minutes: newDuration,
          start_time: newStart,
        })
        .eq('id', tournament.id)
    } catch (e) {
      console.warn('Einstellungsdaten konnten in DB nicht hinterlegt werden:', e)
    }
  }

  function handleTableCountChange(val: number) {
    const clean = Math.max(1, val)
    setTableCount(clean)
    void persistSettings(clean, matchDurationMinutes, startTime)
  }

  function handleDurationChange(val: number) {
    const clean = Math.max(1, val)
    setMatchDurationMinutes(clean)
    void persistSettings(tableCount, clean, startTime)
  }

  function handleStartTimeChange(val: string) {
    setStartTime(val)
    void persistSettings(tableCount, matchDurationMinutes, val)
  }

  function getTeamName(id: number) {
    return teams.find((t) => t.id === id)?.name || `Team #${id}`
  }

  function getGroupName(id: number | null) {
    if (!id) return 'K.-o.-Phase'
    return groups.find((g) => g.id === id)?.name || `Gruppe #${id}`
  }

  // ERMITTELT ALLE VORHANDENEN ZEITSLOTS IM AKTUELLEN SPIELPLAN
  const uniqueTimeSlots = useMemo(() => {
    const slotsMap = new Map<string, Match[]>()
    matches.forEach((m) => {
      if (!m.scheduled_time) return
      const timeKey = new Date(m.scheduled_time).toISOString()
      if (!slotsMap.has(timeKey)) slotsMap.set(timeKey, [])
      slotsMap.get(timeKey)!.push(m)
    })

    return Array.from(slotsMap.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([timeIso, slotMatches], index) => ({
        slotIndex: index,
        timeIso,
        displayTime: new Date(timeIso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        matches: slotMatches,
      }))
  }, [matches])

  // VERSCHIEBT EINEN ZEITSLOT UND ALLE NACHFOLGENDEN ZEITSLOTS KASKADIEREND
  async function handleShiftSlotTime(slotIndexTarget: number, newTimeHHMM: string) {
    if (!tournament?.id || uniqueTimeSlots.length === 0) return
    setSaving(true)
    setStatusMessage(null)

    try {
      const [h, m] = newTimeHHMM.split(':').map(Number)
      const baseTargetDate = new Date(uniqueTimeSlots[slotIndexTarget].timeIso)
      baseTargetDate.setHours(h || 0, m || 0, 0, 0)

      const updates: Array<{ id: number; scheduled_time: string }> = []

      uniqueTimeSlots.forEach((slot, idx) => {
        if (idx < slotIndexTarget) return // Frühere Slots unverändert lassen

        const offsetMultiplier = idx - slotIndexTarget
        const slotTime = new Date(baseTargetDate.getTime() + offsetMultiplier * matchDurationMinutes * 60 * 1000)

        slot.matches.forEach((match) => {
          updates.push({
            id: match.id,
            scheduled_time: slotTime.toISOString(),
          })
        })
      })

      // In Supabase aktualisieren
      for (const update of updates) {
        await supabase
          .from('matches')
          .update({ scheduled_time: update.scheduled_time })
          .eq('id', update.id)
      }

      await triggerBroadcast()
      await loadData()
      setStatusMessage({
        type: 'success',
        text: `Zeitslot ${slotIndexTarget + 1} auf ${newTimeHHMM} Uhr geändert und alle nachfolgenden Spiele verschoben!`,
      })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({ type: 'error', text: 'Fehler beim Verschieben der Uhrzeiten.' })
    } finally {
      setSaving(false)
    }
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
      await persistSettings(tableCount, matchDurationMinutes, startTime)

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

      const validGroups = groups.filter((g) => (groupRoundsMap[g.id]?.length || 0) > 0)

      if (validGroups.length === 0) {
        throw new Error('Es wurden keine gültigen Paarungen gefunden. Prüfe, ob den Gruppen ausreichend Teams zugewiesen sind.')
      }

      // 3. Runden- und gruppenweise durchiterieren und Spiele in die Slots einsortieren
      const slotMatches: Map<number, Array<{ group_id: number; team1_id: number; team2_id: number }>> = new Map()
      const slotTeams: Map<number, Set<number>> = new Map()

      const groupNextMinSlot: Record<number, number> = {}
      validGroups.forEach((g) => {
        groupNextMinSlot[g.id] = 0
      })

      for (let r = 0; r < maxRounds; r++) {
        validGroups.forEach((g) => {
          const rounds = groupRoundsMap[g.id]
          if (!rounds || !rounds[r]) return

          let roundMaxSlotUsed = groupNextMinSlot[g.id]

          rounds[r].matches.forEach((match) => {
            const t1 = match.team1_id
            const t2 = match.team2_id

            let slot = groupNextMinSlot[g.id]

            while (true) {
              if (!slotTeams.has(slot)) slotTeams.set(slot, new Set())
              if (!slotMatches.has(slot)) slotMatches.set(slot, [])

              const teamsInSlot = slotTeams.get(slot)!
              const matchesInSlot = slotMatches.get(slot)!

              if (!teamsInSlot.has(t1) && !teamsInSlot.has(t2) && matchesInSlot.length < tableCount) {
                teamsInSlot.add(t1)
                teamsInSlot.add(t2)
                matchesInSlot.push({
                  group_id: g.id,
                  team1_id: t1,
                  team2_id: t2,
                })

                if (slot > roundMaxSlotUsed) {
                  roundMaxSlotUsed = slot
                }
                break
              }

              slot++
            }
          })

          groupNextMinSlot[g.id] = roundMaxSlotUsed + 1
        })
      }

      // 4. Spiele flach klopfen und Tische sequenziell zuweisen
      const scheduledMatches: Array<{
        group_id: number
        team1_id: number
        team2_id: number
        slotIndex: number
        tableNumber: number
      }> = []

      const sortedSlots = Array.from(slotMatches.keys()).sort((a, b) => a - b)

      sortedSlots.forEach((slotIndex) => {
        const matchesInSlot = slotMatches.get(slotIndex)!
        matchesInSlot.forEach((m, idx) => {
          scheduledMatches.push({
            ...m,
            slotIndex,
            tableNumber: idx + 1,
          })
        })
      })

      if (scheduledMatches.length === 0) {
        throw new Error('Es wurden keine Spiele generiert.')
      }

      // 5. Uhrzeiten berechnen & eintragen
      const [startHours, startMinutes] = startTime.split(':').map(Number)
      const baseDate = new Date()
      baseDate.setHours(startHours || 14, startMinutes || 0, 0, 0)

      const rowsToInsert = scheduledMatches.map((m) => {
        const matchTime = new Date(baseDate.getTime() + m.slotIndex * matchDurationMinutes * 60 * 1000)

        return {
          tournament_id: tournament.id,
          group_id: m.group_id,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
          team1_score: null,
          team2_score: null,
          status: 'scheduled' as const,
          scheduled_time: matchTime.toISOString(),
          table_number: m.tableNumber,
          phase: 'group',
        }
      })

      const { error: insertErr } = await supabase.from('matches').insert(rowsToInsert)
      if (insertErr) throw insertErr

      await triggerBroadcast()
      await loadData()
      setStatusMessage({
        type: 'success',
        text: `Spielplan mit ${rowsToInsert.length} Spielen erfolgreich ohne Lücken auf ${tableCount} Tische verteilt!`,
      })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({ type: 'error', text: err.message || 'Spielplan konnte nicht erstellt werden.' })
    } finally {
      setSaving(false)
    }
  }

  // ZURÜCKSETZEN ALLER SPIELE
  async function handleResetMatches() {
    if (!tournament?.id) return

    const confirmStep1 = confirm('Möchtest du wirklich alle erstellten Spiele und den gesamten Spielplan zurücksetzen?')
    if (!confirmStep1) return

    const confirmStep2 = confirm(
      '⚠️ ACHTUNG: Alle Ansetzungen und Ergebnisse für dieses Turnier werden unwiderruflich gelöscht!\n\nFortfahren?'
    )
    if (!confirmStep2) return

    setSaving(true)
    setStatusMessage(null)

    try {
      const { error } = await supabase.from('matches').delete().eq('tournament_id', tournament.id)
      if (error) throw error

      await triggerBroadcast()
      await loadData()

      setStatusMessage({
        type: 'success',
        text: 'Der Spielplan und alle eingetragenen Spiele wurden gelöscht.',
      })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({ type: 'error', text: `Fehler beim Zurücksetzen: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  // EINZELNES SPIEL UND OPTIONAL NACHFOLGENDE SPIELE UPDATE
  async function handleUpdateMatch(
    matchId: number,
    team1Score: number | null,
    team2Score: number | null,
    newStatus: 'scheduled' | 'live' | 'finished',
    newTableNumber: number | null,
    newScheduledTime: string | null,
    cascadeShift: boolean
  ) {
    if (!tournament?.id) return

    try {
      const currentMatch = matches.find((m) => m.id === matchId)

      // Falls die Zeit geändert wurde und Kaskadierung gewünscht ist
      if (cascadeShift && newScheduledTime && currentMatch?.scheduled_time && newScheduledTime !== currentMatch.scheduled_time) {
        const oldTime = new Date(currentMatch.scheduled_time).getTime()
        const newTime = new Date(newScheduledTime).getTime()
        const diffMs = newTime - oldTime

        // Alle Spiele finden, die ursprünglich zeitgleich oder später angesetzt waren
        const subsequentMatches = matches.filter(
          (m) => m.scheduled_time && new Date(m.scheduled_time).getTime() >= oldTime
        )

        for (const m of subsequentMatches) {
          const updatedMs = new Date(m.scheduled_time!).getTime() + diffMs
          const updatedIso = new Date(updatedMs).toISOString()

          await supabase
            .from('matches')
            .update({
              team1_score: m.id === matchId ? team1Score : m.team1_score,
              team2_score: m.id === matchId ? team2Score : m.team2_score,
              status: m.id === matchId ? newStatus : m.status,
              table_number: m.id === matchId ? newTableNumber : m.table_number,
              scheduled_time: updatedIso,
            })
            .eq('id', m.id)
        }
      } else {
        // Normales Einzel-Update
        const { error } = await supabase
          .from('matches')
          .update({
            team1_score: team1Score,
            team2_score: team2Score,
            status: newStatus,
            table_number: newTableNumber,
            scheduled_time: newScheduledTime,
          })
          .eq('id', matchId)
          .eq('tournament_id', tournament.id)

        if (error) throw error
      }

      await triggerBroadcast()
      await loadData()
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Fehler beim Speichern: ${err.message}` })
    }
  }

  // Filter-Logik
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (selectedGroupFilter !== 'all' && String(m.group_id) !== selectedGroupFilter) return false
      if (selectedStatusFilter !== 'all' && m.status !== selectedStatusFilter) return false
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
      if (!tableMap.has(tableKey)) tableMap.set(tableKey, [])
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
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100 [color-scheme:dark]">
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
    <div className="mx-auto w-full space-y-8 pb-16 text-slate-100 [color-scheme:dark]">
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

      {/* METRIK-KACHELN */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 w-full">
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-slate-300">Spiele Gesamt</p>
          <p className="mt-2 text-3xl font-black text-white">{totalMatches}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-slate-300">🔴 Live / Aktiv</p>
          <p className="mt-2 text-3xl font-black text-red-400">{liveMatches}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-slate-300">Offen</p>
          <p className="mt-2 text-3xl font-black text-amber-400">{openMatches}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-slate-300">Beendet</p>
          <p className="mt-2 text-3xl font-black text-emerald-400">{finishedMatches}</p>
        </div>
      </div>

      {/* PARAMETER-STEUERUNG UND SPIELPLAN GENERATOR */}
      <section className="rounded-3xl border border-white/10 bg-black/30 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
        <div className="border-b border-white/10 pb-4">
          <h2 className="text-xl font-black text-white tracking-tight sm:text-2xl">
            Gruppen-Spielplan &amp; Zeiten-Einstellungen
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Eingestellte Parameter wie Tische, Spieldauer und Startzeit bleiben gespeichert.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2">
              Anzahl Tische / Plätze
            </label>
            <input
              type="number"
              min="1"
              max="64"
              value={tableCount}
              onChange={(e) => handleTableCountChange(Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2">
              Spieldauer inkl. Wechsel (Minuten)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={matchDurationMinutes}
              onChange={(e) => handleDurationChange(Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2">
              Turnier-Startzeit (Uhrzeit)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
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
                      className="w-full rounded-xl border border-amber-500/40 bg-black/80 px-3 py-2 text-xs font-bold text-amber-200 outline-none"
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

        {/* AKTIONEN BUTTONS */}
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
            className="w-full sm:w-auto rounded-2xl border border-white/20 px-5 py-3 text-xs font-black text-white shadow-lg transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? 'Generiere Spielplan …' : '⚡ Gruppen-Spielplan neu erstellen'}
          </button>
        </div>
      </section>

      {/* RUNDEN- & ZEITSLOT SCHNELLSTEUERUNG */}
      {uniqueTimeSlots.length > 0 && (
        <section className="rounded-3xl border border-white/10 bg-black/30 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              ⏰ Runden- &amp; Zeitslots (Kaskadierende Verschiebung)
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Ändere die Startzeit eines Zeitslots (z.B. Runde 2 auf 19:00 Uhr). Alle nachfolgenden Slots verschieben sich automatisch entsprechend der Spieldauer ({matchDurationMinutes} Min).
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
            {uniqueTimeSlots.map((slot) => (
              <div
                key={slot.slotIndex}
                className="rounded-2xl border border-white/10 bg-black/50 p-3 space-y-2 text-center"
              >
                <div className="text-[10px] font-black uppercase text-slate-400">
                  Slot {slot.slotIndex + 1} ({slot.matches.length} Sp.)
                </div>
                <input
                  type="time"
                  defaultValue={slot.displayTime}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== slot.displayTime) {
                      void handleShiftSlotTime(slot.slotIndex, e.target.value)
                    }
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/70 px-2 py-1.5 text-center text-xs font-black text-emerald-400 outline-none focus:border-emerald-400"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FILTER & SEARCH BAR */}
      <section className="rounded-3xl border border-white/10 bg-black/30 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-white tracking-tight sm:text-2xl">
            Spiele Übersicht &amp; Live-Eingabe
          </h2>
          <span className="text-xs text-slate-300 font-bold">
            {filteredMatches.length} von {matches.length} Spielen
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="🔍 Nach Team suchen …"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-bold text-white placeholder-slate-400 outline-none focus:border-white/30"
          />

          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
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
            className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-bold text-white outline-none focus:border-white/30"
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
        <div className="rounded-3xl border border-white/10 bg-black/30 p-8 text-center text-xs font-bold text-slate-300 backdrop-blur-xl">
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
                className="overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-2xl backdrop-blur-xl transition w-full"
              >
                {/* TISCH HEADER */}
                <button
                  type="button"
                  onClick={() => toggleTable(tableKey)}
                  className="flex w-full items-center justify-between p-5 sm:p-6 text-left transition hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/60 font-black text-xs text-white border border-white/10">
                      {tableKey === 'unassigned' ? '?' : `T${tableKey}`}
                    </span>
                    <div>
                      <h3 className="text-base font-black text-white sm:text-lg">{title}</h3>
                      <p className="text-[10px] font-bold text-slate-300">
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
                    <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-black text-slate-300 border border-white/10">
                      {tableFinishedMatches}/{tableMatches.length} Beendet
                    </span>
                    <span className="ml-2 text-xs font-black text-slate-300">
                      {isCollapsed ? '▼ Ausklappen' : '▲ Einklappen'}
                    </span>
                  </div>
                </button>

                {/* TISCH SPIELE GRID */}
                {!isCollapsed && (
                  <div className="border-t border-white/10 p-5 sm:p-6 bg-black/20">
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

// EINZELNE SPIEL-KARTE MIT OPTIONALER VERSCHIEBUNG DES FOLGEPLANES
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
    status: 'scheduled' | 'live' | 'finished',
    tableNumber: number | null,
    scheduledTime: string | null,
    cascadeShift: boolean
  ) => void
}) {
  const [score1, setScore1] = useState<string>(match.team1_score !== null ? String(match.team1_score) : '')
  const [score2, setScore2] = useState<string>(match.team2_score !== null ? String(match.team2_score) : '')
  const [tableNum, setTableNum] = useState<string>(match.table_number !== null ? String(match.table_number) : '')
  const [cascade, setCascade] = useState<boolean>(false)

  const initialTime = match.scheduled_time
    ? new Date(match.scheduled_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : ''
  const [timeStr, setTimeStr] = useState<string>(initialTime)

  useEffect(() => {
    setScore1(match.team1_score !== null ? String(match.team1_score) : '')
    setScore2(match.team2_score !== null ? String(match.team2_score) : '')
    setTableNum(match.table_number !== null ? String(match.table_number) : '')
    if (match.scheduled_time) {
      setTimeStr(new Date(match.scheduled_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }))
    } else {
      setTimeStr('')
    }
  }, [match.team1_score, match.team2_score, match.table_number, match.scheduled_time])

  const isFinished = match.status === 'finished'
  const isLive = match.status === 'live'

  function save(newStatus: 'scheduled' | 'live' | 'finished') {
    const s1 = score1 !== '' ? Number(score1) : null
    const s2 = score2 !== '' ? Number(score2) : null
    const tbl = tableNum !== '' ? Number(tableNum) : null

    let isoTime: string | null = match.scheduled_time
    if (timeStr.trim() !== '') {
      const [h, m] = timeStr.split(':').map(Number)
      const dateObj = match.scheduled_time ? new Date(match.scheduled_time) : new Date()
      dateObj.setHours(h || 0, m || 0, 0, 0)
      isoTime = dateObj.toISOString()
    }

    onUpdate(match.id, s1, s2, newStatus, tbl, isoTime, cascade)
  }

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-4 shadow-lg backdrop-blur-xl transition ${
        isFinished
          ? 'border-emerald-500/30 bg-black/60'
          : isLive
          ? 'border-red-500/50 bg-red-950/20'
          : 'border-white/10 bg-black/60'
      }`}
    >
      <div className="space-y-3">
        {/* HEADER INFOS MIT BEARBEITBARER UHRZEIT & TISCH */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[10px] font-black text-slate-300 gap-2">
          <span className="truncate">{groupName}</span>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] text-slate-400">T:</span>
              <input
                type="number"
                min="1"
                max="99"
                value={tableNum}
                placeholder="-"
                onChange={(e) => setTableNum(e.target.value)}
                className="w-7 rounded bg-black/60 text-center text-[10px] font-mono font-bold text-white outline-none border border-white/10 focus:border-white/40"
              />
            </div>
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="rounded bg-black/60 text-center text-[10px] font-mono font-bold text-white outline-none border border-white/10 focus:border-white/40 px-1 py-0.5"
            />
          </div>
        </div>

        {/* CHECKBOX FÜR KASKADIERENDE VERTSCHIEBUNG */}
        <div className="flex items-center justify-end gap-1.5 text-[9px] text-slate-400 font-bold">
          <label className="cursor-pointer flex items-center gap-1 select-none">
            <input
              type="checkbox"
              checked={cascade}
              onChange={(e) => setCascade(e.target.checked)}
              className="rounded bg-black border-white/20 accent-emerald-500"
            />
            <span>Nachfolgende anpassen</span>
          </label>
        </div>

        {/* TEAMS & PUNKTE */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-2 text-xs font-bold text-white border border-white/5">
            <span className="truncate">{team1Name}</span>
            <input
              type="number"
              min="0"
              max="99"
              value={score1}
              onChange={(e) => setScore1(e.target.value)}
              className="h-8 w-12 rounded-xl border border-white/10 bg-black/60 text-center font-black text-xs text-white outline-none focus:border-white/30"
            />
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-2 text-xs font-bold text-white border border-white/5">
            <span className="truncate">{team2Name}</span>
            <input
              type="number"
              min="0"
              max="99"
              value={score2}
              onChange={(e) => setScore2(e.target.value)}
              className="h-8 w-12 rounded-xl border border-white/10 bg-black/60 text-center font-black text-xs text-white outline-none focus:border-white/30"
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
              : 'text-slate-400 hover:text-white'
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
              : 'text-slate-400 hover:text-red-400'
          }`}
        >
          🔴 Live
        </button>

        <button
          type="button"
          onClick={() => save('finished')}
          className="rounded-lg border border-white/20 px-3 py-1 text-[10px] font-black text-white transition hover:opacity-90 shadow-md"
          style={{ backgroundColor: isFinished ? '#10b981' : primaryColor }}
        >
          {isFinished ? '✓ Fertig' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}