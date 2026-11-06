import { createBrandSessionCloseSchema } from '../../../../../../../../../schemas/brandReview'
import type { BrandFinding, BrandReviewStage } from '../../../../../../../../../shared/brandFindings'
import { mergeBrandSlotFacts, pickNextSession } from '../../../../../../../../../shared/brandJourney'
import { applyAffected, confirmedDependents } from '../../../../../../../../../shared/brandSessions'
import { slotsForStep } from '../../../../../../../../../shared/slotRegistry'
import type {
  BrandFindingView,
  BrandSessionCloseResponse,
  BrandSessionReview,
} from '../../../../../../../../../shared/types/brand'
import {
  loadBrandAcceptanceContext,
  requireSessionParam,
  withStepSlotFacts,
} from '../../../../../../../../utils/brandAcceptance'
import { restampBrandSessions } from '../../../../../../../../utils/brandCorrection'
import {
  listBrandFindings,
  toBrandFindingView,
  writeBrandFindings,
} from '../../../../../../../../utils/brandFindingsStore'
import { loadBrandConversationHistory } from '../../../../../../../../utils/brandConversationHistory'
import { BRAND_REVIEW_EMPTY, runBrandSessionReview } from '../../../../../../../../utils/brandReview'
import { brandSlotPromptLabel } from '../../../../../../../../utils/brandSlotPromptLabels'
import {
  brandReviewChapter,
  brandReviewDocument,
  brandReviewNotes,
  brandReviewOpenSessions,
  brandReviewSessionInfo,
} from '../../../../../../../../utils/brandReviewInputs'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  brandSlotRecordConfirmed,
  mergeStepSlotRecords,
  profileFacts,
  resolveBrandSessionStates,
  serializeSlotRecords,
} from '../../../../../../../../utils/brandStore'

/**
 * DER SPEZIALIST BEIM SCHLIESSEN (BW2 Paket 4, Plan §7) — EIN Aufruf je
 * bestätigter Session.
 *
 * ── ER IST DIE ZWEITE HÄLFTE DES BESTÄTIGENS, NICHT SEIN TÜRSTEHER ────────
 * Bestätigt wird im Autosave-PATCH; diese Route läuft DANACH und ändert an der
 * Bestätigung nichts. `goalReached: false` sperrt nichts, ein Konflikt sperrt
 * nichts, ein Ausfall des Anbieters sperrt nichts (§7). Was sie hinterlässt,
 * sind vier Dinge: das Urteil und die Notizen an der Session, die Befunde in
 * ihrer eigenen Tabelle, die Marke `reviewed` für den Prüfblick — und den
 * Wegweiser, der den Auto-Weiter beweglich macht.
 *
 * Ein Spezialist, der Bestätigungen abweisen könnte, wäre ein zweiter
 * Schreibweg neben `transitionBrandStep`; genau das ist er nicht.
 *
 * ── IDEMPOTENT, UND ZWAR AUS KOSTENGRÜNDEN ───────────────────────────────
 * Der Client ruft die Route im Hintergrund nach jedem Bestätigen. Ein Retry,
 * ein zweiter Tab oder ein „Korrigieren-und-wieder-Bestätigen" ohne Änderung
 * dürfen nicht ein zweites Mal bezahlt werden: ist die Session schon geprüft
 * (`slots[id].reviewed`), antwortet die Route mit dem GESPEICHERTEN Urteil und
 * ohne einen einzigen Anbieter-Aufruf. `force` ist der ausdrückliche Gegenweg
 * und wird vom Client nie geschickt.
 *
 * ── 409 `not_confirmed`, NICHT 400 ───────────────────────────────────────
 * Was hier geprüft wird, ist ein BESTÄTIGTER Wert. Fehlt er, ist das kein
 * kaputter Rumpf, sondern ein Konflikt mit dem Serverstand — dieselbe Familie
 * wie `revision_conflict` und dieselbe Antwort wie beim Abnehmen: die
 * Oberfläche lädt neu, statt einen Eingabefehler zu melden, den niemand
 * gemacht hat.
 *
 * ── FAIL-SOFT SCHREIBT GAR NICHTS ────────────────────────────────────────
 * Kein Urteil heisst: keine Zeile bewegt, keine `revision` erhöht, `reviewed:
 * false` in der Antwort. Ein gespeichertes `reviewed: false` wäre die dritte
 * Auskunft neben „nicht da" und „true" — und der Prüfblick (§10) sucht genau
 * die Sessions OHNE Marke.
 */
export default defineEventHandler(async (event): Promise<BrandSessionCloseResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const { profile, stepKey, stepRow, stepRows, records, stepFacts } = context
  const body = await readValidatedBody(event, createBrandSessionCloseSchema().parse)

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

  const contentLocale = profile.contentLocale
  const { pathKind, team } = profileFacts(profile, betaAccount)
  const stepSlotIds = slotsForStep(stepKey).map(entry => entry.id)

  /** Die offenen Befunde, an denen ein Feld DIESES Kapitels beteiligt ist. */
  async function chapterFindings(): Promise<BrandFindingView[]> {
    const rows = await listBrandFindings(event, profile.$id, 'open')
    const views = rows.map(toBrandFindingView)
    const own = new Set(stepSlotIds)
    return views.filter(view => view.slots.some(slotId => own.has(slotId)))
  }

  /** Der Wegweiser — der geprüfte Vorschlag, sonst die Grundfassung (§6). */
  function nextStop(
    nextRecords: Record<string, BrandSlotRecord>,
    suggestion: string | null,
  ) {
    const afterFacts = withStepSlotFacts(stepFacts, stepKey, nextRecords)
    return pickNextSession(
      stepKey,
      {
        slots: afterFacts.find(entry => entry.stepKey === stepKey)?.slots ?? {},
        sessions: resolveBrandSessionStates(profileFacts(profile, betaAccount), afterFacts),
      },
      suggestion,
    )
  }

  /**
   * DER VOR-WERT EINER KORREKTUR (§9) — er steht VOR der Idempotenz-Weiche,
   * weil er sie aufhebt.
   *
   * Nach einer Korrektur trägt der Datensatz noch das Urteil über den ALTEN
   * Wortlaut (`reviewed: true`). Ohne diese Ausnahme antwortete die Route
   * damit — und der `correct`-Modus, um dessentwillen es Paket 6 gibt, liefe
   * nie. Die Kostenregel von Paket 4 bleibt trotzdem stehen: sie gilt dem
   * zweiten Klick auf DENSELBEN Wert, und genau den gibt es hier nicht.
   */
  const previousValue = record?.previousValue

  // ── Schon geprüft? Dann kostet dieser Aufruf nichts (s. Kopf). ───────────
  if (record?.reviewed && !body.force && previousValue === undefined) {
    const stored: BrandSessionReview = {
      goalReached: record.review?.goalReached ?? true,
      missing: [...(record.review?.missing ?? [])],
      notes: record.notes ? record.notes.split('\n').filter(Boolean) : [],
      // Die BEFUNDE stehen in ihrer eigenen Tabelle und werden dort gelesen —
      // sie im Slot-Datensatz zu spiegeln wären zwei Wahrheiten über einen
      // Zustand, den ein Mensch inzwischen geändert haben kann.
      findings: [],
      nextSession: record.nextSession ?? null,
    }
    return {
      stepKey,
      sessionKey: session.id,
      review: stored,
      findings: await chapterFindings(),
      next: nextStop(records, stored.nextSession),
      revision,
      reviewed: true,
      reviewedBy: (record.review?.reviewedBy === 'stage2' ? 'stage2' : 'stage1') satisfies BrandReviewStage,
    }
  }

  /**
   * IST DAS EINE KORREKTUR? (BW2 Paket 6, §9 „Die Eingrenzung durch den
   * Spezialisten".)
   *
   * ZWEI Bedingungen, und die Route entscheidet es selbst — der Client sagt
   * nirgends „das war eine Korrektur":
   *
   *  1. `previousValue` steht am Datensatz. Gesetzt hat ihn der
   *     Autosave-PATCH, als „Korrigieren" dieses Feld geöffnet hat — und nur
   *     dann, wenn dabei ein Ack fällig war.
   *  2. Die Hülle ist AUCH JETZT noch nicht leer. Zwischen dem Öffnen und dem
   *     erneuten Bestätigen kann jemand die abhängigen Felder aufgehoben
   *     haben; dann gibt es nichts einzugrenzen, und der teurere Modus mit
   *     seinen zusätzlichen Eingaben wäre bezahlte Arbeit ohne Gegenstand.
   *
   * Die Hülle wird über den Stand VOR diesem Aufruf gerechnet: die Sessions
   * darin sind bestätigt und mechanisch veraltet, weil sich ihr Quell-Hash mit
   * dem neuen Wert bewegt hat.
   */
  const hull = previousValue === undefined
    ? []
    : confirmedDependents(session.id, mergeBrandSlotFacts(stepFacts)).transitive
  const correcting = previousValue !== undefined && hull.length > 0

  // ── Die Eingaben (§7): Config, Wert, Verlauf, Dokument, Notizen ─────────
  const allRecords = mergeStepSlotRecords(stepRows)
  const outcome = await runBrandSessionReview({
    event,
    userId,
    profileId: profile.$id,
    mode: correcting ? 'correct' : 'session',
    stepKey,
    session: brandReviewSessionInfo(session, contentLocale, pathKind, team),
    value: record?.confirmed ?? '',
    history: await loadBrandConversationHistory(
      event, profile.$id, stepKey, session.id, stepRow.restartedAt,
    ),
    document: brandReviewDocument(allRecords, contentLocale, pathKind, team),
    chapter: brandReviewChapter(allRecords, stepKey, contentLocale, pathKind, team),
    notes: brandReviewNotes(records, stepKey, contentLocale, pathKind, team),
    openSessions: brandReviewOpenSessions(stepKey, context.sessionStates, contentLocale, pathKind, team),
    // DIE HÜLLE MIT WERTEN (§9): nur so kann der Spezialist sagen, welches
    // Feld die Änderung inhaltlich trifft — eine Liste nackter Ids wäre eine
    // Frage nach einem Inhalt, den er nicht kennt.
    ...(correcting
      ? {
          staleFields: hull.map(slotId => ({
            slotId,
            label: brandSlotPromptLabel(slotId, contentLocale, pathKind, team),
            value: allRecords[slotId]?.confirmed ?? '',
          })),
          previousValue,
        }
      : {}),
    // Nur wirksam, solange der Ersatz-Spezialist läuft (Beweis-Schalter).
    stubFinding: String(getQuery(event).stub ?? '') === 'conflict',
    stubAffected: String(getQuery(event).stub ?? '') === 'affected',
  })

  if (!outcome.reviewed) {
    // FAIL-SOFT: nichts geschrieben, nichts erhöht (s. Kopf).
    return {
      stepKey,
      sessionKey: session.id,
      review: BRAND_REVIEW_EMPTY,
      findings: await chapterFindings(),
      next: nextStop(records, null),
      revision,
      reviewed: false,
      reviewedBy: null,
    }
  }

  const review = outcome.review
  const nextRecords: Record<string, BrandSlotRecord> = {
    ...records,
    [session.id]: {
      ...record,
      reviewed: true,
      review: {
        goalReached: review.goalReached,
        missing: [...review.missing],
        reviewedBy: outcome.reviewedBy ?? 'stage1',
        at: new Date().toISOString(),
      },
      // Die NOTIZEN ersetzen die vorigen, sie wachsen nicht an: derselbe
      // Aufruf über denselben Wert soll denselben Stand hinterlassen, sonst
      // sammelte ein „Korrigieren und wieder bestätigen" drei Fassungen
      // desselben Satzes in einer gedeckelten Spalte.
      ...(review.notes.length ? { notes: review.notes.join('\n') } : {}),
      // Ein NEUES Urteil heisst: George darf es einmal aussprechen (§7).
      ...(review.goalReached ? {} : { briefDelivered: false }),
      ...(review.nextSession ? { nextSession: review.nextSession } : {}),
    },
  }
  // Das Briefing-Flag wird GELÖSCHT statt auf `true` gesetzt, wenn es nichts
  // zu sagen gibt — „fehlt" heisst hier überall dasselbe wie „nein".
  if (review.goalReached) delete nextRecords[session.id]!.briefDelivered
  /**
   * DER VOR-WERT HAT SEINE ARBEIT GETAN (§9).
   *
   * Er wird gelöscht, sobald dieser Aufruf WIRKLICH schreibt — nicht schon
   * beim Lesen: ein fail-soft ausgefallener Aufruf (Drossel, Anbieter) darf
   * seine eigene Eingabe nicht verbrennen, sonst wäre der zweite Versuch
   * keine Korrektur mehr, sondern eine gewöhnliche Bestätigung, und die Hülle
   * bliebe für immer bernstein.
   */
  if (previousValue !== undefined) delete nextRecords[session.id]!.previousValue

  const nextRevision = revision + 1
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
    throw toH3Error(error, 'Brand session could not be closed')
  }

  /**
   * DIE EINGRENZUNG (§9) — was die Korrektur NICHT trifft, wird neu gestempelt.
   *
   * `applyAffected` teilt die Hülle in zwei Hälften: die getroffenen bleiben
   * `stale` (bernstein, mit ihrem Befund), die übrigen bekommen den heutigen
   * Quell-Hash und sind wieder `done`. Ohne gültige Antwort ist `affected`
   * gar nicht da, und die Regel ist fail-CLOSED — dann bleibt alles stehen und
   * der Mensch entscheidet selbst („gilt weiter" oder neu besprechen).
   *
   * GESTEMPELT WIRD MIT DEM SCHON GESCHRIEBENEN STAND: die Kapitel-Zeile oben
   * ist durch, also muss der Hash über den neuen Wert rechnen — sonst
   * stempelte er genau die Fassung, die gerade veraltet ist.
   */
  const split = correcting
    ? applyAffected(hull, review.affected)
    : { restamp: [], stale: [] }
  const restamp = await restampBrandSessions(event, {
    stepRows: stepRows.map(row => (row.$id === stepRow.$id
      ? { ...row, slots: serializeSlotRecords(nextRecords), revision: nextRevision }
      : row)),
    sessions: split.restamp,
  })
  // Ein Feld DESSELBEN Kapitels hat die eigene Zeile ein zweites Mal
  // geschrieben — dann gilt deren Fassung, sonst liefe der nächste Autosave
  // des Clients in einen 409 (s. `BrandRestampResult.revisionOf`).
  const finalRevision = restamp.revisionOf[stepRow.$id] ?? nextRevision
  const finalRecords = restamp.recordsOf[stepRow.$id] ?? nextRecords

  // Die Befunde in ihre eigene Tabelle — fail-soft und dedupliziert (s. dort).
  // Ein `affected`-Befund an einem Feld, das gerade neu gestempelt wurde, wäre
  // ein Chip ohne Anlass: gefiltert wird deshalb auf die WIRKLICH veralteten.
  const survivors = new Set(split.stale)
  await writeBrandFindings(event, {
    profileId: profile.$id,
    stepKey,
    sourceSession: session.id,
    findings: review.findings.filter((finding: BrandFinding) => finding.kind !== 'affected'
      || finding.slots.every(slotId => survivors.has(slotId))),
  })

  return {
    stepKey,
    sessionKey: session.id,
    review,
    findings: await chapterFindings(),
    next: nextStop(finalRecords, review.nextSession),
    revision: finalRevision,
    reviewed: true,
    reviewedBy: outcome.reviewedBy,
    ...(correcting ? { correction: { affected: [...split.stale], restamped: restamp.stamped } } : {}),
  }
})
