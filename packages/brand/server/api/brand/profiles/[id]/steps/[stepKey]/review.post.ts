import { slotsForStep } from '../../../../../../../shared/slotRegistry'
import type {
  BrandFindingView,
  BrandStepReviewResponse,
} from '../../../../../../../shared/types/brand'
import { loadBrandAcceptanceContext } from '../../../../../../utils/brandAcceptance'
import {
  listBrandFindings,
  toBrandFindingView,
  writeBrandFindings,
} from '../../../../../../utils/brandFindingsStore'
import {
  claimBrandChapterReview,
  runBrandSessionReview,
} from '../../../../../../utils/brandReview'
import {
  brandReviewChapter,
  brandReviewDocument,
  brandReviewNotes,
} from '../../../../../../utils/brandReviewInputs'
import { mergeStepSlotRecords, profileFacts } from '../../../../../../utils/brandStore'

/**
 * DER SPEZIALIST LIEST DAS KAPITEL MIT (BW2 Paket 4, Plan §5a/§7
 * Kapitel-Modus) — die Molekül-Ebene der Prüfung.
 *
 * ── EINE EBENE ÜBER DEM SCHLIESS-AUFRUF ──────────────────────────────────
 * Der Schliess-Aufruf prüft EINEN neuen Wert gegen das Dokument; hier liegen
 * alle bestätigten Werte eines Kapitels NEBENEINANDER, und erst so fällt auf,
 * dass zwei davon dasselbe sagen oder sich widersprechen. Es ist dieselbe
 * Prüfung wie der Prüfblick (§10), nur auf einem Kapitel statt auf der ganzen
 * Foundation.
 *
 * ── SIE ANTWORTET NUR MIT BEFUNDEN ───────────────────────────────────────
 * Kein `goalReached` (das ist eine Frage an EINE Session), kein `nextSession`
 * (hier wird nichts gesprochen), keine Notizen (die gehören der Session, die
 * sie gelernt hat). Die Antwort-Form ist trotzdem dieselbe — das Zod-Schema
 * kennt genau einen Umschlag, und ein zweiter wäre der erste, der beim
 * nächsten Umbau vergessen wird.
 *
 * ── FAIL-SOFT UND IDEMPOTENT ─────────────────────────────────────────────
 * Die Abnahme-Seite funktioniert ohne Befunde (§5a): scheitert der Aufruf, ist
 * `reviewed: false` und die Liste zeigt, was ohnehin schon in der Tabelle
 * steht. Und dieselbe FASSUNG eines Kapitels wird genau einmal geprüft
 * (`claimBrandChapterReview`) — sonst kostete jedes Aufschlagen der Seite
 * einen Aufruf über das ganze Dokument.
 *
 * ── SIE SCHREIBT NICHTS AUSSER BEFUNDEN, UND SIE HAT KEINEN RUMPF ────────
 * Keine `revision`, kein Slot, keine Notiz. Es gibt hier auch nichts, was ein
 * zweiter Tab überholen könnte — also gibt es keinen Rumpf: der
 * Idempotenz-Schlüssel ist die `revision` der KAPITEL-ZEILE, wie der Server sie
 * liest. Sie vom Client entgegenzunehmen wäre eine zweite Wahrheit über
 * denselben Augenblick, und ein veralteter Wert von dort liesse denselben
 * Blick ein zweites Mal zu.
 */
export default defineEventHandler(async (event): Promise<BrandStepReviewResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const { profile, stepKey, stepRow, stepRows, records } = context

  const revision = stepRow.revision ?? 0
  const stepSlotIds = new Set(slotsForStep(stepKey).map(entry => entry.id))

  /** Die offenen Befunde, an denen ein Feld dieses Kapitels beteiligt ist. */
  async function chapterFindings(): Promise<BrandFindingView[]> {
    const rows = await listBrandFindings(event, profile.$id, 'open')
    return rows
      .map(toBrandFindingView)
      .filter(view => view.slots.some(slotId => stepSlotIds.has(slotId)))
  }

  if (!claimBrandChapterReview(profile.$id, stepKey, revision)) {
    // Schon geprüft — die Auskunft kommt trotzdem, nur eben aus der Tabelle.
    return { stepKey, revision, reviewed: true, reviewedBy: null, findings: await chapterFindings() }
  }

  const contentLocale = profile.contentLocale
  const { pathKind, team } = profileFacts(profile, betaAccount)
  const allRecords = mergeStepSlotRecords(stepRows)

  const outcome = await runBrandSessionReview({
    event,
    userId,
    profileId: profile.$id,
    mode: 'chapter',
    stepKey,
    session: null,
    value: '',
    history: [],
    document: brandReviewDocument(allRecords, contentLocale, pathKind, team),
    chapter: brandReviewChapter(allRecords, stepKey, contentLocale, pathKind, team),
    notes: brandReviewNotes(records, stepKey, contentLocale, pathKind, team),
    openSessions: [],
    stubFinding: String(getQuery(event).stub ?? '') === 'conflict',
  })

  if (outcome.reviewed) {
    await writeBrandFindings(event, {
      profileId: profile.$id,
      stepKey,
      // Der Kapitel-Blick gehört keiner Session — der Stempel nennt deshalb
      // das KAPITEL. `sourceSession` bleibt trotzdem gefüllt (es ist eine
      // Pflichtspalte), damit ein Ablehnungs-Grund einen Ort hat: die erste
      // Session des Kapitels ist die, an der ein Mensch es wiederfindet.
      sourceSession: slotsForStep(stepKey)[0]?.id ?? stepKey,
      findings: outcome.review.findings,
    })
  }

  return {
    stepKey,
    revision,
    reviewed: outcome.reviewed,
    reviewedBy: outcome.reviewedBy,
    findings: await chapterFindings(),
  }
})
