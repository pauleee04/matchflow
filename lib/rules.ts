export type RuleSection = {
  id: string
  title: string
  rules: string[]
}

export type RulesDocument = {
  title: string
  intro: string
  sections: RuleSection[]
}

function section(
  id: string,
  title: string,
  rules: string[],
): RuleSection {
  return { id, title, rules }
}

const generalSections: RuleSection[] = [
  section('fairplay', 'Fairplay und Verhalten', [
    'Alle Teilnehmer verhalten sich fair, respektvoll und sportlich gegenüber Gegnern, Helfern und Veranstaltern.',
    'Beleidigungen, absichtliche Störungen, Betrugsversuche oder die Manipulation von Ergebnissen werden nicht toleriert.',
    'Anweisungen der Turnierleitung sind zu befolgen. Bei wiederholten oder schweren Verstößen kann ein Team verwarnt, disqualifiziert oder vom Turnier ausgeschlossen werden.',
  ]),

  section('ablauf', 'Ablauf und Pünktlichkeit', [
    'Teams informieren sich selbstständig über Spielplan, Spielort, Tisch beziehungsweise Spielfeld und angesetzte Startzeit.',
    'Bitte mindestens 10–15 Minuten vor dem ersten Spiel einchecken und während des Turniers erreichbar bleiben.',
    'Verspätungen müssen der Turnierleitung unverzüglich gemeldet werden. Bei mehr als 10 Minuten unentschuldigter Verspätung kann die Turnierleitung das Spiel werten oder eine andere angemessene Entscheidung treffen.',
    'Ergebnisse sind unmittelbar nach Spielende korrekt zu melden. Einwände müssen vor Beginn des nächsten Spiels beziehungsweise unverzüglich nach Bekanntwerden vorgebracht werden.',
  ]),

  section('wertung', 'Spielwertung und Gleichstand', [
    'Es gelten der veröffentlichte Spielplan und das auf der Turnierseite angegebene Format, zum Beispiel Gruppenphase, Schweizer System oder K.-o.-Phase.',
    'Sofern für die Gruppenphase nichts anderes angegeben ist, gilt als Standardwertung: Sieg = 3 Punkte, Unentschieden = 1 Punkt, Niederlage = 0 Punkte.',
    'Bei Punktgleichheit entscheiden – soweit für die Sportart passend – zuerst direkte Begegnung, danach Differenz beziehungsweise Satz-/Spielverhältnis, anschließend erzielte Punkte/Tore und zuletzt eine Entscheidung der Turnierleitung.',
    'In einer K.-o.-Runde muss ein Sieger feststehen. Die sportartspezifische Entscheidung bei Gleichstand wird vor dem Spiel durch die Turnierleitung festgelegt.',
  ]),

  section('entscheidungen', 'Streitfälle und Entscheidungen', [
    'Unklare Situationen sollen zunächst ruhig zwischen den beteiligten Teams geklärt werden. Bei keiner Einigung wird die Turnierleitung hinzugezogen.',
    'Die Turnierleitung entscheidet über nicht ausdrücklich geregelte Fälle unter Berücksichtigung von Fairness, Sicherheit und Gleichbehandlung.',
    'Die Turnierleitung kann Regeln vor Turnierbeginn präzisieren, muss Änderungen aber allen betroffenen Teams mitteilen. Nach Beginn sollen Regeln nicht rückwirkend zum Nachteil eines Teams geändert werden.',
  ]),
]

const sportSections: Record<string, RuleSection[]> = {
  bierpong: [
    section('bierpong-aufbau', 'Bierpong – Aufbau und Spielablauf', [
      'Ein Team besteht standardmäßig aus zwei Spielern. Abweichende Teamgrößen legt die Turnierleitung vor Turnierbeginn fest.',
      'Pro Seite werden standardmäßig 10 Becher in Dreiecksform aufgestellt. Wasser- oder Getränkemenge sowie Becheraufbau müssen für beide Seiten gleich sein.',
      'Jedes Team hat pro Zug zwei Würfe; die Spieler eines Teams werfen abwechselnd. Die Turnierleitung kann für das Event eine abweichende Wurfregel festlegen.',
      'Ein Treffer zählt, wenn der Tischtennisball regelgerecht in einem Becher landet. Der getroffene Becher wird aus dem Spiel genommen.',
      'Becher dürfen nicht vorzeitig verschoben, festgehalten oder entfernt werden. Ein versehentlich umgestoßener Becher wird nach der vor Turnierbeginn bekanntgegebenen Hausregel behandelt.',
    ]),

    section('bierpong-hausregeln', 'Bierpong – Hausregeln und Spielende', [
      'Re-Racks, Bounce-Würfe, Fingern beziehungsweise Pusten, Wiederholungswürfe und Sondertreffer gelten nur, wenn sie von der Turnierleitung vor dem Spiel ausdrücklich zugelassen wurden.',
      'Wenn der letzte Becher getroffen wird, wird das Spiel nach der für das Turnier veröffentlichten Endregel entschieden. Eine mögliche Nachwurf- oder Redemption-Regel muss vor Spielbeginn bekannt sein.',
      'Es ist nicht erlaubt, gegnerische Würfe absichtlich zu behindern oder Becher beziehungsweise Bälle des Gegners unzulässig zu berühren.',
      'Alkohol ist nicht Voraussetzung für die Teilnahme. Veranstalter und Teilnehmer müssen alle geltenden Alters-, Sicherheits- und Hausregeln beachten.',
    ]),
  ],

  fussball: [
    section('fussball-format', 'Fußball – Spielregeln und Format', [
      'Teamgröße, Spielfeld, Spielzeit, Auswechslungen und Abseitsregel richten sich nach der für dieses Turnier veröffentlichten Ausschreibung. Fehlt eine Angabe, entscheidet die Turnierleitung vor Anpfiff und informiert beide Teams.',
      'Der Anstoß und die Seitenwahl werden vor Spielbeginn durch Los oder Absprache entschieden. Das Spiel beginnt und endet auf Zeichen des Schiedsrichters beziehungsweise der eingeteilten Spielleitung.',
      'Fouls, Handspiel, unsportliches Verhalten und gefährliches Spiel werden durch die Spielleitung geahndet. Entscheidungen auf dem Spielfeld sind zu respektieren.',
      'Sofern nicht anders angegeben, erhält das Siegerteam in der Gruppenphase 3 Punkte, bei Unentschieden beide Teams je 1 Punkt und bei einer Niederlage 0 Punkte.',
    ]),

    section('fussball-gleichstand', 'Fußball – Gleichstand und K.-o.-Spiele', [
      'Bei Punktgleichheit in der Gruppenphase gelten die veröffentlichten Kriterien. Standardvorschlag: direkte Begegnung, Tordifferenz, erzielte Tore, danach Entscheidung durch die Turnierleitung oder ein kurzes Entscheidungsspiel.',
      'In K.-o.-Spielen muss ein Sieger feststehen. Standardvorschlag für kurze Turniere: direktes Elfmeterschießen beziehungsweise ein vorher festgelegtes Penalty-Verfahren, sofern keine Verlängerung vorgesehen ist.',
      'Schienbeinschoner und geeignetes Schuhwerk werden empfohlen; gefährlicher Schmuck und Gegenstände sind abzulegen.',
    ]),
  ],

  dart: [
    section('darts-format', 'Darts – Modus und Ablauf', [
      'Standardvorlage: 501 Punkte, Double-Out und Best-of-3 Legs. Falls im Turnierplan ein anderer Modus steht, zum Beispiel 301 oder Straight-Out, gilt der dort angegebene Modus.',
      'Die Startreihenfolge wird durch Ausbullen oder ein von der Turnierleitung festgelegtes Losverfahren bestimmt. Danach wechseln die Spieler entsprechend dem Spielmodus ihre Aufnahmen.',
      'Ein Leg muss exakt auf null beendet werden und beim Double-Out mit einem Doppelfeld enden. Überwerfen beendet die Aufnahme; der Punktestand wird auf den Stand vor der Aufnahme zurückgesetzt.',
      'Die Spieler kontrollieren ihren Punktestand gegenseitig. Ein Wurf zählt, sobald die Darts geworfen wurden; herausfallende Darts werden nur nach den vor Spielbeginn bekanntgegebenen Regeln gewertet.',
    ]),

    section('darts-fairplay', 'Darts – Fairplay und Sicherheit', [
      'Während der Aufnahme des Gegners wird nicht geworfen und nicht vor der Abwurflinie gestanden.',
      'Darts werden erst aus der Scheibe gezogen, nachdem der Punktestand bestätigt wurde.',
      'Bei Streit über Treffer oder Zählung wird vor dem Herausziehen der Darts die Spielleitung gerufen. Nach dem Herausziehen ist eine Prüfung nur möglich, soweit der Sachverhalt noch eindeutig feststellbar ist.',
    ]),
  ],

  rocket_league: [
    section('rl-format', 'Rocket League – Matchformat', [
      'Standardvorlage: 3 gegen 3, fünf Minuten reguläre Spielzeit pro Runde und Best-of-1 in der Gruppenphase. In der K.-o.-Phase kann Best-of-3 verwendet werden, wenn dies im Spielplan angekündigt ist.',
      'Die tatsächlich eingestellte Lobby, Teamzuordnung, Serverregion und Spielzeit werden vor Turnierbeginn durch die Turnierleitung bekanntgegeben.',
      'Ein Unentschieden nach regulärer Spielzeit wird durch die im Spiel vorgesehene Verlängerung entschieden. Es gelten die offiziellen Spielmechaniken der verwendeten Rocket-League-Version.',
      'Teams treten rechtzeitig mit den angemeldeten Spielern an. Nicht angemeldete Spieler, Smurfing oder die Nutzung unerlaubter Hilfsmittel sind untersagt.',
    ]),

    section('rl-verbindung', 'Rocket League – Verbindungsprobleme und Fairplay', [
      'Bei Disconnects, Serverproblemen oder einem Lobbyfehler pausieren die Teams, soweit möglich, und informieren sofort die Turnierleitung. Das Match darf nicht eigenmächtig neu gestartet werden.',
      'Ob eine Wiederholung stattfindet, ob die verbleibende Zeit nachgespielt wird oder ob das Ergebnis bestehen bleibt, entscheidet die Turnierleitung anhand der Spielsituation und der geltenden Veranstalterregel.',
      'Absichtliches Zeitspiel, Beleidigungen und Störungen außerhalb des normalen Spiels können zu Verwarnungen oder zur Disqualifikation führen.',
    ]),
  ],

  custom: [
    section('modus', 'Spielmodus und Bewertung', [
      'Die Turnierleitung veröffentlicht vor Beginn die Spielregeln, Teamgröße, Spiel- beziehungsweise Rundendauer, Wertung und den Turniermodus.',
      'Falls eine Angabe fehlt, muss sie vor dem ersten betroffenen Spiel von der Turnierleitung klargestellt werden. Teams sollen nicht davon ausgehen, dass eine nicht veröffentlichte Sonderregel automatisch gilt.',
      'Bei einer Gruppenphase gilt standardmäßig Sieg = 3 Punkte, Unentschieden = 1 Punkt, Niederlage = 0 Punkte, soweit diese Wertung zur Sportart passt.',
      'In einer K.-o.-Runde muss ein Sieger feststehen. Das Verfahren bei Gleichstand muss vor dem Spiel mitgeteilt werden.',
    ]),

    section('sicherheit', 'Sicherheit und Material', [
      'Teilnehmer verwenden nur zugelassenes, geeignetes Material und befolgen die Sicherheitsanweisungen des Veranstalters.',
      'Beschädigtes Material, unsichere Spielbedingungen oder Verletzungen sind sofort der Turnierleitung zu melden.',
      'Die Turnierleitung kann ein Spiel unterbrechen oder verlegen, wenn Sicherheit, Fairness oder die Funktionsfähigkeit des Spielortes beeinträchtigt sind.',
    ]),
  ],
}

export function getTournamentTypeLabel(
  type: string | null | undefined,
) {
  switch ((type ?? '').toLowerCase()) {
    case 'bierpong':
      return 'Bierpong'

    case 'fussball':
    case 'fußball':
      return 'Fußball'

    case 'dart':
    case 'darts':
      return 'Darts'

    case 'rocket_league':
      return 'Rocket League'

    default:
      return 'Eigenes Turnier'
  }
}

export function getDefaultRules(
  type: string | null | undefined,
  tournamentName?: string | null,
): RulesDocument {
  const normalizedType = (type ?? '').toLowerCase()
  const typeSections =
    sportSections[normalizedType] ?? sportSections.custom

  const label = getTournamentTypeLabel(normalizedType)

  return {
    title: `${label} – Turnierregeln`,

    intro: `Diese Regelvorlage gilt für ${
      tournamentName?.trim() || 'dieses Turnier'
    }. Sie enthält sinnvolle Ausgangsregeln und kann von der Turnierleitung angepasst werden. Die konkrete Turnierausschreibung und die vor Spielbeginn bekanntgegebenen Hausregeln haben Vorrang.`,

    sections: [
      ...generalSections.map((item) => ({
        ...item,
        rules: [...item.rules],
      })),

      ...typeSections.map((item) => ({
        ...item,
        rules: [...item.rules],
      })),
    ],
  }
}

export function normalizeRuleSections(
  value: unknown,
): RuleSection[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const sections: RuleSection[] = []

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      return null
    }

    const item = raw as {
      id?: unknown
      title?: unknown
      rules?: unknown
    }

    if (
      typeof item.title !== 'string' ||
      !Array.isArray(item.rules)
    ) {
      return null
    }

    sections.push({
      id:
        typeof item.id === 'string'
          ? item.id
          : `section-${sections.length + 1}`,

      title: item.title,

      rules: item.rules.filter(
        (rule): rule is string =>
          typeof rule === 'string',
      ),
    })
  }

  return sections
}