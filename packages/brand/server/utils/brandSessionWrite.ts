import type { H3Event } from 'h3'
import {
  type BrandStepAction,
  type BrandStepFacts,
  brandAcceptableSessions,
  resolveNextStop,
  transitionBrandStep,
} from '../../shared/brandJourney'
import type {
  BrandSessionAcceptResponse,
  BrandStepAcceptAllResponse,
} from '../../shared/types/brand'
import {
  type BrandAcceptanceContext,
  deriveBrandAcceptance,
  requireSessionParam,
  withStepSlotFacts,
} from './brandAcceptance'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  serializeSlotRecords,
} from './brandStore'

/**
 * ABNEHMEN UND VERTAGEN — EIN Schreibweg für zwei Handlungen (Plan §5a).
 *
 * Die beiden Routen unterscheiden sich in genau einer Zeile: welche Handlung
 * sie der Zustandsmaschine reichen. Alles davor (Revision prüfen, Session aus
 * der Adresse holen, den gerechneten Zustand statt des rohen nehmen) und alles
 * danach (schreiben, die Abnahme neu rechnen, den Wegweiser setzen) ist
 * wörtlich dasselbe — zweimal geschrieben wäre es zweimal zu pflegen und
 * irgendwann einmal falsch.
 *
 * ── DIE FLAGS LEBEN IM SLOT-DATENSATZ, NICHT IN EINER SPALTE ──────────────
 * `accepted`/`deferred` stehen als JSON in der bestehenden `slots`-Spalte
 * (Plan §12: „kein Schema-Schritt"). Die Zustandsmaschine rechnet auf den
 * FAKTEN, geschrieben wird der DATENSATZ — deshalb überträgt diese Funktion
 * das Ergebnis der Transition zurück in `records`, statt die Fakten zu
 * speichern.
 */
export async function writeBrandSessionFlag(
  event: H3Event,
  context: BrandAcceptanceContext,
  revision: number,
  action: (slotId: string) => Extract<BrandStepAction, { kind: 'acceptSlot' | 'deferSlot' }>,
): Promise<BrandSessionAcceptResponse> {
  const { stepKey, stepRow, records, stepFacts } = context
  const session = requireSessionParam(event, stepKey)

  // `revision` VOR ALLEM ANDEREN, wie im Autosave: die Abnahme-Seite liest
  // denselben Stand wie die Werkstatt, und ein zweiter Tab darf ihn nicht
  // still überholen.
  const current = stepRow.revision ?? 0
  if (revision !== current) {
    throw createError({
      status: 409,
      statusText: 'Brand step was changed elsewhere',
      data: { code: 'revision_conflict', revision: current },
    })
  }

  // DER GERECHNETE ZUSTAND, NICHT DER ROHE — dieselbe Regel wie im
  // Autosave-PATCH (dort steht die ganze Begründung): eine Zeile, deren
  // Vorgänger fertig wird, bleibt roh `locked` und wird erst von der Journey
  // `open` gerechnet.
  const journeyState = context.journey.find(entry => entry.stepKey === stepKey)?.state
  const resolvedState = journeyState && journeyState !== 'skipped' ? journeyState : stepRow.state
  let facts: BrandStepFacts = {
    stepKey,
    state: resolvedState,
    confidence: stepRow.confidence ?? null,
    slots: context.stepFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
  }

  // Wer abnimmt, arbeitet — ein `open` wird dadurch `active`. Ein `done`
  // bleibt `done` (die Abnahme-Seite eines fertigen Kapitels ist erlaubt).
  let stateChanged = false
  if (facts.state === 'open') {
    const started = transitionBrandStep(facts, { kind: 'start' })
    if (!started.ok) {
      throw createError({ status: 400, statusText: 'Step transition rejected', data: { code: started.code } })
    }
    facts = started.step
    stateChanged = started.changed
  }

  const result = transitionBrandStep(facts, action(session.id))
  if (!result.ok) {
    throw createError({
      status: result.code === 'not_confirmed' || result.code === 'already_confirmed' ? 409 : 400,
      statusText: 'Session transition rejected',
      data: { code: result.code },
    })
  }
  const after = result.step.slots?.[session.id]

  const nextRecords: Record<string, BrandSlotRecord> = { ...records }
  if (result.changed) {
    const before = records[session.id]
    const candidate: BrandSlotRecord = { ...before, updatedAt: new Date().toISOString() }
    // Zurückgenommene Flags werden GELÖSCHT statt auf `false` gesetzt: der
    // Datensatz ist JSON in einer gedeckelten Spalte, und „fehlt" heisst hier
    // überall dasselbe wie „nein" (`toSlotFacts`).
    if (after?.accepted) candidate.accepted = true
    else delete candidate.accepted
    if (after?.deferred) candidate.deferred = true
    else delete candidate.deferred
    nextRecords[session.id] = candidate
  }

  const nextRevision = result.changed || stateChanged ? current + 1 : current
  if (result.changed || stateChanged) {
    const { tablesDB, databaseId } = brandDb(event)
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: stepRow.$id,
        data: {
          ...(result.changed ? { slots: serializeSlotRecords(nextRecords) } : {}),
          revision: nextRevision,
          ...(stateChanged ? { state: facts.state } : {}),
        },
      })
    }
    catch (error) {
      throw toH3Error(error, 'Brand session could not be updated')
    }
  }

  // NEU GERECHNET aus dem geschriebenen Stand — die Seite bekommt den Zähler,
  // den sie danach zeigen soll, ohne einen zweiten Abruf.
  const afterFacts = withStepSlotFacts(stepFacts, stepKey, nextRecords)
  // DIE KONFLIKTE REISEN MIT (Paket 4): der Zähler, den die Seite danach zeigt,
  // muss dieselbe Sperre kennen wie der, den sie vorher gezeigt hat — sonst
  // sagte die Antwort „bereit", während der nächste Abruf wieder sperrt.
  const derived = deriveBrandAcceptance(context.profile, stepKey, afterFacts, context.betaAccount, context.openConflicts)

  return {
    stepKey,
    sessionKey: session.id,
    revision: nextRevision,
    accepted: Boolean(after?.accepted),
    deferred: Boolean(after?.deferred),
    acceptance: derived.acceptance,
    // Der Wegweiser kennt seit Paket 6 die Warteschlange „neu besprechen" —
    // die Zustände dazu sind gerade neu gerechnet worden (s. `derived`).
    next: resolveNextStop(
      stepKey,
      afterFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
      derived.sessionStates,
    ),
  }
}

/**
 * „ALLE ABNEHMEN" (Davids Befund 10, 2026-09-09) — EIN Schreibvorgang für ein
 * ganzes Kapitel.
 *
 * ── WARUM EINE ROUTE UND NICHT ELF AUFRUFE ────────────────────────────────
 * Weil jede Abnahme die `revision` der Kapitel-Zeile weiterdreht: elf
 * Client-Aufrufe müssten strikt nacheinander laufen und jeder den Rückgabewert
 * des vorigen mitschleppen — elf Roundtrips, elf Schreibvorgänge auf DIESELBE
 * Zeile, und beim ersten 409 mittendrin ein halb abgenommenes Kapitel, dessen
 * Zustand niemand mehr benennen kann. Hier ist es eine Rechnung, eine
 * Schreibung, eine Fassung.
 *
 * ── ALLES ODER NICHTS WÄRE HIER FALSCH ────────────────────────────────────
 * Die Zeilen sind unabhängig: eine unbestätigte darf zehn andere nicht daran
 * hindern, abgenommen zu werden. Deshalb sammelt die Schleife die Absagen und
 * die Antwort trägt sie mit (`failed`) — der Mensch soll sehen, WAS liegen
 * geblieben ist, nicht bloss, dass etwas nicht ging. Die eine ATOMARE Zusage,
 * die es gibt, ist die richtige: entweder die Zeile wird geschrieben oder
 * keines der Häkchen gilt (ein `updateRow`).
 *
 * ── DIESELBE REGEL WIE DER EINZEL-KNOPF ───────────────────────────────────
 * Welche Sessions überhaupt in Frage kommen, sagt `brandAcceptableSessions` —
 * dieselbe pure Regel, die `BwSessionBlock` seinen Haken zeigen lässt.
 * Entschieden wird trotzdem je Zeile von `transitionBrandStep`: die Vorauswahl
 * spart Arbeit, sie ersetzt die Zustandsmaschine nicht.
 */
export async function acceptAllBrandSessions(
  event: H3Event,
  context: BrandAcceptanceContext,
  revision: number,
): Promise<BrandStepAcceptAllResponse> {
  const { stepKey, stepRow, records, stepFacts } = context

  // `revision` VOR ALLEM ANDEREN — wie beim einzelnen Abnehmen.
  const current = stepRow.revision ?? 0
  if (revision !== current) {
    throw createError({
      status: 409,
      statusText: 'Brand step was changed elsewhere',
      data: { code: 'revision_conflict', revision: current },
    })
  }

  // Der GERECHNETE Zustand, nicht der rohe (s. `writeBrandSessionFlag`).
  const journeyState = context.journey.find(entry => entry.stepKey === stepKey)?.state
  const resolvedState = journeyState && journeyState !== 'skipped' ? journeyState : stepRow.state
  let facts: BrandStepFacts = {
    stepKey,
    state: resolvedState,
    confidence: stepRow.confidence ?? null,
    slots: stepFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
  }

  let stateChanged = false
  if (facts.state === 'open') {
    const started = transitionBrandStep(facts, { kind: 'start' })
    if (!started.ok) {
      throw createError({ status: 400, statusText: 'Step transition rejected', data: { code: started.code } })
    }
    facts = started.step
    stateChanged = started.changed
  }

  const nextRecords: Record<string, BrandSlotRecord> = { ...records }
  const accepted: string[] = []
  const failed: { slotId: string, code: string }[] = []
  let changed = false
  const now = new Date().toISOString()

  for (const slotId of brandAcceptableSessions(stepKey, facts.slots ?? {})) {
    const result = transitionBrandStep(facts, { kind: 'acceptSlot', slotId })
    if (!result.ok) {
      failed.push({ slotId, code: result.code })
      continue
    }
    // Der neue Stand ist die Grundlage der NÄCHSTEN Zeile — sonst rechnete die
    // Schleife elfmal gegen denselben Anfangszustand.
    facts = result.step
    accepted.push(slotId)
    if (!result.changed) continue
    changed = true
    const after = result.step.slots?.[slotId]
    const candidate: BrandSlotRecord = { ...nextRecords[slotId], updatedAt: now }
    if (after?.accepted) candidate.accepted = true
    else delete candidate.accepted
    // Abnehmen hebt ein Vertagen auf (`acceptSlot`) — gelöscht statt `false`,
    // wie überall in diesem Datensatz.
    delete candidate.deferred
    nextRecords[slotId] = candidate
  }

  const nextRevision = changed || stateChanged ? current + 1 : current
  if (changed || stateChanged) {
    const { tablesDB, databaseId } = brandDb(event)
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: stepRow.$id,
        data: {
          ...(changed ? { slots: serializeSlotRecords(nextRecords) } : {}),
          revision: nextRevision,
          ...(stateChanged ? { state: facts.state } : {}),
        },
      })
    }
    catch (error) {
      throw toH3Error(error, 'Brand sessions could not be updated')
    }
  }

  const afterFacts = withStepSlotFacts(stepFacts, stepKey, nextRecords)
  const derived = deriveBrandAcceptance(context.profile, stepKey, afterFacts, context.betaAccount, context.openConflicts)

  return {
    stepKey,
    revision: nextRevision,
    accepted,
    failed,
    acceptance: derived.acceptance,
    next: resolveNextStop(
      stepKey,
      afterFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
      derived.sessionStates,
    ),
  }
}
