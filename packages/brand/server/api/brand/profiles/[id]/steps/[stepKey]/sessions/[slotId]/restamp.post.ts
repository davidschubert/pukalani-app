import { createBrandSessionRestampSchema } from '../../../../../../../../../schemas/brandStep'
import { mergeBrandSlotFacts, resolveNextStop } from '../../../../../../../../../shared/brandJourney'
import type { BrandSessionAcceptResponse } from '../../../../../../../../../shared/types/brand'
import {
  deriveBrandAcceptance,
  loadBrandAcceptanceContext,
  requireSessionParam,
  withStepSlotFacts,
} from '../../../../../../../../utils/brandAcceptance'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  brandSlotRecordConfirmed,
  brandSourcesHash,
  serializeSlotRecords,
} from '../../../../../../../../utils/brandStore'

/**
 * „GILT WEITER" (BW2 Paket 6, Plan §9) — der Stempel auf eine VERALTETE
 * Session.
 *
 * ── DIE ZWEITE ANTWORT AUF EINE KORREKTUR ────────────────────────────────
 * Ist ein Feld davor geändert worden, steht diese Session bernstein: ihr
 * gespeicherter Quell-Hash weicht vom heutigen ab. Zwei Wege führen da
 * heraus, und der Mensch entscheidet, welcher: NEU BESPRECHEN (die Session
 * öffnen, George eröffnet mit Bezug auf die Änderung) oder GILT WEITER — der
 * Wert bleibt, wie er ist, und bekommt den neuen Stand als Grundlage
 * gestempelt.
 *
 * Ohne diesen Knopf wäre die Warteschlange eine Strafe: eine Kommakorrektur
 * an `a.pitch` schickte jemanden durch 27 Gespräche, von denen 26 mit
 * demselben Satz enden. Die KI-Eingrenzung (`correct`-Modus) nimmt den
 * grössten Teil davon ab; dieser Knopf ist die Hand des Menschen für den Rest
 * — und der einzige Weg, wenn der Spezialist ausgefallen ist (fail-closed,
 * §7).
 *
 * ── ER SCHREIBT EINEN HASH, KEINEN WERT ──────────────────────────────────
 * `slots[id].sourcesHash` und sonst nichts: kein Text, keine Abnahme, keine
 * Bestätigung. Der Wert war schon bestätigt und bleibt Wort für Wort stehen —
 * „gilt weiter" ist eine Aussage über die GRUNDLAGE, nicht über den Inhalt.
 * Deshalb fällt hier auch `accepted` NICHT (anders als bei einer
 * Wert-Änderung): es wurde nichts geändert, was jemand neu lesen müsste.
 *
 * ── NUR AUF EINEM BESTÄTIGTEN WERT ───────────────────────────────────────
 * 409 `not_confirmed`, wie beim Abnehmen: ohne Bestätigung gibt es keine
 * Grundlage, die weitergelten könnte — und der Hash stünde an einem Entwurf,
 * der beim nächsten Bestätigen ohnehin neu gerechnet wird.
 *
 * ── NICHT VERALTET? DANN IST NICHTS ZU TUN ───────────────────────────────
 * Kein Fehler, keine Fassung: der Stempel wäre derselbe. Das ist die No-op-
 * Regel des Schema-Anhangs §2 an dieser Stelle — zwei Tabs, zwei Klicks, eine
 * Wirkung.
 */
export default defineEventHandler(async (event): Promise<BrandSessionAcceptResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const { profile, stepKey, stepRow, records, stepFacts } = context
  const body = await readValidatedBody(event, createBrandSessionRestampSchema().parse)

  const session = requireSessionParam(event, stepKey)

  const revision = stepRow.revision ?? 0
  if (body.revision !== revision) {
    throw createError({
      status: 409,
      statusText: 'Brand step was changed elsewhere',
      data: { code: 'revision_conflict', revision },
    })
  }

  const record = records[session.id]
  if (!brandSlotRecordConfirmed(record)) {
    throw createError({
      status: 409,
      statusText: 'Session is not confirmed',
      data: { code: 'not_confirmed' },
    })
  }

  // DERSELBE STEMPLER WIE BEIM BESTÄTIGEN (`brandSourcesHash` über die Fakten
  // ALLER Kapitel) — ein zweiter Weg dorthin wäre ein zweiter Hash für
  // denselben Stand, und die Session stünde gleich wieder bernstein.
  const fresh = brandSourcesHash(session, mergeBrandSlotFacts(stepFacts))
  const changed = record?.sourcesHash !== fresh

  const nextRecords: Record<string, BrandSlotRecord> = changed
    ? { ...records, [session.id]: { ...record, sourcesHash: fresh } }
    : records
  const nextRevision = changed ? revision + 1 : revision

  if (changed) {
    const { tablesDB, databaseId } = brandDb(event)
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: stepRow.$id,
        data: { slots: serializeSlotRecords(nextRecords), revision: nextRevision },
      })
    }
    catch (error) {
      throw toH3Error(error, 'Brand session could not be restamped')
    }
  }

  // NEU GERECHNET aus dem geschriebenen Stand — die Seite bekommt den Zähler,
  // den sie danach zeigen soll (der `stale`-Blocker ist gerade gefallen), ohne
  // einen zweiten Abruf. Dieselbe Kette wie in `writeBrandSessionFlag`.
  const afterFacts = withStepSlotFacts(stepFacts, stepKey, nextRecords)
  const derived = deriveBrandAcceptance(profile, stepKey, afterFacts, context.betaAccount, context.openConflicts)

  return {
    stepKey,
    sessionKey: session.id,
    revision: nextRevision,
    accepted: Boolean(record?.accepted),
    deferred: Boolean(record?.deferred),
    acceptance: derived.acceptance,
    next: resolveNextStop(
      stepKey,
      afterFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
      derived.sessionStates,
    ),
  }
})
