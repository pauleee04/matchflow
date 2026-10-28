export type SportType =
  | 'bierpong'
  | 'fussball'
  | 'tennis'
  | 'basketball'
  | 'volleyball'
  | 'dart'
  | 'tischtennis'
  | 'kicker'
  | 'eishockey'
  | 'rocket_league'
  | 'sonstiges'

export type SportConfig = {
  id: SportType
  name: string
  emoji: string
  scoreUnit: string // z.B. "Tore", "Punkte", "Becher", "Legs", "Sätze"
  scoreShort: string
  periodType: 'halves' | 'quarters' | 'sets' | 'periods' | 'cups' | 'legs' | 'none'
  periodNames: string[]
  defaultPeriodDurationMin?: number
  defaultRulesPreset: string
  scoringRules: {
    winPoints: number
    drawPoints: number
    allowDraw: boolean
    hasOvertime: boolean
    customNotice?: string
  }
}

export const SPORTS_CONFIG: Record<SportType, SportConfig> = {
  bierpong: {
    id: 'bierpong',
    name: 'Bierpong',
    emoji: '🍺',
    scoreUnit: 'Getroffene Becher',
    scoreShort: 'Becher',
    periodType: 'cups',
    periodNames: ['Hauptspiel', 'Verlängerung (3 Becher)'],
    defaultRulesPreset: `1. Aufbau: 10 Becher in Pyramidenform pro Seite.
2. Würfe: 2 Würfe pro Team & Runde. "Balls Back" bei Doppel-Treffer.
3. Bouncer: Zählt als 2 Becher (darf weggeschlagen werden).
4. Reroll: 2x Umstellen pro Spiel erlaubt.
5. Overtime: Bei Gleichstand wird mit 3 Bechern nachgespielt.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: true,
      customNotice: 'Sieger ist, wer zuerst alle gegnerischen Becher abräumt.',
    },
  },

  fussball: {
    id: 'fussball',
    name: 'Fußball',
    emoji: '⚽',
    scoreUnit: 'Tore',
    scoreShort: 'Tore',
    periodType: 'halves',
    periodNames: ['1. Halbzeit', '2. Halbzeit'],
    defaultPeriodDurationMin: 10,
    defaultRulesPreset: `1. Spieldauer: 2x 10 Minuten (oder nach Absprache).
2. Punkte: Sieg 3 Pkt, Unentschieden 1 Pkt, Niederlage 0 Pkt.
3. Wertung: 1. Punkte, 2. Tordifferenz, 3. Erzielte Tore, 4. Direkter Vergleich.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 1,
      allowDraw: true,
      hasOvertime: false,
    },
  },

  tennis: {
    id: 'tennis',
    name: 'Tennis',
    emoji: '🎾',
    scoreUnit: 'Gewonnene Sätze',
    scoreShort: 'Sätze',
    periodType: 'sets',
    periodNames: ['1. Satz', '2. Satz', '3. Satz (Match-Tiebreak)'],
    defaultRulesPreset: `1. Zählweise im Game: 15, 30, 40, Game.
2. Zählweise im Satz: Zuerst 6 Spiele mit 2 Spielen Vorsprung (bei 6:6 Tiebreak bis 7).
3. Modus: Best of 3 Sätze (3. Satz als Match-Tiebreak bis 10 Punkte).`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: true,
      customNotice: 'Zählweise folgt dem offiziellen Tennis-Satz-System.',
    },
  },

  basketball: {
    id: 'basketball',
    name: 'Basketball / 3x3',
    emoji: '🏀',
    scoreUnit: 'Punkte',
    scoreShort: 'Punkte',
    periodType: 'quarters',
    periodNames: ['1. Viertel', '2. Viertel', '3. Viertel', '4. Viertel'],
    defaultPeriodDurationMin: 8,
    defaultRulesPreset: `1. Spieldauer: 4x 8 Minuten (oder 1x 10 Min bei 3x3).
2. Wertung: 1, 2 oder 3 Punkte pro Treffer.
3. Unentschieden: 2 Minuten Verlängerung, bis ein Sieger feststeht.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: true,
    },
  },

  volleyball: {
    id: 'volleyball',
    name: 'Volleyball / Beach-Volleyball',
    emoji: '🏐',
    scoreUnit: 'Gewonnene Sätze',
    scoreShort: 'Sätze',
    periodType: 'sets',
    periodNames: ['1. Satz', '2. Satz', '3. Satz (Entscheidungssatz)'],
    defaultRulesPreset: `1. Modus: Best of 3 Sätze.
2. Punkte: 1. & 2. Satz bis 25 Punkte (Rallye-Point-System, 2 Punkte Vorsprung).
3. 3. Satz (Tiebreak): Bis 15 Punkte.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: false,
    },
  },

  dart: {
    id: 'dart',
    name: 'Darts',
    emoji: '🎯',
    scoreUnit: 'Legs',
    scoreShort: 'Legs',
    periodType: 'legs',
    periodNames: ['Leg 1', 'Leg 2', 'Leg 3'],
    defaultRulesPreset: `1. Modus: 501 Double-Out (Best of 3 oder Best of 5 Legs).
2. Anwurf: Ausbullen vor dem ersten Leg.
3. Finish: Das Leg muss exakt mit einem Treffer im Doppel-Sektor beendet werden.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: false,
    },
  },

  tischtennis: {
    id: 'tischtennis',
    name: 'Tischtennis',
    emoji: '🏓',
    scoreUnit: 'Gewonnene Sätze',
    scoreShort: 'Sätze',
    periodType: 'sets',
    periodNames: ['1. Satz', '2. Satz', '3. Satz'],
    defaultRulesPreset: `1. Modus: Best of 3 oder Best of 5 Sätze.
2. Satzgewinn: Wer zuerst 11 Punkte erreicht (mit 2 Punkten Vorsprung).
3. Aufschlag: Wechselt alle 2 Punkte.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: false,
    },
  },

  kicker: {
    id: 'kicker',
    name: 'Tischkicker',
    emoji: '⚽',
    scoreUnit: 'Tore',
    scoreShort: 'Tore',
    periodType: 'sets',
    periodNames: ['1. Satz (bis 5)', '2. Satz (bis 5)'],
    defaultRulesPreset: `1. Modus: 2 Gewinnsätze bis 5 Tore.
2. Kurbeln: Mehr als 360-Grad-Drehungen sind verboten.
3. Teamwechsel: Nach jedem Satz werden die Seiten gewechselt.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: false,
    },
  },

  eishockey: {
    id: 'eishockey',
    name: 'Eishockey',
    emoji: '🏒',
    scoreUnit: 'Tore',
    scoreShort: 'Tore',
    periodType: 'periods',
    periodNames: ['1. Drittel', '2. Drittel', '3. Drittel'],
    defaultPeriodDurationMin: 15,
    defaultRulesPreset: `1. Spieldauer: 3x 15 Minuten.
2. Verlängerung / Penaltyschießen bei Gleichstand.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 1,
      allowDraw: true,
      hasOvertime: true,
    },
  },

  rocket_league: {
    id: 'rocket_league',
    name: 'Rocket League / E-Sports',
    emoji: '🚗',
    scoreUnit: 'Tore',
    scoreShort: 'Tore',
    periodType: 'sets',
    periodNames: ['Match 1', 'Match 2', 'Match 3 (Best of 3)'],
    defaultPeriodDurationMin: 5,
    defaultRulesPreset: `1. Modus: Best of 3 oder Best of 5 Matches (je 5 Min Spieldauer).
2. Overtime: Golden Goal bei Gleichstand nach Ablauf der Zeit.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 0,
      allowDraw: false,
      hasOvertime: true,
    },
  },

  sonstiges: {
    id: 'sonstiges',
    name: 'Allgemeines Turnier',
    emoji: '🏆',
    scoreUnit: 'Punkte',
    scoreShort: 'Punkte',
    periodType: 'none',
    periodNames: ['Hauptspiel'],
    defaultRulesPreset: `1. Fairplay steht an erster Stelle.
2. Der Sieger erhält 3 Punkte, Niederlage 0 Punkte.`,
    scoringRules: {
      winPoints: 3,
      drawPoints: 1,
      allowDraw: true,
      hasOvertime: false,
    },
  },
}

export function getSportConfig(type: string | null | undefined): SportConfig {
  const key = (type || '').toLowerCase().trim() as SportType
  return SPORTS_CONFIG[key] || SPORTS_CONFIG.sonstiges
}