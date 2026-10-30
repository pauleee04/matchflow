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
  tertiary_color: string | null
  background_color: string | null
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
}

// GLÄSERNE DESIGN-PRESETS
const DESIGN_PRESETS = [
  {
    name: '🍺 Biergartengrün',
    primary: '#22c55e',
    secondary: '#10b981',
    tertiary: '#081c10',
    background: '#020a05',
    description: 'Klassischer Biergarten-Look mit gläsernem Dunkelgrün',
  },
  {
    name: '🌊 Oktopus Glasblau',
    primary: '#0284c7',
    secondary: '#0369a1',
    tertiary: '#061324',
    background: '#02060e',
    description: 'Sportliches Glasblau mit tiefdunklem Hintergrund',
  },
  {
    name: '🎉 Party Pink & Violett',
    primary: '#ec4899',
    secondary: '#8b5cf6',
    tertiary: '#16081e',
    background: '#0a030f',
    description: 'Knallige Party-Atmosphäre mit Aubergine-Glas',
  },
  {
    name: '🔥 Feuerrot Glas',
    primary: '#ef4444',
    secondary: '#b91c1c',
    tertiary: '#1a0608',
    background: '#0a0203',
    description: 'Dynamisches Wettkampf-Rot mit dunkelrotem Glas',
  },
  {
    name: '🏆 Champions Schwarz-Gold',
    primary: '#eab308',
    secondary: '#ca8a04',
    tertiary: '#14120e',
    background: '#080705',
    description: 'Edler Look mit dunklem Rauchglas',
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

  // Formular-States
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [registrationOpen, setRegistrationOpen] = useState(true)

  // 4 Farb-System für das Glas-Design
  const [primaryColor, setPrimaryColor] = useState('#22c55e')
  const [secondaryColor, setSecondaryColor] = useState('#10b981')
  const [tertiaryColor, setTertiaryColor] = useState('#081c10')
  const [backgroundColor, setBackgroundColor] = useState('#020a05')
  const [logoUrl, setLogoUrl] = useState('')

  // Spielfeld & Finanzen
  const [teamCount, setTeamCount] = useState<number>(16)
  const [tableCount, setTableCount] = useState<number>(8)
  const [matchDuration, setMatchDuration] = useState<number>(10)
  const [startTime, setStartTime] = useState<string>('14:00')
  const [hasThirdPlaceMatch, setHasThirdPlaceMatch] = useState<boolean>(false)
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

  async function loadData() {
    if (!slug && !rawSlug) return
    setLoading(true)
    try {
      let { data: t } = await supabase
        .from('tournaments')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (!t && rawSlug !== slug) {
        const fallback = await supabase
          .from('tournaments')
          .select('*')
          .eq('slug', rawSlug)
          .maybeSingle()
        t = fallback.data
      }

      if (t) {
        setTournament(t)
        setName(t.name || '')
        setIsPublic(t.is_public ?? true)
        setRegistrationOpen(t.registration_open ?? true)
        setHasThirdPlaceMatch(t.has_third_place_match ?? false)
        setPrimaryColor(t.primary_color || '#22c55e')
        setSecondaryColor(t.secondary_color || '#10b981')
        setTertiaryColor(t.tertiary_color || '#081c10')
        setBackgroundColor(t.background_color || '#020a05')
        setLogoUrl(t.logo_url || '')
        setEntryFee(t.entry_fee ?? 0)
        setCashEnabled(t.cash_enabled ?? true)
        setBankTransferEnabled(t.bank_transfer_enabled ?? false)
        setBankAccountHolder(t.bank_account_holder || '')
        setBankIban(t.bank_iban || '')
        setBankReference(t.bank_reference || '')
        setPaypalEnabled(t.paypal_enabled ?? false)
        setPaypalPaymentLink(t.paypal_payment_link || '')

        const { data: st } = await supabase
          .from('tournament_settings')
          .select('*')
          .eq('tournament_id', t.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (st) {
          setTeamCount(st.team_count ?? 16)
          setTableCount(st.table_count ?? 8)
          setMatchDuration(st.match_duration_minutes ?? 10)
          setStartTime(st.start_time || '14:00')
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Fehler beim Laden der Einstellungen.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tournament?.id) return

    setUploadingLogo(true)
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `logos/${tournament.id}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('tournament-logos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('tournament-logos').getPublicUrl(filePath)
      setLogoUrl(publicUrl)
      setStatusMessage({ type: 'success', text: 'Logo hochgeladen! Klicke auf Speichern.' })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Fehler beim Logo-Upload.' })
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tournament?.id) return
    setSaving(true)

    try {
      const { error: tourneyErr } = await supabase
        .from('tournaments')
        .update({
          name: name.trim(),
          is_public: isPublic,
          registration_open: registrationOpen,
          has_third_place_match: hasThirdPlaceMatch,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          tertiary_color: tertiaryColor,
          background_color: backgroundColor,
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
        await supabase.from('tournament_settings').update(settingsPayload).eq('id', existingSettings.id)
      } else {
        await supabase.from('tournament_settings').insert([settingsPayload])
      }

      const channel = supabase.channel(`tournament:${tournament.id}`)
      await channel.send({ type: 'broadcast', event: 'refresh', payload: { updated: Date.now() } })

      setStatusMessage({ type: 'success', text: 'Einstellungen erfolgreich gespeichert!' })
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Fehler beim Speichern: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800" style={{ borderTopColor: primaryColor }} />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Lade Einstellungen …</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 text-slate-100 [color-scheme:dark]">
      {statusMessage && (
        <div className={`w-full rounded-2xl border p-4 text-xs font-extrabold backdrop-blur-md ${
          statusMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300' : 'border-red-500/30 bg-red-950/40 text-red-300'
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* 1. ALLGEMEINES */}
      <section className="w-full rounded-3xl border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-lg font-black tracking-tight text-white">1. Allgemeines &amp; Sichtbarkeit</h2>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>Grundkonfiguration</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Turnier-Name *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-bold text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">URL-Slug</label>
            <input type="text" disabled value={tournament?.slug || ''} className="w-full rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-xs font-bold text-slate-500 cursor-not-allowed" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4">
            <div>
              <div className="text-xs font-black text-white">Öffentlicher Status</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Ist das Turnier öffentlich sichtbar?</div>
            </div>
            <button type="button" onClick={() => setIsPublic(!isPublic)} className={`rounded-2xl px-4 py-2.5 text-xs font-black border ${isPublic ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'}`}>
              {isPublic ? '🌐 Aktiv' : '🔒 Entwurf'}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4">
            <div>
              <div className="text-xs font-black text-white">Team-Anmeldungen</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Dürfen sich neue Teams anmelden?</div>
            </div>
            <button type="button" onClick={() => setRegistrationOpen(!registrationOpen)} className={`rounded-2xl px-4 py-2.5 text-xs font-black border ${registrationOpen ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40'}`}>
              {registrationOpen ? '✓ Offen' : '🚫 Zu'}
            </button>
          </div>
        </div>
      </section>

      {/* 2. BRANDING & FARBEN */}
      <section className="w-full rounded-3xl border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-lg font-black tracking-tight text-white">2. Design &amp; Branding</h2>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>Glas-Design &amp; Farben</span>
        </div>

        {/* LOGO */}
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
          <label className="block text-xs font-black text-white">🖼️ Turnier-Logo</label>
          <div className="grid gap-4 sm:grid-cols-2 items-start pt-1">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Datei hochladen</label>
              <input type="file" accept="image/*" onChange={handleLogoFileUpload} disabled={uploadingLogo} className="w-full cursor-pointer rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-bold text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Oder Bild-URL</label>
              <input type="url" placeholder="https://beispiel.de/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-xs font-bold text-white focus:outline-none" />
            </div>
          </div>
          {logoUrl && (
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/60 p-3 text-center">
              <img src={logoUrl} alt="Logo Preview" className="mx-auto h-16 w-auto object-contain" />
            </div>
          )}
        </div>

        {/* GLAS PRESETS */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-black text-white">🎨 Gläserne Design-Presets</label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DESIGN_PRESETS.map((preset) => {
              const isSelected = primaryColor === preset.primary && tertiaryColor === preset.tertiary
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setPrimaryColor(preset.primary)
                    setSecondaryColor(preset.secondary)
                    setTertiaryColor(preset.tertiary)
                    setBackgroundColor(preset.background)
                  }}
                  className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                    isSelected ? 'border-emerald-500/60 bg-emerald-500/15 ring-2 ring-emerald-500/30' : 'border-white/10 bg-black/40 hover:border-white/20'
                  }`}
                >
                  <div>
                    <span className="font-extrabold text-xs text-white block">{preset.name}</span>
                    <p className="text-[10px] text-slate-400 mt-1">{preset.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <div className="h-4 w-5 rounded-full border border-white/20" style={{ backgroundColor: preset.primary }} title="Primär" />
                    <div className="h-4 w-5 rounded-full border border-white/20" style={{ backgroundColor: preset.secondary }} title="Sekundär" />
                    <div className="h-4 w-5 rounded-full border border-white/20" style={{ backgroundColor: preset.tertiary }} title="Kachelglas" />
                    <div className="h-4 w-5 rounded-full border border-white/20" style={{ backgroundColor: preset.background }} title="Hintergrund" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* CUSTOM PICKERS */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl border border-white/10 bg-black/40 p-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">1. Primär (Akzente)</label>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-2xl border-0 bg-transparent shrink-0" />
              <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">2. Sekundär (Badges)</label>
            <div className="flex items-center gap-2">
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-2xl border-0 bg-transparent shrink-0" />
              <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">3. Tertiär (Glas-Kachel)</label>
            <div className="flex items-center gap-2">
              <input type="color" value={tertiaryColor} onChange={(e) => setTertiaryColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-2xl border-0 bg-transparent shrink-0" />
              <input type="text" value={tertiaryColor} onChange={(e) => setTertiaryColor(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">4. Hintergrund (Canvas)</label>
            <div className="flex items-center gap-2">
              <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded-2xl border-0 bg-transparent shrink-0" />
              <input type="text" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none" />
            </div>
          </div>
        </div>
      </section>

      {/* 3. SPIELFELD & ABLAUF */}
      <section className="w-full rounded-3xl border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-lg font-black tracking-tight text-white">3. Spielfeld &amp; Zeitplanung</h2>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: primaryColor }}>Ablauf</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Maximal-Teams</label>
            <input type="number" min="2" max="256" value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value) || 2)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-bold text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Anzahl Tische</label>
            <input type="number" min="1" max="64" value={tableCount} onChange={(e) => setTableCount(Number(e.target.value) || 1)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-bold text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Spieldauer (Minuten)</label>
            <input type="number" min="1" max="120" value={matchDuration} onChange={(e) => setMatchDuration(Number(e.target.value) || 1)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-bold text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Startzeit</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs font-bold text-white focus:outline-none" />
          </div>
        </div>
      </section>

      {/* SPEICHERN BUTTON */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl border border-white/20 px-8 py-4 text-xs font-black text-white shadow-2xl transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: primaryColor }}
        >
          {saving ? 'Speichere Einstellungen …' : '💾 Alle Einstellungen Speichern'}
        </button>
      </div>
    </form>
  )
}