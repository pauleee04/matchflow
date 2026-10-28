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
        owner_id: currentUser.id, // Verknüpfung mit dem eingeloggten Veranstalter
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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white font-bold text-sm">
        Prüfe Veranstalter-Sitzung …
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* HEADER WITH USER LOGOUT */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-6">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-amber-500">
              Veranstalter Control Panel
            </span>
            <h1 className="text-3xl font-black sm:text-4xl">Meine Turniere</h1>
            <p className="mt-1 text-xs text-slate-400">
              Eingeloggt als: <span className="font-bold text-white">{currentUser?.email}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              Abmelden
            </button>
            <Link
              href="/"
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              ← Plattform
            </Link>
          </div>
        </div>

        {/* NEUES TURNIER ERSTELLEN */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur-md sm:p-8">
          <h2 className="text-lg font-black tracking-tight">Neues Turnier anlegen</h2>

          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs font-bold text-red-300">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleCreateTournament} className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-black uppercase text-slate-400">Turniername *</label>
              <input
                type="text"
                required
                placeholder="z. B. Sommer-Cup 2026"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="w-full sm:w-48">
              <label className="block text-xs font-black uppercase text-slate-400">Sportart</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
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
              className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {creating ? 'Erstelle …' : '+ Turnier Erstellen'}
            </button>
          </form>
        </div>

        {/* EIGENE TURNIERE LISTE */}
        <div className="space-y-4">
          <h2 className="text-xl font-black tracking-tight">Deine verwaltsfähigen Turniere</h2>

          {tournaments.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-xs font-bold text-slate-500">
              Du hast noch keine Turniere angelegt. Erstelle oben dein erstes Turnier!
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 transition hover:border-amber-500/50"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                      <span className="uppercase">{t.type}</span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-400">
                        {t.status}
                      </span>
                    </div>

                    <h3 className="mt-2 text-lg font-black tracking-tight">{t.name}</h3>
                    <p className="mt-1 font-mono text-xs text-slate-500">/turnier/{t.slug}</p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4">
                    <Link
                      href={`/admin/${t.slug}`}
                      className="rounded-xl bg-amber-500/10 px-3.5 py-2 text-xs font-black text-amber-400 transition hover:bg-amber-500/20"
                    >
                      Verwalten →
                    </Link>

                    <button
                      type="button"
                      onClick={() => deleteTournament(t.id, t.name)}
                      className="text-xs font-bold text-red-500 hover:underline"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}