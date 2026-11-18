import { BRAND_RUN_SCOPES, emptyBrandRunDetail, parseBrandRunDetail, toBrandRunView } from '../../../../../shared/brandRun'
import type { BrandStepKey } from '../../../../../shared/slotRegistry'
import type { BrandDocumentReviewStartResponse } from '../../../../../shared/types/brand'
import { loadBrandDocumentContext } from '../../../../utils/brandAcceptance'
import {
  brandDocumentHasConfirmed,
  brandDocumentReviewKey,
  runBrandDocumentReview,
} from '../../../../utils/brandDocumentReviewRun'
import {
  brandRunStore,
  readBrandRunView,
  runningBrandRunView,
  startBrandRun,
} from '../../../../utils/brandRun'

/**
 * DER PRÜFBLICK (BW2 Paket 7, Plan §10) — der Spezialist über das GANZE
 * Dokument, ausgelöst von einem Menschen. Seit LL1 d (2026-11-18) rechnet er
 * HINTER DER ANTWORT.
 *
 * ── NIE AUTOMATISCH (§16, Davids Entscheidung 2026-09-04) ────────────────
 * Genau ein Auslöser: dieser POST, hinter dem Knopf „Dokument prüfen".
 *
 * ── WARUM IM HINTERGRUND ─────────────────────────────────────────────────
 * Er holt bis zu zehn Sitzungs-Prüfungen nach und prüft dann das ganze
 * Dokument — je zwei Stufen, im ungünstigsten Fall (10 + 1) × 2 Text-Läufe.
 * Das dauert länger, als der Webserver wartet (60 s); der Mensch sähe einen
 * Fehler, obwohl der Lauf gelingt. Ein Zeitdeckel wäre hier kein ehrliches
 * Teil-Ergebnis (der Dokument-Blick käme fast nie dran). Deshalb wie die drei
 * N10-Wege: prüfen, was nichts kostet → Lauf-Sperre in `brand_runs` (Art
 * `doc-review`, Gegenstand = die Marke; ein zweiter Start ⇒ 409
 * `run_running`) → `202` → der Lauf rechnet in `startBrandRun`
 * (`brandDocumentReviewRun.ts`). Das Kontingent bucht jede Stufe selbst
 * (`runBrandSessionReview`), also erst NACH der Sperre.
 *
 * ── WAS AUS DER SPERRE IM PROZESS WURDE ──────────────────────────────────
 * `claimBrandDocumentReview` ist weg. Sie hatte zwei Zwecke, und beide trägt
 * jetzt die Lauf-Zeile, über Prozesse und Neustarts hinweg: (1) „läuft schon"
 * hält die Lauf-Sperre — ein Merker im Prozess hielt einen zweiten Prozess
 * nicht auf; (2) „für diesen Stand schon geprüft" steht als Stand-Schlüssel in
 * `detail.ref` des letzten fertigen Laufs. Gleicher Schlüssel ⇒ sofort 200,
 * kein Lauf, kein Geld. Ein gescheiterter Lauf hinterlässt keinen Schlüssel,
 * der nächste Klick versucht es wieder.
 *
 * ── DAS ERGEBNIS ─────────────────────────────────────────────────────────
 * Die Seite fragt `GET …/document` ab: dort steht der Lauf-Stand
 * (`reviewRun`: Zustand, Ausgang, nachgeholte Sitzungen), die Befunde (aus
 * der Tabelle) und was noch ungeprüft ist.
 *
 * ── SIE HAT KEINEN RUMPF ─────────────────────────────────────────────────
 * Der Stand ist der, den der SERVER liest — nie ein Wert vom Client.
 */
export default defineEventHandler(async (event): Promise<BrandDocumentReviewStartResponse> => {
  // (1) Zugang und Besitz — ein fremdes Konto bekommt dieselbe 404 wie eine
  // unbekannte Marke (`loadOwnedProfile`).
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandDocumentContext(event, userId, betaAccount)
  const { profile, stepRows, journey } = context

  /** Die Kapitel des WEGES — übersprungene gehören nicht zum Dokument (§10). */
  const included: BrandStepKey[] = journey.filter(entry => entry.state !== 'skipped').map(entry => entry.stepKey)
  const includedSet = new Set<string>(included)
  const revisionKey = brandDocumentReviewKey(
    profile.$id,
    included,
    stepKey => stepRows.find(row => row.stepKey === stepKey)?.revision ?? 0,
  )

  // (2) Nichts zu tun? — ohne Lauf, sofort.
  const store = brandRunStore(event)
  let previous: Awaited<ReturnType<typeof store.latest>> = null
  try {
    previous = await store.latest(BRAND_RUN_SCOPES.documentReview, profile.$id)
  }
  catch {
    // Fail-soft: ohne lesbaren Vorgänger gibt es keinen Merker; die Sperre
    // unten liest selbst und lehnt sauber ab, wenn die Tabelle fehlt.
  }
  const previousView = toBrandRunView(previous, Date.now())
  if (previousView.state === 'done' && parseBrandRunDetail(previous?.detail).ref === revisionKey) {
    logEvent('info', 'brand.document_review_unchanged', { profileId: profile.$id })
    return { ok: true, started: false, run: previousView }
  }
  if (!brandDocumentHasConfirmed(stepRows, includedSet)) {
    return { ok: true, started: false, run: await readBrandRunView(event, BRAND_RUN_SCOPES.documentReview, profile.$id) }
  }

  // (3) DIE SPERRE — ein Doppelklick, ein zweiter Reiter, ein zweiter Prozess
  // bekommt 409 `run_running`.
  const detail = emptyBrandRunDetail()
  const { lease } = await acquireRunLease(store, {
    scope: BRAND_RUN_SCOPES.documentReview,
    subject: profile.$id,
    detail,
  })

  // (4) DER LAUF — hinter der Antwort. In die Antwort schreibt er nicht; der
  // Beweis-Schalter wird deshalb JETZT gelesen.
  const stubFinding = String(getQuery(event).stub ?? '') === 'conflict'
  startBrandRun({
    label: 'brand-doc-review',
    store,
    lease,
    detail,
    work: context => runBrandDocumentReview({
      event,
      userId,
      betaAccount,
      profile,
      included,
      stepRows,
      stubFinding,
    }, context),
  })

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return { ok: true, started: true, run: runningBrandRunView(lease, detail) }
})
