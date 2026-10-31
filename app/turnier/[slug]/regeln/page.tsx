'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

export type RuleCategory = 'general' | 'gameplay' | 'scoring' | 'penalties'

export type RuleItem = {
  id: string
  category: RuleCategory
  title: string
  description: string
  enabled: boolean
}

type TournamentInfo = {
  id: number
  name: string
  slug?: string | null
  logo_url: string | null
  primary_color: string | null
  secondary_color?: string | null
  background_style?: string | null
  rules?: RuleItem[] | null
  rules_pdf_url?: string | null
}

const CATEGORY_LABELS: Record<RuleCategory, { label: string; icon: string }> = {
  general: { label: 'Allgemein & Verhalten', icon: '🛡️' },
  gameplay: { label: 'Spielablauf', icon: '🎮' },
  scoring: { label: 'Punkte & Wertung', icon: '🎯' },
  penalties: { label: 'Strafen & Verstöße', icon: '⚠️' },
}

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

export default function RulesPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''

  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [activeCategory, setActiveCategory] = useState<RuleCategory | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!slug) return

    try {
      let tourneyData: TournamentInfo | null = null
      const { data, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, secondary_color, background_style, rules, rules_pdf_url')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (tourneyError) {
        const fallbackRes = await supabase
          .from('tournaments')
          .select('id, name, slug, logo_url, primary_color, secondary_color, background_style, rules')
          .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
          .maybeSingle()

        if (fallbackRes.error) throw fallbackRes.error
        tourneyData = fallbackRes.data as TournamentInfo | null
      } else {
        tourneyData = data as TournamentInfo | null
      }

      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      setTournament(tourneyData)
      setError('')
    } catch (err) {
      console.error('RULES LOAD ERROR:', err)
      setError('Die Turnierregeln konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [slug, rawSlug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!tournament?.id) return

    const channel = supabase
      .channel(`tournament:${tournament.id}`)
      .on('broadcast', { event: 'refresh' }, () => void loadData())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournament?.id, loadData])

  const primaryColor = tournament?.primary_color?.trim() || '#22c55e'
  const primaryContrastText = getContrastTextColor(primaryColor)

  const activeRules = useMemo(() => {
    if (!tournament?.rules || !Array.isArray(tournament.rules)) return []
    return tournament.rules.filter((r) => r.enabled)
  }, [tournament?.rules])

  const filteredRules = useMemo(() => {
    if (activeCategory === 'all') return activeRules
    return activeRules.filter((r) => r.category === activeCategory)
  }, [activeRules, activeCategory])

  const rulesByCategory = useMemo(() => {
    const categories: RuleCategory[] = ['general', 'gameplay', 'scoring', 'penalties']
    return categories
      .map((cat) => ({
        category: cat,
        info: CATEGORY_LABELS[cat],
        rules: activeRules.filter((r) => r.category === cat),
      }))
      .filter((group) => group.rules.length > 0)
  }, [activeRules])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100 [color-scheme:dark]">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800"
            style={{ borderTopColor: primaryColor }}
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Lade Regelwerk …
          </p>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 [color-scheme:dark]">
        <div className="mx-auto max-w-lg rounded-[32px] border border-red-500/30 bg-black/40 p-6 text-center backdrop-blur-xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-slate-100">Fehler beim Laden</h2>
          <p className="mt-1 text-xs font-semibold text-red-300">{error || 'Turnier existiert nicht.'}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* GLOBAL PRINT STYLES FÜR EIN CLEANES DIN-A4 PDF */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
          }
        }
      `}</style>

      {/* ------------------------------------------------------------- */}
      {/* 1. OFFICAL PRINT LAYOUT (WIRD NUR BEIM DRUCKEN / PDF SPEICHERN ANGEZEIGT) */}
      {/* ------------------------------------------------------------- */}
      <div className="hidden print:block text-slate-900 bg-white font-sans p-2">
        {/* DOKUMENTEN-KOPF */}
        <header className="border-b-2 border-slate-900 pb-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Offizielles Regelwerk
            </p>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">
              {tournament.name}
            </h1>
            <p className="text-sm font-semibold text-slate-600 mt-1">
              Turnierbestimmungen &amp; Spielregeln
            </p>
          </div>
          {tournament.logo_url && (
            <img
              src={tournament.logo_url}
              alt={tournament.name}
              className="h-16 w-16 object-contain"
            />
          )}
        </header>

        {/* REGELN NACH KATEGORIEN STRUKTURIERT */}
        <div className="space-y-6">
          {rulesByCategory.map(({ category, info, rules }) => (
            <section key={category} className="space-y-3">
              <h2 className="text-base font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                {info.label}
              </h2>
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div key={rule.id} className="pl-2 border-l-2 border-slate-300">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      • {rule.title}
                    </h3>
                    {rule.description && (
                      <p className="text-xs text-slate-700 leading-relaxed font-medium mt-0.5 whitespace-pre-wrap pl-3">
                        {rule.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* DOKUMENTEN-FUSSZEILE */}
        <footer className="mt-10 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 font-semibold">
          Offizielles Turnierregelwerk für {tournament.name} • Erstellt mit MatchFlow.pro
        </footer>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REGULÄRE WEB-ANSICHT (BEIM DRUCKEN AUTOMATISCH VERSTECKT) */}
      {/* ------------------------------------------------------------- */}
      <div className="print:hidden mx-auto w-full max-w-5xl space-y-6 sm:space-y-8 pb-16 text-slate-100 [color-scheme:dark]">
        {/* SEITEN-KOPF */}
        <section className="rounded-[32px] border border-white/10 bg-black/40 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            {tournament.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name}
                className="h-12 w-12 rounded-2xl object-contain bg-black/50 p-1 border border-white/10"
              />
            ) : (
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black shadow-lg text-slate-950"
                style={{ backgroundColor: primaryColor }}
              >
                📜
              </span>
            )}
            <div>
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: primaryColor }}
              >
                Offizielles Regelwerk
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Turnierbestimmungen &amp; Regeln
              </h1>
            </div>
          </div>
          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">
            Hier findest du alle aktiven Vorgaben, Wurfregeln, Punkte-Bestimmungen und Verhaltensweisen für {tournament.name}.
          </p>
        </section>

        {/* PDF DOWNLOAD BOX */}
        <section className="rounded-[24px] border border-white/15 bg-black/40 p-5 sm:p-6 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 transition hover:border-white/25">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-2xl text-red-400 shadow-md">
              📄
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                Regelwerk als PDF herunterladen
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Lade dir das komplette Regelwerk für unterwegs als PDF-Dokument herunter.
              </p>
            </div>
          </div>

          {tournament.rules_pdf_url ? (
            <a
              href={tournament.rules_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-3 text-xs sm:text-sm font-black transition-all duration-300 shadow-xl hover:scale-105 active:scale-95 shrink-0"
              style={{
                backgroundColor: primaryColor,
                color: primaryContrastText,
                boxShadow: `0 0 20px ${hexToRgba(primaryColor, 0.45)}`,
              }}
            >
              <span>📥</span>
              <span>PDF Herunterladen</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-xs sm:text-sm font-black text-white backdrop-blur-md transition-all duration-300 hover:bg-white/20 hover:scale-105 active:scale-95 shrink-0"
            >
              <span>🖨️</span>
              <span>Als PDF drucken / speichern</span>
            </button>
          )}
        </section>

        {/* KATEGORIE FILTER TABS */}
        {activeRules.length > 0 && (
          <div className="flex flex-wrap gap-2.5 sm:gap-3">
            {/* TAB: ALLE */}
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`rounded-2xl px-5 py-3 text-xs sm:text-sm font-black transition-all duration-300 flex items-center gap-2.5 shadow-xl ${
                activeCategory === 'all'
                  ? 'scale-105 border-2 border-white ring-2 ring-white/30 font-black'
                  : 'bg-black/40 text-slate-300 border border-white/10 hover:bg-black/60 hover:text-white hover:border-white/25 backdrop-blur-md font-bold'
              }`}
              style={
                activeCategory === 'all'
                  ? {
                      backgroundColor: primaryColor,
                      color: primaryContrastText,
                      boxShadow: `0 0 20px ${hexToRgba(primaryColor, 0.55)}`,
                    }
                  : undefined
              }
            >
              <span>🌐</span>
              <span style={{ color: activeCategory === 'all' ? primaryContrastText : undefined }}>
                Alle Regeln ({activeRules.length})
              </span>
              {activeCategory === 'all' && (
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black"
                  style={{
                    backgroundColor: primaryContrastText === '#ffffff' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
                    color: primaryContrastText,
                  }}
                >
                  ✓
                </span>
              )}
            </button>

            {/* KATEGORIE-TABS */}
            {(['general', 'gameplay', 'scoring', 'penalties'] as RuleCategory[]).map((cat) => {
              const count = activeRules.filter((r) => r.category === cat).length
              if (count === 0) return null
              const info = CATEGORY_LABELS[cat]
              const isActive = activeCategory === cat

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-2xl px-5 py-3 text-xs sm:text-sm font-black transition-all duration-300 flex items-center gap-2.5 shadow-xl ${
                    isActive
                      ? 'scale-105 border-2 border-white ring-2 ring-white/30 font-black'
                      : 'bg-black/40 text-slate-300 border border-white/10 hover:bg-black/60 hover:text-white hover:border-white/25 backdrop-blur-md font-bold'
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: primaryColor,
                          color: primaryContrastText,
                          boxShadow: `0 0 20px ${hexToRgba(primaryColor, 0.55)}`,
                        }
                      : undefined
                  }
                >
                  <span>{info.icon}</span>
                  <span style={{ color: isActive ? primaryContrastText : undefined }}>
                    {info.label} ({count})
                  </span>
                  {isActive && (
                    <span
                      className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black"
                      style={{
                        backgroundColor: primaryContrastText === '#ffffff' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
                        color: primaryContrastText,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* REGELN LISTE (WEB-ANSICHT) */}
        {filteredRules.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:gap-5">
            {filteredRules.map((rule) => {
              const catInfo = CATEGORY_LABELS[rule.category] || { label: rule.category, icon: '📌' }
              return (
                <article
                  key={rule.id}
                  className="rounded-2xl border border-white/10 bg-black/40 p-6 sm:p-7 shadow-xl backdrop-blur-md space-y-3.5 transition hover:border-white/20 hover:bg-black/50"
                >
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{catInfo.icon}</span>
                      <h2 className="text-base sm:text-lg font-black text-white">{rule.title}</h2>
                    </div>
                    <span
                      className="self-start sm:self-auto rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-300"
                      style={{
                        borderColor: hexToRgba(primaryColor, 0.35),
                      }}
                    >
                      {catInfo.label}
                    </span>
                  </div>

                  {rule.description && (
                    <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-200 whitespace-pre-wrap sm:pl-9">
                      {rule.description}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-12 text-center text-xs sm:text-sm font-bold text-slate-300 backdrop-blur-md">
            {activeRules.length === 0
              ? 'Für dieses Turnier wurden noch keine spezifischen Regeln veröffentlicht.'
              : 'Keine aktiven Regeln in dieser Kategorie vorhanden.'}
          </div>
        )}
      </div>
    </>
  )
}