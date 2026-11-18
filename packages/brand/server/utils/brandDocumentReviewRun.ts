import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { brandDocumentRevisionInput, splitBrandDocumentCatchUp } from '../../shared/brandDocument'
import type { BrandFinding } from '../../shared/brandFindings'
import { BRAND_RUN_OUTCOMES } from '../../shared/brandRun'
import { BRAND_SLOTS, type BrandStepKey, slotById } from '../../shared/slotRegistry'
import { loadBrandConversationHistory } from './brandConversationHistory'
import { writeBrandFindings } from './brandFindingsStore'
import { runBrandSessionReview, type BrandReviewOutcome } from './brandReview'
import {
  brandReviewAllNotes,
  brandReviewChapter,
  brandReviewDocument,
  brandReviewSessionInfo,
} from './brandReviewInputs'
import { type BrandRunContext, brandRunProfileExists } from './brandRun'
import {
  BRAND_PROFILES_TABLE,
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  brandSlotRecordConfirmed,
  loadStepRows,
  parseSlotRecords,
  profileFacts,
  serializeSlotRecords,
} from './brandStore'

/**
 * DIE DOKUMENT-PRÜFUNG HINTER DER ANTWORT (LL1 d, 2026-11-18).
 *
 * Die Route (`profiles/[id]/review.post.ts`) prüft, was nichts kostet, nimmt
 * die Lauf-Sperre und antwortet `202`; hier steht die ARBEIT, die
 * `startBrandRun` danach fährt: bis zu zehn Sitzungs-Prüfungen nachholen,
 * dann das ganze Dokument prüfen. Das kann Minuten dauern — länger, als der
 * Webserver wartet (60 s).
 *
 * ── GESCHRIEBEN WIRD GEGEN DEN STAND VON JETZT ───────────────────────────
 * Hinter der Antwort schreibt der Mensch womöglich weiter (Autosave). Deshalb
 * liest der Lauf JEDE Kapitel-Zeile unmittelbar vor dem Schreiben neu und
 * setzt nur seine eigenen Felder des geprüften Slots ein (`reviewed`,
 * `review`, `notes`, `briefDelivered`). Hat sich der BESTÄTIGTE WERT des Slots
 * seit dem Lesen für die Prüfung geändert (oder ist er nicht mehr bestätigt),
 * gilt das Urteil einem alten Text: der Slot wird NICHT als geprüft markiert,
 * und seine Befunde werden nicht geschrieben. Dasselbe gilt für die Befunde
 * des Dokument-Blicks: einer, dessen Felder sich während des Blicks bewegt
 * haben, fällt weg. Ein schmales Fenster zwischen Neu-Lesen und Schreiben
 * bleibt (Appwrite kennt kein bedingtes Schreiben) — dieselbe Grenze wie bei
 * den anderen Läufen des Layers.
 *
 * ── NACH JEDER NACHGEHOLTEN SITZUNG WIRD GESCHRIEBEN ─────────────────────
 * Nicht erst am Ende: ein abgebrochener Lauf (Ausliefern, Anbieter weg)
 * behält seine fertigen Urteile. Der Fortschritt steht in `detail.created`.
 *
 * ── DER MERKER „FÜR DIESEN STAND SCHON GEPRÜFT" STEHT AN DER LAUF-ZEILE ──
 * `detail.ref` trägt den Stand-Schlüssel (sha256 über die `revision` aller
 * Kapitel des Weges), für den der Dokument-Blick gilt — aber nur, wenn sich
 * während des Blicks keine Kapitel-Zeile bewegt hat. Die Route vergleicht
 * ihn beim nächsten Klick; anders als der frühere Merker im Prozess hält er
 * über Prozesse und Neustarts.
 *
 * ── LOG §6 ──────────────────────────────────────────────────────────────
 * Nur Zahlen und Kennungen, nie ein Wert, nie ein Befundtext.
 */

/** Der Stand-Schlüssel des Dokuments — derselbe für Route und Lauf. */
export function brandDocumentReviewKey(
  profileId: string,
  included: readonly BrandStepKey[],
  revisionOf: (stepKey: BrandStepKey) => number,
): string {
  return createHash('sha256').update(brandDocumentRevisionInput(
    profileId,
    included.map(stepKey => ({ stepKey, revision: revisionOf(stepKey) })),
  )).digest('hex')
}

/** Die Slots je Kapitel, aus den gelesenen Zeilen. */
function recordsOf(rows: readonly BrandStepRow[]): Map<string, Record<string, BrandSlotRecord>> {
  return new Map(rows.map(row => [row.stepKey, parseSlotRecords(row.slots)]))
}

/** Bestätigte Sitzungen ohne Urteil, in Registry-Reihenfolge. */
export function brandDocumentUnreviewed(
  rows: readonly BrandStepRow[],
  included: ReadonlySet<string>,
): string[] {
  const records = recordsOf(rows)
  const open: string[] = []
  for (const session of BRAND_SLOTS) {
    if (session.deactivated || !included.has(session.stepId)) continue
    const record = records.get(session.stepId)?.[session.id]
    if (brandSlotRecordConfirmed(record) && record?.reviewed !== true) open.push(session.id)
  }
  return open
}

/** Gibt es im Weg überhaupt einen bestätigten Wert? Ohne ihn ist nichts zu prüfen. */
export function brandDocumentHasConfirmed(
  rows: readonly BrandStepRow[],
  included: ReadonlySet<string>,
): boolean {
  const records = recordsOf(rows)
  return BRAND_SLOTS.some(session => !session.deactivated
    && included.has(session.stepId)
    && brandSlotRecordConfirmed(records.get(session.stepId)?.[session.id]))
}

function mergedRecords(rows: readonly BrandStepRow[]): Record<string, BrandSlotRecord> {
  const records = recordsOf(rows)
  const merged: Record<string, BrandSlotRecord> = {}
  for (const session of BRAND_SLOTS) {
    const record = records.get(session.stepId)?.[session.id]
    if (record) merged[session.id] = record
  }
  return merged
}

export interface BrandDocumentReviewInput {
  event: H3Event
  userId: string
  betaAccount: boolean
  profile: BrandProfileRow
  /** Die Kapitel des Weges (ohne übersprungene), am Start gelesen. */
  included: readonly BrandStepKey[]
  /** Die Kapitel-Zeilen vom Start — nur für die Auswahl der Nachholung. */
  stepRows: readonly BrandStepRow[]
  /** Beweis-Schalter des Ersatz-Spezialisten (`?stub=conflict`). */
  stubFinding: boolean
}

type SlotWrite = 'written' | 'changed' | 'gone'

/**
 * EIN NACHGEHOLTES URTEIL SCHREIBEN — gegen die Zeile von JETZT (s. Kopf).
 * `changed`: der bestätigte Wert ist nicht mehr der geprüfte; `gone`: die
 * Kapitel-Zeile fehlt. Beides schreibt nichts.
 */
async function writeCaughtUpSlot(
  event: H3Event,
  profileId: string,
  stepKey: BrandStepKey,
  slotId: string,
  seenValue: string,
  outcome: BrandReviewOutcome,
): Promise<SlotWrite> {
  const row = (await loadStepRows(event, profileId)).find(entry => entry.stepKey === stepKey)
  if (!row) return 'gone'
  const records = parseSlotRecords(row.slots)
  const fresh = records[slotId]
  if (!brandSlotRecordConfirmed(fresh) || fresh?.confirmed !== seenValue) return 'changed'

  const review = outcome.review
  const reviewed: BrandSlotRecord = {
    ...fresh,
    reviewed: true,
    review: {
      goalReached: review.goalReached,
      missing: [...review.missing],
      reviewedBy: outcome.reviewedBy ?? 'stage1',
      at: new Date().toISOString(),
    },
    ...(review.notes.length ? { notes: review.notes.join('\n') } : {}),
    ...(review.goalReached ? {} : { briefDelivered: false }),
  }
  if (review.goalReached) delete reviewed.briefDelivered
  records[slotId] = reviewed

  const { tablesDB, databaseId } = brandDb(event)
  await tablesDB.updateRow({
    databaseId,
    tableId: BRAND_STEPS_TABLE,
    rowId: row.$id,
    data: { slots: serializeSlotRecords(records), revision: (row.revision ?? 0) + 1 },
  })
  return 'written'
}

/**
 * DIE ARBEIT DES LAUFS: Nachholung, dann der Blick über das Dokument.
 * Ausgang `done` oder ein kurzer Grund (`BRAND_RUN_OUTCOMES`).
 */
export async function runBrandDocumentReview(
  input: BrandDocumentReviewInput,
  { detail, progress, lost }: BrandRunContext,
): Promise<string> {
  const { event, userId, profile } = input
  const profileId = profile.$id
  const contentLocale = profile.contentLocale
  const { pathKind, team } = profileFacts(profile, input.betaAccount)
  const includedSet = new Set<string>(input.included)
  const started = Date.now()

  // ── 1 · Die Nachholung (§10) ────────────────────────────────────────────
  const split = splitBrandDocumentCatchUp(brandDocumentUnreviewed(input.stepRows, includedSet))
  let missed = 0
  let changed = 0

  for (const slotId of split.take) {
    if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
    const session = slotById(slotId)
    if (!session) {
      missed++
      continue
    }
    // Die Eingabe der Prüfung ist der Stand von JETZT — inklusive dessen, was
    // der Mensch seit dem Klick gespeichert hat.
    const rows = await loadStepRows(event, profileId)
    const record = recordsOf(rows).get(session.stepId)?.[slotId]
    // Inzwischen geschlossen (eigenes Urteil) oder nicht mehr bestätigt.
    if (!brandSlotRecordConfirmed(record) || record?.reviewed === true) continue
    const seenValue = record?.confirmed ?? ''
    const stepRow = rows.find(row => row.stepKey === session.stepId)
    const merged = mergedRecords(rows)

    const outcome = await runBrandSessionReview({
      event,
      userId,
      profileId,
      mode: 'session',
      stepKey: session.stepId,
      session: brandReviewSessionInfo(session, contentLocale, pathKind, team),
      value: seenValue,
      history: await loadBrandConversationHistory(
        event, profileId, session.stepId, session.id, stepRow?.restartedAt,
      ),
      document: brandReviewDocument(merged, contentLocale, pathKind, team),
      chapter: brandReviewChapter(merged, session.stepId, contentLocale, pathKind, team),
      notes: brandReviewAllNotes(merged, contentLocale, pathKind, team),
      // KEIN Wegweiser: der Prüfblick holt ein Urteil nach.
      openSessions: [],
    })
    if (!outcome.reviewed) {
      missed++
      continue
    }

    // Ohne Herzschlag darf ein anderer Start übernehmen — dann schreibt
    // DIESER Lauf nichts mehr. Ohne Marke entsteht nichts ohne Besitzer.
    if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
    if (!await brandRunProfileExists(event, BRAND_PROFILES_TABLE, profileId)) {
      return BRAND_RUN_OUTCOMES.profileGone
    }

    const written = await writeCaughtUpSlot(event, profileId, session.stepId, slotId, seenValue, outcome)
    if (written !== 'written') {
      changed++
      logEvent('info', 'brand.document_catchup_skipped', { stepKey: session.stepId, slotId, reason: written })
      continue
    }
    // Die Befunde einer nachgeholten Sitzung gehören IHR (§8).
    await writeBrandFindings(event, {
      profileId,
      stepKey: session.stepId,
      sourceSession: session.id,
      findings: outcome.review.findings,
    })
    detail.created += 1
    await progress()
  }

  // ── 2 · Der Blick über das ganze Dokument (§10) ─────────────────────────
  if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
  const before = await loadStepRows(event, profileId)
  const revisionsBefore = new Map(before.map(row => [row.stepKey, row.revision ?? 0]))
  const merged = mergedRecords(before)
  const documentEntries = brandReviewDocument(merged, contentLocale, pathKind, team)

  const outcome = await runBrandSessionReview({
    event,
    userId,
    profileId,
    mode: 'chapter',
    scope: 'document',
    // Nur eine Ansage im Prompt (s. `taskLines`) — das erste Kapitel des Weges.
    stepKey: input.included[0] ?? 'context',
    session: null,
    value: '',
    history: [],
    document: documentEntries,
    // Dieselbe Liste: der Prompt schickt sie GENAU EINMAL (s. `inputBlocks`).
    chapter: documentEntries,
    notes: brandReviewAllNotes(merged, contentLocale, pathKind, team),
    openSessions: [],
    stubFinding: input.stubFinding,
  })

  if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
  if (!await brandRunProfileExists(event, BRAND_PROFILES_TABLE, profileId)) {
    return BRAND_RUN_OUTCOMES.profileGone
  }

  let dropped = 0
  if (outcome.reviewed) {
    // Was hat sich WÄHREND des Blicks bewegt? Ein Befund über ein solches
    // Feld urteilt über einen alten Text und fällt weg (s. Kopf).
    const after = await loadStepRows(event, profileId)
    const afterRecords = mergedRecords(after)
    const moved = new Set<string>()
    for (const slotId of new Set([...Object.keys(merged), ...Object.keys(afterRecords)])) {
      if ((merged[slotId]?.confirmed ?? '') !== (afterRecords[slotId]?.confirmed ?? '')) moved.add(slotId)
    }
    const findings: BrandFinding[] = outcome.review.findings
      .filter(finding => finding.slots.every(slot => !moved.has(slot)))
    dropped = outcome.review.findings.length - findings.length

    /** Ein Dokument-Befund gehört dorthin, wo sein ERSTES Feld wohnt. */
    const anchorOf = (finding: BrandFinding) => slotById(finding.slots[0] ?? '')
    await writeBrandFindings(event, {
      profileId,
      stepKey: finding => anchorOf(finding)?.stepId ?? input.included[0] ?? 'context',
      sourceSession: finding => anchorOf(finding)?.id ?? finding.slots[0] ?? '',
      findings,
    })

    // Der Merker gilt nur, wenn der Blick den Stand sah, der jetzt steht.
    const unchanged = input.included
      .every(stepKey => (after.find(row => row.stepKey === stepKey)?.revision ?? 0) === (revisionsBefore.get(stepKey) ?? 0))
    detail.ref = unchanged
      ? brandDocumentReviewKey(profileId, input.included, stepKey => revisionsBefore.get(stepKey) ?? 0)
      : ''
  }

  logEvent('info', 'brand.document_reviewed', {
    caughtUp: detail.created,
    missed,
    changed,
    rest: split.rest.length,
    reviewedBy: outcome.reviewed ? (outcome.reviewedBy ?? '') : '',
    dropped,
    ms: Date.now() - started,
  })

  return outcome.reviewed ? BRAND_RUN_OUTCOMES.done : BRAND_RUN_OUTCOMES.reviewUnavailable
}
