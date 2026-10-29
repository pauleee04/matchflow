'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { publicSupabase } from '@/lib/supabase'

type TournamentItem = {
  id: number
  name: string
  slug: string
  type: string
  status: string
  created_at: string
  owner_id?: string | null
}

export default function AdminIndexPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tournaments, setTournaments] = useState<TournamentItem[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('bierpong')
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Auth Status & Turniere laden
  useEffect(() => {
    async function initAdminPortal() {
      try {
        const { data: authData } = await publicSupabase.auth.getUser()

        if (!authData.user) {
          router.push('/admin/login')
          return
        }

        setCurrentUser(authData.user)

        // Nur Turniere laden, die diesem User gehören
        const { data, error } = await publicSupabase
          .from('tournaments')
          .select('id, name, slug, type, status, created_at, owner_id')
          .eq('owner_id', authData.user.id)
          .order('created_at', { ascending: false })

        if (!error && data) {
          setTournaments(data)
        }
      } catch (err) {
        console.error('Ladefehler Admin-Portal:', err)
      } finally {
        setLoading(false)
      }
    }

    void initAdminPortal()
  }, [router])

  async function handleLogout() {
    await publicSupabase.auth.signOut()
    router.push('/admin/login')
  }

  async function handleCreateTournament(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !currentUser) return

    setCreating(true)
    setErrorMessage(null)

    try {
      const generatedSlug = newName
        .toLowerCase()
        .trim()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .concat('-', Math.floor(1000 + Math.random() * 9000).toString())

      const payload = {
        name: newName.trim(),
        slug: generatedSlug,
        type: newType || 'bierpong',
        status: 'active',
        primary_color: '#f59e0b',
        background_style: 'dark',
        owner_id: currentUser.id,
      }

      const { data, error } = await publicSupabase
        .from('tournaments')
        .insert([payload])
        .select()

      if (error) throw error

      if (data && data.length > 0) {
        router.push(`/admin/${data[0].slug}`)
      }
    } catch (err: any) {
      console.error('Erstellungsfehler:', err)
      setErrorMessage(err?.message || 'Fehler beim Erstellen des Turniers.')
    } finally {
      setCreating(false)
    }
  }

  async function deleteTournament(id: number, name: string) {
    if (!confirm(`Möchtest du das Turnier "${name}" wirklich unwiderruflich löschen?`)) return

    try {
      const { error } = await publicSupabase.from('tournaments').delete().eq('id', id)
      if (error) throw error
      setTournaments((prev) => prev.filter((t) => t.id !== id))
    } catch (err: any) {
      alert(`Fehler beim Löschen: ${err?.message || 'Unbekannter Fehler'}`)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-800 border-t-amber-500" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Prüfe Veranstalter-Sitzung …
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16 text-slate-100">
      {/* HEADER WITH USER LOGOUT */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
            Veranstalter Control Panel
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5">
            Meine Turniere
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Eingeloggt als: <span className="font-bold text-white">{currentUser?.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:text-white backdrop-blur-md"
          >
            Abmelden
          </button>
          <Link
            href="/"
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-white/20 hover:text-white backdrop-blur-md"
          >
            ← Plattform
          </Link>
        </div>
      </section>

      {/* NEUES TURNIER ERSTELLEN */}
      <section className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
        <h2 className="text-lg font-black tracking-tight text-white">Neues Turnier anlegen</h2>

        {errorMessage && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-bold text-red-300 backdrop-blur-md">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleCreateTournament} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Turniername *
            </label>
            <input
              type="text"
              required
              placeholder="z. B. Sommer-Cup 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            />
          </div>

          <div className="w-full sm:w-48">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Sportart
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-bold text-white focus:border-white/30 focus:outline-none"
            >
              <option value="bierpong">🍺 Bierpong</option>
              <option value="fussball">⚽ Fußball</option>
              <option value="tennis">🎾 Tennis</option>
              <option value="basketball">🏀 Basketball</option>
              <option value="volleyball">🏐 Volleyball</option>
              <option value="dart">🎯 Darts</option>
              <option value="tischtennis">🏓 Tischtennis</option>
              <option value="kicker">⚽ Kicker</option>
              <option value="eishockey">🏒 Eishockey</option>
              <option value="rocket_league">🚗 Rocket League</option>
              <option value="sonstiges">🏆 Allgemein</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="rounded-2xl bg-amber-400 px-6 py-3 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-50 shadow-lg"
          >
            {creating ? 'Erstelle …' : '+ Turnier Erstellen'}
          </button>
        </form>
      </section>

      {/* EIGENE TURNIERE LISTE */}
      <section className="space-y-4">
        <h2 className="text-xl font-black tracking-tight text-white px-1">
          Deine verwaltsfähigen Turniere
        </h2>

        {tournaments.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-white/10 bg-slate-900/40 p-12 text-center text-xs font-bold text-slate-400 backdrop-blur-xl">
            Du hast noch keine Turniere angelegt. Erstelle oben dein erstes Turnier!
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl transition hover:border-amber-500/40"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
                    <span className="tracking-wider">{t.type}</span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-400">
                      {t.status}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-black tracking-tight text-white">{t.name}</h3>
                  <p className="mt-1 font-mono text-xs text-slate-400">/turnier/{t.slug}</p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                  <Link
                    href={`/admin/${t.slug}`}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-black text-amber-300 transition hover:bg-amber-500/20"
                  >
                    Verwalten →
                  </Link>

                  <button
                    type="button"
                    onClick={() => deleteTournament(t.id, t.name)}
                    className="text-xs font-bold text-red-400 hover:underline"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}