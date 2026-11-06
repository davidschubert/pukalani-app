import { createBrandStepRestartSchema } from '../../../../../../../schemas/brandStep'
import {
  type BrandStepFacts,
  resolveBrandJourney,
  transitionBrandStep,
} from '../../../../../../../shared/brandJourney'
import { slotsForStep } from '../../../../../../../shared/slotRegistry'
import type { BrandStepRestartResponse } from '../../../../../../../shared/types/brand'
import {
  brandRestartImpactView,
  loadBrandAcceptanceContext,
} from '../../../../../../utils/brandAcceptance'
import {
  BRAND_EVENT_PAYLOAD_MAX,
  recordBrandEvent,
} from '../../../../../../utils/brandEvents'
import { purgeBrandStepFindings } from '../../../../../../utils/brandFindingsStore'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  profileFacts,
  resolveProfileProgress,
  toStepFacts,
  touchProfile,
} from '../../../../../../utils/brandStore'

/**
 * „NOCHMAL VON VORN" — der EINZIGE löschende Weg des Wizards (Plan §5a).
 *
 * ── ER IST NICHT `reopen` ────────────────────────────────────────────────
 * `reopen` ist die LEISE Vertiefungsrunde: Slots und Konfidenz bleiben stehen,
 * nichts propagiert (§3b.8). `restart` heisst, was es sagt — die Ebene-3-
 * Ergebnisse dieses Kapitels gehen verloren. Davids Entscheidung vom
 * 2026-09-04; erreichbar NUR über die Abnahme-Seite, nie über die Bühne.
 *
 * ── DER SCHUTZ IST DOPPELT UND LIEGT AN ZWEI ORTEN ───────────────────────
 * Das getippte Wort („bestätigen") ist Reibung gegen den Fehlklick und gehört
 * der Oberfläche. Der SERVER prüft `acknowledge` UND den `impactAck` — den
 * Hash über genau die Hülle, die dem Menschen gezeigt wurde. Passt er nicht,
 * hat sich seither etwas bewegt: 409 `restart_unacknowledged` MIT der neuen
 * Hülle, damit der Layer neu zeigen kann, statt zu löschen, was er so nie
 * angekündigt hat.
 *
 * ── DIE REIHENFOLGE IST DIE BEGRÜNDUNG ───────────────────────────────────
 *  1. Revision prüfen — ein zweiter Tab darf hier nichts überholen.
 *  2. Hülle neu rechnen und gegen `impactAck` halten.
 *  3. SCHNAPPSCHUSS als `brand_events` `step.restarted` — VOR dem Löschen.
 *     Fail-soft wie jedes Ereignis: die Beobachtung darf die Handlung nicht
 *     verhindern. Was nicht in die 4096 Zeichen passt, wird gekürzt und
 *     `truncated: true` gesetzt (ein still verworfener Audit-Eintrag wäre die
 *     schlechteste der drei Möglichkeiten).
 *  4. Die geleerte Zeile schreiben (`transitionBrandStep(…, 'restart')` sagt,
 *     WAS übrig bleibt; diese Route legt `restartedAt` und die Revision dazu).
 *
 * ── SPÄTERE KAPITEL WERDEN NICHT ANGEFASST ───────────────────────────────
 * Sie werden über den fehlenden Quell-Wert MECHANISCH `stale` (der
 * `sourcesHash` weicht ab, §9) — es gibt keinen neuen Wert, gegen den ein
 * Spezialist eingrenzen könnte. Die Eingrenzung kommt mit der ersten neuen
 * Bestätigung im Kapitel.
 *
 * ── DIE NACHRICHTEN BLEIBEN ──────────────────────────────────────────────
 * Retention brand-003 sagt „dauerhaft", und das gilt weiter. Der VERLAUF
 * beginnt trotzdem neu: `restartedAt` schneidet ihn ab (`$createdAt >
 * restartedAt`), sonst wäre „von vorn" eine Lüge — George erinnerte sich an
 * ein Gespräch, das der Mensch gerade verworfen hat.
 */
export default defineEventHandler(async (event): Promise<BrandStepRestartResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const { profile, stepKey, stepRow, stepRows, records, allFacts, stepFacts } = context
  const body = await readValidatedBody(event, createBrandStepRestartSchema().parse)

  const revision = stepRow.revision ?? 0
  if (body.revision !== revision) {
    throw createError({
      status: 409,
      statusText: 'Brand step was changed elsewhere',
      data: { code: 'revision_conflict', revision },
    })
  }

  const impact = brandRestartImpactView(stepKey, revision, records, allFacts)
  if (!body.acknowledge || body.impactAck !== impact.ack) {
    throw createError({
      status: 409,
      statusText: 'Restart was not acknowledged',
      // Die AKTUELLE Hülle reist mit — die Oberfläche zeigt sie neu, ohne
      // einen zweiten Abruf (dasselbe Muster wie `revision_conflict`).
      data: { code: 'restart_unacknowledged', impact },
    })
  }

  const journeyState = context.journey.find(entry => entry.stepKey === stepKey)?.state
  const resolvedState = journeyState && journeyState !== 'skipped' ? journeyState : stepRow.state
  const facts: BrandStepFacts = {
    stepKey,
    state: resolvedState,
    confidence: stepRow.confidence ?? null,
    slots: stepFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
  }

  const restarted = transitionBrandStep(facts, { kind: 'restart' })
  if (!restarted.ok) {
    throw createError({
      status: 400,
      statusText: 'Step transition rejected',
      data: { code: restarted.code },
    })
  }

  // ── 3 · Der Schnappschuss, VOR dem Löschen ──────────────────────────────
  await recordBrandEvent(event, {
    type: 'step.restarted',
    profileId: profile.$id,
    userId,
    payload: packRestartSnapshot(stepKey, revision, stepRow.confidence ?? '', records, impact),
  })

  const now = new Date().toISOString()
  const nextRevision = revision + 1
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      rowId: stepRow.$id,
      data: {
        slots: '{}',
        state: restarted.step.state,
        confidence: null,
        // Ein Kapitel, das von vorn beginnt, ist nicht mehr abgeschlossen —
        // ein stehen gelassenes `completedAt` behauptete das Gegenteil.
        completedAt: null,
        restartedAt: now,
        revision: nextRevision,
      },
    })
  }
  catch (error) {
    throw toH3Error(error, 'Brand step could not be restarted')
  }

  /**
   * DIE BEFUNDE DIESES KAPITELS GEHEN MIT (Paket 4).
   *
   * Sie sind das Ergebnis desselben Schliess-Aufrufs, der auch die Notizen
   * geschrieben hat — und die sind soeben gelöscht worden. Ein offener
   * `conflict` an einem Feld, das es nicht mehr gibt, sperrte die Abnahme
   * eines Kapitels, das gerade leer ist; der Schnappschuss oben bewahrt den
   * Stand für den Betreiber. FAIL-SOFT: gelöscht ist gelöscht, ein Rest-Befund
   * darf daraus kein 500 machen (s. `purgeBrandStepFindings`).
   */
  await purgeBrandStepFindings(event, profile.$id, stepKey)

  // Der Fortschritts-Cache am Profil zieht mit — aus der neu gerechneten
  // Journey, nie aus dem Client (dieselbe Kette wie im Autosave).
  const mergedRows = stepRows.map(row => (row.$id === stepRow.$id
    ? { ...row, state: restarted.step.state, confidence: null, slots: '{}' }
    : row))
  const journey = resolveBrandJourney(profileFacts(profile, betaAccount), toStepFacts(mergedRows))
  const progress = resolveProfileProgress(journey)
  await touchProfile(event, profile.$id, {
    progressPct: progress.progressPct,
    currentStepKey: progress.currentStepKey,
  })

  const first = slotsForStep(stepKey)[0]

  return {
    stepKey,
    storedState: restarted.step.state,
    revision: nextRevision,
    restartedAt: now,
    // George eröffnet die erste Session des Kapitels — der Auto-Weiter-Vertrag
    // aus §5, nur eben am Anfang statt am Ende.
    next: first ? { stepKey, sessionKey: first.id } : null,
    progressPct: progress.progressPct,
    currentStepKey: progress.currentStepKey,
  }
})

/**
 * DER SCHNAPPSCHUSS IN 4096 ZEICHEN (s. Kopf, Schritt 3).
 *
 * Er nimmt die Slots in Registry-Reihenfolge auf, solange der serialisierte
 * `payload` unter dem Spaltendeckel bleibt, und markiert danach `truncated`.
 * Nicht „alles oder nichts": ein Kapitel darf 200k tragen, ein Ereignis 4096 —
 * ohne Kürzung wäre der Audit-Eintrag in der Praxis IMMER leer, und niemand
 * sähe es ihm an.
 */
function packRestartSnapshot(
  stepKey: string,
  revision: number,
  confidence: string,
  records: Record<string, BrandSlotRecord>,
  impact: { chapter: { values: number, notes: number, accepted: number }, downstream: { count: number } },
): Record<string, string | number | boolean> {
  const base: Record<string, string | number | boolean> = {
    stepKey,
    revision,
    confidence,
    values: impact.chapter.values,
    notes: impact.chapter.notes,
    accepted: impact.chapter.accepted,
    downstream: impact.downstream.count,
  }

  const kept: Record<string, BrandSlotRecord> = {}
  let truncated = false
  for (const [slotId, record] of Object.entries(records)) {
    const candidate = { ...kept, [slotId]: record }
    const probe = { ...base, snapshot: JSON.stringify(candidate), truncated: true }
    if (JSON.stringify(probe).length > BRAND_EVENT_PAYLOAD_MAX) {
      truncated = true
      continue
    }
    kept[slotId] = record
  }

  return {
    ...base,
    snapshot: JSON.stringify(kept),
    ...(truncated ? { truncated: true } : {}),
  }
}
