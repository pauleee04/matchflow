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
  background_style: string | null
  rules?: RuleItem[] | null
}

const CATEGORY_LABELS: Record<RuleCategory, { label: string; icon: string }> = {
  general: { label: 'Allgemein & Verhalten', icon: '🛡️' },
  gameplay: { label: 'Spielablauf', icon: '🎮' },
  scoring: { label: 'Punkte & Wertung', icon: '🎯' },
  penalties: { label: 'Strafen & Verstöße', icon: '⚠️' },
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
        .select('id, name, slug, logo_url, primary_color, background_style, rules')
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
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100">
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
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-center backdrop-blur-md">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400">
          ⚠️
        </div>
        <h2 className="text-lg font-black text-slate-100">Fehler beim Laden</h2>
        <p className="mt-1 text-xs font-semibold text-red-300">{error || 'Turnier existiert nicht.'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100">
      {/* SEITEN-KOPF */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-4">
          {tournament.logo_url ? (
            <img
              src={tournament.logo_url}
              alt={tournament.name}
              className="h-12 w-12 rounded-2xl object-contain bg-slate-950/60 p-1 border border-white/10"
            />
          ) : (
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-slate-950 shadow-lg"
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

      {/* KATEGORIE FILTER TABS */}
      {activeRules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`rounded-2xl px-4 py-2.5 text-xs font-black transition border ${
              activeCategory === 'all'
                ? 'bg-white text-slate-950 border-white shadow-lg'
                : 'bg-slate-900/60 text-slate-400 border-white/10 hover:border-white/20 hover:text-white backdrop-blur-md'
            }`}
          >
            Alle Regeln ({activeRules.length})
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
                className={`rounded-2xl px-4 py-2.5 text-xs font-black transition flex items-center gap-2 border ${
                  isActive
                    ? 'bg-white text-slate-950 border-white shadow-lg'
                    : 'bg-slate-900/60 text-slate-400 border-white/10 hover:border-white/20 hover:text-white backdrop-blur-md'
                }`}
              >
                <span>{info.icon}</span>
                <span>{info.label} ({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* REGELN LISTE */}
      {filteredRules.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredRules.map((rule) => {
            const catInfo = CATEGORY_LABELS[rule.category] || { label: rule.category, icon: '📌' }
            return (
              <article
                key={rule.id}
                className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-7 shadow-2xl backdrop-blur-xl space-y-3 transition hover:border-white/20"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{catInfo.icon}</span>
                    <h2 className="text-base font-black text-white">{rule.title}</h2>
                  </div>
                  <span className="self-start sm:self-auto rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {catInfo.label}
                  </span>
                </div>

                {rule.description && (
                  <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-300 whitespace-pre-wrap sm:pl-8">
                    {rule.description}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[32px] border border-dashed border-white/10 bg-slate-900/40 p-12 text-center text-xs font-bold text-slate-400 backdrop-blur-xl">
          {activeRules.length === 0
            ? 'Für dieses Turnier wurden noch keine spezifischen Regeln veröffentlicht.'
            : 'Keine aktiven Regeln in dieser Kategorie vorhanden.'}
        </div>
      )}
    </div>
  )
}