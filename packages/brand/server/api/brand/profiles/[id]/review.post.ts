import { createHash } from 'node:crypto'
import type { BrandFinding, BrandReviewStage } from '../../../../../shared/brandFindings'
import {
  brandDocumentRevisionInput,
  splitBrandDocumentCatchUp,
} from '../../../../../shared/brandDocument'
import {
  BRAND_SLOTS,
  type BrandStepKey,
  slotById,
} from '../../../../../shared/slotRegistry'
import type {
  BrandDocumentReviewResponse,
  BrandFindingView,
} from '../../../../../shared/types/brand'
import { loadBrandDocumentContext } from '../../../../utils/brandAcceptance'
import { loadBrandConversationHistory } from '../../../../utils/brandConversationHistory'
import {
  listBrandFindings,
  toBrandFindingView,
  writeBrandFindings,
} from '../../../../utils/brandFindingsStore'
import {
  claimBrandDocumentReview,
  rememberBrandDocumentReview,
  runBrandSessionReview,
} from '../../../../utils/brandReview'
import {
  brandReviewAllNotes,
  brandReviewChapter,
  brandReviewDocument,
  brandReviewSessionInfo,
} from '../../../../utils/brandReviewInputs'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  brandSlotRecordConfirmed,
  parseSlotRecords,
  profileFacts,
  serializeSlotRecords,
} from '../../../../utils/brandStore'

/**
 * DER PRÜFBLICK (BW2 Paket 7, Plan §10) — der Spezialist über das GANZE
 * Dokument, ausgelöst von einem Menschen.
 *
 * ── NIE AUTOMATISCH (§16, Davids Entscheidung 2026-09-04) ────────────────
 * Es gibt genau einen Auslöser: diesen POST, hinter dem Knopf „Dokument
 * prüfen". Kein Seitenaufruf, kein Öffnen, kein Reload. Der Aufruf wiegt 5 im
 * Tages-Eimer (§13) und liest neun Kapitel — er gehört bestellt, nicht
 * verabreicht.
 *
 * ── DREI SCHRITTE, IN DIESER REIHENFOLGE ─────────────────────────────────
 *  1. NACHHOLUNG: jede bestätigte Session ohne Urteil bekommt ihren
 *     Schliess-Aufruf nachgereicht (Modus `session`, Gewicht 1 je Session,
 *     höchstens `BRAND_DOCUMENT_CATCHUP_MAX`). Sie steht ZUERST, weil ihre
 *     Notizen in den Dokument-Blick eingehen: erst wenn die Sessions gelesen
 *     sind, hat der Blick über alles die volle Grundlage.
 *  2. DOKUMENT: EIN Aufruf im Kapitel-Modus mit `scope: 'document'` — nur
 *     `findings` als Nutzlast (Widersprüche, Lücken, Schärfungen).
 *  3. Was dabei herauskommt, geht in `brand_findings` — dedupliziert wie
 *     überall (gleiche Art, gleiche Felder, noch offen).
 *
 * ── ALLES FAIL-SOFT (§7) ─────────────────────────────────────────────────
 * Eine gescheiterte Nachholung bleibt ungeprüft und wird gemeldet
 * (`stillUnreviewed`); ein gescheiterter Dokument-Blick antwortet mit
 * `reviewedBy: null` und der Liste, die ohnehin in der Tabelle steht. Nichts
 * davon sperrt etwas — der Prüfblick ist eine ZUGABE, so wie jeder Befund.
 *
 * ── IDEMPOTENT JE DOKUMENT-STAND ─────────────────────────────────────────
 * `claimBrandDocumentReview` riegelt über einen Hash aus profileId und den
 * `revision`-Ständen aller Kapitel des Weges. Derselbe Stand ⇒ 200 mit dem
 * gemerkten Ergebnis und ohne einen einzigen Anbieter-Aufruf. Der Merker ist
 * PROZESS-lokal, und der Grund steht bei ihm: `brand_profiles` hat kein freies
 * JSON-Feld, und eine Spalte, deren einziger Zweck ein Cache-Stempel ist, wäre
 * eine Migration auf jeder Instanz für einen gesparten Klick.
 *
 * ── SIE HAT KEINEN RUMPF ─────────────────────────────────────────────────
 * Wie der Kapitel-Blick: der Idempotenz-Schlüssel ist der Stand, wie der SERVER
 * ihn liest. Ihn vom Client entgegenzunehmen wäre eine zweite Wahrheit über
 * denselben Augenblick — und ein veralteter Wert von dort liesse denselben
 * Blick ein zweites Mal zu.
 */
export default defineEventHandler(async (event): Promise<BrandDocumentReviewResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandDocumentContext(event, userId, betaAccount)
  const { profile, stepRows, journey, sessionStates } = context

  const contentLocale = profile.contentLocale
  const { pathKind, team } = profileFacts(profile, betaAccount)

  /** Die Kapitel des WEGES — übersprungene gehören nicht zum Dokument (§10). */
  const included = journey.filter(entry => entry.state !== 'skipped').map(entry => entry.stepKey)
  const includedSet = new Set<BrandStepKey>(included)

  /**
   * DER STAND, WIE ER JETZT IST — und wie er nach der Nachholung sein wird.
   *
   * Die Nachholung SCHREIBT (`reviewed`, Notizen), also bewegt sie die
   * `revision` der Kapitel, die sie berührt. Gemerkt wird deshalb der Stand
   * DANACH: der nächste Klick rechnet genau ihn, und ohne diese Unterscheidung
   * wäre der Riegel wirkungslos, sobald ein einziges Urteil nachzuholen war —
   * ein Doppelklick kostete dann zweimal 5.
   */
  const revisionByStep = new Map<string, number>(
    stepRows.map(row => [row.stepKey, row.revision ?? 0]),
  )

  function documentKey(): string {
    return createHash('sha256').update(brandDocumentRevisionInput(
      profile.$id,
      included.map(stepKey => ({ stepKey, revision: revisionByStep.get(stepKey) ?? 0 })),
    )).digest('hex')
  }

  const revisionKey = documentKey()

  /** Die gelesenen Slots je Kapitel — lokal fortgeschrieben, am Ende geschrieben. */
  const recordsByStep = new Map<string, Record<string, BrandSlotRecord>>(
    stepRows.map(row => [row.stepKey, parseSlotRecords(row.slots)]),
  )

  function unreviewedNow(): string[] {
    const open: string[] = []
    for (const session of BRAND_SLOTS) {
      if (session.deactivated || !includedSet.has(session.stepId)) continue
      const record = recordsByStep.get(session.stepId)?.[session.id]
      if (brandSlotRecordConfirmed(record) && record?.reviewed !== true) open.push(session.id)
    }
    return open
  }

  /** Die offenen Befunde nach diesem Lauf — sie kommen IMMER aus der Tabelle. */
  async function openFindings(): Promise<BrandFindingView[]> {
    return (await listBrandFindings(event, profile.$id, 'open')).map(toBrandFindingView)
  }

  const claim = claimBrandDocumentReview(profile.$id, revisionKey)
  if (!claim.granted) {
    const previous = claim.previous
    return {
      ran: false,
      caughtUp: [...(previous?.caughtUp ?? [])],
      // Was JETZT noch ungeprüft ist, sagt der Stand und nicht der alte Lauf:
      // zwischen den beiden Klicks kann eine Session geschlossen worden sein.
      stillUnreviewed: unreviewedNow(),
      findings: await openFindings(),
      reviewedBy: previous?.reviewedBy ?? null,
      revisionKey,
    }
  }

  /** ALLE bestätigten Werte, quer über die Kapitel — die Eingabe beider Stufen. */
  function allRecords(): Record<string, BrandSlotRecord> {
    const merged: Record<string, BrandSlotRecord> = {}
    for (const session of BRAND_SLOTS) {
      const record = recordsByStep.get(session.stepId)?.[session.id]
      if (record) merged[session.id] = record
    }
    return merged
  }

  // ── 1 · Die Nachholung (§10) ────────────────────────────────────────────
  const split = splitBrandDocumentCatchUp(unreviewedNow())
  const caughtUp: string[] = []
  const missed: string[] = []
  /** Kapitel, deren Zeile sich durch die Nachholung bewegt hat. */
  const touched = new Set<string>()

  for (const slotId of split.take) {
    const session = slotById(slotId)
    const records = session ? recordsByStep.get(session.stepId) : undefined
    const record = session ? records?.[slotId] : undefined
    if (!session || !records || !record) {
      missed.push(slotId)
      continue
    }
    const stepRow = stepRows.find(row => row.stepKey === session.stepId)
    const merged = allRecords()

    const outcome = await runBrandSessionReview({
      event,
      userId,
      profileId: profile.$id,
      mode: 'session',
      stepKey: session.stepId,
      session: brandReviewSessionInfo(session, contentLocale, pathKind, team),
      value: record.confirmed ?? '',
      history: await loadBrandConversationHistory(
        event, profile.$id, session.stepId, session.id, stepRow?.restartedAt,
      ),
      document: brandReviewDocument(merged, contentLocale, pathKind, team),
      chapter: brandReviewChapter(merged, session.stepId, contentLocale, pathKind, team),
      notes: brandReviewAllNotes(merged, contentLocale, pathKind, team),
      // KEIN Wegweiser: der Prüfblick schickt niemanden in ein Gespräch, er
      // holt ein Urteil nach. Eine leere Liste heisst „antworte null" (s. Prompt).
      openSessions: [],
    })

    if (!outcome.reviewed) {
      missed.push(slotId)
      continue
    }

    const review = outcome.review
    const reviewedRecord: BrandSlotRecord = {
      ...record,
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
    if (review.goalReached) delete reviewedRecord.briefDelivered
    records[slotId] = reviewedRecord
    touched.add(session.stepId)
    caughtUp.push(slotId)

    // Die Befunde einer nachgeholten Session gehören IHR — wie beim
    // gewöhnlichen Schliess-Aufruf (§8).
    await writeBrandFindings(event, {
      profileId: profile.$id,
      stepKey: session.stepId,
      sourceSession: session.id,
      findings: review.findings,
    })
  }

  /**
   * EINE SCHREIBUNG JE KAPITEL, am Ende der Nachholung.
   *
   * Die Marke `reviewed` ändert den Dokument-INHALT nicht — die späteren
   * Aufrufe lesen dieselben Werte wie die früheren. Deshalb darf gesammelt
   * werden, und zehn Nachholungen in einem Kapitel kosten eine Fassung statt
   * zehn. Fail-soft: eine klemmende Zeile kostet die Marken dieses Kapitels,
   * nicht den Prüfblick.
   */
  const { tablesDB, databaseId } = brandDb(event)
  for (const stepKey of touched) {
    const row = stepRows.find(entry => entry.stepKey === stepKey)
    const records = recordsByStep.get(stepKey)
    if (!row || !records) continue
    const nextRevision = (row.revision ?? 0) + 1
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_STEPS_TABLE,
        rowId: row.$id,
        data: { slots: serializeSlotRecords(records), revision: nextRevision },
      })
      revisionByStep.set(stepKey, nextRevision)
    }
    catch (error) {
      logEvent('warn', 'brand.document_catchup_write_failed', {
        stepKey,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // ── 2 · Der Blick über das ganze Dokument (§10) ─────────────────────────
  const merged = allRecords()
  const documentEntries = brandReviewDocument(merged, contentLocale, pathKind, team)

  const outcome = await runBrandSessionReview({
    event,
    userId,
    profileId: profile.$id,
    mode: 'chapter',
    scope: 'document',
    // Der Modus verlangt einen Kapitel-Schlüssel für seine Aufgabe; im
    // Prüfblick ist er nur eine Ansage und wird vom Prompt nicht mehr benutzt
    // (s. `taskLines`). Das erste Kapitel des Weges ist der ehrlichste Wert —
    // eine erfundene Zeichenkette wäre einer, den ein Log nicht einordnen kann.
    stepKey: included[0] ?? 'context',
    session: null,
    value: '',
    history: [],
    document: documentEntries,
    // Dieselbe Liste: der Prompt schickt sie GENAU EINMAL (s. `inputBlocks`).
    chapter: documentEntries,
    notes: brandReviewAllNotes(merged, contentLocale, pathKind, team),
    openSessions: [],
    stubFinding: String(getQuery(event).stub ?? '') === 'conflict',
  })

  if (outcome.reviewed) {
    /**
     * EIN DOKUMENT-BEFUND GEHÖRT DORTHIN, WO SEIN FELD WOHNT.
     *
     * Anders als beim Schliess-Aufruf gibt es hier keine Quell-Session: der
     * Blick lief über alles. Der Anker ist deshalb das ERSTE beteiligte Feld —
     * dort findet ein Mensch ihn wieder, dort landet ein Ablehnungs-Grund als
     * Notiz, und dort sperrt ein offener Konflikt die Abnahme seines Kapitels
     * (§5a Schritt 3). Ein fester Stempel für alle wäre neunmal falsch.
     */
    const anchorOf = (finding: BrandFinding) => slotById(finding.slots[0] ?? '')
    await writeBrandFindings(event, {
      profileId: profile.$id,
      stepKey: finding => anchorOf(finding)?.stepId ?? included[0] ?? 'context',
      sourceSession: finding => anchorOf(finding)?.id ?? finding.slots[0] ?? '',
      findings: outcome.review.findings,
    })
  }

  const reviewedBy: BrandReviewStage | null = outcome.reviewed ? outcome.reviewedBy : null
  // Der Stand NACH der Nachholung — s. `documentKey`.
  const finalKey = documentKey()
  rememberBrandDocumentReview(profile.$id, {
    revisionKey: finalKey,
    at: new Date().toISOString(),
    caughtUp,
    reviewedBy,
  })

  logEvent('info', 'brand.document_reviewed', {
    caughtUp: caughtUp.length,
    stillUnreviewed: missed.length + split.rest.length,
    reviewedBy: reviewedBy ?? '',
    sessions: Object.keys(sessionStates).length,
  })

  return {
    ran: true,
    caughtUp,
    // Der Deckel-Rest UND die fail-soft ausgefallenen — beide warten auf den
    // nächsten Klick, und beide gehören genannt.
    stillUnreviewed: [...missed, ...split.rest],
    findings: await openFindings(),
    reviewedBy,
    revisionKey: finalKey,
  }
})
