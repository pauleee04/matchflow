// Öffentliche Links im Admin-Layout (bleibt konstant sichtbar)
// const publicLinks = [
//   { href: `/turnier/${encodeURIComponent(slug)}`, label: '🌐 Turnierseite ↗' },
//   { href: `/turnier/${encodeURIComponent(slug)}/anmeldung`, label: '📝 Anmeldung ↗' },
//   { href: `/turnier/${encodeURIComponent(slug)}/beamer`, label: '📺 Beamer ↗' },
//   { href: `/turnier/${encodeURIComponent(slug)}/live`, label: '🔴 Live ↗' },
//   { href: `/turnier/${encodeURIComponent(slug)}/regeln`, label: '📜 Regeln ↗' },
//   { href: `/turnier/${encodeURIComponent(slug)}/sieger`, label: '🥇 Sieger ↗' },
//   { href: `/turnier/${encodeURIComponent(slug)}/stats`, label: '📈 Stats ↗' },
// ]

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
  background_style: string | null
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
        .select('id, name, slug, logo_url, primary_color, secondary_color, background_style')
        .or(`slug.eq."${slug}",slug.eq."${rawSlug}"`)
        .maybeSingle()

      if (data) {
        setTournament(data as TournamentData)
      }
    }
    void loadTournament()
  }, [slug, rawSlug])

  const triggerBroadcast = async () => {
    if (!tournament?.id) return
    const channel = publicSupabase.channel(`tournament:${tournament.id}`)
    await channel.send({
      type: 'broadcast',
      event: 'refresh',
      payload: { updated: Date.now() },
    })
    window.location.reload()
  }

  // Dynamische Admin-Farben mit grünem Fallback
  const primaryColor = tournament?.primary_color || '#22c55e'
  const secondaryColor = tournament?.secondary_color || '#10b981'

  const adminLinks = [
    { href: `/admin/${encodeURIComponent(slug)}`, label: '📊 Dashboard', exact: true },
    { href: `/admin/${encodeURIComponent(slug)}/einstellungen`, label: '⚙️ Einstellungen' },
    { href: `/admin/${encodeURIComponent(slug)}/gruppen`, label: '🧱 Gruppen' },
    { href: `/admin/${encodeURIComponent(slug)}/ko`, label: '🏆 K.-o.-Phase' },
    { href: `/admin/${encodeURIComponent(slug)}/regeln`, label: '📜 Regeln' },
    { href: `/admin/${encodeURIComponent(slug)}/spiele`, label: '⚽ Spiele' },
    { href: `/admin/${encodeURIComponent(slug)}/tabelle`, label: '📋 Tabelle' },
    { href: `/admin/${encodeURIComponent(slug)}/teams`, label: '👥 Teams' },
  ]

  const publicLinks = [
    { href: `/turnier/${encodeURIComponent(slug)}`, label: '🌐 Turnierseite ↗' },
    { href: `/turnier/${encodeURIComponent(slug)}/anmeldung`, label: '📝 Anmeldung ↗' },
    { href: `/turnier/${encodeURIComponent(slug)}/beamer`, label: '📺 Beamer ↗' },
    { href: `/turnier/${encodeURIComponent(slug)}/live`, label: '🔴 Live ↗' },
    { href: `/turnier/${encodeURIComponent(slug)}/regeln`, label: '📜 Regeln ↗' },
    { href: `/turnier/${encodeURIComponent(slug)}/sieger`, label: '🥇 Sieger ↗' },
    { href: `/turnier/${encodeURIComponent(slug)}/stats`, label: '📈 Stats ↗' },
  ]

  return (
    <div
      className="relative min-h-screen p-4 sm:p-6 lg:p-8 space-y-8 text-slate-100 transition-colors duration-500 bg-[#04120c]"
      style={{
        background: tournament?.background_style || `radial-gradient(circle at 50% 0%, ${primaryColor}25 0%, transparent 70%), radial-gradient(circle at 100% 100%, ${secondaryColor}18 0%, transparent 60%)`,
      }}
    >
      {/* GLOBAL OVERRIDE FÜR DIE TRANSPARENZ ALLER UNTERSEITEN-KARTEN */}
      <style>{`
        main section, 
        main .rounded-3xl, 
        main .rounded-2xl {
          background-color: rgba(6, 23, 16, 0.42) !important;
          backdrop-filter: blur(10px) !important;
          -webkit-backdrop-filter: blur(10px) !important;
          border-color: rgba(16, 185, 129, 0.18) !important;
        }
      `}</style>

      {/* 1. GROSSES ZENTRALES WASSERZEICHEN IM SEITENHINTERGRUND */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
        {tournament?.logo_url ? (
          <img
            src={tournament.logo_url}
            alt=""
            draggable={false}
            className="h-[650px] w-[650px] max-w-[80vw] max-h-[80vh] object-contain opacity-20 filter grayscale blur-[0.5px]"
          />
        ) : (
          <span
            className="select-none text-center font-black uppercase tracking-[0.12em] text-7xl sm:text-9xl opacity-10"
            style={{ color: primaryColor, lineHeight: 1 }}
          >
            {tournament?.name || 'ADMIN'}
          </span>
        )}
      </div>

      {/* 2. ADMIN CONTROL PANEL HEADER */}
      <header className="relative z-10 overflow-hidden rounded-3xl border border-emerald-500/20 bg-[#061710]/45 p-6 shadow-2xl backdrop-blur-md space-y-5">
        {/* TOP ROW: LOGO, TITEL & BUTTON */}
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {tournament?.logo_url ? (
              <img
                src={tournament.logo_url}
                alt={tournament.name || 'Logo'}
                className="h-16 w-16 rounded-2xl border border-emerald-500/30 bg-slate-900/90 object-contain p-1 shadow-lg sm:h-20 sm:w-20"
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
              <span
                className="inline-block rounded-md px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest shadow-sm"
                style={{
                  backgroundColor: `${primaryColor}25`,
                  color: primaryColor,
                  border: `1px solid ${primaryColor}40`,
                }}
              >
                Admin Control Panel
              </span>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl drop-shadow-sm">
                {tournament?.name ? `${tournament.name} (#${slug})` : `Turnier #${slug}`}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-950/40 px-4 py-2 text-xs font-extrabold text-slate-200 shadow-sm backdrop-blur-md transition hover:bg-emerald-900/50 hover:border-emerald-500/40"
            >
              ← Meine Turniere
            </Link>
          </div>
        </div>

        {/* DREIZEILIGE NAVIGATION */}
        <div className="relative z-10 flex flex-col gap-3.5 border-t border-emerald-500/20 pt-4">
          {/* REIHE 1: ADMIN SEITEN */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="mr-1 text-[10px] font-black uppercase tracking-wider"
              style={{ color: primaryColor }}
            >
              Admin:
            </span>
            {adminLinks.map((link) => {
              const decodedPath = decodeURIComponent(pathname)
              const decodedHref = decodeURIComponent(link.href)

              const isActive = link.exact
                ? decodedPath === decodedHref
                : decodedPath.startsWith(decodedHref)

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black transition-all shadow-sm"
                  style={{
                    backgroundColor: isActive ? primaryColor : 'rgba(6, 23, 16, 0.5)',
                    color: isActive ? '#022c22' : '#e2e8f0',
                    border: isActive ? `1px solid ${primaryColor}` : '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* REIHE 2: ÖFFENTLICHE SEITEN */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="mr-1 text-[10px] font-black uppercase tracking-wider"
              style={{ color: secondaryColor }}
            >
              Öffentlich:
            </span>
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold backdrop-blur-md transition-all border shadow-sm hover:scale-105"
                style={{
                  backgroundColor: `${secondaryColor}15`,
                  color: secondaryColor,
                  borderColor: `${secondaryColor}40`,
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* REIHE 3: SYSTEM AKTIONEN */}
          <div className="flex items-center justify-end border-t border-emerald-500/20 pt-2">
            <button
              type="button"
              onClick={triggerBroadcast}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-950/40 px-3.5 py-1.5 text-xs font-extrabold text-slate-200 shadow-sm backdrop-blur-md hover:bg-emerald-900/50 transition"
            >
              🔄 Live-Sync / Aktualisieren
            </button>
          </div>
        </div>
      </header>

      {/* HAUPTINHALT ALLER UNTERSEITEN (DASHBOARD, KO, GRUPPEN) */}
      <main className="relative z-10">{children}</main>
    </div>
  )
}