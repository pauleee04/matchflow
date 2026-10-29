'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type TournamentData = {
  id: number
  name: string
  slug: string
  primary_color: string | null
  secondary_color: string | null
  logo_url: string | null
  is_public: boolean | null
  registration_open: boolean | null
  has_third_place_match: boolean | null
  entry_fee: number | null
  cash_enabled: boolean | null
  bank_transfer_enabled: boolean | null
  bank_account_holder: string | null
  bank_iban: string | null
  bank_reference: string | null
  paypal_enabled: boolean | null
  paypal_payment_link: string | null
}

type TournamentSettings = {
  id?: number
  tournament_id: number
  team_count: number | null
  table_count: number | null
  match_duration_minutes: number | null
  start_time: string | null
  direct_qualifiers: number | null
  additional_qualifiers: number | null
  additional_qualifier_position: number | null
  additional_qualifier_table_enabled: boolean | null
}

// VOREINGESTELLTE DESIGN-SETUPS (PRESETS)
const DESIGN_PRESETS = [
  {
    name: '🍺 Biergartengrün',
    primary: '#16a34a',
    secondary: '#15803d',
    description: 'Klassisches Zelt- & Biergarten-Grün',
  },
  {
    name: '🟢 Smaragd Grün (Standard)',
    primary: '#22c55e',
    secondary: '#10b981',
    description: 'Frisches, moderneres Turniermuster',
  },
  {
    name: '🌊 Oktopus Blau',
    primary: '#0284c7',
    secondary: '#0369a1',
    description: 'Sportliches Tiefblau',
  },
  {
    name: '🎉 Party Pink & Violett',
    primary: '#ec4899',
    secondary: '#8b5cf6',
    description: 'Knallige Event-Atmosphäre',
  },
  {
    name: '🔥 Feuerrot',
    primary: '#ef4444',
    secondary: '#b91c1c',
    description: 'Dynamisches Wettkampf-Rot',
  },
  {
    name: '🏆 Gold & Dunkel',
    primary: '#eab308',
    secondary: '#ca8a04',
    description: 'Edler Champions-Look',
  },
]

export default function AdminEinstellungenPage() {
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // 1. Allgemeines & Sichtbarkeit
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [registrationOpen, setRegistrationOpen] = useState(true)

  // 2. Design & Branding
  const [designMode, setDesignMode] = useState<'preset' | 'custom'>('preset')
  const [selectedPresetName, setSelectedPresetName] = useState('🟢 Smaragd Grün (Standard)')
  const [primaryColor, setPrimaryColor] = useState('#22c55e')
  const [secondaryColor, setSecondaryColor] = useState('#10b981')
  const [logoUrl, setLogoUrl] = useState('')

  // 3. Spielfeld & Zeitplanung
  const [teamCount, setTeamCount] = useState<number>(16)
  const [tableCount, setTableCount] = useState<number>(8)
  const [matchDuration, setMatchDuration] = useState<number>(10)
  const [startTime, setStartTime] = useState<string>('14:00')

  // 4. K.-o.-Phase & Platz 3
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState<boolean>(false)

  // 5. Startgeld & Zahlungsoptionen
  const [entryFee, setEntryFee] = useState<number>(15)
  const [cashEnabled, setCashEnabled] = useState<boolean>(true)
  const [bankTransferEnabled, setBankTransferEnabled] = useState<boolean>(false)
  const [bankAccountHolder, setBankAccountHolder] = useState<string>('')
  const [bankIban, setBankIban] = useState<string>('')
  const [bankReference, setBankReference] = useState<string>('')
  const [paypalEnabled, setPaypalEnabled] = useState<boolean>(false)
  const [paypalPaymentLink, setPaypalPaymentLink] = useState<string>('')

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
    setStatusMessage(null)

    try {
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
        setStatusMessage({ type: 'error', text: 'Turnier konnte nicht gefunden werden.' })
        return
      }

      const t = tourneyData as TournamentData
      setTournament(t)
      setName(t.name || '')
      setIsPublic(t.is_public ?? true)
      setRegistrationOpen(t.registration_open ?? true)
      setHasThirdPlaceMatch(t.has_third_place_match ?? false)
      setPrimaryColor(t.primary_color || '#22c55e')
      setSecondaryColor(t.secondary_color || '#10b981')
      setLogoUrl(t.logo_url || '')

      // Prüfen, ob die geladenen Farben einem Preset entsprechen
      const matchedPreset = DESIGN_PRESETS.find(
        (p) => p.primary === t.primary_color && p.secondary === t.secondary_color
      )
      if (matchedPreset) {
        setDesignMode('preset')
        setSelectedPresetName(matchedPreset.name)
      } else {
        setDesignMode('custom')
      }

      // Zahlungsdaten
      setEntryFee(t.entry_fee ?? 0)
      setCashEnabled(t.cash_enabled ?? true)
      setBankTransferEnabled(t.bank_transfer_enabled ?? false)
      setBankAccountHolder(t.bank_account_holder || '')
      setBankIban(t.bank_iban || '')
      setBankReference(t.bank_reference || '')
      setPaypalEnabled(t.paypal_enabled ?? false)
      setPaypalPaymentLink(t.paypal_payment_link || '')

      // Einstellungen aus tournament_settings laden
      const { data: settingsData } = await supabase
        .from('tournament_settings')
        .select('*')
        .eq('tournament_id', t.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (settingsData) {
        const st = settingsData as TournamentSettings
        setTeamCount(st.team_count ?? 16)
        setTableCount(st.table_count ?? 8)
        setMatchDuration(st.match_duration_minutes ?? 10)
        setStartTime(st.start_time || '14:00')
      }
    } catch (err: any) {
      const msg = err?.message || err?.details || 'Fehler beim Laden der Einstellungen.'
      setStatusMessage({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }

  // LOGO UPLOAD HANDLER FÜR SUPABASE STORAGE
  async function handleLogoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tournament?.id) return

    setUploadingLogo(true)
    setStatusMessage(null)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${tournament.id}_${Date.now()}.${fileExt}`
      const filePath = `logos/${fileName}`

      // Versuche das Bild in den Supabase Bucket 'tournament-logos' hochzuladen
      const { error: uploadError } = await supabase.storage
        .from('tournament-logos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        throw new Error(
          `Storage Fehler: ${uploadError.message}. Stelle sicher, dass der Bucket 'tournament-logos' in Supabase existiert.`
        )
      }

      // Öffentliche URL abrufen
      const {
        data: { publicUrl },
      } = supabase.storage.from('tournament-logos').getPublicUrl(filePath)

      setLogoUrl(publicUrl)
      setStatusMessage({
        type: 'success',
        text: 'Turnierlogo erfolgreich hochgeladen! Klicke unten auf Speichern.',
      })
    } catch (err: any) {
      console.error('Logo upload error:', err)
      setStatusMessage({
        type: 'error',
        text: err.message || 'Fehler beim Hochladen des Logos.',
      })
    } finally {
      setUploadingLogo(false)
    }
  }

  function handlePresetSelect(presetName: string) {
    const preset = DESIGN_PRESETS.find((p) => p.name === presetName)
    if (preset) {
      setSelectedPresetName(preset.name)
      setPrimaryColor(preset.primary)
      setSecondaryColor(preset.secondary)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tournament?.id) return

    setSaving(true)
    setStatusMessage(null)

    try {
      // 1. Hauptturnier-Tabelle aktualisieren
      const { error: tourneyErr } = await supabase
        .from('tournaments')
        .update({
          name: name.trim(),
          is_public: isPublic,
          registration_open: registrationOpen,
          has_third_place_match: hasThirdPlaceMatch,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          logo_url: logoUrl.trim() || null,
          entry_fee: entryFee,
          cash_enabled: cashEnabled,
          bank_transfer_enabled: bankTransferEnabled,
          bank_account_holder: bankAccountHolder.trim() || null,
          bank_iban: bankIban.trim() || null,
          bank_reference: bankReference.trim() || null,
          paypal_enabled: paypalEnabled,
          paypal_payment_link: paypalPaymentLink.trim() || null,
        })
        .eq('id', tournament.id)

      if (tourneyErr) throw tourneyErr

      // 2. Settings aktualisieren / eintragen
      const settingsPayload = {
        tournament_id: tournament.id,
        team_count: teamCount,
        table_count: tableCount,
        match_duration_minutes: matchDuration,
        start_time: startTime,
      }

      const { data: existingSettings } = await supabase
        .from('tournament_settings')
        .select('id')
        .eq('tournament_id', tournament.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingSettings?.id) {
        const { error: setErr } = await supabase
          .from('tournament_settings')
          .update(settingsPayload)
          .eq('id', existingSettings.id)

        if (setErr) throw setErr
      } else {
        const { error: setErr } = await supabase
          .from('tournament_settings')
          .insert([settingsPayload])

        if (setErr) throw setErr
      }

      await triggerBroadcast(tournament.id)
      setStatusMessage({ type: 'success', text: 'Einstellungen erfolgreich gespeichert!' })
    } catch (err: any) {
      const msg = err?.message || err?.details || err?.hint || (typeof err === 'string' ? err : 'Unbekannter Fehler.')
      setStatusMessage({ type: 'error', text: `Fehler beim Speichern: ${msg}` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade Einstellungen …
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100">
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

      {/* HEADER BAR */}
      <section className="w-full flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primaryColor }}>
            Konfiguration
          </span>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Turnier-Einstellungen</h1>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Verwalte Grunddaten, Branding, Spielplan und Zahlungswege.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl px-6 py-3 text-xs font-black text-slate-950 shadow-lg transition hover:opacity-90 disabled:opacity-40 shrink-0"
          style={{ backgroundColor: primaryColor }}
        >
          {saving ? 'Speichere …' : '💾 Einstellungen Speichern'}
        </button>
      </section>

      {/* 1. ALLGEMEINES & SICHTBARKEIT */}
      <section className="w-full rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5">
        <h2 className="text-lg font-black tracking-tight text-white border-b border-white/10 pb-3">
          1. Allgemeines &amp; Sichtbarkeit
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Turnier-Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              URL-Slug (schreibgeschützt)
            </label>
            <input
              type="text"
              disabled
              value={tournament?.slug || ''}
              className="w-full rounded-2xl border border-white/5 bg-slate-950/40 px-4 py-3 text-xs font-bold text-slate-500 cursor-not-allowed"
            />
          </div>
        </div>

        {/* ÖFFENTLICHER STATUS */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div>
            <div className="text-xs font-black text-white">Öffentlicher Turnier-Status</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Ist das Turnier öffentlich aufrufbar oder im Entwurfsmodus?
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
              isPublic
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {isPublic ? '🌐 Öffentlich / Aktiv' : '🔒 Entwurf / Privat'}
          </button>
        </div>

        {/* ANMELDUNG ÖFFNEN / SCHLIESSEN */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div>
            <div className="text-xs font-black text-white">Team-Anmeldungen erlauben</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Steuert, ob sich neue Teams öffentlich anmelden dürfen.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRegistrationOpen(!registrationOpen)}
            className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
              registrationOpen
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-red-500/20 text-red-300 border-red-500/40'
            }`}
          >
            {registrationOpen ? '✓ Anmeldung Offen' : '🚫 Anmeldung Geschlossen'}
          </button>
        </div>
      </section>

      {/* 2. DESIGN & BRANDING (MIT PRESETS UND BILD-UPLOAD) */}
      <section className="w-full rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        <h2 className="text-lg font-black tracking-tight text-white border-b border-white/10 pb-3">
          2. Design &amp; Branding
        </h2>

        {/* TURNIERLOGO (BILD-UPLOAD & URL) */}
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <label className="block text-xs font-black text-white">
            🖼️ Turnier-Logo
          </label>
          <p className="text-[10px] text-slate-400">
            Lade ein Bild von deinem Gerät hoch (JPG, PNG, WebP) oder trage direkt eine Bild-URL ein.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 items-start pt-2">
            {/* Datei Upload */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                1. Bild-Datei hochladen
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoFileUpload}
                disabled={uploadingLogo}
                className="w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-bold text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white hover:file:bg-white/20"
              />
              {uploadingLogo && (
                <p className="text-[10px] font-bold text-emerald-400 animate-pulse">
                  Upload läuft …
                </p>
              )}
            </div>

            {/* URL EINGABE */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                2. Oder Bild-URL eingeben
              </label>
              <input
                type="url"
                placeholder="https://beispiel.de/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
              />
            </div>
          </div>

          {/* VORSCHAU */}
          {logoUrl && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-black block mb-2 tracking-wider">Logo Vorschau</span>
              <img src={logoUrl} alt="Logo Preview" className="mx-auto h-16 w-auto object-contain" />
            </div>
          )}
        </div>

        {/* DESIGN FARBSCHEMA - TOGGLE PRESET VS CUSTOM */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-black text-white">
              🎨 Farb-Design des Turniers
            </label>
            <div className="flex rounded-2xl bg-slate-950/80 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setDesignMode('preset')}
                className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                  designMode === 'preset'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Voreingestellte Themes
              </button>
              <button
                type="button"
                onClick={() => setDesignMode('custom')}
                className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                  designMode === 'custom'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Eigene Farben
              </button>
            </div>
          </div>

          {/* OPTION A: PRESETS */}
          {designMode === 'preset' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DESIGN_PRESETS.map((preset) => {
                const isSelected = selectedPresetName === preset.name && primaryColor === preset.primary

                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handlePresetSelect(preset.name)}
                    className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-emerald-500/60 bg-emerald-500/15 ring-2 ring-emerald-500/30'
                        : 'border-white/10 bg-slate-950/60 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-white">{preset.name}</span>
                        {isSelected && <span className="text-xs font-black text-emerald-400">✓ Aktiv</span>}
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">{preset.description}</p>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div
                        className="h-4 w-8 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: preset.primary }}
                        title="Primärfarbe"
                      />
                      <div
                        className="h-4 w-8 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: preset.secondary }}
                        title="Sekundärfarbe"
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* OPTION B: CUSTOM FARBWAHL */}
          {designMode === 'custom' && (
            <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Primärfarbe (Hauptakzent)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-2xl border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-mono font-bold text-white focus:border-white/30 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Sekundärfarbe (Gradients / Badges)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-2xl border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-mono font-bold text-white focus:border-white/30 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. SPIELFELD & ZEITPLANUNG */}
      <section className="w-full rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
        <h2 className="text-lg font-black tracking-tight text-white border-b border-white/10 pb-3">
          3. Spielfeld &amp; Zeitplanung
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Maximal-Teams
            </label>
            <input
              type="number"
              min="2"
              max="256"
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value) || 2)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Anzahl Tische / Plätze
            </label>
            <input
              type="number"
              min="1"
              max="64"
              value={tableCount}
              onChange={(e) => setTableCount(Number(e.target.value) || 1)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Spieldauer (Minuten)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={matchDuration}
              onChange={(e) => setMatchDuration(Number(e.target.value) || 1)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Startzeit (Uhrzeit)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* 4. K.-O.-PHASE & PLATZ 3 */}
      <section className="w-full rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
        <h2 className="text-lg font-black tracking-tight text-white border-b border-white/10 pb-3">
          4. K.-o.-Phase
        </h2>

        <p className="text-xs text-slate-400">
          💡 <strong>Hinweis:</strong> Die genaue Gruppenanzahl und Qualifikationsregeln stellst du direkt im Bereich <strong>&quot;Gruppen&quot;</strong> ein.
        </p>

        {/* SPIEL UM PLATZ 3 TOGGLE */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div>
            <div className="text-xs font-black text-white">Spiel um Platz 3 austragen</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Erstellt in der K.-o.-Phase ein zusätzliches Match zwischen den Verlierern der Halbfinals.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setHasThirdPlaceMatch(!hasThirdPlaceMatch)}
            className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
              hasThirdPlaceMatch
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-950/80 text-slate-400 border-white/10'
            }`}
          >
            {hasThirdPlaceMatch ? '✓ Aktiv' : 'Inaktiv'}
          </button>
        </div>
      </section>

      {/* 5. STARTGELD & ZAHLUNGSOPTIONEN */}
      <section className="w-full rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
        <h2 className="text-lg font-black tracking-tight text-white border-b border-white/10 pb-3">
          5. Startgeld &amp; Zahlungsoptionen
        </h2>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
            Startgebühr pro Team (€)
          </label>
          <input
            type="number"
            min="0"
            step="0.50"
            value={entryFee}
            onChange={(e) => setEntryFee(Number(e.target.value) || 0)}
            className="w-full sm:max-w-xs rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
          />
        </div>

        {/* BARZAHLUNG */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div>
            <div className="text-xs font-black text-white">💵 Barzahlung vor Ort</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Erlaubt es Teams, das Startgeld am Turnier-Tag bar zu bezahlen.</div>
          </div>
          <button
            type="button"
            onClick={() => setCashEnabled(!cashEnabled)}
            className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
              cashEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-950/80 text-slate-400 border-white/10'
            }`}
          >
            {cashEnabled ? '✓ Aktiv' : 'Inaktiv'}
          </button>
        </div>

        {/* BANKÜBERWEISUNG */}
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-white">🏛️ Banküberweisung</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Zeigt den Teams eure Bankdaten für Vorab-Überweisungen.</div>
            </div>
            <button
              type="button"
              onClick={() => setBankTransferEnabled(!bankTransferEnabled)}
              className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
                bankTransferEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/80 text-slate-400 border-white/10'
              }`}
            >
              {bankTransferEnabled ? '✓ Aktiv' : 'Inaktiv'}
            </button>
          </div>

          {bankTransferEnabled && (
            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Kontoinhaber</label>
                <input
                  type="text"
                  placeholder="z.B. Max Mustermann"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">IBAN</label>
                <input
                  type="text"
                  placeholder="DE89 3704 0044 ..."
                  value={bankIban}
                  onChange={(e) => setBankIban(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-mono font-bold text-white focus:border-white/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Verwendungszweck</label>
                <input
                  type="text"
                  placeholder="z.B. Turnier + Teamname"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* PAYPAL */}
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-white">💳 PayPal-Zahlung</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Ermöglicht direkte Zahlungen per PayPal-Link.</div>
            </div>
            <button
              type="button"
              onClick={() => setPaypalEnabled(!paypalEnabled)}
              className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
                paypalEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/80 text-slate-400 border-white/10'
              }`}
            >
              {paypalEnabled ? '✓ Aktiv' : 'Inaktiv'}
            </button>
          </div>

          {paypalEnabled && (
            <div className="pt-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">PayPal.me / Payment Link</label>
              <input
                type="url"
                placeholder="https://paypal.me/DeinName"
                value={paypalPaymentLink}
                onChange={(e) => setPaypalPaymentLink(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
              />
            </div>
          )}
        </div>
      </section>

      {/* SPEICHERN BUTTON UNTEN */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl px-8 py-4 text-xs font-black text-slate-950 shadow-2xl transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: primaryColor }}
        >
          {saving ? 'Speichere Einstellungen …' : '💾 Alle Einstellungen Speichern'}
        </button>
      </div>
    </form>
  )
}