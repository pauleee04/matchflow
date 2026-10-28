'use client'

import { useEffect, useMemo, useState } from 'react'
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

type TournamentData = {
  id: number
  name: string
  slug: string
  primary_color: string | null
  rules?: RuleItem[] | null
}

const PRESETS: Record<string, { label: string; rules: RuleItem[] }> = {
  beerpong: {
    label: '🍺 Beer Pong (Offiziell & Fun)',
    rules: [
      {
        id: 'bp-1',
        category: 'gameplay',
        title: 'Ellbogen-Regel (Elbow Rule)',
        description:
          'Der Ellbogen des werfenden Spielers muss beim Abwurf hinter der Tischkante verbleiben. Wurf zählt nicht, falls der Ellbogen die Kante überragt.',
        enabled: true,
      },
      {
        id: 'bp-2',
        category: 'gameplay',
        title: 'Re-Racks / Umstellen',
        description:
          'Jedes Team darf 2x pro Spiel ein Umstellen der Becher (Re-Rack) verlangen (z. B. Pyramide, Diamant, Linie). Das Umstellen erfolgt jeweils vor Beginn des eigenen Zuges.',
        enabled: true,
      },
      {
        id: 'bp-3',
        category: 'gameplay',
        title: 'Bounce Shot / Aufsetzer',
        description:
          'Ein Ball, der vor dem Becher die Tischoberfläche berührt und trifft, zählt als 2 Becher. Der verteidigende Spieler darf Aufsetzer-Bälle abwehren (wegschlagen/fangen).',
        enabled: true,
      },
      {
        id: 'bp-4',
        category: 'gameplay',
        title: 'Heating Up & On Fire',
        description:
          'Trifft ein Spieler 2-mal in Folge, darf er "Heating Up" rufen. Trifft er das 3. Mal ("On Fire"), behält er die Bälle und darf sofort erneut werfen.',
        enabled: true,
      },
      {
        id: 'bp-5',
        category: 'gameplay',
        title: 'Island / Insel-Call',
        description:
          '1x pro Spiel darf ein freistehender Becher (ohne direkten Kontakt zu anderen Bechern) als Insel angesagt werden. Trifft der Spieler die Insel, zählt sie doppelt. Trifft er einen anderen Becher, zählt dieser nicht.',
        enabled: true,
      },
      {
        id: 'bp-6',
        category: 'scoring',
        title: 'Rebuttal / Nachwurf-Chance',
        description:
          'Wurde der letzte Becher getroffen, hat das gegnerische Team noch die Chance auf einen Nachwurf (so viele Würfe wie Spieler). Treffen sie alle verbleibenden Becher, geht das Spiel in die Verlängerung (3 Becher Overtime).',
        enabled: true,
      },
      {
        id: 'bp-7',
        category: 'general',
        title: 'Fingern / Pusten',
        description:
          'Pusten oder Fingern, während der Ball im Becher kreist, ist nur erlaubt, wenn dies vor dem Spiel von beiden Teams explizit vereinbart wurde.',
        enabled: false,
      },
    ],
  },
  kicker: {
    label: '⚽ Tischfußball / Kicker',
    rules: [
      {
        id: 'k-1',
        category: 'gameplay',
        title: 'Kurbelverbot (360° Drehung)',
        description:
          'Das Durchdrehen der Figuren um mehr als 360° vor oder nach dem Ballkontakt ist strengstens untersagt. Ein Wackler/Schuss mit max. 360° ist erlaubt.',
        enabled: true,
      },
      {
        id: 'k-2',
        category: 'gameplay',
        title: 'Anstoß & Ballfreigabe',
        description:
          'Vor dem Anstoß auf der 5er-Reihe muss der ballbesitzende Spieler den Gegner fragen, ob er bereit ist. Erst nach Rückmeldung darf gepasst oder geschossen werden.',
        enabled: true,
      },
      {
        id: 'k-3',
        category: 'scoring',
        title: 'Tore aus dem Tor herausspringen',
        description:
          'Geht ein Ball ins Tor und springt wieder heraus, zählt das Tor trotzdem als regulärer Treffer.',
        enabled: true,
      },
      {
        id: 'k-4',
        category: 'penalties',
        title: 'Tischanschlag / Erschütterung',
        description:
          'Absichtliches Anschlagen, Anheben oder Verrücken des Tisches führt zum Ballverlust und Ballbesitz für den Gegner.',
        enabled: true,
      },
    ],
  },
  darts: {
    label: '🎯 Darts (501 Double Out)',
    rules: [
      {
        id: 'd-1',
        category: 'scoring',
        title: '501 Double-Out Modus',
        description:
          'Jeder Spieler startet mit 501 Punkten. Das Spiel muss exakt mit einem Treffer in ein Doppel-Feld (oder Bullseye) auf Null beendet werden.',
        enabled: true,
      },
      {
        id: 'd-2',
        category: 'gameplay',
        title: 'Bust / Überworfen-Regel',
        description:
          'Wirft ein Spieler mehr Punkte als verbleibend oder bleibt 1 Punkt übrig, gilt der Durchgang als "überworfen" (Bust) und die Punkte werden auf den Stand vor dem Wurf zurückgesetzt.',
        enabled: true,
      },
      {
        id: 'd-3',
        category: 'gameplay',
        title: 'Gültigkeit der Darts im Board',
        description:
          'Nur Darts, deren Spitze im Board stecken bleibt, bis der Spieler sie herauszieht, werden gewertet. Abpraller (Bouncer) zählen 0 Punkte.',
        enabled: true,
      },
      {
        id: 'd-4',
        category: 'general',
        title: 'Oche / Abwurflinie',
        description:
          'Der Spieler darf beim Wurf die Abwurflinie (Oche) nicht übertreten. Ein Übertreten führt zur Ungültigkeit der geworfenen Darts dieses Durchgangs.',
        enabled: true,
      },
    ],
  },
  general: {
    label: '🛡️ Allgemeine Fairplay- & Verhaltensregeln',
    rules: [
      {
        id: 'gen-1',
        category: 'general',
        title: 'Pünktlichkeit & Antreten',
        description:
          'Teams müssen spätestens 3 Minuten vor dem angesetzten Spieltermin am zugewiesenen Tisch/Platz erscheinen. Bei 5 Minuten Verspätung wird das Spiel gewertet.',
        enabled: true,
      },
      {
        id: 'gen-2',
        category: 'general',
        title: 'Schiedsrichter & Turnierleitung',
        description:
          'Tatsachenentscheidungen der Schiedsrichter oder der Turnierleitung sind unanfechtbar und sofort zu akzeptieren.',
        enabled: true,
      },
      {
        id: 'gen-3',
        category: 'general',
        title: 'Sauberkeit & Material schonen',
        description:
          'Jedes Team ist verpflichtet, seinen Spielbereich sauber zu hinterlassen und das gestellt Equipment pfleglich zu behandeln.',
        enabled: true,
      },
    ],
  },
}

export default function AdminRegelnPage() {
  const params = useParams()
  const rawSlug = (params?.slug as string) || ''

  const slug = useMemo(() => {
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  }, [rawSlug])

  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [rules, setRules] = useState<RuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('beerpong')
  const [activeTab, setActiveTab] = useState<RuleCategory | 'all'>('all')

  // Neue Regel State
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState<RuleCategory>('gameplay')

  useEffect(() => {
    void loadData()
  }, [slug, rawSlug])

  async function triggerBroadcast(tournamentId: number) {
    const channel = supabase.channel(`tournament:${tournamentId}`)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.send({
          type: 'broadcast',
          event: 'refresh',
          payload: { updated: Date.now() },
        })
      }
    })
  }

  async function loadData() {
    if (!slug && !rawSlug) return
    setLoading(true)
    setStatusMessage(null)

    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, slug, primary_color, rules')
        .or(`slug.eq.${slug},slug.eq.${rawSlug}`)
        .maybeSingle()

      if (error) throw error
      
      if (!data) {
        setStatusMessage({
          type: 'error',
          text: 'Turnier konnte nicht gefunden werden.',
        })
        return
      }

      setTournament(data as TournamentData)

      if (data.rules && Array.isArray(data.rules) && data.rules.length > 0) {
        setRules(data.rules as RuleItem[])
      } else {
        setRules(PRESETS.general.rules)
      }
    } catch (err: any) {
      console.error('Fehler beim Laden der Regeln:', err)
      
      // Fallback: Wenn die 'rules' Spalte in DB fehlt
      if (err?.message?.includes('rules')) {
        setStatusMessage({
          type: 'error',
          text: 'Hinweis: Bitte erstelle in Supabase in der Tabelle "tournaments" die Spalte "rules" vom Typ "jsonb".',
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'Fehler beim Laden der Regeln.',
        })
      }
      setRules(PRESETS.general.rules)
    } finally {
      setLoading(false)
    }
  }

  function handleApplyPreset(mode: 'replace' | 'append') {
    const preset = PRESETS[selectedPresetKey]
    if (!preset) return

    if (
      mode === 'replace' &&
      rules.length > 0 &&
      !confirm('Möchtest du alle bisherigen Regeln durch die gewählte Vorlage ersetzen?')
    ) {
      return
    }

    const newItems = preset.rules.map((r, i) => ({
      ...r,
      id: `rule-${Date.now()}-${i}`,
    }))

    if (mode === 'replace') {
      setRules(newItems)
    } else {
      setRules((prev) => [...prev, ...newItems])
    }

    setStatusMessage({
      type: 'success',
      text: `Vorlage "${preset.label}" geladen (${mode === 'replace' ? 'Ersetzt' : 'Angehängt'}).`,
    })
  }

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    )
  }

  function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  function updateRuleContent(id: string, field: 'title' | 'description', val: string) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
    )
  }

  function handleAddCustomRule() {
    if (!newTitle.trim()) {
      setStatusMessage({ type: 'error', text: 'Bitte gib einen Titel ein.' })
      return
    }

    const item: RuleItem = {
      id: `custom-${Date.now()}`,
      category: newCategory,
      title: newTitle.trim(),
      description: newDesc.trim(),
      enabled: true,
    }

    setRules((prev) => [...prev, item])
    setNewTitle('')
    setNewDesc('')
    setStatusMessage({ type: 'success', text: 'Neue Regel hinzugefügt.' })
  }

  async function handleSave() {
    if (!tournament?.id) return
    setSaving(true)
    setStatusMessage(null)

    try {
      const { error } = await supabase
        .from('tournaments')
        .update({ rules })
        .eq('id', tournament.id)

      if (error) throw error

      await triggerBroadcast(tournament.id)
      setStatusMessage({
        type: 'success',
        text: 'Regelwerk erfolgreich gespeichert und live aktualisiert!',
      })
    } catch (err: any) {
      console.error(err)
      setStatusMessage({
        type: 'error',
        text: `Fehler beim Speichern: ${err.message}. Stelle sicher, dass die Spalte "rules" (jsonb) in Supabase existiert.`,
      })
    } finally {
      setSaving(false)
    }
  }

  const primaryColor = tournament?.primary_color || '#22c55e'

  const filteredRules = rules.filter((r) =>
    activeTab === 'all' ? true : r.category === activeTab,
  )

  const categoryLabels: Record<RuleCategory, string> = {
    general: '🛡️ Allgemein & Verhalten',
    gameplay: '🎮 Spielablauf',
    scoring: '🎯 Punkte & Wertung',
    penalties: '⚠️ Strafen & Verstöße',
  }

  if (loading) {
    return <div className="p-8 text-center font-bold text-slate-400 text-xs">Lade Regelwerk …</div>
  }

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div
          className={`rounded-2xl border p-4 text-xs font-extrabold backdrop-blur-md ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
              : 'border-red-500/30 bg-red-500/20 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* REGEL-VORLAGEN SCHNELL-SELEKTOR */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-lg backdrop-blur-xl space-y-4">
        <div className="border-b border-white/10 pb-4">
          <span
            className="text-[10px] font-black uppercase tracking-wider"
            style={{ color: primaryColor }}
          >
            Sportarten-Vorlagen
          </span>
          <h2 className="mt-1 text-xl font-black text-white">
            Vordefinierte Regelwerke laden
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Wähle eine Sportart aus, um etablierte Turnierregeln automatisch einzufügen.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={selectedPresetKey}
            onChange={(e) => setSelectedPresetKey(e.target.value)}
            className="flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
          >
            {Object.entries(PRESETS).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApplyPreset('replace')}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-300 hover:bg-red-500/20 transition"
            >
              🔄 Ersetzen
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('append')}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-black text-white hover:bg-white/20 transition"
            >
              ➕ Hinzufügen
            </button>
          </div>
        </div>
      </section>

      {/* KATEGORIE FILTER & HINZUFÜGEN */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-lg backdrop-blur-xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">
              Aktuelles Regelwerk ({rules.length})
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Passe die einzelnen Paragraphen an oder deaktiviere einzelne Absätze.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !tournament}
            className="rounded-xl px-5 py-3 text-xs font-black text-slate-950 shadow-md transition hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? 'Speichere …' : '💾 Regelwerk Speichern'}
          </button>
        </div>

        {/* TABS */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              activeTab === 'all'
                ? 'bg-white text-slate-950'
                : 'bg-slate-950/60 text-slate-400 border border-white/5 hover:text-white'
            }`}
          >
            Alle ({rules.length})
          </button>
          {(['general', 'gameplay', 'scoring', 'penalties'] as RuleCategory[]).map(
            (cat) => {
              const count = rules.filter((r) => r.category === cat).length
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveTab(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                    activeTab === cat
                      ? 'bg-white text-slate-950'
                      : 'bg-slate-950/60 text-slate-400 border border-white/5 hover:text-white'
                  }`}
                >
                  {categoryLabels[cat]} ({count})
                </button>
              )
            },
          )}
        </div>

        {/* REGELN LISTE */}
        {filteredRules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center text-xs font-bold text-slate-500">
            Keine Regeln in dieser Kategorie vorhanden.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRules.map((rule) => (
              <div
                key={rule.id}
                className={`rounded-2xl border p-4 shadow-md backdrop-blur-md transition ${
                  rule.enabled
                    ? 'border-white/10 bg-slate-950/60'
                    : 'border-white/5 bg-slate-950/20 opacity-50'
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-lg bg-slate-900 border border-white/10 px-2.5 py-1 text-[10px] font-black text-slate-400">
                      {categoryLabels[rule.category]}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleRule(rule.id)}
                        className={`rounded-xl px-3 py-1 text-[10px] font-black transition ${
                          rule.enabled
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'Aktiv' : 'Deaktiviert'}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteRule(rule.id)}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-400 hover:bg-red-500/20 transition font-black text-xs"
                        title="Regel löschen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={rule.title}
                    onChange={(e) =>
                      updateRuleContent(rule.id, 'title', e.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm font-black text-white outline-none focus:border-emerald-500"
                    placeholder="Regel-Titel"
                  />

                  <textarea
                    rows={2}
                    value={rule.description}
                    onChange={(e) =>
                      updateRuleContent(rule.id, 'description', e.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-300 outline-none focus:border-emerald-500"
                    placeholder="Detaillierte Beschreibung der Regel …"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CUSTOM REGEL CREATOR */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-lg backdrop-blur-xl space-y-4">
        <h2 className="text-xl font-black text-white">Eigene Regel hinzufügen</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Kategorie
            </label>
            <select
              value={newCategory}
              onChange={(e) =>
                setNewCategory(e.target.value as RuleCategory)
              }
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
            >
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Regel-Titel
            </label>
            <input
              type="text"
              placeholder="z. B. Zeitlimit pro Spielzug"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
            Beschreibung / Paragraphentext
          </label>
          <textarea
            rows={2}
            placeholder="Erkläre die Regel verständlich für Teilnehmer und Schiedsrichter …"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={handleAddCustomRule}
          className="rounded-xl border border-white/10 bg-white/10 px-5 py-2.5 text-xs font-black text-white hover:bg-white/20 transition"
        >
          ➕ Regel zum Regelwerk hinzufügen
        </button>
      </section>
    </div>
  )
}