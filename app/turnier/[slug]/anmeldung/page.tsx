'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { publicSupabase as supabase } from '@/lib/supabase'

type TournamentData = {
  id: number
  name: string
  slug: string
  primary_color: string | null
  registration_open: boolean | null
  entry_fee: number | null
  cash_enabled: boolean | null
  bank_transfer_enabled: boolean | null
  bank_account_holder: string | null
  bank_iban: string | null
  bank_reference: string | null
  paypal_enabled: boolean | null
  paypal_payment_link: string | null
}

type SettingsData = {
  team_count: number | null
}

export default function PublicAnmeldungPage() {
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
  const [maxTeams, setMaxTeams] = useState<number>(16)
  const [currentTeamCount, setCurrentTeamCount] = useState<number>(0)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successData, setSuccessData] = useState<{
    teamName: string
    paymentMethod: 'cash' | 'bank' | 'paypal'
  } | null>(null)

  // Formulardaten
  const [teamName, setTeamName] = useState('')
  const [player1, setPlayer1] = useState('')
  const [player2, setPlayer2] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank' | 'paypal'>('cash')

  useEffect(() => {
    void loadData()
  }, [slug, rawSlug])

  async function triggerBroadcast(tournamentId: number) {
    try {
      const channel = supabase.channel(`tournament:${tournamentId}`)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.send({
            type: 'broadcast',
            event: 'refresh',
            payload: { updated: Date.now() },
          })
        }
      })
    } catch {
      // Stumm abfangen
    }
  }

  async function loadData() {
    if (!slug && !rawSlug) return
    setLoading(true)
    setErrorMessage('')

    try {
      // 1. Turnierdaten laden
      let { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (!tourneyData && rawSlug !== slug) {
        const fallback = await supabase
          .from('tournaments')
          .select('*')
          .eq('slug', rawSlug)
          .maybeSingle()
        tourneyData = fallback.data
        tourneyError = fallback.error
      }

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setErrorMessage('Turnier nicht gefunden.')
        return
      }

      const t = tourneyData as TournamentData
      setTournament(t)

      // Standard-Zahlungsart wählen
      if (t.cash_enabled) {
        setPaymentMethod('cash')
      } else if (t.bank_transfer_enabled) {
        setPaymentMethod('bank')
      } else if (t.paypal_enabled) {
        setPaymentMethod('paypal')
      }

      // 2. Settings (Max Teams) & Aktuelle Teamanzahl
      const [settingsRes, teamsRes] = await Promise.all([
        supabase
          .from('tournament_settings')
          .select('team_count')
          .eq('tournament_id', t.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('teams')
          .select('id', { count: 'exact' })
          .eq('tournament_id', t.id),
      ])

      if (settingsRes.data) {
        const st = settingsRes.data as SettingsData
        if (st.team_count) setMaxTeams(st.team_count)
      }

      setCurrentTeamCount(teamsRes.count ?? 0)
    } catch (err: any) {
      const msg = err?.message || 'Fehler beim Laden der Anmeldedaten.'
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tournament?.id) return

    setSubmitting(true)
    setErrorMessage('')

    try {
      if (!tournament.registration_open) {
        throw new Error('Die Anmeldungen für dieses Turnier sind aktuell geschlossen.')
      }

      if (currentTeamCount >= maxTeams) {
        throw new Error('Das Teilnehmerfeld ist leider bereits voll.')
      }

      if (!teamName.trim() || !player1.trim() || !player2.trim()) {
        throw new Error('Bitte fülle alle Pflichtfelder aus.')
      }

      // Team in Supabase einfügen
      const { error: insertError } = await supabase.from('teams').insert([
        {
          tournament_id: tournament.id,
          name: teamName.trim(),
          player1: player1.trim(),
          player2: player2.trim(),
          payment_status: tournament.entry_fee && tournament.entry_fee > 0 ? 'offen' : 'bezahlt',
          checkin_status: 'offen',
        },
      ])

      if (insertError) throw insertError

      await triggerBroadcast(tournament.id)

      setSuccessData({
        teamName: teamName.trim(),
        paymentMethod,
      })
    } catch (err: any) {
      const msg = err?.message || 'Die Anmeldung konnte nicht abgeschlossen werden.'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const primaryColor = tournament?.primary_color || '#22c55e'
  const isRegistrationOpen = tournament?.registration_open ?? true
  const isFull = currentTeamCount >= maxTeams

  if (loading) {
    return (
      <div className="p-8 text-center text-xs font-bold text-slate-400">
        Lade Anmeldeformular …
      </div>
    )
  }

  // FALL 1: ERFOLGREICHE ANMELDUNG
  if (successData) {
    return (
      <div className="w-full space-y-6">
        <div className="w-full rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 shadow-2xl backdrop-blur-xl text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-3xl font-black text-slate-950 shadow-lg">
            🎉
          </div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">Anmeldung erfolgreich!</h1>
          <p className="text-sm font-semibold text-emerald-300 max-w-xl mx-auto">
            Das Team <span className="font-black text-white">„{successData.teamName}“</span> wurde erfolgreich für das Turnier registriert.
          </p>

          {/* ZAHLUNGSHINWEIS DYNAMISCH */}
          {tournament?.entry_fee && tournament.entry_fee > 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-left max-w-xl mx-auto space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs font-black uppercase text-slate-400">Startgebühr</span>
                <span className="text-lg font-black text-emerald-400">{tournament.entry_fee.toFixed(2)} €</span>
              </div>

              {successData.paymentMethod === 'cash' && (
                <p className="text-xs text-slate-300 leading-relaxed">
                  💵 <strong className="text-white">Barzahlung vor Ort:</strong> Bitte bringt die Startgebühr passend am Turnier-Tag mit zum Check-in.
                </p>
              )}

              {successData.paymentMethod === 'bank' && (
                <div className="space-y-2 text-xs text-slate-300">
                  <p>🏛️ <strong className="text-white">Überweisung an:</strong></p>
                  <div className="rounded-xl bg-slate-900 p-3 font-mono text-[11px] space-y-1 text-slate-200">
                    {tournament.bank_account_holder && <div>Inhaber: {tournament.bank_account_holder}</div>}
                    {tournament.bank_iban && <div>IBAN: {tournament.bank_iban}</div>}
                    <div>Verwendungszweck: {tournament.bank_reference || `${tournament.name} - ${successData.teamName}`}</div>
                  </div>
                </div>
              )}

              {successData.paymentMethod === 'paypal' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <p>💳 <strong className="text-white">PayPal Zahlung:</strong></p>
                  {tournament.paypal_payment_link ? (
                    <a
                      href={tournament.paypal_payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg hover:bg-blue-500 transition"
                    >
                      Jetzt direkt per PayPal bezahlen →
                    </a>
                  ) : (
                    <p className="text-slate-400">Bitte überweise das Startgeld an den Turnierveranstalter per PayPal.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-slate-950/40 p-4 text-xs font-bold text-emerald-400">
              Dieses Turnier ist kostenlos! Ihr seid direkt startklar.
            </div>
          )}

          <div className="pt-4 flex justify-center gap-3">
            <Link
              href={`/turnier/${encodeURIComponent(slug)}`}
              className="rounded-xl px-6 py-3 text-xs font-black text-slate-950 transition hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Zur Turnierübersicht
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // FALL 2: ANMELDUNG GESCHLOSSEN ODER VOLL
  if (!isRegistrationOpen || isFull) {
    return (
      <div className="w-full space-y-6">
        <div className="w-full rounded-3xl border border-red-500/30 bg-red-500/10 p-8 shadow-2xl backdrop-blur-xl text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20 text-3xl font-black text-red-400 border border-red-500/30">
            🚫
          </div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            {!isRegistrationOpen ? 'Anmeldung geschlossen' : 'Turnier ausgebucht'}
          </h1>
          <p className="text-xs font-bold text-slate-300 max-w-md mx-auto">
            {!isRegistrationOpen
              ? 'Der Veranstalter hat die Online-Anmeldung für dieses Turnier momentan deaktiviert.'
              : `Die maximale Anzahl von ${maxTeams} Teams ist bereits erreicht.`}
          </p>
          <div className="pt-2">
            <Link
              href={`/turnier/${encodeURIComponent(slug)}`}
              className="inline-block rounded-xl border border-white/10 bg-white/10 px-6 py-3 text-xs font-black text-white hover:bg-white/20 transition"
            >
              Zurück zur Turnierübersicht
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // FALL 3: ANMELDEFORMULAR
  return (
    <div className="w-full space-y-8">
      {errorMessage && (
        <div className="w-full rounded-2xl border border-red-500/30 bg-red-500/20 p-4 text-xs font-extrabold text-red-300 backdrop-blur-md">
          {errorMessage}
        </div>
      )}

      {/* FORMULAR CARD */}
      <div className="w-full rounded-3xl border border-white/15 bg-[#061710]/70 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: primaryColor }}>
              Jetzt Teilnahme sichern
            </span>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Team-Anmeldung</h1>
            <p className="mt-1 text-xs text-slate-400">
              Trage deinen Teamnamen und die beiden Spieler ein, um am Turnier teilzunehmen.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-xs font-black text-slate-300 shrink-0">
            👥 Plätze: <span className="text-emerald-400">{currentTeamCount}</span> / {maxTeams} belegt
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 1. SPIELER & TEAMDATEN */}
          <div className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
              1. Team &amp; Spieler
            </h2>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                Teamname *
              </label>
              <input
                type="text"
                required
                placeholder="z. B. Bierkapitäne"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Spieler 1 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Vor- und Nachname"
                  value={player1}
                  onChange={(e) => setPlayer1(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Spieler 2 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Vor- und Nachname"
                  value={player2}
                  onChange={(e) => setPlayer2(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 2. ZAHLUNGSART (FALLS STARTGEBÜHR > 0) */}
          {tournament?.entry_fee && tournament.entry_fee > 0 ? (
            <div className="space-y-4 border-t border-white/10 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
                  2. Zahlungsoption ({tournament.entry_fee.toFixed(2)} € Startgeld)
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {tournament.cash_enabled && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`rounded-2xl border p-4 text-left transition ${
                      paymentMethod === 'cash'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-slate-950/40 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <div className="text-lg mb-1">💵</div>
                    <div className="text-xs font-black">Barzahlung vor Ort</div>
                    <div className="text-[10px] opacity-70">Am Turniertag abgeben</div>
                  </button>
                )}

                {tournament.bank_transfer_enabled && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank')}
                    className={`rounded-2xl border p-4 text-left transition ${
                      paymentMethod === 'bank'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-slate-950/40 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <div className="text-lg mb-1">🏛️</div>
                    <div className="text-xs font-black">Banküberweisung</div>
                    <div className="text-[10px] opacity-70">Vorab überweisen</div>
                  </button>
                )}

                {tournament.paypal_enabled && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('paypal')}
                    className={`rounded-2xl border p-4 text-left transition ${
                      paymentMethod === 'paypal'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-slate-950/40 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <div className="text-lg mb-1">💳</div>
                    <div className="text-xs font-black">PayPal</div>
                    <div className="text-[10px] opacity-70">Direkt online zahlen</div>
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* ABSCHICKEN BUTTON */}
          <div className="border-t border-white/10 pt-6 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl px-8 py-4 text-xs font-black text-slate-950 shadow-xl transition hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: primaryColor }}
            >
              {submitting ? 'Melde an …' : '🚀 Team kostenpflichtig / verbindlich anmelden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}