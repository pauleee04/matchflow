'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { publicSupabase } from '@/lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // State für Passwort-Sichtbarkeit
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  function toggleRegisterMode(register: boolean) {
    setIsRegister(register)
    setErrorMessage(null)
    setSuccessMessage(null)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    // Validierung bei Registrierung
    if (isRegister && password !== confirmPassword) {
      setErrorMessage('Die eingegebenen Passwörter stimmen nicht überein.')
      return
    }

    setLoading(true)

    try {
      if (isRegister) {
        const { error } = await publicSupabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error

        setSuccessMessage('Konto erfolgreich erstellt! Du kannst dich jetzt anmelden.')
        toggleRegisterMode(false)
      } else {
        const { error } = await publicSupabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error

        router.push('/admin')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentifizierung fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white sm:p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl ring-1 ring-amber-500/30 transition hover:scale-105"
          >
            🏆
          </Link>
          <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
            {isRegister ? 'Veranstalter-Konto erstellen' : 'Veranstalter-Login'}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Melde dich an, um deine Turniere sicher zu verwalten.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-400">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-400">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {/* EMAIL FELD */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-400">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="veranstalter@domain.de"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* PASSWORT FELD MIT SICHTBARKEITSSCHALTER */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-400">
                Passwort
              </label>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-4 pr-11 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition p-1"
                  title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* PASSWORT BESTÄTIGEN (NUR BEI REGISTRIERUNG) */}
            {isRegister && (
              <div>
                <label className="block text-xs font-black uppercase text-slate-400">
                  Passwort bestätigen
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-4 pr-11 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition p-1"
                    title={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-amber-500 py-3.5 text-xs font-black text-slate-950 shadow-lg transition hover:bg-amber-400 disabled:opacity-50 mt-2"
            >
              {loading
                ? 'Verarbeite …'
                : isRegister
                ? 'Jetzt Konto erstellen'
                : 'Anmelden'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs font-bold text-slate-400">
            {isRegister ? (
              <button
                type="button"
                onClick={() => toggleRegisterMode(false)}
                className="text-amber-400 hover:underline"
              >
                Bereits ein Konto? Hier anmelden
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toggleRegisterMode(true)}
                className="text-amber-400 hover:underline"
              >
                Noch kein Konto? Jetzt registrieren
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}