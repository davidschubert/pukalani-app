import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { mergeBrandSlotFacts } from '../../shared/brandJourney'
import { type BrandCorrectionImpact, confirmedDependents } from '../../shared/brandSessions'
import {
  type BrandSlotStateFacts,
  type BrandStepKey,
  slotById,
} from '../../shared/slotRegistry'
import type { BrandSessionImpactResponse } from '../../shared/types/brand'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  brandSourcesHash,
  parseSlotRecords,
  serializeSlotRecords,
  toStepFacts,
} from './brandStore'

/**
 * DIE KORREKTUR-REGEL AUF DER SERVERSEITE (BW2 Paket 6,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §9).
 *
 * Drei Dinge, die alle drei am gespeicherten Stand hängen und deshalb nicht in
 * `shared/` können: der ACK-HASH (sha256, `node:crypto` läge sonst im
 * Client-Bündel), die ANSICHT der Hülle für die Route und das NEU-STEMPELN der
 * nicht getroffenen Felder. Die Rechnungen selbst sind pur
 * (`confirmedDependents`, `correctionNeedsAck`, `applyAffected`) — hier steht
 * nur, was daraus geschrieben wird.
 *
 * ── WARUM DER ACK ÜBERHAUPT EXISTIERT ─────────────────────────────────────
 * „Diese Änderung berührt 14 bestätigte Felder" ist eine Ankündigung. Ohne
 * einen Wert, der genau diese Ankündigung bezeichnet, wäre sie eine Zeile
 * Markup: ein zweiter Tab, ein alter Client oder ein direkter Aufruf gingen
 * daran vorbei, und der Mensch verlöre den Anschluss von vierzehn Feldern,
 * ohne je gefragt worden zu sein. Der Hash bindet DREI Dinge zusammen — das
 * Feld, die `revision` der Kapitel-Zeile und die sortierte Hülle. Bewegt sich
 * eines davon zwischen dem Zeigen und dem Klick, passt er nicht mehr, und der
 * Layer zeigt neu, statt etwas zu lösen, das so nie angekündigt war.
 */

/**
 * Derselbe Trenner wie im Generations-, Quellen- und Restart-Hash — ein
 * Zeichen, das in keiner Slot-Id vorkommen kann. Als ESCAPE geschrieben und
 * nie als Byte: ein rohes U+0000 macht die Datei für git zu einer Binärdatei.
 */
const SEPARATOR = '\u0000'

/**
 * DER ACK-HASH EINER KORREKTUR (§9 Schritt 3) — dasselbe Muster wie
 * `brandRestartAck`.
 *
 * SORTIERT und nicht in Registry-Reihenfolge: der Hash ist eine Aussage über
 * die MENGE, nicht über ihre Anzeige. Die Reihenfolge, in der die Oberfläche
 * die Felder auflistet, darf sich ändern, ohne einen Menschen zweimal zu
 * fragen.
 */
export function brandCorrectionAck(
  slotId: string,
  revision: number,
  sessions: readonly string[],
): string {
  const canonical = [slotId, String(revision), ...[...sessions].sort()].join(SEPARATOR)
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * WAS DIE ROUTE ZEIGT — die bestätigte Hülle plus ihr Ack. Nichts wird
 * geschrieben, nichts gerechnet, was der Browser nicht selbst rechnen könnte:
 * die eine Sache, die er NICHT kann, ist der Hash, und genau der ist die
 * Durchsetzung.
 */
export function brandCorrectionImpactView(
  slotId: string,
  stepKey: BrandStepKey,
  revision: number,
  allFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
): BrandSessionImpactResponse {
  const impact: BrandCorrectionImpact = confirmedDependents(slotId, allFacts)
  const byStep: Partial<Record<BrandStepKey, string[]>> = {}
  for (const [key, ids] of Object.entries(impact.byStep)) {
    byStep[key as BrandStepKey] = [...(ids ?? [])]
  }
  return {
    slotId,
    stepKey,
    revision,
    direct: [...impact.direct],
    transitive: [...impact.transitive],
    byStep,
    count: impact.count,
    ack: brandCorrectionAck(slotId, revision, impact.transitive),
  }
}

export interface BrandRestampResult {
  /** Die Sessions, deren Quell-Hash wirklich neu steht — sie sind wieder `done`. */
  stamped: string[]
  /**
   * Die neue `revision` je geschriebener Kapitel-Zeile ($id → Fassung).
   *
   * Sie MUSS nach draussen: liegt ein neu gestempeltes Feld im SELBEN Kapitel
   * (`c.final` → `c.definitions` ist der Normalfall), hat diese Funktion
   * dieselbe Zeile ein zweites Mal geschrieben — und der Client, der noch die
   * Fassung von davor hält, liefe mit seinem nächsten Autosave in einen 409,
   * den niemand ausgelöst hat.
   */
  revisionOf: Record<string, number>
  /**
   * Der neue Slot-Stand je geschriebener Zeile ($id → Datensätze) — aus
   * demselben Grund wie `revisionOf`: wer nach dem Stempeln noch etwas aus dem
   * eigenen Kapitel rechnet (den Wegweiser etwa), rechnete sonst mit einer
   * Session, die er selbst gerade geheilt hat, und schickte den Menschen in
   * eine Warteschlange, die leer ist.
   */
  recordsOf: Record<string, Record<string, BrandSlotRecord>>
}

/**
 * DER NEUE STEMPEL FÜR DIE NICHT GETROFFENEN FELDER (§9 „Die Eingrenzung").
 *
 * ── WARUM DAS SCHREIBEN ÜBER KAPITELGRENZEN GEHT ─────────────────────────
 * Die Hülle einer Korrektur liegt fast nie im eigenen Kapitel: `a.pitch`
 * berührt Felder in sieben. Jede betroffene Kapitel-Zeile wird deshalb einzeln
 * geschrieben, mit eigener `revision` — es gibt keine Sammel-Zeile, und eine
 * Transaktion über neun Zeilen gibt es in Appwrite auch nicht.
 *
 * ── FAIL-SOFT, UND ZWAR IN DIE SICHERE RICHTUNG ──────────────────────────
 * Scheitert eine Zeile, bleiben IHRE Felder `stale`. Das ist genau der
 * Zustand, den der Mensch mit einem Klick („gilt weiter") selbst auflösen
 * kann — und der ihm nichts verschweigt. Ein geworfener Fehler machte aus
 * einer geglückten Bestätigung eine gescheiterte Route.
 *
 * ── DER HASH WIRD NEU GERECHNET, NICHT KOPIERT ───────────────────────────
 * Gestempelt wird der Stand, der JETZT gilt (`brandSourcesHash` über die
 * Fakten aller Kapitel inklusive der eben geschriebenen Zeile). Einen alten
 * Hash stehen zu lassen wäre dasselbe wie nicht zu stempeln.
 */
export async function restampBrandSessions(
  event: H3Event,
  options: {
    /** Alle Kapitel-Zeilen, die eben geschriebene bereits eingesetzt. */
    stepRows: readonly BrandStepRow[]
    /** Die Sessions, deren Quell-Hash neu gesetzt wird. */
    sessions: readonly string[]
  },
): Promise<BrandRestampResult> {
  if (options.sessions.length === 0) return { stamped: [], revisionOf: {}, recordsOf: {} }

  const facts = mergeBrandSlotFacts(toStepFacts(options.stepRows))
  /** Session-Ids je Kapitel-Zeile — eine Zeile wird höchstens einmal geschrieben. */
  const byRow = new Map<string, string[]>()
  for (const sessionId of options.sessions) {
    const home = slotById(sessionId)?.stepId
    if (!home) continue
    const row = options.stepRows.find(entry => entry.stepKey === home)
    if (!row) continue
    byRow.set(row.$id, [...(byRow.get(row.$id) ?? []), sessionId])
  }

  const stamped: string[] = []
  const revisionOf: Record<string, number> = {}
  const recordsOf: Record<string, Record<string, BrandSlotRecord>> = {}
  const { tablesDB, databaseId } = brandDb(event)
  for (const [rowId, sessionIds] of byRow) {
    const row = options.stepRows.find(entry => entry.$id === rowId)!
    const records = parseSlotRecords(row.slots)
    const next: Record<string, BrandSlotRecord> = { ...records }
    const written: string[] = []
    for (const sessionId of sessionIds) {
      const config = slotById(sessionId)
      const record = records[sessionId]
      // Ohne bestätigten Wert gibt es nichts zu stempeln — die Hülle zählt nur
      // Bestätigtes, aber zwischen dem Zeigen und hier kann eine Sitzung
      // dazwischengekommen sein.
      if (!config || !record?.confirmed) continue
      const fresh = brandSourcesHash(config, facts)
      /**
       * NUR WAS WIRKLICH VERALTET IST (2026-09-05 am Beweis gelernt).
       *
       * Die transitive Hülle ist GRÖSSER als die Menge der mechanisch
       * veralteten Felder: `c.final` hängt über `c.candidates` an
       * `a.customerPraise`, sein eigener Quell-Hash rechnet aber nur über
       * `c.candidates` — und der bewegt sich erst, wenn DESSEN Wert sich
       * ändert. Ein Stempel auf so ein Feld schriebe denselben Hash noch
       * einmal und erhöhte dabei die `revision` einer fremden Kapitel-Zeile:
       * ein Konflikt für jeden Tab, der sie gerade offen hat, für nichts.
       */
      if (record.sourcesHash === fresh) continue
      next[sessionId] = { ...record, sourcesHash: fresh }
      written.push(sessionId)
    }
    if (written.length === 0) continue

    const revision = (row.revision ?? 0) + 1
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId,
        data: { slots: serializeSlotRecords(next), revision },
      })
      stamped.push(...written)
      revisionOf[rowId] = revision
      recordsOf[rowId] = next
    }
    catch (error) {
      // s. Kopf: die Felder dieser Zeile bleiben `stale`, mehr passiert nicht.
      logEvent('warn', 'brand.restamp_failed', {
        stepKey: row.stepKey,
        sessions: written.length,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { stamped, revisionOf, recordsOf }
}
