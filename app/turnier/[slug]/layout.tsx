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
  registration_open: boolean | null
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

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()

  const rawSlug = (params?.slug as string) || ''
  const slug = decodeURIComponent(rawSlug)

  const [tournament, setTournament] = useState<TournamentData | null>(null)

  const loadTournament = async () => {
    if (!slug) return
    const { data } = await publicSupabase
      .from('tournaments')
      .select('id, name, slug, logo_url, primary_color, secondary_color, registration_open')
      .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
      .maybeSingle()

    if (data) {
      setTournament(data as TournamentData)
    }
  }

  useEffect(() => {
    void loadTournament()
  }, [slug, rawSlug])

  // Realtime Broadcast Listener für sofortige Aktualisierung ohne Reload
  useEffect(() => {
    if (!tournament?.id) return

    const channel = publicSupabase.channel(`tournament:${tournament.id}`)
    channel
      .on('broadcast', { event: 'refresh' }, () => {
        void loadTournament()
      })
      .subscribe()

    return () => {
      void publicSupabase.removeChannel(channel)
    }
  }, [tournament?.id])

  // Dynamische Markenfarben & Kontrast
  const primaryColor = tournament?.primary_color?.trim() || '#22c55e'
  const secondaryColor = tournament?.secondary_color?.trim() || '#10b981'
  const primaryContrastText = getContrastTextColor(primaryColor)
  const isRegistrationOpen = tournament?.registration_open ?? true

  // Navigations-Links (Anmeldung wird dynamisch ein-/ausgeblendet)
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
      className="relative min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100 bg-slate-950 [color-scheme:dark] transition-colors duration-500"
      style={{
        background: getPageBackgroundStyle(primaryColor, secondaryColor),
      }}
    >
      {/* WASSERZEICHEN IM SEITENHINTERGRUND */}
      {tournament?.logo_url && (
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
          <img
            src={tournament.logo_url}
            alt=""
            className="h-[650px] w-[650px] object-contain opacity-15 blur-[1px]"
          />
        </div>
      )}

      {/* HAUPT-HEADER (FREISTEHENDE KACHEL) */}
      <header className="relative z-10 overflow-hidden rounded-[32px] border border-white/15 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl space-y-6">
        {/* LOGO-WASSERZEICHEN IM HEADER HINTERGRUND RECHTS UNTEN */}
        {tournament?.logo_url && (
          <img
            src={tournament.logo_url}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -bottom-10 h-56 w-56 select-none object-contain opacity-15 blur-[0.5px]"
          />
        )}

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* LOGO, BADGES & TURNIERNAME */}
          <div className="flex items-center gap-4 min-w-0">
            {tournament?.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name || 'Logo'}
                className="h-16 w-16 rounded-2xl border border-white/20 bg-slate-950/80 object-contain p-1.5 shadow-xl sm:h-20 sm:w-20 shrink-0"
              />
            ) : (
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-black shadow-xl sm:h-20 sm:w-20"
                style={{ backgroundColor: primaryColor, color: primaryContrastText }}
              >
                🏆
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-block rounded-md px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest shadow-sm"
                  style={{
                    backgroundColor: hexToRgba(primaryColor, 0.25),
                    color: primaryColor,
                    border: `1px solid ${hexToRgba(primaryColor, 0.4)}`,
                  }}
                >
                  Offizielle Turnierseite
                </span>
                <span className="inline-block rounded-md bg-white/10 border border-white/15 px-2.5 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                  #{slug}
                </span>
              </div>

              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl drop-shadow-md truncate">
                {tournament?.name || `Turnier #${slug}`}
              </h1>

              <p className="text-xs font-semibold text-slate-300 truncate">
                Willkommen im offiziellen Turnier-Portal • Live Spielpläne, Tabellen &amp; Ergebnisse
              </p>
            </div>
          </div>

          {/* AKTIONS-BUTTON RECHTS OBEN (NUR BEI OFFENER ANMELDUNG SICHTBAR) */}
          {isRegistrationOpen && (
            <div className="shrink-0 flex items-center gap-2">
              <Link
                href={`/turnier/${encodeURIComponent(slug)}/anmeldung`}
                className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs sm:text-sm font-black shadow-xl transition hover:scale-105 active:scale-95"
                style={{ backgroundColor: primaryColor, color: primaryContrastText }}
              >
                📝 Jetzt anmelden
              </Link>
            </div>
          )}
        </div>

        {/* NAVIGATION LEISTE */}
        <nav className="relative z-10 border-t border-white/10 pt-4">
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
                  className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-black transition-all shadow-md border ${
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
                  {link.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>

      {/* HAUPTINHALT DER ÖFFENTLICHEN UNTERSEITEN */}
      <main className="relative z-10 w-full">{children}</main>
    </div>
  )
}