'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
  payment_status?: string | null
  checkin_status?: string | null
}

type Group = {
  id: number
  name: string
}

type GroupMember = {
  id: number
  group_id: number
  team_id: number
}

type GroupConstraint = {
  id: number
  tournament_id: number
  team_a_id: number
  team_b_id: number
  rule_type: 'together' | 'separate'
}

type TournamentSettings = {
  id: number
  mode: string | null
  group_count: number | null
  qualifiers_per_group: number | null
  knockout_size: number | null
  minimum_group_games: number | null
  min_group_games: number | null
  team_count: number | null
  qualification_mode: string | null
  ko_size: number | null
  play_in_enabled: boolean | null
  direct_qualifiers: number | null
  additional_qualifiers: number | null
  additional_qualifier_position: number | null
  filler_place: number | null
  filler_qualifiers: number | null
  filler_enabled: boolean | null
  knockout_draw_mode: string | null
  knockout_avoid_same_group: boolean | null
  knockout_third_place_mode: string | null
  knockout_bracket_generated: boolean | null
  additional_qualifier_table_enabled: boolean | null
  additional_qualifier_table_position: number | null
}

type Configuration = {
  groupCount: number
  koSize: number
  directQualifiers: number
  additionalQualifiers: number
  additionalQualifierPosition: number
}

type Tournament = {
  id: number
  name: string
  slug: string
  type: string
  primary_color: string | null
  secondary_color: string | null
  logo_url: string | null
}

// INTELLIGENTE VOREINSTELLUNG (IMMER SAUBERE 2ER-POTENZEN OHNE 3. PLÄTZE)
function getSmartDefaultConfiguration(teamCount: number): Configuration {
  if (teamCount < 4) {
    return {
      groupCount: 2,
      koSize: 4,
      directQualifiers: 2,
      additionalQualifiers: 0,
      additionalQualifierPosition: 3,
    }
  }

  let groupCount = 2
  if (teamCount >= 128) groupCount = 32
  else if (teamCount >= 64) groupCount = 16
  else if (teamCount >= 32) groupCount = 8
  else if (teamCount >= 16) groupCount = 4
  else groupCount = 2

  const directQualifiers = 2
  const koSize = groupCount * directQualifiers

  return {
    groupCount,
    koSize,
    directQualifiers,
    additionalQualifiers: 0,
    additionalQualifierPosition: 3,
  }
}

// ALGORITHMUS FÜR BINDENDE GRUPPENVORGABEN (UNION-FIND + BACKTRACKING)
function generateConstrainedGroupAssignment(
  teams: Team[],
  groupCount: number,
  constraints: GroupConstraint[]
): number[][] {
  if (teams.length === 0) {
    throw new Error('Es sind noch keine Teams vorhanden.')
  }
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > teams.length) {
    throw new Error('Die Anzahl der Gruppen ist ungültig.')
  }

  const teamIds = new Set(teams.map((team) => team.id))
  const parent = new Map<number, number>()
  for (const team of teams) {
    parent.set(team.id, team.id)
  }

  function find(id: number): number {
    const currentParent = parent.get(id)
    if (currentParent === undefined) return id
    if (currentParent === id) return id
    const root = find(currentParent)
    parent.set(id, root)
    return root
  }

  function union(a: number, b: number) {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent.set(rootB, rootA)
    }
  }

  for (const constraint of constraints) {
    if (constraint.rule_type !== 'together') continue
    if (!teamIds.has(constraint.team_a_id) || !teamIds.has(constraint.team_b_id)) continue
    union(constraint.team_a_id, constraint.team_b_id)
  }

  const components = new Map<number, Team[]>()
  for (const team of teams) {
    const root = find(team.id)
    const existing = components.get(root) ?? []
    existing.push(team)
    components.set(root, existing)
  }

  const componentRoots = Array.from(components.keys())
  const rootForTeam = new Map<number, number>()
  for (const team of teams) {
    rootForTeam.set(team.id, find(team.id))
  }

  const conflicts = new Map<number, Set<number>>()
  for (const root of componentRoots) {
    conflicts.set(root, new Set<number>())
  }

  for (const constraint of constraints) {
    if (constraint.rule_type !== 'separate') continue
    if (!teamIds.has(constraint.team_a_id) || !teamIds.has(constraint.team_b_id)) continue

    const rootA = rootForTeam.get(constraint.team_a_id)
    const rootB = rootForTeam.get(constraint.team_b_id)
    if (rootA === undefined || rootB === undefined) continue

    if (rootA === rootB) {
      const nameA = teams.find((team) => team.id === constraint.team_a_id)?.name ?? 'Team A'
      const nameB = teams.find((team) => team.id === constraint.team_b_id)?.name ?? 'Team B'
      throw new Error(
        `${nameA} und ${nameB} müssen laut deinen Vorgaben zusammen und gleichzeitig getrennt sein. Bitte korrigiere die Gruppenvorgaben.`
      )
    }

    conflicts.get(rootA)?.add(rootB)
    conflicts.get(rootB)?.add(rootA)
  }

  const baseSize = Math.floor(teams.length / groupCount)
  const remainder = teams.length % groupCount
  const targetSizes = Array.from(
    { length: groupCount },
    (_, index) => baseSize + (index < remainder ? 1 : 0)
  )

  const randomizedRoots = [...componentRoots].sort((a, b) => {
    const sizeDifference = (components.get(b)?.length ?? 0) - (components.get(a)?.length ?? 0)
    if (sizeDifference !== 0) return sizeDifference
    const conflictDifference = (conflicts.get(b)?.size ?? 0) - (conflicts.get(a)?.size ?? 0)
    if (conflictDifference !== 0) return conflictDifference
    return Math.random() - 0.5
  })

  const assignedRootsByGroup: number[][] = Array.from({ length: groupCount }, () => [])
  const currentGroupSizes = Array.from({ length: groupCount }, () => 0)
  let searchNodes = 0
  const maxSearchNodes = 250000

  function canPlace(root: number, groupIndex: number): boolean {
    const blockSize = components.get(root)?.length ?? 0
    if (currentGroupSizes[groupIndex] + blockSize > targetSizes[groupIndex]) {
      return false
    }
    const conflictRoots = conflicts.get(root) ?? new Set<number>()
    for (const existingRoot of assignedRootsByGroup[groupIndex]) {
      if (conflictRoots.has(existingRoot)) {
        return false
      }
    }
    return true
  }

  function search(position: number): boolean {
    searchNodes += 1
    if (searchNodes > maxSearchNodes) return false
    if (position >= randomizedRoots.length) {
      return currentGroupSizes.every((size, index) => size === targetSizes[index])
    }

    const root = randomizedRoots[position]
    const blockSize = components.get(root)?.length ?? 0
    const possibleGroups = Array.from({ length: groupCount }, (_, index) => index).filter(
      (groupIndex) => canPlace(root, groupIndex)
    )

    possibleGroups.sort((a, b) => {
      const remainingA = targetSizes[a] - currentGroupSizes[a] - blockSize
      const remainingB = targetSizes[b] - currentGroupSizes[b] - blockSize
      if (remainingA !== remainingB) return remainingA - remainingB
      return Math.random() - 0.5
    })

    for (const groupIndex of possibleGroups) {
      assignedRootsByGroup[groupIndex].push(root)
      currentGroupSizes[groupIndex] += blockSize
      if (search(position + 1)) return true
      assignedRootsByGroup[groupIndex].pop()
      currentGroupSizes[groupIndex] -= blockSize
    }

    return false
  }

  const successful = search(0)
  if (!successful) {
    throw new Error(
      'Mit den aktuellen Gruppenvorgaben konnte keine passende Verteilung gefunden werden. Reduziere die Anzahl der Vorgaben, ändere die Gruppenzahl oder prüfe, ob zu viele Teams zusammenbleiben müssen.'
    )
  }

  return assignedRootsByGroup.map((roots) =>
    roots.flatMap((root) => components.get(root)?.map((team) => team.id) ?? [])
  )
}

export default function AdminGruppenPage() {
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
  const [groupConstraints, setGroupConstraints] = useState<GroupConstraint[]>([])
  const [settings, setSettings] = useState<TournamentSettings | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [constraintSaving, setConstraintSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // SUCHFUNKTION STATE
  const [groupSearchQuery, setGroupSearchQuery] = useState('')

  const [configuration, setConfiguration] = useState<Configuration>({
    groupCount: 4,
    koSize: 16,
    directQualifiers: 2,
    additionalQualifiers: 0,
    additionalQualifierPosition: 3,
  })

  const [showRecommendation, setShowRecommendation] = useState(true)
  const [selectedConstraintTeamIds, setSelectedConstraintTeamIds] = useState<string[]>(['', ''])
  const [constraintType, setConstraintType] = useState<'together' | 'separate'>('separate')

  // STATE FÜR SPIELFREI & TEAM-SWAP
  const [firstByeTeamMap, setFirstByeTeamMap] = useState<Record<number, number>>({})
  const [swapSourceMember, setSwapSourceMember] = useState<{ memberId: number; teamId: number; groupId: number } | null>(null)
  const [swapTargetMemberId, setSwapTargetMemberId] = useState<string>('')

  const triggerBroadcast = useCallback(async (tournamentId: number) => {
    try {
      const channel = supabase.channel(`tournament:${tournamentId}`)
      await channel.send({
        type: 'broadcast',
        event: 'refresh',
        payload: { updated: Date.now() },
      })
    } catch (e) {
      console.error('Broadcast error:', e)
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (tourneyError) {
        throw new Error(`Fehler beim Laden des Turniers: ${tourneyError.message}`)
      }
      if (!tourneyData) {
        setError(`Kein Turnier mit dem Slug "${slug}" gefunden.`)
        return
      }

      setTournament(tourneyData as Tournament)

      const [teamsRes, groupsRes, membersRes, settingsRes, constraintsRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('id', { ascending: true }),
        supabase
          .from('groups')
          .select('id, name')
          .eq('tournament_id', tourneyData.id)
          .order('name', { ascending: true }),
        supabase
          .from('group_members')
          .select('id, group_id, team_id')
          .eq('tournament_id', tourneyData.id),
        supabase
          .from('tournament_settings')
          .select('*')
          .eq('tournament_id', tourneyData.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('group_constraints')
          .select('id, tournament_id, team_a_id, team_b_id, rule_type')
          .eq('tournament_id', tourneyData.id)
          .order('id', { ascending: true }),
      ])

      if (teamsRes.error) throw new Error(`Tabelle 'teams': ${teamsRes.error.message}`)
      if (groupsRes.error) throw new Error(`Tabelle 'groups': ${groupsRes.error.message}`)
      if (membersRes.error) throw new Error(`Tabelle 'group_members': ${membersRes.error.message}`)

      const loadedTeams = (teamsRes.data ?? []) as Team[]
      const loadedGroups = (groupsRes.data ?? []) as Group[]
      const loadedMembers = (membersRes.data ?? []) as GroupMember[]

      setTeams(loadedTeams)
      setGroups(loadedGroups)
      setMembers(loadedMembers)

      if (settingsRes.data) {
        const loadedSettings = settingsRes.data as TournamentSettings
        setSettings(loadedSettings)
        setConfiguration({
          groupCount: loadedSettings.group_count ?? (loadedGroups.length > 0 ? loadedGroups.length : getSmartDefaultConfiguration(loadedTeams.length).groupCount),
          koSize: loadedSettings.ko_size ?? loadedSettings.knockout_size ?? getSmartDefaultConfiguration(loadedTeams.length).koSize,
          directQualifiers:
            loadedSettings.direct_qualifiers ?? loadedSettings.qualifiers_per_group ?? 2,
          additionalQualifiers: loadedSettings.additional_qualifiers ?? 0,
          additionalQualifierPosition: loadedSettings.additional_qualifier_position ?? 3,
        })
      } else {
        setSettings(null)
        setConfiguration(getSmartDefaultConfiguration(loadedTeams.length))
      }

      if (constraintsRes.error) {
        console.warn('Fehler bei group_constraints:', constraintsRes.error.message)
        setGroupConstraints([])
      } else {
        setGroupConstraints((constraintsRes.data ?? []) as GroupConstraint[])
      }
    } catch (err: any) {
      console.error('FEHLER BEIM LADEN DER DATEN:', err)
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // REALTIME SYNC
  useEffect(() => {
    if (!tournament?.id) return

    const channel = supabase
      .channel(`admin_gruppen_${tournament.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_constraints', filter: `tournament_id=eq.${tournament.id}` },
        () => void loadData()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournament?.id, loadData])

  const primaryColor = tournament?.primary_color || '#22c55e'

  const groupDistribution = useMemo(() => {
    const distribution: Record<number, number> = {}
    for (const group of groups) {
      distribution[group.id] = 0
    }
    for (const member of members) {
      if (distribution[member.group_id] !== undefined) {
        distribution[member.group_id] += 1
      }
    }
    return distribution
  }, [groups, members])

  const groupSizes = useMemo(() => {
    return groups.map((group) => groupDistribution[group.id] ?? 0)
  }, [groups, groupDistribution])

  const minGroupSize = groupSizes.length > 0 ? Math.min(...groupSizes) : 0
  const maxGroupSize = groupSizes.length > 0 ? Math.max(...groupSizes) : 0
  const averageGroupSize = groups.length > 0 ? teams.length / groups.length : 0

  const estimatedGroupGames = useMemo(() => {
    if (teams.length === 0 || configuration.groupCount === 0) return 0
    const baseSize = Math.floor(teams.length / configuration.groupCount)
    const largerGroups = teams.length % configuration.groupCount
    let games = 0
    for (let i = 0; i < configuration.groupCount; i++) {
      const size = baseSize + (i < largerGroups ? 1 : 0)
      if (size >= 2) {
        games += (size * (size - 1)) / 2
      }
    }
    return games
  }, [teams.length, configuration.groupCount])

  const directQualified = configuration.groupCount * configuration.directQualifiers
  const totalQualified = directQualified + configuration.additionalQualifiers

  const groupSizeValid =
    configuration.groupCount > 0 &&
    configuration.groupCount <= Math.max(teams.length, 1) &&
    maxGroupSize - minGroupSize <= 1

  const enoughTeamsForKo =
    configuration.koSize > 0 && totalQualified >= configuration.koSize

  const qualificationValid =
    configuration.directQualifiers >= 1 && directQualified <= configuration.koSize

  const additionalQualifierValid =
    configuration.additionalQualifiers >= 0 && totalQualified >= configuration.koSize

  const qualifierPositionValid =
    configuration.additionalQualifiers === 0 || configuration.additionalQualifierPosition >= 1

  const configurationIsValid =
    groupSizeValid &&
    enoughTeamsForKo &&
    qualificationValid &&
    additionalQualifierValid &&
    qualifierPositionValid

  const recommendation = useMemo(() => {
    return getSmartDefaultConfiguration(teams.length)
  }, [teams.length])

  function applyRecommendation() {
    if (!recommendation) return
    setConfiguration(recommendation)
    setSuccess('Saubere 2er-Potenz Empfehlung ohne 3. Plätze übernommen.')
    setError('')
  }

  function updateConfiguration(key: keyof Configuration, value: number) {
    setConfiguration((current) => ({
      ...current,
      [key]: value,
    }))
    setSuccess('')
    setError('')
  }

  function handleConstraintTeamChange(index: number, value: string) {
    setSelectedConstraintTeamIds((current) => {
      const updated = [...current]
      updated[index] = value
      return updated
    })
  }

  function addTeamSelectField() {
    setSelectedConstraintTeamIds((current) => [...current, ''])
  }

  function removeTeamSelectField(index: number) {
    if (selectedConstraintTeamIds.length <= 2) return
    setSelectedConstraintTeamIds((current) => current.filter((_, idx) => idx !== index))
  }

  async function moveTeamToGroup(memberId: number, targetGroupId: number) {
    if (!tournament?.id) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await supabase
        .from('group_members')
        .update({ group_id: targetGroupId })
        .eq('id', memberId)
        .eq('tournament_id', tournament.id)

      if (updateError) throw updateError

      await triggerBroadcast(tournament.id)
      await loadData()
      setSuccess('Team wurde erfolgreich in die neue Gruppe verschoben.')
    } catch (err: any) {
      console.error('Move team error:', err)
      setError(`Fehler beim Verschieben des Teams: ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  async function swapTwoTeams(member1Id: number, targetGroupId1: number, member2Id: number, targetGroupId2: number) {
    if (!tournament?.id) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const { error: err1 } = await supabase
        .from('group_members')
        .update({ group_id: targetGroupId2 })
        .eq('id', member1Id)
        .eq('tournament_id', tournament.id)

      if (err1) throw err1

      const { error: err2 } = await supabase
        .from('group_members')
        .update({ group_id: targetGroupId1 })
        .eq('id', member2Id)
        .eq('tournament_id', tournament.id)

      if (err2) throw err2

      setSwapSourceMember(null)
      setSwapTargetMemberId('')
      await triggerBroadcast(tournament.id)
      await loadData()
      setSuccess('Die beiden Teams wurden erfolgreich gegeneinander getauscht.')
    } catch (err: any) {
      console.error('Swap teams error:', err)
      setError(`Fehler beim Tauschen der Teams: ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  async function addGroupConstraint() {
    if (!tournament?.id) return
    setError('')
    setSuccess('')

    const validIds = Array.from(
      new Set(
        selectedConstraintTeamIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0 && teams.some((team) => team.id === id))
      )
    )

    if (validIds.length < 2) {
      setError('Bitte wähle mindestens zwei unterschiedliche Teams aus.')
      return
    }

    const pairsToInsert: {
      tournament_id: number
      team_a_id: number
      team_b_id: number
      rule_type: 'together' | 'separate'
    }[] = []

    for (let i = 0; i < validIds.length; i++) {
      for (let j = i + 1; j < validIds.length; j++) {
        const firstTeamId = Math.min(validIds[i], validIds[j])
        const secondTeamId = Math.max(validIds[i], validIds[j])
        const exists = groupConstraints.some(
          (constraint) =>
            constraint.team_a_id === firstTeamId && constraint.team_b_id === secondTeamId
        )
        if (!exists) {
          pairsToInsert.push({
            tournament_id: tournament.id,
            team_a_id: firstTeamId,
            team_b_id: secondTeamId,
            rule_type: constraintType,
          })
        }
      }
    }

    if (pairsToInsert.length === 0) {
      setError('Für alle ausgewählten Teams existiert bereits eine direkte Vorgabe.')
      return
    }

    setConstraintSaving(true)
    try {
      const { data, error: insertError } = await supabase
        .from('group_constraints')
        .insert(pairsToInsert)
        .select('*')

      if (insertError) {
        throw new Error(insertError.message || JSON.stringify(insertError))
      }

      if (data && data.length > 0) {
        setGroupConstraints((current) => [...current, ...(data as GroupConstraint[])])
      } else {
        await loadData()
      }

      setSelectedConstraintTeamIds(['', ''])
      setSuccess(
        constraintType === 'together'
          ? `Regel gespeichert: ${validIds.length} Teams werden zusammen in dieselbe Gruppe gelost.`
          : `Regel gespeichert: ${validIds.length} Teams werden auf unterschiedliche Gruppen verteilt.`
      )
    } catch (err: any) {
      console.error('Constraint save error:', err)
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      setError(`Fehler beim Speichern der Vorgabe: ${msg}`)
    } finally {
      setConstraintSaving(false)
    }
  }

  async function deleteGroupConstraint(constraintId: number) {
    if (!tournament?.id) return
    setError('')
    setSuccess('')
    if (!confirm('Möchtest du diese Gruppenvorgabe wirklich löschen?')) return

    setConstraintSaving(true)
    try {
      const { error: deleteError } = await supabase
        .from('group_constraints')
        .delete()
        .eq('id', constraintId)
        .eq('tournament_id', tournament.id)

      if (deleteError) {
        throw new Error(deleteError.message || JSON.stringify(deleteError))
      }

      setGroupConstraints((current) =>
        current.filter((constraint) => constraint.id !== constraintId)
      )
      setSuccess('Die Gruppenvorgabe wurde gelöscht.')
    } catch (err: any) {
      console.error('Constraint delete error:', err)
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      setError(`Fehler beim Löschen der Vorgabe: ${msg}`)
    } finally {
      setConstraintSaving(false)
    }
  }

  async function saveSettings() {
    if (!tournament?.id) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      if (!configurationIsValid) {
        throw new Error('Die aktuelle Konfiguration ist noch nicht gültig.')
      }

      const payload = {
        tournament_id: tournament.id,
        mode: 'gruppen_ko',
        group_count: configuration.groupCount,
        qualifiers_per_group: configuration.directQualifiers,
        knockout_size: configuration.koSize,
        ko_size: configuration.koSize,
        team_count: teams.length,
        direct_qualifiers: configuration.directQualifiers,
        additional_qualifiers: configuration.additionalQualifiers,
        additional_qualifier_position: configuration.additionalQualifierPosition,
      }

      let savedResult: TournamentSettings | null = null

      const { data: upsertData, error: upsertError } = await supabase
        .from('tournament_settings')
        .upsert(payload, { onConflict: 'tournament_id' })
        .select('*')
        .maybeSingle()

      if (upsertError) {
        if (settings?.id) {
          const { data: updateData, error: updateError } = await supabase
            .from('tournament_settings')
            .update(payload)
            .eq('id', settings.id)
            .select('*')
            .maybeSingle()

          if (updateError) throw new Error(`Update-Fehler: ${updateError.message}`)
          savedResult = updateData as TournamentSettings
        } else {
          const { data: insertData, error: insertError } = await supabase
            .from('tournament_settings')
            .insert(payload)
            .select('*')
            .maybeSingle()

          if (insertError) throw new Error(`Insert-Fehler: ${insertError.message}`)
          savedResult = insertData as TournamentSettings
        }
      } else {
        savedResult = upsertData as TournamentSettings
      }

      if (savedResult) {
        setSettings(savedResult)
      }

      await triggerBroadcast(tournament.id)
      setSuccess('Turnierkonfiguration wurde erfolgreich gespeichert.')
    } catch (err: any) {
      console.error('SPEICHERFEHLER:', err)
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
      setError(`Fehler beim Speichern der Konfiguration: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  async function createGroups() {
    if (!tournament?.id) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      if (!configurationIsValid) {
        throw new Error('Die Konfiguration ist noch nicht gültig.')
      }
      if (teams.length === 0) {
        throw new Error('Es sind noch keine Teams vorhanden.')
      }

      const assignment = generateConstrainedGroupAssignment(
        teams,
        configuration.groupCount,
        groupConstraints
      )

      if (
        !confirm(
          `Die bestehenden Gruppen werden ersetzt und ${teams.length} Teams nach den gespeicherten Vorgaben auf ${configuration.groupCount} Gruppen verteilt. Fortfahren?`
        )
      ) {
        return
      }

      await supabase.from('group_members').delete().eq('tournament_id', tournament.id)
      await supabase.from('groups').delete().eq('tournament_id', tournament.id)

      const groupRows = Array.from({ length: configuration.groupCount }, (_, index) => ({
        tournament_id: tournament.id,
        name: `Gruppe ${String.fromCharCode(65 + index)}`,
      }))

      const { data: createdGroups, error: createGroupsError } = await supabase
        .from('groups')
        .insert(groupRows)
        .select('id, name')
        .order('id', { ascending: true })

      if (createGroupsError) throw createGroupsError
      if (!createdGroups || createdGroups.length !== configuration.groupCount) {
        throw new Error('Es konnten nicht alle Gruppen erstellt werden.')
      }

      const newMembers: {
        tournament_id: number
        group_id: number
        team_id: number
      }[] = []

      assignment.forEach((teamIds, groupIndex) => {
        const group = createdGroups[groupIndex]
        for (const teamId of teamIds) {
          newMembers.push({
            tournament_id: tournament.id,
            group_id: group.id,
            team_id: teamId,
          })
        }
      })

      const { error: memberInsertError } = await supabase
        .from('group_members')
        .insert(newMembers)

      if (memberInsertError) throw memberInsertError

      await saveSettings()
      await triggerBroadcast(tournament.id)
      await loadData()

      setSuccess(
        `Die Gruppen wurden erfolgreich erstellt. Alle ${teams.length} Teams wurden verteilt und die ${groupConstraints.length} Gruppenvorgaben wurden berücksichtigt.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Die Gruppen konnten nicht erstellt werden.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  // NEU: GRUPPEN & SPIELE AUFLÖSEN / ZURÜCKSETZEN
  async function resetGroupsAndMatches() {
    if (!tournament?.id) return

    const confirmStep1 = confirm(
      'Möchtest du die Gruppenerstellung wirklich auflösen?'
    )
    if (!confirmStep1) return

    const confirmStep2 = confirm(
      '⚠️ SYSTEM-ABFRAGE: Sollten bereits Spiele oder der Spielplan für dieses Turnier generiert worden sein, werden auch ALLE Spiele unwiderruflich gelöscht!\n\nBist du dir ganz sicher, dass du Gruppen und Spiele zurücksetzen willst?'
    )
    if (!confirmStep2) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // 1. Spiele zurücksetzen (falls Tabelle 'matches' existiert)
      const { error: matchesError } = await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', tournament.id)

      if (matchesError) {
        console.warn('Hinweis beim Löschen der Spiele (Matches):', matchesError.message)
      }

      // 2. Gruppenmitglieder löschen
      const { error: membersDeleteErr } = await supabase
        .from('group_members')
        .delete()
        .eq('tournament_id', tournament.id)

      if (membersDeleteErr) throw membersDeleteErr

      // 3. Gruppen löschen
      const { error: groupsDeleteErr } = await supabase
        .from('groups')
        .delete()
        .eq('tournament_id', tournament.id)

      if (groupsDeleteErr) throw groupsDeleteErr

      await triggerBroadcast(tournament.id)
      await loadData()

      setSuccess('Die Gruppen und alle zugehörigen Spiele wurden erfolgreich zurückgesetzt.')
    } catch (err: any) {
      console.error('Reset error:', err)
      setError(`Fehler beim Zurücksetzen der Gruppen: ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  const teamsWithoutGroup = useMemo(() => {
    const assignedIds = new Set(members.map((member) => member.team_id))
    return teams.filter((team) => !assignedIds.has(team.id))
  }, [teams, members])

  const groupTeamMap = useMemo(() => {
    const map: Record<number, { memberId: number; team: Team }[]> = {}
    for (const group of groups) {
      map[group.id] = []
    }
    for (const member of members) {
      const team = teams.find((item) => item.id === member.team_id)
      if (!team) continue
      if (!map[member.group_id]) {
        map[member.group_id] = []
      }
      map[member.group_id].push({ memberId: member.id, team })
    }
    return map
  }, [groups, members, teams])

  // GEFILTERTE GRUPPEN FÜR DIE SUCHFUNKTION
  const filteredGroups = useMemo(() => {
    if (!groupSearchQuery.trim()) return groups

    const query = groupSearchQuery.toLowerCase().trim()
    return groups.filter((group) => {
      const groupNameMatch = group.name.toLowerCase().includes(query)
      const groupItems = groupTeamMap[group.id] ?? []
      const teamNameMatch = groupItems.some(({ team }) =>
        team.name.toLowerCase().includes(query)
      )
      return groupNameMatch || teamNameMatch
    })
  }, [groups, groupTeamMap, groupSearchQuery])

  function getConstraintTeamName(teamId: number) {
    return teams.find((team) => team.id === teamId)?.name ?? 'Unbekanntes Team'
  }

  const togetherConstraints = groupConstraints.filter(
    (constraint) => constraint.rule_type === 'together'
  )
  const separateConstraints = groupConstraints.filter(
    (constraint) => constraint.rule_type === 'separate'
  )

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade Gruppen-Manager …
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100">
      {/* ERROR & SUCCESS MESSAGES */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-extrabold text-red-300 backdrop-blur-md">
          <div className="font-bold uppercase tracking-wider">Fehler</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs font-extrabold text-emerald-300 backdrop-blur-md">
          {success}
        </div>
      )}

      {/* TEAM OVERVIEW CARDS */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 w-full">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Angemeldete Teams</p>
          <p className="mt-2 text-3xl font-black text-white">{teams.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Aktuelle Gruppen</p>
          <p className="mt-2 text-3xl font-black text-white">{groups.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Zugeordnet</p>
          <p className="mt-2 text-3xl font-black text-white">{members.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ohne Gruppe</p>
          <p
            className="mt-2 text-3xl font-black"
            style={{ color: teamsWithoutGroup.length > 0 ? '#ef4444' : primaryColor }}
          >
            {teamsWithoutGroup.length}
          </p>
        </div>
      </section>

      {/* INDIVIDUELLE VORGABEN */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-white/10 pb-4">
          <div>
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ color: primaryColor }}
            >
              Individuelle Vorgaben
            </span>
            <h2 className="mt-1 text-xl font-black text-white tracking-tight">
              Welche Teams sollen zusammen oder getrennt werden?
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-300">
              Wähle beliebig viele Teams aus und lege fest, ob sie gemeinsam in einer Gruppe
              spielen oder auf unterschiedliche Gruppen verteilt werden sollen.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black text-emerald-400 border border-emerald-500/30">
              {togetherConstraints.length} Zusammen
            </span>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-black text-amber-300 border border-amber-500/30">
              {separateConstraints.length} Trennen
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Ausgewählte Teams ({selectedConstraintTeamIds.length})
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedConstraintTeamIds.map((selectedId, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950/80 font-mono text-xs font-black text-slate-400 border border-white/10">
                  #{idx + 1}
                </span>
                <select
                  value={selectedId}
                  onChange={(e) => handleConstraintTeamChange(idx, e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
                >
                  <option value="">Team auswählen ...</option>
                  {teams.map((team) => (
                    <option
                      key={team.id}
                      value={team.id}
                      disabled={
                        selectedConstraintTeamIds.includes(String(team.id)) &&
                        String(team.id) !== selectedId
                      }
                    >
                      {team.name}
                    </option>
                  ))}
                </select>
                {selectedConstraintTeamIds.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeTeamSelectField(idx)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-900/30 transition font-black"
                    title="Entfernen"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addTeamSelectField}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-xs font-black text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            + Weiteres Team-Feld
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr] items-end pt-2 border-t border-white/10">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Gruppenvorgabe
            </label>
            <select
              value={constraintType}
              onChange={(e) => setConstraintType(e.target.value as 'together' | 'separate')}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            >
              <option value="separate">
                → Alle ausgewählten Teams gegenseitig getrennt halten
              </option>
              <option value="together">
                ✓ Alle ausgewählten Teams zusammen in eine Gruppe losen
              </option>
            </select>
          </div>
          <button
            type="button"
            onClick={addGroupConstraint}
            disabled={
              constraintSaving ||
              teams.length < 2 ||
              selectedConstraintTeamIds.filter(Boolean).length < 2
            }
            className="rounded-2xl px-5 py-3.5 text-xs font-black text-slate-950 shadow-lg transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {constraintSaving ? 'Speichere ...' : 'Vorgabe speichern'}
          </button>
        </div>

        {/* LISTE DER GESPEICHERTEN PAAR-VORGABEN */}
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Gespeicherte Paar-Vorgaben ({groupConstraints.length})
            </h3>
          </div>
          {groupConstraints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-center text-xs font-bold text-slate-400">
              Noch keine individuellen Vorgaben gespeichert.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {groupConstraints.map((constraint) => {
                const together = constraint.rule_type === 'together'
                return (
                  <div
                    key={constraint.id}
                    className={`flex items-center justify-between rounded-2xl border p-3 text-xs font-bold backdrop-blur-md ${
                      together
                        ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                        : 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-sm">{together ? '✓' : '→'}</span>
                      <span className="truncate text-white">
                        {getConstraintTeamName(constraint.team_a_id)}{' '}
                        <span className="text-slate-400 font-normal">
                          {together ? 'zusammen mit' : 'getrennt von'}
                        </span>{' '}
                        {getConstraintTeamName(constraint.team_b_id)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteGroupConstraint(constraint.id)}
                      disabled={constraintSaving}
                      className="ml-2 text-slate-400 hover:text-red-400 text-xs font-black"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* EMPFEHLUNG VOLLAUTOMATISCH */}
      {recommendation && showRecommendation && (
        <section className="rounded-[32px] border border-emerald-500/30 bg-emerald-950/20 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase text-slate-950"
                  style={{ backgroundColor: primaryColor }}
                >
                  INTELLIGENTE VOREINSTELLUNG
                </span>
                <span className="text-xs font-bold text-slate-300">
                  Sauberer Turnierbaum (ohne 3. Plätze)
                </span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">
                {recommendation.groupCount} Gruppen &amp; {recommendation.koSize}er-K.-o.
              </h2>
              <p className="mt-1 text-xs text-slate-300 max-w-3xl leading-relaxed">
                Bei {teams.length} Teams werden voreingestellt {recommendation.groupCount} Gruppen erstellt.
                Die besten 2 Teams pro Gruppe ziehen direkt in die K.-o.-Phase ({recommendation.koSize}er-Baum) ein.
                Es werden <span className="font-bold text-emerald-400">keine 3. Plätze</span> benötigt!
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={applyRecommendation}
                className="rounded-2xl px-4 py-2 text-xs font-black text-slate-950 transition hover:opacity-90 shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                Übernehmen
              </button>
              <button
                type="button"
                onClick={() => setShowRecommendation(false)}
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-xs font-bold text-slate-300 hover:border-white/20 hover:text-white"
              >
                Ausblenden
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TURNIERKONFIGURATION */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
        <div className="border-b border-white/10 pb-4">
          <h2 className="text-xl font-black text-white tracking-tight">Turnierkonfiguration</h2>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Diese Werte bestimmen die Gruppenaufteilung und K.-o.-Verteilung.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Anzahl Gruppen
            </label>
            <input
              type="number"
              min={1}
              max={teams.length || 1}
              value={configuration.groupCount}
              onChange={(e) => updateConfiguration('groupCount', Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-black text-white focus:border-white/30 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Größe der K.-o.-Phase
            </label>
            <select
              value={configuration.koSize}
              onChange={(e) => updateConfiguration('koSize', Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-black text-white focus:border-white/30 focus:outline-none"
            >
              {[4, 8, 16, 32, 64].map((size) => (
                <option key={size} value={size}>
                  {size} Teams
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Direkte Qualifikanten pro Gruppe
            </label>
            <input
              type="number"
              min={1}
              max={configuration.koSize}
              value={configuration.directQualifiers}
              onChange={(e) => updateConfiguration('directQualifiers', Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-black text-white focus:border-white/30 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Zusätzliche Qualifikanten (z.B. 3. Plätze)
            </label>
            <input
              type="number"
              min={0}
              max={configuration.koSize}
              value={configuration.additionalQualifiers}
              onChange={(e) => updateConfiguration('additionalQualifiers', Number(e.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-black text-white focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* PRÜFUNG / VALIDATION GRID */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
        <h2 className="text-xl font-black text-white tracking-tight">Voraussetzungen &amp; Prüfung</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ValidationItem
            valid={teams.length >= 4}
            label="Genügend Teams vorhanden"
            detail={`${teams.length} Teams`}
          />
          <ValidationItem
            valid={groupSizeValid}
            label="Gruppengrößen sinnvoll"
            detail={
              configuration.groupCount > 0
                ? `${Math.floor(teams.length / configuration.groupCount)}-${Math.ceil(
                    teams.length / configuration.groupCount
                  )} Teams`
                : 'Ungültig'
            }
          />
          <ValidationItem
            valid={enoughTeamsForKo}
            label="K.-o.-Phase erreichbar"
            detail={`${totalQualified} / ${configuration.koSize} Plätze`}
          />
          <ValidationItem
            valid={qualificationValid}
            label="Direkte Qualifikation"
            detail={`${directQualified} direkte Plätze`}
          />
          <ValidationItem
            valid={additionalQualifierValid}
            label="Zusätzliche Plätze"
            detail={`${totalQualified} qualifizierte Teams`}
          />
          <ValidationItem
            valid={qualifierPositionValid}
            label="Zusatzplatz-Regel"
            detail={
              configuration.additionalQualifiers > 0
                ? `Platz ${configuration.additionalQualifierPosition}`
                : 'Nicht benötigt (Clean)'
            }
          />
        </div>
      </section>

      {/* AKTUELLE GRUPPEN MIT VOLLER HÖHE UND KOMPAKTER TEAM-DARSTELLUNG */}
      {groups.length > 0 && (
        <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 w-full">
          {/* HEADER MIT SUCHLEISTE & AUFLÖSEN-BUTTON */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-white tracking-tight">Aktuelle Gruppen</h2>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-extrabold text-emerald-400">
                  {groups.length} Gruppen aktiv
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-300">
                Teams per Dropdown in andere Gruppen verschieben, gegenseitig tauschen oder Spielfrei-Regeln einstellen.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* SUCHFELD */}
              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  placeholder="🔍 Gruppe oder Team suchen ..."
                  value={groupSearchQuery}
                  onChange={(e) => setGroupSearchQuery(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:border-white/30 focus:outline-none"
                />
                {groupSearchQuery && (
                  <button
                    onClick={() => setGroupSearchQuery('')}
                    className="absolute right-3 top-2.5 text-xs font-black text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* GRUPPEN AUFLÖSEN BUTTON */}
              <button
                type="button"
                onClick={resetGroupsAndMatches}
                disabled={saving}
                className="rounded-2xl border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-xs font-black text-red-300 hover:bg-red-900/30 transition disabled:opacity-40 shrink-0"
              >
                🗑️ Gruppen &amp; Spiele auflösen
              </button>
            </div>
          </div>

          {/* SUCHGERGEBNISSE WARNUNG / HINWEIS */}
          {filteredGroups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center text-xs font-bold text-slate-400">
              Keine Gruppen oder Teams gefunden für &quot;{groupSearchQuery}&quot;.
            </div>
          )}

          {/* GRUPPEN GRID - NACHHALTIGES RASTER OHNE INNERES SCROLLEN */}
          <div className="grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 w-full">
            {filteredGroups.map((group) => {
              const groupItems = groupTeamMap[group.id] ?? []
              const isOdd = groupItems.length % 2 !== 0
              const selectedByeTeamId = firstByeTeamMap[group.id] ?? groupItems[0]?.team.id

              return (
                <div
                  key={group.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 space-y-3.5 flex flex-col justify-between shadow-xl hover:border-white/20 transition-all"
                >
                  <div className="space-y-3">
                    {/* CARD HEADER */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                          {group.name.replace('Gruppe ', '')}
                        </span>
                        <h3 className="font-black text-white text-base tracking-wide">{group.name}</h3>
                      </div>
                      <span className="rounded-full bg-slate-900 border border-white/10 px-2.5 py-0.5 text-[10px] font-black text-slate-300">
                        {groupItems.length} Teams
                      </span>
                    </div>

                    {/* HINWEIS UND DROPDOWN FÜR UNGERADE TEAMS (SPIELFREI) */}
                    {isOdd && (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-300">
                          <span>⏸️ Ungerade ({groupItems.length} Teams)</span>
                        </div>
                        <p className="text-[9px] text-amber-200/80 font-bold">
                          Ein Team hat pro Runde spielfrei. Stelle hier ein, welches Team in Runde 1 startet:
                        </p>
                        <select
                          value={selectedByeTeamId || ''}
                          onChange={(e) =>
                            setFirstByeTeamMap((prev) => ({
                              ...prev,
                              [group.id]: Number(e.target.value),
                            }))
                          }
                          className="w-full rounded-xl border border-amber-500/40 bg-slate-950/90 px-2 py-1.5 text-[10px] font-extrabold text-amber-200 focus:outline-none"
                        >
                          {groupItems.map(({ team }) => (
                            <option key={team.id} value={team.id}>
                              Spielfrei R1: {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* TEAM LISTE OHNE INNERES SCROLLEN */}
                    <div className="space-y-2 pt-0.5">
                      {groupItems.length === 0 ? (
                        <p className="text-xs text-slate-500 py-4 text-center">Keine Teams in dieser Gruppe</p>
                      ) : (
                        groupItems.map(({ memberId, team }, idx) => {
                          const isFirstBye = isOdd && team.id === selectedByeTeamId
                          const isBeingSwapped = swapSourceMember?.memberId === memberId

                          return (
                            <div
                              key={team.id}
                              className={`rounded-2xl border p-2.5 space-y-2 transition-all ${
                                isBeingSwapped
                                  ? 'border-amber-400 bg-amber-500/20 ring-2 ring-amber-400/50'
                                  : 'border-white/10 bg-slate-900/80 hover:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-extrabold text-xs text-white truncate max-w-[150px]" title={team.name}>
                                  <span className="mr-1.5 font-mono text-[10px] text-slate-500">#{idx + 1}</span>
                                  {team.name}
                                </span>
                                {isFirstBye && (
                                  <span className="shrink-0 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[8.5px] font-black uppercase text-amber-300 border border-amber-500/30">
                                    ⏸️ Spielfrei R1
                                  </span>
                                )}
                              </div>

                              {/* TAUSCHEN UND VERSCHIEBEN AKTIONEN IN EINER KOMPAKTEN ZEILE */}
                              <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/10">
                                {/* Direct Group Move */}
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      void moveTeamToGroup(memberId, Number(e.target.value))
                                      e.target.value = ''
                                    }
                                  }}
                                  disabled={saving}
                                  className="w-1/2 rounded-xl border border-white/10 bg-slate-950/80 px-2 py-1 text-[9px] font-bold text-slate-300 outline-none hover:border-white/30 truncate"
                                >
                                  <option value="" disabled>In Gruppe ...</option>
                                  {groups
                                    .filter((g) => g.id !== group.id)
                                    .map((g) => (
                                      <option key={g.id} value={g.id}>
                                        → {g.name}
                                      </option>
                                    ))}
                                </select>

                                {/* Swap with team */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isBeingSwapped) {
                                      setSwapSourceMember(null)
                                    } else {
                                      setSwapSourceMember({ memberId, teamId: team.id, groupId: group.id })
                                      setSwapTargetMemberId('')
                                    }
                                  }}
                                  disabled={saving}
                                  className={`w-1/2 rounded-xl border px-2 py-1 text-[9px] font-black transition ${
                                    isBeingSwapped
                                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                                      : 'border-white/10 bg-slate-950/60 text-slate-300 hover:text-white'
                                  }`}
                                >
                                  {isBeingSwapped ? 'Abbrechen' : '⇄ Tauschen'}
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* SWAP CONFIRM MODAL / BANNER */}
          {swapSourceMember && (
            <div className="rounded-2xl border border-amber-400/50 bg-amber-950/30 p-4 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-amber-300">
                  🔄 Team-Tausch aktiv für:{' '}
                  <span className="text-white">
                    {teams.find((t) => t.id === swapSourceMember.teamId)?.name}
                  </span>
                </span>
                <button
                  onClick={() => setSwapSourceMember(null)}
                  className="text-xs font-black text-amber-300 hover:text-white"
                >
                  ✕ Abbrechen
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <select
                  value={swapTargetMemberId}
                  onChange={(e) => setSwapTargetMemberId(e.target.value)}
                  className="w-full sm:w-auto flex-1 rounded-2xl border border-white/20 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-white focus:outline-none"
                >
                  <option value="">Wähle ein Tausch-Partner-Team ...</option>
                  {members
                    .filter((m) => m.group_id !== swapSourceMember.groupId)
                    .map((m) => {
                      const t = teams.find((item) => item.id === m.team_id)
                      const g = groups.find((item) => item.id === m.group_id)
                      return (
                        <option key={m.id} value={m.id}>
                          {t?.name || 'Team'} ({g?.name || 'Gruppe'})
                        </option>
                      )
                    })}
                </select>

                <button
                  type="button"
                  disabled={!swapTargetMemberId || saving}
                  onClick={() => {
                    const targetMember = members.find((m) => m.id === Number(swapTargetMemberId))
                    if (targetMember) {
                      void swapTwoTeams(
                        swapSourceMember.memberId,
                        swapSourceMember.groupId,
                        targetMember.id,
                        targetMember.group_id
                      )
                    }
                  }}
                  className="w-full sm:w-auto rounded-2xl px-5 py-2.5 text-xs font-black text-slate-950 transition hover:opacity-90 disabled:opacity-40 shrink-0 shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  Jetzt tauschen
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VERTEILUNGSÜBERSICHT & STATISTIK */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4 w-full">
        <h2 className="text-xl font-black text-white tracking-tight">Verteilungsübersicht</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoBox
            label="Durchschnittliche Gruppengröße"
            value={averageGroupSize > 0 ? averageGroupSize.toFixed(1) : '0'}
          />
          <InfoBox label="Kleinste Gruppe" value={String(minGroupSize)} />
          <InfoBox label="Größte Gruppe" value={String(maxGroupSize)} />
          <InfoBox label="Geschätzte Gruppenspiele" value={String(estimatedGroupGames)} />
        </div>
      </section>

      {/* SYSTEM AKTIONEN */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5 w-full">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Aktionen</h2>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Speichere zuerst die Einstellungen oder veranlasse direkt das Neuerstellen aller
            Gruppen.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving || !configurationIsValid}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3.5 text-xs font-black text-white hover:border-white/20 transition disabled:opacity-40"
          >
            {saving ? 'Speichere ...' : 'Konfiguration speichern'}
          </button>
          <button
            type="button"
            onClick={createGroups}
            disabled={saving || !configurationIsValid}
            className="rounded-2xl px-5 py-3.5 text-xs font-black text-slate-950 shadow-lg transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? 'Erstelle...' : 'Gruppen neu auslosen & erstellen'}
          </button>
        </div>
      </section>
    </div>
  )
}

function ValidationItem({
  valid,
  label,
  detail,
}: {
  valid: boolean
  label: string
  detail: string
}) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-md ${
        valid
          ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
          : 'border-red-500/30 bg-red-950/20 text-red-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
            valid ? 'bg-emerald-500 text-slate-950' : 'bg-red-500 text-white'
          }`}
        >
          {valid ? '✓' : '✕'}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black">{label}</div>
          <div className="mt-0.5 text-[10px] text-slate-400">{detail}</div>
        </div>
      </div>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  )
}