import { describe, expect, it } from 'vitest'
import {
  BRAND_ACCEPTANCE_VIEW,
  type BrandNavSession,
  acceptTargets,
  chapterEffortMinutes,
  chapterRemainingMinutes,
  countChapterSessions,
  countOpenFindings,
  decideAutoAdvance,
  dismissReasonValid,
  isAcceptanceView,
  needsOpeningTurn,
  openingAdvanceAllowed,
  resolveAcceptanceStage,
  resolveActiveSession,
  resolveContinueTarget,
  restartWordMatches,
} from '../shared/brandWorkspaceNav'
import { BRAND_SLOTS, slotIsConfirmable, slotsForStep } from '../shared/slotRegistry'
import { brandStepCompletion } from '../shared/brandJourney'

/**
 * DIE VIER RECHNUNGEN DER SESSION-NAVIGATION (BW2 Paket 3c-i).
 *
 * Sie sind der Grund, warum die Werkstatt-Seite trotz 2000 Zeilen prüfbar
 * bleibt: „welche Session ist offen", „darf jetzt gewechselt werden" und „was
 * steht im Zähler" sind Fragen mit einer Antwort, und die Antwort hängt nicht
 * an einer montierten Komponente. Jede Gegenprobe hier ist eine Lage, die im
 * Browser nur mit Glück auffiele — eine gesperrte Session in der Adresszeile,
 * ein überstimmter Auto-Weiter, ein Zähler ohne veraltete Felder.
 */

const CONTEXT_SESSIONS = slotsForStep('context')
const FIRST = CONTEXT_SESSIONS[0]!.id
const SECOND = CONTEXT_SESSIONS[1]!.id
const THIRD = CONTEXT_SESSIONS[2]!.id

function map(entries: Record<string, BrandNavSession>): Record<string, BrandNavSession> {
  return entries
}

describe('resolveActiveSession', () => {
  it('nimmt die Session aus der Adresse (Rang 1)', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      requested: SECOND,
      next: { stepKey: 'context', sessionKey: THIRD },
      sessions: map({ [FIRST]: { state: 'open' }, [SECOND]: { state: 'open' }, [THIRD]: { state: 'open' } }),
    })
    expect(active).toBe(SECOND)
  })

  it('nimmt ohne Adresse den Wegweiser des Servers (Rang 2)', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      next: { stepKey: 'context', sessionKey: THIRD },
      sessions: map({ [FIRST]: { state: 'open' }, [THIRD]: { state: 'open' } }),
    })
    expect(active).toBe(THIRD)
  })

  it('nimmt sonst die erste offene Session in Registry-Reihenfolge (Rang 3)', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      sessions: map({ [FIRST]: { state: 'done' }, [SECOND]: { state: 'open' }, [THIRD]: { state: 'open' } }),
    })
    expect(active).toBe(SECOND)
  })

  it('lässt eine GESPERRTE Session auch aus der Adresszeile nicht gewinnen', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      requested: THIRD,
      sessions: map({ [FIRST]: { state: 'open' }, [THIRD]: { state: 'locked' } }),
    })
    expect(active).toBe(FIRST)
  })

  it('ignoriert einen Wegweiser auf ein ANDERES Kapitel', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      next: { stepKey: 'pvm', sessionKey: 'b.purpose' },
      sessions: map({ [FIRST]: { state: 'open' } }),
    })
    expect(active).toBe(FIRST)
  })

  it('ignoriert einen Wegweiser auf die Finale Abnahme (dort gibt es keine Session)', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      next: { stepKey: 'context', acceptance: true },
      sessions: map({ [SECOND]: { state: 'open' } }),
    })
    expect(active).toBe(SECOND)
  })

  it('überspringt eine VERTAGTE Session beim Suchen — einmal', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      sessions: map({ [FIRST]: { state: 'open', deferred: true }, [SECOND]: { state: 'open' } }),
    })
    expect(active).toBe(SECOND)
  })

  it('öffnet eine vertagte Session trotzdem, wenn keine andere offen ist', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      sessions: map({ [FIRST]: { state: 'open', deferred: true }, [SECOND]: { state: 'done' } }),
    })
    expect(active).toBe(FIRST)
  })

  it('öffnet eine vertagte Session, wenn die Adresse sie nennt', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      requested: FIRST,
      sessions: map({ [FIRST]: { state: 'open', deferred: true }, [SECOND]: { state: 'open' } }),
    })
    expect(active).toBe(FIRST)
  })

  it('gibt null zurück, wenn nichts offen ist', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      sessions: map({ [FIRST]: { state: 'done' }, [SECOND]: { state: 'stale' } }),
    })
    expect(active).toBeNull()
  })

  it('ignoriert eine Adresse, die keine Session dieses Kapitels ist', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      requested: 'b.purpose',
      sessions: map({ [FIRST]: { state: 'open' }, 'b.purpose': { state: 'open' } }),
    })
    expect(active).toBe(FIRST)
  })
})

/**
 * EINE ZÄHLWEISE, ÜBERALL DIESELBE (Testlauf-Befund L, 2026-09-09): der Nenner
 * sind die bestätigbaren PFLICHT-Sessions — genau der von `brandStepCompletion`,
 * den Notizblock und Finale Abnahme schon benutzen. Vorher zählte die Leiste
 * ALLE Sessions mit und sagte „0 von 9 bestätigt", während der Notizblock
 * daneben „0/8 + 1 optional" zeigte.
 */
const CONTEXT_REQUIRED = CONTEXT_SESSIONS.filter(
  session => session.required && slotIsConfirmable(session),
).length
const CONTEXT_OPTIONAL = CONTEXT_SESSIONS.filter(session => !session.required).length

describe('countChapterSessions', () => {
  it('zählt bestätigt und veraltet GETRENNT', () => {
    const counts = countChapterSessions('context', map({
      [FIRST]: { state: 'done' },
      [SECOND]: { state: 'stale' },
      [THIRD]: { state: 'open' },
    }))
    expect(counts.confirmed).toBe(1)
    expect(counts.stale).toBe(1)
    expect(counts.total).toBe(CONTEXT_REQUIRED)
  })

  it('zählt PFLICHT-Sessions, optionale getrennt daneben (Befund L)', () => {
    const counts = countChapterSessions('context', {})
    expect(counts.total).toBe(CONTEXT_REQUIRED)
    expect(counts.optional).toBe(CONTEXT_OPTIONAL)
    expect(counts.total + counts.optional).toBeLessThanOrEqual(CONTEXT_SESSIONS.length)
    // Und der Nenner ist derselbe wie der der Finalen Abnahme.
    expect(counts.total).toBe(brandStepCompletion('context', {}).total)
  })

  it('eine BESTÄTIGTE optionale Session bewegt den Bruch nicht', () => {
    const optional = CONTEXT_SESSIONS.find(session => !session.required)
    // Ohne optionale Session im Kapitel gibt es nichts zu beweisen.
    if (!optional) return
    const counts = countChapterSessions('context', map({ [optional.id]: { state: 'done' } }))
    expect(counts.confirmed).toBe(0)
    expect(counts.total).toBe(CONTEXT_REQUIRED)
  })

  it('zählt eine fehlende Session als offen, nie als fertig', () => {
    const counts = countChapterSessions('context', {})
    expect(counts.confirmed).toBe(0)
    expect(counts.stale).toBe(0)
    expect(counts.total).toBe(CONTEXT_REQUIRED)
  })

  it('zählt vertagte Sessions eigens', () => {
    const counts = countChapterSessions('context', map({
      [FIRST]: { state: 'open', deferred: true },
      [SECOND]: { state: 'done', deferred: false },
    }))
    expect(counts.deferred).toBe(1)
  })
})

describe('chapterEffortMinutes', () => {
  it('summiert die Registry-Minuten des Kapitels', () => {
    expect(chapterEffortMinutes('context')).toBe(
      CONTEXT_SESSIONS.reduce((sum, session) => sum + session.effort.minutes, 0),
    )
  })

  it('bleibt in der kommunizierten Grössenordnung (kein Kapitel über 30 Min)', () => {
    for (const key of ['context', 'pvm', 'values', 'archetype'] as const) {
      expect(chapterEffortMinutes(key)).toBeGreaterThan(0)
      expect(chapterEffortMinutes(key)).toBeLessThanOrEqual(30)
    }
  })
})

/**
 * TESTLAUF-BEFUND 7 (2026-09-09): der Kopf des AKTIVEN Kapitels zeigte den
 * Registry-Umfang und blieb nach vier Bestätigungen unverändert stehen — die
 * einzige Zahl der Leiste, die vom Fortschritt nichts weiss.
 */
describe('chapterRemainingMinutes', () => {
  it('ohne einen einzigen Stand ist die Restzeit der volle Umfang', () => {
    expect(chapterRemainingMinutes('context', {})).toBe(chapterEffortMinutes('context'))
  })

  it('jede BESTÄTIGTE Session nimmt ihre Minuten aus der Zahl', () => {
    const first = CONTEXT_SESSIONS[0]!
    const second = CONTEXT_SESSIONS[1]!
    const rest = chapterRemainingMinutes('context', map({
      [first.id]: { state: 'done' },
      [second.id]: { state: 'done' },
    }))
    expect(rest).toBe(
      chapterEffortMinutes('context') - first.effort.minutes - second.effort.minutes,
    )
    expect(rest).toBeLessThan(chapterEffortMinutes('context'))
  })

  it('GEGENPROBE: vertagt, veraltet und offen bleiben Arbeit', () => {
    // Eine vertagte Session ist aufgehobene Arbeit, eine veraltete
    // ausdrücklich wieder welche („neu besprechen") — beide gehören in die
    // Restzeit, sonst verspräche sie ein Ende, das es nicht gibt.
    const full = chapterEffortMinutes('context')
    expect(chapterRemainingMinutes('context', map({
      [FIRST]: { state: 'open', deferred: true },
      [SECOND]: { state: 'stale' },
      [THIRD]: { state: 'active' },
    }))).toBe(full)
  })

  it('alles bestätigt heisst null Minuten', () => {
    const all = Object.fromEntries(
      CONTEXT_SESSIONS.map(session => [session.id, { state: 'done' } as BrandNavSession]),
    )
    expect(chapterRemainingMinutes('context', all)).toBe(0)
  })
})

describe('decideAutoAdvance', () => {
  const base = {
    from: FIRST,
    active: FIRST,
    next: { stepKey: 'context' as const, sessionKey: SECOND },
    streaming: false,
    savePending: false,
    conflict: false,
  }

  it('wechselt auf die genannte Session', () => {
    expect(decideAutoAdvance(base)).toEqual({ kind: 'session', stepKey: 'context', sessionKey: SECOND })
  })

  it('bleibt, wenn der Mensch inzwischen woanders steht', () => {
    expect(decideAutoAdvance({ ...base, active: THIRD })).toEqual({ kind: 'stay' })
  })

  it('bleibt, solange ein Strom läuft', () => {
    expect(decideAutoAdvance({ ...base, streaming: true })).toEqual({ kind: 'stay' })
  })

  it('bleibt, solange eine Speicherung aussteht (409-Falle)', () => {
    expect(decideAutoAdvance({ ...base, savePending: true })).toEqual({ kind: 'stay' })
  })

  it('bleibt bei offenem Konflikt', () => {
    expect(decideAutoAdvance({ ...base, conflict: true })).toEqual({ kind: 'stay' })
  })

  it('bleibt ohne Wegweiser', () => {
    expect(decideAutoAdvance({ ...base, next: null })).toEqual({ kind: 'stay' })
  })

  it('bleibt, wenn der Wegweiser auf die eigene Session zeigt', () => {
    expect(decideAutoAdvance({ ...base, next: { stepKey: 'context', sessionKey: FIRST } }))
      .toEqual({ kind: 'stay' })
  })

  it('meldet das Kapitelende eigens (seit 3c-ii springt die Seite darauf)', () => {
    expect(decideAutoAdvance({ ...base, next: { stepKey: 'context', acceptance: true } }))
      .toEqual({ kind: 'acceptance', stepKey: 'context' })
  })

  /**
   * WER RUFT IHN NOCH? (Davids Entscheidung 2026-09-09.)
   *
   * Die REGEL ist unverändert — sie sagt weiterhin „wechseln", wenn alle vier
   * Sperren offen sind. Was sich gedreht hat, sind die AUFRUFER: nach einer
   * Antwort und nach einer Bestätigung wird sie nicht mehr gefragt (die Bühne
   * zeigt dort den Weiter-Knopf). Geblieben ist der Eröffnungszug einer
   * Entwurfs-Session, der zur ersten Katalog-Frage springt — Davids
   * Entscheidung (8) vom 2026-09-08, und genau dieses Verhalten steht hier.
   */
  it('der Eröffnungszug einer Entwurfs-Session springt weiter — das BLEIBT', () => {
    // `a.pitch` ist eine Ableitung: George eröffnet dort und der Wegweiser
    // zeigt auf die erste echte Frage des Kapitels.
    expect(decideAutoAdvance({ ...base, from: FIRST, active: FIRST }))
      .toEqual({ kind: 'session', stepKey: 'context', sessionKey: SECOND })
  })
})

/**
 * DER WEITER-KNOPF NACH DEM ABSCHLUSSZUG (Davids Entscheidung 2026-09-09) —
 * die Umkehrung von `decideAutoAdvance`: dort „im Zweifel bleiben", hier „im
 * Zweifel einen Weg anbieten".
 */
describe('resolveContinueTarget', () => {
  const base = {
    stepKey: 'context' as const,
    from: FIRST,
    active: FIRST,
    next: { stepKey: 'context' as const, sessionKey: SECOND },
    streaming: false,
  }

  it('zeigt auf die Session, die der Server genannt hat', () => {
    expect(resolveContinueTarget(base))
      .toEqual({ kind: 'session', stepKey: 'context', sessionKey: SECOND })
  })

  it('OHNE Abschluss steht kein Knopf da', () => {
    expect(resolveContinueTarget({ ...base, from: '' })).toEqual({ kind: 'none' })
  })

  it('verschwindet, wenn der Mensch inzwischen woanders steht', () => {
    expect(resolveContinueTarget({ ...base, active: THIRD })).toEqual({ kind: 'none' })
  })

  it('verschwindet, solange der Abschlusszug noch schreibt', () => {
    expect(resolveContinueTarget({ ...base, streaming: true })).toEqual({ kind: 'none' })
  })

  it('zeigt auf die Finale Abnahme, wenn das Kapitel durch ist', () => {
    expect(resolveContinueTarget({ ...base, next: { stepKey: 'context', acceptance: true } }))
      .toEqual({ kind: 'acceptance', stepKey: 'context' })
  })

  it('OHNE Ziel zeigt er auf die Abnahme — nie ins Leere', () => {
    // `null` heisst „keine Frage mehr offen, aber es fehlt ein Pflicht-Wert".
    // Für den AUTO-Weiter ist das „bleib"; für einen Knopf direkt nach einer
    // Bestätigung wäre es eine Sackgasse.
    expect(resolveContinueTarget({ ...base, next: null }))
      .toEqual({ kind: 'acceptance', stepKey: 'context' })
  })

  it('zeigt nie auf die eben geschlossene Session', () => {
    expect(resolveContinueTarget({ ...base, next: { stepKey: 'context', sessionKey: FIRST } }))
      .toEqual({ kind: 'none' })
  })
})

describe('needsOpeningTurn', () => {
  it('eröffnet eine stumme Session', () => {
    expect(needsOpeningTurn({
      sessionKey: FIRST, opened: new Set(), hasAdvisorTurn: false, streaming: false,
    })).toBe(true)
  })

  it('eröffnet NICHT, wenn der Verlauf schon einen Berater-Zug trägt', () => {
    expect(needsOpeningTurn({
      sessionKey: FIRST, opened: new Set(), hasAdvisorTurn: true, streaming: false,
    })).toBe(false)
  })

  it('eröffnet NICHT zweimal in derselben Sitzung', () => {
    expect(needsOpeningTurn({
      sessionKey: FIRST, opened: new Set([FIRST]), hasAdvisorTurn: false, streaming: false,
    })).toBe(false)
  })

  it('eröffnet nicht, während ein Zug läuft', () => {
    expect(needsOpeningTurn({
      sessionKey: FIRST, opened: new Set(), hasAdvisorTurn: false, streaming: true,
    })).toBe(false)
  })

  it('eröffnet nichts ohne Session', () => {
    expect(needsOpeningTurn({
      sessionKey: '', opened: new Set(), hasAdvisorTurn: false, streaming: false,
    })).toBe(false)
  })
})

/**
 * DER SPRUNG NACH DEM ERÖFFNUNGSZUG (Testlauf-Befund B, 2026-09-09).
 *
 * Er lief für JEDE Session: ein Klick auf „Das Eine" eröffnete dort und landete
 * eine Sekunde später auf „Größtes Hindernis" — zwei KI-Züge je Klick, und der
 * gewählte Eintrag war weg. Erlaubt ist er nur noch da, wofür er gedacht war:
 * die BEILÄUFIG betretene Entwurfs-Session am Kapitel-Anfang.
 */
describe('openingAdvanceAllowed', () => {
  it('eine ENTWURFS-Session, die niemand angeklickt hat, springt weiter', () => {
    expect(openingAdvanceAllowed({ askable: false, requested: false })).toBe(true)
  })

  it('eine FRAGE-Session bleibt stehen — sie ist selbst das Ziel', () => {
    expect(openingAdvanceAllowed({ askable: true, requested: false })).toBe(false)
  })

  it('ein ANGEKLICKTER Eintrag springt nie weg (Befund B)', () => {
    expect(openingAdvanceAllowed({ askable: false, requested: true })).toBe(false)
    expect(openingAdvanceAllowed({ askable: true, requested: true })).toBe(false)
  })
})

/**
 * DIE ABNAHME-ANSICHT (BW2 Paket 3c-ii, §5a). Drei Fragen, drei Rechnungen:
 * steht sie in der Adresse, was steht unter ihrer Liste, und ist der löschende
 * Weg freigegeben. Alle drei sind Ja/Nein-Fragen mit teuren falschen Antworten
 * — die Gegenproben stehen deshalb jeweils daneben.
 */
describe('BRAND_ACCEPTANCE_VIEW', () => {
  it('kollidiert mit KEINER Slot-Id (sonst verschluckt die Ansicht eine Session)', () => {
    expect(BRAND_SLOTS.some(slot => slot.id === BRAND_ACCEPTANCE_VIEW)).toBe(false)
  })

  it('erkennt die Ansicht, auch mit Leerraum aus der Adresszeile', () => {
    expect(isAcceptanceView('acceptance')).toBe(true)
    expect(isAcceptanceView(' acceptance ')).toBe(true)
  })

  it('erkennt eine Session NICHT als Ansicht — Gegenprobe', () => {
    expect(isAcceptanceView(FIRST)).toBe(false)
    expect(isAcceptanceView('')).toBe(false)
    expect(isAcceptanceView(undefined)).toBe(false)
  })

  it('macht aus `?s=acceptance` KEINE Session (sonst liefe darunter ein Gespräch)', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      requested: BRAND_ACCEPTANCE_VIEW,
      sessions: map({ [FIRST]: { state: 'open' }, [SECOND]: { state: 'open' } }),
    })
    expect(active).toBeNull()
  })

  it('GEGENPROBE: ohne die Ansicht in der Adresse gilt weiter die erste offene', () => {
    const active = resolveActiveSession({
      stepKey: 'context',
      sessions: map({ [FIRST]: { state: 'open' }, [SECOND]: { state: 'open' } }),
    })
    expect(active).toBe(FIRST)
  })
})

describe('resolveAcceptanceStage', () => {
  it('zeigt die Frage erst, wenn nichts mehr offen ist', () => {
    expect(resolveAcceptanceStage({ ready: true, storedState: 'active' })).toBe('question')
  })

  it('zeigt vorher die Blocker — Gegenprobe zur Weiche', () => {
    expect(resolveAcceptanceStage({ ready: false, storedState: 'active' })).toBe('blocked')
  })

  it('fragt ein ABGESCHLOSSENES Kapitel nicht noch einmal (`already_done`)', () => {
    expect(resolveAcceptanceStage({ ready: true, storedState: 'done' })).toBe('done')
  })

  it('lässt `done` auch dann stehen, wenn die Abnahme nicht mehr trägt', () => {
    expect(resolveAcceptanceStage({ ready: false, storedState: 'done' })).toBe('done')
  })

  it('zeigt auf einer noch nicht betretenen Zeile die Blocker', () => {
    expect(resolveAcceptanceStage({ ready: false, storedState: 'open' })).toBe('blocked')
    expect(resolveAcceptanceStage({ ready: false, storedState: 'locked' })).toBe('blocked')
  })
})

describe('restartWordMatches', () => {
  it('gibt frei, wenn das Wort steht — unabhängig von Leerraum und Grossschreibung', () => {
    expect(restartWordMatches('bestätigen', 'bestätigen')).toBe(true)
    expect(restartWordMatches('  Bestätigen ', 'bestätigen')).toBe(true)
    expect(restartWordMatches('CONFIRM', 'confirm')).toBe(true)
  })

  it('gibt bei einem anderen Wort NICHT frei', () => {
    expect(restartWordMatches('bestätige', 'bestätigen')).toBe(false)
    expect(restartWordMatches('ja', 'bestätigen')).toBe(false)
    expect(restartWordMatches('', 'bestätigen')).toBe(false)
  })

  it('gibt ohne Erwartungswort NIE frei (fehlender Locale-Schlüssel)', () => {
    expect(restartWordMatches('', '')).toBe(false)
    expect(restartWordMatches('irgendwas', '   ')).toBe(false)
  })
})

// ── Die Befund-Chips (BW2 Paket 5, §8) ────────────────────────────────────

const VALUES = slotsForStep('values')
const ARCHETYPE = slotsForStep('archetype')

function finding(
  slots: string[],
  status: 'open' | 'accepted' | 'dismissed' = 'open',
): { status: 'open' | 'accepted' | 'dismissed', slots: string[] } {
  return { status, slots }
}

describe('dismissReasonValid', () => {
  it('gibt frei, sobald ein Grund dasteht', () => {
    expect(dismissReasonValid('Absicht')).toBe(true)
    expect(dismissReasonValid('  Ja.  ')).toBe(true)
  })

  it('gibt bei leerem Klick NICHT frei — die Notiz wäre eine leere Behauptung', () => {
    expect(dismissReasonValid('')).toBe(false)
    expect(dismissReasonValid('    ')).toBe(false)
    expect(dismissReasonValid('ok')).toBe(false)
  })
})

describe('countOpenFindings', () => {
  it('zählt einen Befund in BEIDEN Kapiteln, die er berührt', () => {
    const list = [finding([VALUES[0]!.id, ARCHETYPE[0]!.id])]
    expect(countOpenFindings(list, 'values')).toBe(1)
    expect(countOpenFindings(list, 'archetype')).toBe(1)
    expect(countOpenFindings(list, 'context')).toBe(0)
  })

  it('zählt Befunde, nicht Felder: zwei Felder desselben Kapitels sind EIN Punkt', () => {
    expect(countOpenFindings([finding([VALUES[0]!.id, VALUES[1]!.id])], 'values')).toBe(1)
  })

  it('GEGENPROBE: entschiedene Befunde zählen nicht mehr mit', () => {
    const list = [
      finding([VALUES[0]!.id], 'accepted'),
      finding([VALUES[1]!.id], 'dismissed'),
      finding([VALUES[2]!.id]),
    ]
    expect(countOpenFindings(list, 'values')).toBe(1)
  })
})

describe('acceptTargets', () => {
  it('nennt bei einem Konflikt BEIDE Felder — dann fragt die Oberfläche', () => {
    const targets = acceptTargets({ slots: [VALUES[0]!.id, ARCHETYPE[0]!.id] })
    expect(targets).toEqual([VALUES[0]!.id, ARCHETYPE[0]!.id])
  })

  it('nennt bei einer Lücke genau eines — dann geht der Sprung direkt', () => {
    expect(acceptTargets({ slots: [VALUES[0]!.id] })).toEqual([VALUES[0]!.id])
  })

  it('lässt unbekannte Ids fallen (Sprung auf eine leere Bühne)', () => {
    expect(acceptTargets({ slots: ['x.erfunden', VALUES[0]!.id] })).toEqual([VALUES[0]!.id])
    expect(acceptTargets({ slots: ['x.erfunden'] })).toEqual([])
  })

  it('fasst dasselbe Feld zusammen — zweimal dasselbe ist keine Wahl', () => {
    expect(acceptTargets({ slots: [VALUES[0]!.id, VALUES[0]!.id] })).toEqual([VALUES[0]!.id])
  })
})
