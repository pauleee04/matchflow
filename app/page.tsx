'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { publicSupabase } from '@/lib/supabase'
import { SPORTS_CONFIG, type SportType } from '@/lib/sportsConfig'

type PublicTournament = {
  id: number
  name: string
  slug: string
  type: string
  status: string
  primary_color?: string | null
  background_style?: string | null
  logo_url?: string | null
  created_at: string
}

export default function PlatformHomePage() {
  const [tournaments, setTournaments] = useState<PublicTournament[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSportTab, setSelectedSportTab] = useState<string>('all')
  const [showcaseSport, setShowcaseSport] = useState<SportType>('bierpong')

  useEffect(() => {
    async function loadPublicTournaments() {
      try {
        const { data, error } = await publicSupabase
          .from('tournaments')
          .select('id, name, slug, type, status, primary_color, background_style, logo_url, created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        if (!error && data) {
          setTournaments(data)
        }
      } catch (err) {
        console.error('Ladefehler Turniere:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadPublicTournaments()
  }, [])

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesType = selectedSportTab === 'all' || t.type === selectedSportTab

      return matchesSearch && matchesType
    })
  }, [tournaments, searchQuery, selectedSportTab])

  const activeSportConfig = SPORTS_CONFIG[showcaseSport]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950 font-sans">
      {/* BACKGROUND GLOW ACCENTS */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-amber-500/10 blur-[140px]" />
        <div className="absolute right-0 top-1/3 h-[35rem] w-[35rem] rounded-full bg-indigo-500/10 blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 h-[30rem] w-[30rem] rounded-full bg-emerald-500/10 blur-[140px]" />
      </div>

      {/* NAVIGATION BAR */}
      <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-xl font-black text-slate-950 shadow-lg shadow-amber-500/20">
              ⚡
            </div>
            <div>
              <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                MatchFlow<span className="text-amber-500">.pro</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="#tournaments"
              className="hidden text-xs font-bold text-slate-400 transition hover:text-white sm:block"
            >
              Aktive Turniere
            </Link>
            <Link
              href="#features"
              className="hidden text-xs font-bold text-slate-400 transition hover:text-white sm:block"
            >
              Features
            </Link>
            <Link
              href="/admin"
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-xs font-black text-slate-950 shadow-md shadow-amber-500/15 transition hover:brightness-110 active:scale-95"
            >
              + Turnier veranstalten
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 text-center sm:px-8 sm:pt-24 sm:pb-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-amber-400 backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Next-Gen Tournament Engine 2026
        </div>

        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
          Das smarte Betriebssystem für{' '}
          <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
            jedes Turnier weltweit.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-sm font-medium leading-relaxed text-slate-400 sm:text-lg">
          Ob 🍺 Bierpong, ⚽ Fußball, 🎾 Tennis oder 🎯 Darts: Erstelle mit <strong>MatchFlow</strong> in Sekunden dein eigenes Turnier mit automatischer Gruppen-Auslosung, Live-Ticker auf jedem Smartphone und Fullscreen-Beamer-Displays.
        </p>

        {/* HERO CALL TO ACTIONS */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/admin"
            className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-8 py-4 text-sm font-black text-slate-950 shadow-xl shadow-amber-500/20 transition hover:scale-105 active:scale-95"
          >
            🚀 Jetzt kostenfrei Turnier erstellen
          </Link>

          <a
            href="#tournaments"
            className="w-full sm:w-auto rounded-2xl border border-slate-800 bg-slate-900/80 px-8 py-4 text-sm font-bold text-slate-300 backdrop-blur-md transition hover:border-slate-700 hover:bg-slate-800"
          >
            🔍 Aktive Turniere suchen
          </a>
        </div>

        {/* STATS STRIP */}
        <div className="mt-16 grid grid-cols-2 gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur-xl sm:grid-cols-4 sm:p-8">
          <div>
            <div className="text-2xl font-black text-amber-400 sm:text-3xl">100% Realtime</div>
            <div className="mt-1 text-xs font-bold text-slate-500">Live-Sync ohne Neuladen</div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-400 sm:text-3xl">Multi-Sport</div>
            <div className="mt-1 text-xs font-bold text-slate-500">Automatische Regeln & Zählungen</div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-400 sm:text-3xl">Custom Branding</div>
            <div className="mt-1 text-xs font-bold text-slate-500">Eigene Farben & Wasserzeichen</div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-400 sm:text-3xl">Beamer Mode</div>
            <div className="mt-1 text-xs font-bold text-slate-500">Optimierte Hallen-Anzeige</div>
          </div>
        </div>
      </section>

      {/* MULTI-SPORT AUTO-CONFIGURATION ENGINE SHOWCASE */}
      <section className="relative z-10 border-t border-b border-slate-800/80 bg-slate-900/40 py-20 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="text-center">
            <span className="text-xs font-black uppercase tracking-widest text-amber-500">
              MatchFlow Rules Engine
            </span>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Jedes Spiel hat seine eigenen Regeln. Wir kennen sie alle.
            </h2>
            <p className="mt-2 text-xs font-semibold text-slate-400 sm:text-sm">
              Wähle deine Sportart – das System stellt Zählweise, Zeitabschnitte und Gruppenregeln automatisch ein.
            </p>
          </div>

          {/* SPORT TYPE SELECTOR TABS */}
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {(Object.keys(SPORTS_CONFIG) as SportType[]).map((type) => {
              const cfg = SPORTS_CONFIG[type]
              const isSelected = showcaseSport === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setShowcaseSport(type)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                      : 'border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <span>{cfg.emoji}</span>
                  <span>{cfg.name}</span>
                </button>
              )
            })}
          </div>

          {/* DYNAMIC RULES PREVIEW CARD */}
          <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4 lg:max-w-md">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-3xl shadow-inner ring-1 ring-amber-500/30">
                    {activeSportConfig.emoji}
                  </span>
                  <div>
                    <h3 className="text-2xl font-black">{activeSportConfig.name}</h3>
                    <p className="text-xs font-bold text-amber-500">
                      Einheit: {activeSportConfig.scoreUnit} ({activeSportConfig.scoreShort})
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-[10px] font-black uppercase text-slate-500">Abschnitte</span>
                    <p className="mt-1 font-bold text-slate-200">
                      {activeSportConfig.periodNames.join(', ')}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-[10px] font-black uppercase text-slate-500">Punkte-System</span>
                    <p className="mt-1 font-bold text-slate-200">
                      Sieg: {activeSportConfig.scoringRules.winPoints} Pkt | Remis: {activeSportConfig.scoringRules.drawPoints} Pkt
                    </p>
                  </div>
                </div>

                {activeSportConfig.scoringRules.customNotice && (
                  <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-bold text-amber-400 border border-amber-500/20">
                    💡 {activeSportConfig.scoringRules.customNotice}
                  </p>
                )}

                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 text-xs font-black text-amber-400 hover:underline pt-2"
                >
                  Turnier mit {activeSportConfig.name}-Regeln erstellen →
                </Link>
              </div>

              {/* CODE / PRESET PREVIEW */}
              <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                  Automatisch generierte Turnier-Regeln:
                </span>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                  {activeSportConfig.defaultRulesPreset}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE SHOWCASE GRID */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-8">
        <div className="text-center">
          <span className="text-xs font-black uppercase tracking-widest text-amber-500">
            Smart Features
          </span>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
            Ein System. Unendliche Möglichkeiten.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-md backdrop-blur-xl transition hover:border-amber-500/50 hover:bg-slate-900/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-400 ring-1 ring-amber-500/30">
              ⚡
            </div>
            <h3 className="mt-6 text-xl font-black">Supabase Realtime Sync</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
              Trage Ergebnisse ein – die Tische, Live-Ticker, Beamer und Handys aller Zuschauer aktualisieren sich in Millisekunden ohne Seite neuladen.
            </p>
          </div>

          <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-md backdrop-blur-xl transition hover:border-amber-500/50 hover:bg-slate-900/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-400 ring-1 ring-amber-500/30">
              🎨
            </div>
            <h3 className="mt-6 text-xl font-black">Custom Branding & Logos</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
              Wähle Farbwelten (Festival, Biergarten, Ozean, Gold) und lade ein Logo hoch. Es erscheint als dezentes Wasserzeichen auf allen öffentlichen Seiten.
            </p>
          </div>

          <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-md backdrop-blur-xl transition hover:border-amber-500/50 hover:bg-slate-900/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-400 ring-1 ring-amber-500/30">
              🔀
            </div>
            <h3 className="mt-6 text-xl font-black">Smart Group Draw & Swap</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
              1-Klick-Auslosung der Teams mit integrierten Ausschluss-Regeln, manuelle Team-Swaps und automatisches Spielfrei-Management bei ungeraden Gruppen.
            </p>
          </div>

          <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-md backdrop-blur-xl transition hover:border-amber-500/50 hover:bg-slate-900/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-400 ring-1 ring-amber-500/30">
              🏆
            </div>
            <h3 className="mt-6 text-xl font-black">Automatische K.-o.-Bäume</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
              Generiert automatisch Viertelfinale, Halbfinale und Finale direkt aus den Bestplatzierten der Gruppenphase.
            </p>
          </div>

          <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-md backdrop-blur-xl transition hover:border-amber-500/50 hover:bg-slate-900/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-400 ring-1 ring-amber-500/30">
              📺
            </div>
            <h3 className="mt-6 text-xl font-black">Hallen-Beamer-Modus</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
              Spezielle Großbildschirm-Ansicht in hochkontrastreichem Dark-Design für Leinwände, Monitore und Beamer am Event.
            </p>
          </div>

          <div className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-md backdrop-blur-xl transition hover:border-amber-500/50 hover:bg-slate-900/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl text-amber-400 ring-1 ring-amber-500/30">
              📊
            </div>
            <h3 className="mt-6 text-xl font-black">Echtzeit-Statistiken</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
              Berechnet automatisch beste Offensive, beste Defensive, Höchstsiege und Gesamttabellen in Echtzeit.
            </p>
          </div>
        </div>
      </section>

      {/* ACTIVE TOURNAMENTS SECTION */}
      <section id="tournaments" className="relative z-10 border-t border-slate-800/80 bg-slate-900/30 py-20 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-500">
                Live & Upcoming
              </span>
              <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                Aktive Turniere finden
              </h2>
            </div>

            <Link
              href="/admin"
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-black text-amber-400 transition hover:bg-amber-500/20"
            >
              + Eigenes Turnier hinzufügen
            </Link>
          </div>

          {/* SEARCH & SPORT FILTER */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Turnier nach Name oder Slug suchen …"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-5 py-3.5 pl-11 text-sm font-bold text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
              <span className="absolute left-4 top-3.5 text-slate-500">🔍</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedSportTab('all')}
                className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                  selectedSportTab === 'all'
                    ? 'bg-amber-500 text-slate-950'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Alle
              </button>

              {(['bierpong', 'fussball', 'tennis', 'dart'] as SportType[]).map((st) => {
                const cfg = SPORTS_CONFIG[st]
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedSportTab(st)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                      selectedSportTab === st
                        ? 'bg-amber-500 text-slate-950'
                        : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cfg.emoji} {cfg.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* TOURNAMENT CARDS */}
          {loading ? (
            <div className="mt-12 text-center text-sm font-bold text-slate-500">
              Lade aktive Turniere …
            </div>
          ) : filteredTournaments.length === 0 ? (
            <div className="mt-12 rounded-3xl border border-slate-800 bg-slate-950/50 p-12 text-center text-xs font-bold text-slate-500">
              Keine aktiven Turniere in dieser Kategorie gefunden.
            </div>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTournaments.map((t) => {
                const cfg = SPORTS_CONFIG[(t.type || '') as SportType] || SPORTS_CONFIG.sonstiges
                return (
                  <Link
                    key={t.id}
                    href={`/turnier/${t.slug}`}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-amber-500/50 hover:shadow-2xl"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl shadow-inner"
                          style={{
                            backgroundColor: t.primary_color || '#f59e0b',
                            color: '#111827',
                          }}
                        >
                          {cfg.emoji}
                        </span>

                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-400 ring-1 ring-emerald-500/20">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                          Aktiv
                        </span>
                      </div>

                      <h3 className="mt-4 text-2xl font-black tracking-tight group-hover:text-amber-400">
                        {t.name}
                      </h3>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        /turnier/{t.slug}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs font-extrabold text-amber-500">
                      <span>Turnier-Übersicht & Tische</span>
                      <span>→</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* BOTTOM CTA BANNER */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-purple-500/20 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-16">
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
            Bereit für dein nächstes Turnier?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-xs font-semibold text-slate-300 sm:text-sm">
            Erstelle jetzt mit MatchFlow in weniger als 30 Sekunden dein eigenes Turnier.
          </p>

          <div className="mt-8">
            <Link
              href="/admin"
              className="inline-block rounded-2xl bg-amber-500 px-8 py-4 text-sm font-black text-slate-950 shadow-xl transition hover:scale-105 active:scale-95"
            >
              + Jetzt Turnier veranstalten
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-950 py-8 text-center text-xs font-bold text-slate-500">
        <div className="mx-auto max-w-7xl px-4">
          © 2026 MatchFlow — Global Realtime Tournament Engine
        </div>
      </footer>
    </div>
  )
}