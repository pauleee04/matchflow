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
}

const CATEGORY_LABELS: Record<RuleCategory, { label: string; icon: string }> = {
  general: { label: 'Allgemein & Verhalten', icon: '🛡️' },
  gameplay: { label: 'Spielablauf', icon: '🎮' },
  scoring: { label: 'Punkte & Wertung', icon: '🎯' },
  penalties: { label: 'Strafen & Verstöße', icon: '⚠️' },
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
  return yiq >= 135 ? '#090d16' : '#ffffff'
}

function getPageBackgroundStyle(primary?: string | null, secondary?: string | null) {
  const p1 = hexToRgba(primary, 0.22, '#22c55e')
  const p2 = hexToRgba(secondary || primary, 0.1, '#10b981')
  return `radial-gradient(circle at 50% 5%, ${p1} 0%, ${p2} 45%, #030712 90%)`
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
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, secondary_color, background_style, rules')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      setTournament(tourneyData as TournamentInfo)
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

  // Live Broadcast Listener
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
  const secondaryColor = tournament?.secondary_color?.trim() || '#10b981'
  const primaryContrastText = getContrastTextColor(primaryColor)

  const activeRules = useMemo(() => {
    if (!tournament?.rules || !Array.isArray(tournament.rules)) return []
    return tournament.rules.filter((r) => r.enabled)
  }, [tournament?.rules])

  const filteredRules = useMemo(() => {
    if (activeCategory === 'all') return activeRules
    return activeRules.filter((r) => r.category === activeCategory)
  }, [activeRules, activeCategory])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-slate-100 bg-slate-950 [color-scheme:dark]">
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
      <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950 [color-scheme:dark]">
        <div className="mx-auto max-w-lg rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-center backdrop-blur-md">
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
    <div
      className="min-h-screen w-full bg-slate-950 text-slate-100 [color-scheme:dark] px-4 py-6 sm:px-8 sm:py-10"
      style={{ background: getPageBackgroundStyle(primaryColor, secondaryColor) }}
    >
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-16">
        {/* SEITEN-KOPF (FREISTEHENDE KACHEL) */}
        <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-4">
            {tournament.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name}
                className="h-12 w-12 rounded-2xl object-contain bg-slate-950/60 p-1 border border-white/10"
              />
            ) : (
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black shadow-lg"
                style={{ backgroundColor: primaryColor, color: primaryContrastText }}
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

        {/* KATEGORIE FILTER TABS (STARK VERBESSERTE LESBARKEIT FÜR LAPTOPS/MONITORE) */}
        {activeRules.length > 0 && (
          <div className="flex flex-wrap gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-black transition-all flex items-center gap-2 border shadow-md ${
                activeCategory === 'all'
                  ? 'ring-2 ring-white/30 scale-[1.02]'
                  : 'bg-slate-900/80 text-slate-200 border-white/15 hover:border-white/30 hover:bg-slate-800 hover:text-white backdrop-blur-md'
              }`}
              style={
                activeCategory === 'all'
                  ? {
                      backgroundColor: primaryColor,
                      color: primaryContrastText,
                      borderColor: primaryColor,
                    }
                  : undefined
              }
            >
              <span>🌐</span>
              <span>Alle Regeln ({activeRules.length})</span>
            </button>

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
                  className={`rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-black transition-all flex items-center gap-2 border shadow-md ${
                    isActive
                      ? 'ring-2 ring-white/30 scale-[1.02]'
                      : 'bg-slate-900/80 text-slate-200 border-white/15 hover:border-white/30 hover:bg-slate-800 hover:text-white backdrop-blur-md'
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: primaryColor,
                          color: primaryContrastText,
                          borderColor: primaryColor,
                        }
                      : undefined
                  }
                >
                  <span>{info.icon}</span>
                  <span>{info.label} ({count})</span>
                </button>
              )
            })}
          </div>
        )}

        {/* REGELN LISTE (FREISTEHENDE KACHELN) */}
        {filteredRules.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:gap-5">
            {filteredRules.map((rule) => {
              const catInfo = CATEGORY_LABELS[rule.category] || { label: rule.category, icon: '📌' }
              return (
                <article
                  key={rule.id}
                  className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 sm:p-7 shadow-xl backdrop-blur-xl space-y-3.5 transition hover:border-white/20"
                >
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{catInfo.icon}</span>
                      <h2 className="text-base sm:text-lg font-black text-white">{rule.title}</h2>
                    </div>
                    <span
                      className="self-start sm:self-auto rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-300"
                      style={{
                        borderColor: hexToRgba(primaryColor, 0.3),
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
          <div className="rounded-[32px] border border-dashed border-white/15 bg-slate-900/50 p-12 text-center text-xs sm:text-sm font-bold text-slate-300 backdrop-blur-xl">
            {activeRules.length === 0
              ? 'Für dieses Turnier wurden noch keine spezifischen Regeln veröffentlicht.'
              : 'Keine aktiven Regeln in dieser Kategorie vorhanden.'}
          </div>
        )}
      </div>
    </div>
  )
}