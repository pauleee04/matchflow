'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { publicSupabase } from '@/lib/supabase'

type TournamentData = {
  id: number
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  tertiary_color: string | null
  background_color: string | null
  registration_open: boolean | null
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()

  const rawSlug = (params?.slug as string) || ''
  const slug = decodeURIComponent(rawSlug)

  const [tournament, setTournament] = useState<TournamentData | null>(null)

  useEffect(() => {
    if (!slug) return
    async function loadTournament() {
      const { data } = await publicSupabase
        .from('tournaments')
        .select('id, name, slug, logo_url, primary_color, secondary_color, tertiary_color, background_color, registration_open')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (data) {
        setTournament(data as TournamentData)
      }
    }
    void loadTournament()
  }, [slug, rawSlug])

  // Realtime Broadcast Listener für sofortiges Design- & Daten-Sync
  useEffect(() => {
    if (!tournament?.id) return

    const channel = publicSupabase.channel(`tournament:${tournament.id}`)
    channel
      .on('broadcast', { event: 'refresh' }, () => {
        void (async () => {
          const { data } = await publicSupabase
            .from('tournaments')
            .select('id, name, slug, logo_url, primary_color, secondary_color, tertiary_color, background_color, registration_open')
            .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
            .maybeSingle()
          if (data) setTournament(data as TournamentData)
        })()
      })
      .subscribe()

    return () => {
      void publicSupabase.removeChannel(channel)
    }
  }, [tournament?.id, slug, rawSlug])

  // Standard-Farben analog zum Admin Layout
  const primaryColor = tournament?.primary_color || '#22c55e'
  const secondaryColor = tournament?.secondary_color || '#10b981'
  const tertiaryColor = tournament?.tertiary_color || '#081c10'
  const backgroundColor = tournament?.background_color || '#020a05'
  const isRegistrationOpen = tournament?.registration_open ?? true

  const navLinks = [
    { href: `/turnier/${encodeURIComponent(slug)}`, label: '🌐 Turnierseite', exact: true },
    ...(isRegistrationOpen
      ? [{ href: `/turnier/${encodeURIComponent(slug)}/anmeldung`, label: '📝 Anmeldung', exact: false }]
      : []),
    { href: `/turnier/${encodeURIComponent(slug)}/live`, label: '🔴 Live & Spiele', exact: false },
    { href: `/turnier/${encodeURIComponent(slug)}/beamer`, label: '📺 Beamer', exact: false },
    { href: `/turnier/${encodeURIComponent(slug)}/regeln`, label: '📜 Regeln', exact: false },
    { href: `/turnier/${encodeURIComponent(slug)}/sieger`, label: '🥇 Sieger', exact: false },
    { href: `/turnier/${encodeURIComponent(slug)}/stats`, label: '📈 Stats', exact: false },
  ]

  return (
    <div
      className="relative min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100 transition-colors duration-500"
      style={{
        backgroundColor: backgroundColor,
        backgroundImage: `radial-gradient(circle at 50% 0%, ${primaryColor}30 0%, transparent 75%), radial-gradient(circle at 100% 100%, ${secondaryColor}20 0%, transparent 60%)`,
      }}
    >
      {/* HOHER GLAS-EFFEKT: ~20% DECKKRAFT FÜR OPTIMALE PERFORATION DES WASSERZEICHENS (1:1 ADMIN STYLES) */}
      <style>{`
        main section, 
        main .rounded-3xl, 
        main .rounded-2xl {
          background-color: ${tertiaryColor}35 !important;
          backdrop-filter: blur(10px) !important;
          -webkit-backdrop-filter: blur(10px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
      `}</style>

      {/* 1. WASSERZEICHEN IM SEITENHINTERGRUND (FARBIG & KLAR DURCHSCHIMMERND) */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
        {tournament?.logo_url ? (
          <img
            src={tournament.logo_url}
            alt=""
            draggable={false}
            className="h-[680px] w-[680px] max-w-[85vw] max-h-[85vh] object-contain opacity-35"
          />
        ) : (
          <span
            className="select-none text-center font-black uppercase tracking-[0.12em] text-7xl sm:text-9xl opacity-10"
            style={{ color: primaryColor, lineHeight: 1 }}
          >
            {tournament?.name || 'TURNIER'}
          </span>
        )}
      </div>

      {/* 2. GLÄSERNER HEADER (1:1 WIE ADMIN CONTROL PANEL) */}
      <header
        className="relative z-10 overflow-hidden rounded-[32px] border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
        style={{ backgroundColor: `${tertiaryColor}35` }}
      >
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {tournament?.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name || 'Logo'}
                className="h-16 w-16 rounded-2xl border border-white/10 bg-black/50 object-contain p-1.5 shadow-lg sm:h-20 sm:w-20 shrink-0"
              />
            ) : (
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-black text-slate-950 shadow-lg sm:h-20 sm:w-20"
                style={{ backgroundColor: primaryColor }}
              >
                🏆
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-block rounded-xl px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] shadow-sm"
                  style={{
                    backgroundColor: `${primaryColor}20`,
                    color: primaryColor,
                    border: `1px solid ${primaryColor}40`,
                  }}
                >
                  Offizielle Turnierseite
                </span>
                <span className="inline-block rounded-xl bg-black/50 border border-white/10 px-2.5 py-1 text-[10px] font-mono font-bold text-slate-300">
                  #{slug}
                </span>
              </div>

              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl drop-shadow-md truncate">
                {tournament?.name || `Turnier #${slug}`}
              </h1>

              <p className="mt-1 text-xs font-semibold text-slate-300 truncate">
                Willkommen im offiziellen Turnier-Portal • Live Spielpläne, Tabellen &amp; Ergebnisse
              </p>
            </div>
          </div>

          {/* JETZT ANMELDEN BUTTON */}
          {isRegistrationOpen && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/turnier/${encodeURIComponent(slug)}/anmeldung`}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-5 py-3 text-xs sm:text-sm font-black text-slate-950 shadow-xl transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                📝 Jetzt anmelden
              </Link>
            </div>
          )}
        </div>

        {/* NAVIGATION LEISTE (ADMIN-STYLE BUTTON PILLS) */}
        <div className="relative z-10 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {navLinks.map((link) => {
              const decodedPath = decodeURIComponent(pathname)
              const decodedHref = decodeURIComponent(link.href)

              const isActive = link.exact
                ? decodedPath === decodedHref
                : decodedPath.startsWith(decodedHref)

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-black transition-all shadow-md"
                  style={{
                    backgroundColor: isActive ? primaryColor : 'rgba(0, 0, 0, 0.5)',
                    color: isActive ? '#022c22' : '#e2e8f0',
                    border: isActive ? `1px solid ${primaryColor}` : '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>
      </header>

      {/* HAUPTINHALT DER ÖFFENTLICHEN UNTERSEITEN */}
      <main className="relative z-10 space-y-6">{children}</main>
    </div>
  )
}