'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { publicSupabase as supabase } from '@/lib/supabase'

export type PaymentStatus = 'paid' | 'open' | 'free'
export type CheckinStatus = 'checked_in' | 'pending'

export type Team = {
  id: number
  tournament_id: number
  name: string
  player1?: string | null
  player2?: string | null
  captain_name?: string | null
  email: string | null
  phone: string | null
  payment_status: PaymentStatus | string | null
  payment_method?: string | null
  checkin_status: boolean | string | null
  notes: string | null
  token?: string | null
  created_at?: string
}

type TournamentData = {
  id: number
  name: string
  slug: string
  primary_color: string | null
}

export default function AdminTeamsPage() {
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [checkinFilter, setCheckinFilter] = useState<string>('all')

  // Modal / Form States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    player1: '',
    player2: '',
    email: '',
    phone: '',
    payment_status: 'open',
    checkin_status: 'pending',
    notes: '',
  })

  useEffect(() => {
    void loadData()
  }, [slug, rawSlug])

  async function triggerBroadcast(tournamentId: number) {
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
  }

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

      if (!tourneyData) {
        setStatusMessage({
          type: 'error',
          text: 'Turnier konnte nicht gefunden werden. Bitte überprüfe die URL.',
        })
        setTournament(null)
        setTeams([])
        return
      }

      setTournament(tourneyData as TournamentData)

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('tournament_id', tourneyData.id)
        .order('name', { ascending: true })

      if (teamError) throw teamError

      setTeams((teamData as Team[]) || [])
    } catch (err: any) {
      console.error('Fehler beim Laden der Teams:', err)
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Fehler beim Laden der Teamliste.',
      })
    } finally {
      setLoading(false)
    }
  }

  function isTeamCheckedIn(status: boolean | string | null): boolean {
    return status === true || status === 'checked_in' || status === 'true'
  }

  // --- CHECK-IN QUICK-TOGGLE ---
  async function handleToggleCheckin(teamId: number, currentStatus: boolean | string | null) {
    if (!tournament?.id) return
    const currentlyCheckedIn = isTeamCheckedIn(currentStatus)
    const nextStatusBool = !currentlyCheckedIn

    try {
      const { error } = await supabase
        .from('teams')
        .update({ checkin_status: nextStatusBool })
        .eq('id', teamId)
        .eq('tournament_id', tournament.id)

      if (error) throw error

      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, checkin_status: nextStatusBool } : t))
      )
      await triggerBroadcast(tournament.id)
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Check-in Fehler: ${err.message}` })
    }
  }

  // --- ZAHLUNGSSTATUS QUICK-TOGGLE ---
  async function handleTogglePayment(teamId: number, currentStatus: PaymentStatus | string | null) {
    if (!tournament?.id) return
    const isPaid = currentStatus === 'paid' || currentStatus === 'bezahlt'
    const nextStatus = isPaid ? 'open' : 'bezahlt'

    try {
      const { error } = await supabase
        .from('teams')
        .update({ payment_status: nextStatus })
        .eq('id', teamId)
        .eq('tournament_id', tournament.id)

      if (error) throw error

      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, payment_status: nextStatus } : t))
      )
      await triggerBroadcast(tournament.id)
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Zahlungsstatus Fehler: ${err.message}` })
    }
  }

  // --- TEAM LÖSCHEN ---
  async function handleDeleteTeam(teamId: number, teamName: string) {
    if (!tournament?.id) return
    if (!confirm(`Möchtest du das Team "${teamName}" wirklich dauerhaft löschen?`)) return

    try {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)
        .eq('tournament_id', tournament.id)

      if (error) throw error

      setTeams((prev) => prev.filter((t) => t.id !== teamId))
      await triggerBroadcast(tournament.id)
      setStatusMessage({ type: 'success', text: `Team "${teamName}" wurde gelöscht.` })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Fehler beim Löschen: ${err.message}` })
    }
  }

  // --- MODAL ÖFFNEN ---
  function openAddModal() {
    setEditingTeam(null)
    setFormData({
      name: '',
      player1: '',
      player2: '',
      email: '',
      phone: '',
      payment_status: 'open',
      checkin_status: 'pending',
      notes: '',
    })
    setIsModalOpen(true)
  }

  function openEditModal(team: Team) {
    setEditingTeam(team)
    setFormData({
      name: team.name,
      player1: team.player1 || '',
      player2: team.player2 || '',
      email: team.email || '',
      phone: team.phone || '',
      payment_status: typeof team.payment_status === 'string' ? team.payment_status : 'open',
      checkin_status: isTeamCheckedIn(team.checkin_status) ? 'checked_in' : 'pending',
      notes: team.notes || '',
    })
    setIsModalOpen(true)
  }

  // --- TEAM SPEICHERN ---
  async function handleSaveTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!tournament?.id || !formData.name.trim()) return

    setSaving(true)
    setStatusMessage(null)

    try {
      const checkinBool = formData.checkin_status === 'checked_in'

      const payload = {
        tournament_id: tournament.id,
        name: formData.name.trim(),
        player1: formData.player1.trim() || null,
        player2: formData.player2.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        payment_status: formData.payment_status,
        checkin_status: checkinBool,
        notes: formData.notes.trim() || null,
      }

      if (editingTeam) {
        const { error } = await supabase
          .from('teams')
          .update(payload)
          .eq('id', editingTeam.id)
          .eq('tournament_id', tournament.id)

        if (error) throw error
        setStatusMessage({ type: 'success', text: 'Teamdaten aktualisiert.' })
      } else {
        const { error } = await supabase
          .from('teams')
          .insert([payload])

        if (error) throw error
        setStatusMessage({ type: 'success', text: 'Neues Team erfolgreich hinzugefügt.' })
      }

      setIsModalOpen(false)
      await triggerBroadcast(tournament.id)
      await loadData()
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Fehler beim Speichern: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  // --- FILTER & STATISTIKEN ---
  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase()
        const matchName = t.name.toLowerCase().includes(q)
        const matchP1 = (t.player1 || '').toLowerCase().includes(q)
        const matchP2 = (t.player2 || '').toLowerCase().includes(q)
        const matchEmail = (t.email || '').toLowerCase().includes(q)
        if (!matchName && !matchP1 && !matchP2 && !matchEmail) return false
      }

      if (paymentFilter !== 'all') {
        const isPaid = t.payment_status === 'paid' || t.payment_status === 'bezahlt'
        if (paymentFilter === 'paid' && !isPaid) return false
        if (paymentFilter === 'open' && isPaid) return false
      }

      if (checkinFilter !== 'all') {
        const checkedIn = isTeamCheckedIn(t.checkin_status)
        if (checkinFilter === 'checked_in' && !checkedIn) return false
        if (checkinFilter === 'pending' && checkedIn) return false
      }

      return true
    })
  }, [teams, searchQuery, paymentFilter, checkinFilter])

  const totalTeams = teams.length
  const checkedInCount = teams.filter((t) => isTeamCheckedIn(t.checkin_status)).length
  const paidCount = teams.filter((t) => t.payment_status === 'paid' || t.payment_status === 'bezahlt' || t.payment_status === 'free').length
  const openPaymentCount = totalTeams - paidCount

  const primaryColor = tournament?.primary_color || '#22c55e'
  const activeSlug = tournament?.slug || slug

  if (loading) {
    return <div className="p-8 text-center font-bold text-slate-400 text-xs">Lade Teamverwaltung …</div>
  }

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div
          className={`rounded-2xl border p-4 text-xs font-extrabold backdrop-blur-md ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
              : 'border-red-500/30 bg-red-500/20 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* METRIK CARDS */}
      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Teams Gesamt</p>
          <p className="mt-2 text-3xl font-black text-white">{totalTeams}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Anwesend (Check-in)</p>
          <p className="mt-2 text-3xl font-black text-emerald-400">
            {checkedInCount} <span className="text-xs text-slate-500">/ {totalTeams}</span>
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Bezahlt / Befreit</p>
          <p className="mt-2 text-3xl font-black text-blue-400">{paidCount}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black uppercase text-slate-400">Zahlung Ausstehend</p>
          <p className="mt-2 text-3xl font-black text-amber-400">{openPaymentCount}</p>
        </div>
      </section>

      {/* FILTER & AKTIONEN BAR */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-lg backdrop-blur-xl space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Teamliste &amp; Check-in</h2>
            <p className="mt-1 text-xs text-slate-400">
              Klicke direkt auf den Check-in- oder Zahlungs-Badge, um den Status schnell anzupassen.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            disabled={!tournament}
            className="rounded-xl px-5 py-3 text-xs font-black text-slate-950 shadow-md transition hover:opacity-90 shrink-0 disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            ➕ Team Manuell Hinzufügen
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-white/10">
          <input
            type="text"
            placeholder="🔍 Suche nach Team, Spielern oder E-Mail …"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-xs font-bold text-white placeholder-slate-500 outline-none focus:border-emerald-500"
          />

          <select
            value={checkinFilter}
            onChange={(e) => setCheckinFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
          >
            <option value="all">Alle Check-in Status</option>
            <option value="checked_in">✓ Anwesend (Checked-in)</option>
            <option value="pending">⏳ Ausstehend</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
          >
            <option value="all">Alle Zahlungsstatus</option>
            <option value="paid">✓ Bezahlt</option>
            <option value="open">⏳ Offen</option>
          </select>
        </div>
      </section>

      {/* TEAM TABLE */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-lg backdrop-blur-xl overflow-x-auto">
        {filteredTeams.length === 0 ? (
          <div className="py-8 text-center text-xs font-bold text-slate-500">
            Keine Teams für die gewählte Filterkombination gefunden.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-black uppercase text-slate-400">
                <th className="py-3 px-3">Teamname</th>
                <th className="py-3 px-3">Spieler &amp; Kontakt</th>
                <th className="py-3 px-3 text-center">Check-in Status</th>
                <th className="py-3 px-3 text-center">Zahlungsstatus</th>
                <th className="py-3 px-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-bold">
              {filteredTeams.map((team) => {
                const isCheckedIn = isTeamCheckedIn(team.checkin_status)
                const isPaid = team.payment_status === 'paid' || team.payment_status === 'bezahlt'
                
                const tokenValue = team.token || (team as any).access_token || team.id
                const teamPortalUrl = `/turnier/${encodeURIComponent(activeSlug)}/team/${team.id}?t=${tokenValue}`

                return (
                  <tr key={team.id} className="hover:bg-white/5 transition">
                    <td className="py-3 px-3">
                      <Link
                        href={teamPortalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-black text-white text-sm hover:text-emerald-400 hover:underline transition inline-flex items-center gap-1 group"
                        title="Team-Portal in neuem Tab öffnen"
                      >
                        <span>{team.name}</span>
                        <span className="text-xs text-slate-400 group-hover:text-emerald-400 transition-colors">↗</span>
                      </Link>
                      {team.notes && (
                        <div className="text-[10px] text-slate-400 font-normal italic mt-0.5">
                          Note: {team.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="text-slate-200">
                        {[team.player1, team.player2].filter(Boolean).join(' & ') || 'Keine Spieler angegeben'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {[team.email, team.phone].filter(Boolean).join(' • ') || 'Keine Kontaktdaten'}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCheckin(team.id, team.checkin_status)}
                        className={`rounded-xl px-3 py-1.5 text-[10px] font-black transition border ${
                          isCheckedIn
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        {isCheckedIn ? '✓ Anwesend' : '⏳ Ausstehend'}
                      </button>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePayment(team.id, team.payment_status)}
                        className={`rounded-xl px-3 py-1.5 text-[10px] font-black transition border ${
                          isPaid
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {isPaid ? '✓ Bezahlt' : '⏳ Offen'}
                      </button>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={teamPortalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition flex items-center gap-1"
                          title="Team-Portal im neuen Tab öffnen"
                        >
                          <span>Team-Portal</span>
                          <span>↗</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(team)}
                          className="rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-200 hover:bg-white/10 transition"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(team.id, team.name)}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/20 transition"
                          title="Löschen"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* TEAM EDIT / ADD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-black text-white">
                {editingTeam ? 'Team Bearbeiten' : 'Neues Team Hinzufügen'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-[10px] uppercase text-slate-400 mb-1">
                  Teamname *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    Spieler 1
                  </label>
                  <input
                    type="text"
                    value={formData.player1}
                    onChange={(e) => setFormData({ ...formData, player1: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    Spieler 2
                  </label>
                  <input
                    type="text"
                    value={formData.player2}
                    onChange={(e) => setFormData({ ...formData, player2: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    E-Mail Adresse
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    Telefon / Mobil
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    Check-in Status
                  </label>
                  <select
                    value={formData.checkin_status}
                    onChange={(e) =>
                      setFormData({ ...formData, checkin_status: e.target.value as CheckinStatus })
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  >
                    <option value="pending">⏳ Ausstehend</option>
                    <option value="checked_in">✓ Anwesend (Checked-in)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    Zahlungsstatus
                  </label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_status: e.target.value })
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                  >
                    <option value="open">⏳ Offen</option>
                    <option value="bezahlt">✓ Bezahlt</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 mb-1">
                  Notizen / Anmerkungen
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-300 hover:bg-white/10 transition"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl px-5 py-2.5 text-slate-950 font-black shadow-md transition hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: primaryColor }}
                >
                  {saving ? 'Speichere …' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}