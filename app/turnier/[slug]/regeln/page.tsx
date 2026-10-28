'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { publicSupabase as supabase } from '@/lib/supabase'

type TournamentInfo = {
  id: number
  name: string
  slug?: string | null
  logo_url: string | null
  primary_color: string | null
  background_style: string | null
}

type TournamentRules = {
  id?: number
  tournament_id?: number
  rules_text?: string | null
  team_summary?: string | null
  general_rules?: string | null
  cup_rules?: string | null
  throwing_rules?: string | null
  overtime_rules?: string | null
  penalty_rules?: string | null
  updated_at?: string | null
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
  const [rules, setRules] = useState<TournamentRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!slug) return

    try {
      const { data: tourneyData, error: tourneyError } = await supabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, background_style')
        .eq('slug', slug)
        .maybeSingle()

      if (tourneyError) throw tourneyError
      if (!tourneyData) {
        setError('Turnier nicht gefunden.')
        return
      }

      const t = tourneyData as TournamentInfo
      setTournament(t)

      const { data: rulesData, error: rulesError } = await supabase
        .from('tournament_rules')
        .select('*')
        .eq('tournament_id', t.id)
        .maybeSingle()

      if (!rulesError && rulesData) {
        setRules(rulesData as TournamentRules)
      } else {
        setRules(null)
      }
      setError('')
    } catch (err) {
      console.error('RULES LOAD ERROR:', err)
      setError('Die Turnierregeln konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Realtime Broadcast Listener
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

  const primaryColor = tournament?.primary_color?.trim() || '#2563eb'

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-gray-900 dark:text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 dark:border-gray-800 dark:border-t-blue-400" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">
            Lade Regelwerk …
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-red-50/90 p-6 text-center shadow-sm backdrop-blur-md dark:border-red-900/40 dark:bg-red-950/20">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xl dark:bg-red-900/40">
          ⚠️
        </div>
        <h2 className="text-lg font-black text-red-900 dark:text-red-200">
          Fehler beim Laden
        </h2>
        <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      </div>
    )
  }

  const hasCustomSections =
    rules &&
    (rules.general_rules ||
      rules.throwing_rules ||
      rules.cup_rules ||
      rules.overtime_rules ||
      rules.penalty_rules ||
      rules.rules_text)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
      {/* SEITEN-KOPF (CLEAN & MINIMALISTISCH) */}
      <section className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90 sm:p-8">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            📜
          </span>
          <div>
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ color: primaryColor }}
            >
              Offizielles Regelwerk
            </span>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              Turnierbestimmungen &amp; Regeln
            </h1>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:text-sm">
          Alle offiziellen Vorgaben für Fairplay, Becheraufstellung, Wurftechnik und Verlängerungen.
        </p>
      </section>

      {/* BENUTZERDEFINIERTES ODER STANDARD-REGELWERK */}
      {hasCustomSections ? (
        <div className="grid grid-cols-1 gap-5">
          {rules?.team_summary && (
            <div className="rounded-3xl border border-blue-200/60 bg-blue-50/50 p-6 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Wichtigste Regeln im Überblick
              </span>
              <div className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-gray-800 dark:text-gray-200 sm:text-sm">
                {rules.team_summary}
              </div>
            </div>
          )}

          {rules?.general_rules && (
            <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📋</span>
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  1. Allgemeine Bestimmungen
                </h2>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-xs font-medium leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
                {rules.general_rules}
              </div>
            </article>
          )}

          {rules?.throwing_rules && (
            <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🎯</span>
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  2. Wurfregeln &amp; Bälle
                </h2>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-xs font-medium leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
                {rules.throwing_rules}
              </div>
            </article>
          )}

          {rules?.cup_rules && (
            <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🍺</span>
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  3. Becher &amp; Formationen
                </h2>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-xs font-medium leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
                {rules.cup_rules}
              </div>
            </article>
          )}

          {rules?.overtime_rules && (
            <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⏱️</span>
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  4. Verlängerung &amp; Rebuttal
                </h2>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-xs font-medium leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
                {rules.overtime_rules}
              </div>
            </article>
          )}

          {rules?.penalty_rules && (
            <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⚠️</span>
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  5. Fairplay &amp; Strafen
                </h2>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-xs font-medium leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
                {rules.penalty_rules}
              </div>
            </article>
          )}

          {rules?.rules_text && (
            <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                Zusätzliche Hinweise
              </h2>
              <div className="mt-3 whitespace-pre-wrap text-xs font-medium leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
                {rules.rules_text}
              </div>
            </article>
          )}
        </div>
      ) : (
        /* FALLBACK STANDARD-REGELN */
        <div className="grid grid-cols-1 gap-5">
          <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🍺</span>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                1. Spielaufbau &amp; Becher
              </h2>
            </div>
            <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>Jedes Team baut zu Beginn eine Pyramide aus 10 Bechern auf.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  Einmal pro Spiel darf jedes Team ein Zusammenstellen (Re-Rack) anfordern (z. B. auf 6 oder 3 Becher).
                </span>
              </li>
            </ul>
          </article>

          <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🎯</span>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                2. Wurfablauf &amp; Treffer
              </h2>
            </div>
            <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>Pro Runde wirft jeder Spieler genau einen Ball.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  <strong>Direktwurf:</strong> Trifft ohne Tischkontakt = 1 Becher muss entfernt werden.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  <strong>Aufsetzer (Bounce):</strong> Prallt vor dem Becher auf = 2 Becher zählen. Aufsetzer dürfen vom Gegner abgewehrt werden!
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  <strong>Rollback:</strong> Treffen beide Spieler in derselben Runde, bekommt das Team beide Bälle zurück.
                </span>
              </li>
            </ul>
          </article>

          <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⏱️</span>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                3. Spielende &amp; Rebuttal
              </h2>
            </div>
            <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  Wird der letzte Becher getroffen, erhält das gegnerische Team eine Konter-Chance (Rebuttal).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>
                  Treffen sie alle verbleibenden Becher, geht es in die Verlängerung (3 Becher).
                </span>
              </li>
            </ul>
          </article>

          <article className="rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-900/90">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🤝</span>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                4. Fairplay
              </h2>
            </div>
            <ul className="mt-4 space-y-2 text-xs font-semibold leading-relaxed text-gray-600 dark:text-gray-300 sm:text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>Ellbogen müssen beim Wurf hinter der Tischkante bleiben.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>Ergebnisse direkt im Anschluss bei der Turnierleitung melden.</span>
              </li>
            </ul>
          </article>
        </div>
      )}
    </div>
  )
}