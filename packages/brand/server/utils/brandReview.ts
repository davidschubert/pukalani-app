import type { H3Event } from 'h3'
import { BRAND_AI_REVIEW_WEIGHTS } from '../../shared/brandAiLimits'
import {
  type BrandFinding,
  type BrandReviewMode,
  type BrandReviewStage,
  needsStageTwo,
} from '../../shared/brandFindings'
import type { BrandStepKey } from '../../shared/slotRegistry'
import type { BrandSessionReview } from '../../shared/types/brand'
import { createBrandSessionReviewSchema } from '../../schemas/brandReview'
import { bookBrandAiQuota } from './brandAiQuota'
import { BRAND_PROVIDER_ROUTING } from './brandProviderRouting'
import { brandDevStubEnabled, readBrandAiEnabled } from './brandGenerators'
import type { BrandConverseHistoryTurn } from './conversePrompt'
import {
  BRAND_REVIEW_MAX_TOKENS,
  BRAND_REVIEW_PROMPT_VERSION,
  type BrandReviewDocumentEntry,
  type BrandReviewScope,
  type BrandReviewSessionInfo,
  brandReviewPrompt,
  brandReviewSystemPrompt,
} from './reviewPrompt'

/**
 * DER SCHLIESS-AUFRUF: DER SPEZIALIST (BW2 Paket 4,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §7).
 *
 * EIN Aufruf je Session, beim Bestätigen — nicht je Zug. Der Marker-Vertrag
 * (`georgeTurn.ts`) wurde genau gebaut, um einen zweiten Aufruf je Zug zu
 * vermeiden (Geld, Latenz); dieser hier ist der eine, den es dafür gibt.
 *
 * ── ZWEISTUFIG, UND WARUM DAS KEIN LUXUS IST (Davids Entscheidung 2026-09-04)
 * Stufe 1 läuft mit dem günstigen Modell (`pukalani.brand.ai.reviewModel`) über
 * JEDE geschlossene Session — 68 Aufrufe je Fundament. Stufe 2 läuft mit dem
 * George-Modell und NUR dort, wo Stufe 1 einen `conflict` oder `affected`
 * vermutet: genau die zwei Arten, die den Kunden etwas kosten. Ein falscher
 * Konflikt sperrt später die Finale Abnahme (§5a Schritt 3), ein falsches
 * `affected` schickt ihn in ein Gespräch, das er nicht führen müsste.
 *
 * Die Antwort der Stufe 2 ERSETZT die Befunde — sie darf streichen und
 * schärfen. Alles andere (`notes`, `nextSession`, `goalReached`, `missing`)
 * bleibt von Stufe 1: das sind Urteile über die SESSION, und die hat Stufe 1
 * mit denselben Eingaben gefällt. Zwei Urteile darüber zu mischen hiesse, das
 * teurere für Fragen zu bezahlen, die längst beantwortet waren.
 *
 * Scheitert Stufe 2 (Drossel, Anbieter, Schema), gilt Stufe 1 — mit
 * `reviewedBy: 'stage1'` im Ergebnis, damit man einer Befund-Liste ansieht,
 * wer sie geschrieben hat.
 *
 * ── FAIL-SOFT IST DIE REGEL, NICHT DER AUSNAHMEFALL (§7) ──────────────────
 * Drossel, Anbieter, Schema, fehlender Schlüssel, ausgeschaltete KI: in JEDEM
 * dieser Fälle bleibt der bestätigte Wert geschrieben, `notes`/`findings`
 * bleiben leer, `nextSession` fällt auf die Grundfassung, und die Session
 * trägt `reviewed: false` — der Prüfblick (§10, Paket 7) holt genau diese
 * nach. Ein Spezialist, der eine Bestätigung verhindert, wäre ein zweiter
 * Schreibweg neben `transitionBrandStep`.
 *
 * Die AUSNAHME `correct` ist seit Paket 6 verdrahtet, und dort ist fail-soft
 * fail-CLOSED in Richtung „bitte ansehen": ohne gültige Antwort fehlt
 * `affected` ganz, und `applyAffected` lässt dann ALLE mechanisch veralteten
 * Felder veraltet. Die Entscheidung darüber steht nicht hier, sondern in
 * dieser einen puren Funktion — hier kommt einfach kein `affected` an, und das
 * ist genau die Auskunft, die sie braucht.
 *
 * ── ER SCHREIBT NICHT ─────────────────────────────────────────────────────
 * Diese Datei ruft den Anbieter und prüft die Antwort. Was davon in
 * `brand_steps.slots` und in `brand_findings` landet, entscheidet die Route —
 * dieselbe Trennung wie zwischen `advisorGenerator.ts` und `generate.post.ts`.
 *
 * ── LOG-REGEL §6 ──────────────────────────────────────────────────────────
 * Eine Warnzeile ohne Inhalt: Modus, Kapitel, Session-Id, Fehlercode, Dauer.
 * NIE der Prompt, NIE der Wert, NIE ein Befundtext.
 */

/** Kein Urteil, keine Befunde — die Form, die fail-soft zurückgibt. */
export const BRAND_REVIEW_EMPTY: BrandSessionReview = {
  goalReached: true,
  missing: [],
  notes: [],
  findings: [],
  nextSession: null,
}

/**
 * WARUM KEIN URTEIL ZUSTANDE KAM. Nur fürs Log — nach draussen geht
 * ausschliesslich `reviewed: false` (dieselbe Zurückhaltung wie bei
 * `conversed: false`: WARUM ist Sache des Servers).
 */
export type BrandReviewFailure =
  | 'ai_disabled'
  | 'throttled'
  | 'provider_error'
  | 'schema_error'

export interface BrandReviewOutcome {
  /** `false` heisst fail-soft: der Wert steht, das Urteil fehlt (§7). */
  reviewed: boolean
  /** Wer die Befunde geschrieben hat — `null`, wenn keine Stufe durchkam. */
  reviewedBy: BrandReviewStage | null
  review: BrandSessionReview
  failure?: BrandReviewFailure
}

export interface BrandReviewRequest {
  event: H3Event
  userId: string
  profileId: string
  mode: BrandReviewMode
  /**
   * NUR im Kapitel-Modus: `document` macht daraus den PRÜFBLICK (§10) — dieselbe
   * Antwort-Form, alle Kapitel im Prompt, Gewicht 5 statt 2. Ohne Angabe gilt
   * `chapter`, also bleibt jeder bestehende Aufrufer unverändert.
   */
  scope?: BrandReviewScope
  stepKey: BrandStepKey
  /** `null` im Kapitel-Modus. */
  session: BrandReviewSessionInfo | null
  value: string
  history: readonly BrandConverseHistoryTurn[]
  document: readonly BrandReviewDocumentEntry[]
  chapter: readonly BrandReviewDocumentEntry[]
  notes: readonly BrandReviewDocumentEntry[]
  openSessions: readonly { id: string, label: string }[]
  staleFields?: readonly BrandReviewDocumentEntry[]
  /** Nur `correct` (§9): der bestätigte Wortlaut VOR der Korrektur. */
  previousValue?: string
  /**
   * NUR FÜR BEWEISE: der Entwicklungs-Ersatz soll einen Beispiel-Befund
   * liefern. Ohne diesen Wunsch tut er es NIE — sonst erzeugte jeder Klick in
   * der Entwicklung einen Konflikt, und die Finale Abnahme wäre dort
   * dauerhaft gesperrt. Er wirkt ausschliesslich, solange der Ersatz überhaupt
   * läuft (s. `reviewStubEnabled`).
   */
  stubFinding?: boolean
  /**
   * NUR FÜR BEWEISE, `correct`-Modus: der Ersatz soll GENAU EIN veraltetes
   * Feld als getroffen melden (§9). Ohne diesen Wunsch meldet er `affected:
   * []` — „nachgesehen, es trifft nichts", der freundliche Normalfall, der
   * alle mechanisch veralteten Felder wieder grün stempelt.
   */
  stubAffected?: boolean
}

/**
 * DAS MODELL DER STUFE 1 — `pukalani.brand.ai.reviewModel`.
 *
 * Ohne Eintrag gibt es KEINEN stillen Rückfall auf das George-Modell: Stufe 1
 * soll das günstige sein, und ein Rückfall auf das teure machte aus einer
 * fehlenden Konfiguration eine 68-fach höhere Rechnung, die niemand bemerkt.
 * Fehlt der Schlüssel, gilt der Layer-Default aus `app/app.config.ts`; steht
 * dort etwas Leeres, läuft der Aufruf gar nicht erst (fail-soft, s. u.).
 */
function reviewModel(): string {
  const config = useAppConfig() as { pukalani?: { brand?: { ai?: { reviewModel?: unknown } } } }
  const model = config.pukalani?.brand?.ai?.reviewModel
  return typeof model === 'string' ? model.trim() : ''
}

/**
 * DIESELBEN DATENSCHUTZ-BEDINGUNGEN WIE JEDER ANDERE BRAND-AUFRUF — seit dem
 * Brand-Check aus `brandProviderRouting.ts`.
 *
 * Hier stand bis dahin eine eigene Kopie mit der Begründung, dass die eine an
 * der STREAM-Naht hängt und diese am JSON-Transport. Mit dem DRITTEN Aufrufer
 * (dem Check-Urteil) trägt das nicht mehr: „die drei Werte dürfen nie
 * abweichen" ist als Verabredung zwischen drei Dateien keine Regel, sondern
 * eine Hoffnung. Ein Befund über die Marke ist derselbe Markeninhalt wie ein
 * Entwurf — und bekommt deshalb wörtlich dieselben Bedingungen.
 */

/** Ein JSON-Aufruf ist kein Strom — 45 s Core-Default reichen, 60 s sind Luft. */
const BRAND_REVIEW_TIMEOUT_MS = 60_000

/**
 * LÄUFT DER ERSATZ-SPEZIALIST? — der Ersatz-Generator ODER die
 * Beweis-Umgebungsvariable.
 *
 * ── WARUM ES ZWEI SCHALTER SIND ───────────────────────────────────────────
 * `pukalani.brand.devStubGenerator` steht nur im `.playground` auf `true`; der
 * BEWEIS (`verify-brand-sessions.mjs`) läuft aber gegen einen Dev-Server der
 * `branding`-App, weil nur dort die Datentür, der Zugang und die neun
 * Kapitel-Zeilen echt sind. Ohne einen zweiten Weg wäre der Beweis auf einen
 * KI-Schlüssel und eine bezahlte Runde angewiesen — und ein Beweis, der Geld
 * kostet, wird nicht gefahren.
 *
 * Die Variable ist bewusst OHNE `NUXT_`-Präfix: sie ist keine Runtime-Config
 * und soll auch nicht so aussehen. Auf einem Server ist sie nicht gesetzt, und
 * `ops:site-env` kennt sie nicht — sie ist kein Pflichtschlüssel, sondern ein
 * Handgriff am Beweis.
 */
function reviewStubEnabled(): boolean {
  return brandDevStubEnabled() || process.env.BRAND_DEV_STUB_REVIEW === '1'
}

/**
 * DER DETERMINISTISCHE ERSATZ (§13 „im Dev der bestehende Stub").
 *
 * Er ruft keinen Anbieter, kostet nichts und bucht deshalb auch nichts — genau
 * wie `brandDevStubGenerator`. Er sagt in seiner Notiz, dass er ein Ersatz ist:
 * ein Urteil, das wie ein Urteil aussieht, landet irgendwann in einem
 * Screenshot.
 *
 * Einen BEFUND liefert er nur auf ausdrücklichen Wunsch (`stubFinding`), und
 * das ist der Punkt: ein Konflikt sperrt die Finale Abnahme, und ein Ersatz,
 * der bei jedem Klick einen erfindet, machte die Entwicklung unbedienbar.
 */
function stubReview(request: BrandReviewRequest): BrandSessionReview {
  const notes = [`Ersatz-Spezialist (${request.mode}) — kein Sprachmodell beteiligt.`]
  const findings: BrandFinding[] = []

  if (request.stubFinding) {
    // Zwei VERSCHIEDENE Felder mit bestätigtem Wert, sonst wäre der Befund
    // ungültig (`brandFindingIsUsable`) und der Ersatz bewiese das Gegenteil
    // von dem, was er beweisen soll.
    const pool = request.mode === 'chapter'
      ? request.chapter.map(entry => entry.slotId)
      : [request.session?.id ?? '', ...request.document.map(entry => entry.slotId)]
    const [first, second] = [...new Set(pool.filter(Boolean))]
    if (first && second) {
      findings.push({
        kind: 'conflict',
        slots: [first, second],
        why: 'Ersatz-Befund für den Beweis — er zeigt, dass ein offener Konflikt die Abnahme sperrt.',
        suggestion: 'Im echten Betrieb steht hier der Satz des Spezialisten.',
      })
    }
  }

  /**
   * DIE EINGRENZUNG IM ERSATZ (§9): ohne Wunsch trifft die Korrektur NICHTS —
   * dann stempelt der Server alle mechanisch veralteten Felder neu, und der
   * Beweis sieht die freundliche Hälfte der Regel. `stubAffected` zeigt die
   * andere: genau der ERSTE Abhängige bleibt veraltet und bekommt seinen
   * Befund. Zwei Läufe, zwei Ausgänge, kein Sprachmodell.
   */
  const affected: string[] = []
  if (request.mode === 'correct') {
    const first = request.staleFields?.[0]?.slotId
    if (request.stubAffected && first) {
      affected.push(first)
      findings.push({
        kind: 'affected',
        slots: [first],
        why: 'Ersatz-Befund für den Beweis — er zeigt, dass ein getroffenes Feld veraltet bleibt.',
      })
    }
  }

  return {
    goalReached: true,
    missing: [],
    notes,
    findings,
    // Deterministisch die LETZTE offene Session — und bewusst nicht die erste:
    // die wäre die Grundfassung (`resolveNextStop`), und ein Beweis, der beide
    // nicht auseinanderhalten kann, beweist die adaptive Wahl nicht.
    nextSession: request.openSessions.at(-1)?.id ?? null,
    ...(request.mode === 'correct' ? { affected } : {}),
  }
}

/** Der Prompt dieses Laufs — einmal gebaut, von beiden Stufen benutzt. */
function promptFor(request: BrandReviewRequest, hypothesis?: readonly BrandFinding[]): string {
  return brandReviewPrompt({
    mode: request.mode,
    ...(request.scope ? { scope: request.scope } : {}),
    stepKey: request.stepKey,
    session: request.session,
    value: request.value,
    history: request.history,
    document: request.document,
    chapter: request.chapter,
    notes: request.notes,
    openSessions: request.openSessions,
    ...(request.staleFields ? { staleFields: request.staleFields } : {}),
    ...(request.previousValue ? { previousValue: request.previousValue } : {}),
    ...(hypothesis ? { hypothesis } : {}),
  })
}

interface StageResult {
  review?: BrandSessionReview
  failure?: BrandReviewFailure
}

/**
 * EINE STUFE: buchen, rufen, prüfen. Sie wirft NIE — jeder Ausgang ist entweder
 * ein geprüftes Urteil oder ein Grund fürs Log.
 */
async function runStage(
  request: BrandReviewRequest,
  model: string,
  weight: number,
  prompt: string,
): Promise<StageResult> {
  if (!model) return { failure: 'provider_error' }

  const rejection = await bookBrandAiQuota(request.event, {
    userId: request.userId,
    profileId: request.profileId,
    kind: 'review',
    weight,
  })
  if (rejection) {
    logEvent('info', 'brand.review_throttled', {
      mode: request.mode,
      stepKey: request.stepKey,
      code: rejection.code,
    })
    return { failure: 'throttled' }
  }

  let raw: unknown
  try {
    raw = await aiCompleteJson<unknown>(request.event, prompt, {
      model,
      system: brandReviewSystemPrompt(),
      label: 'brand-review',
      maxTokens: BRAND_REVIEW_MAX_TOKENS,
      timeoutMs: BRAND_REVIEW_TIMEOUT_MS,
      // Ein Urteil soll bei gleicher Eingabe möglichst gleich ausfallen —
      // deutlich unter dem Core-Default von 0.2.
      temperature: 0,
      providerRouting: { ...BRAND_PROVIDER_ROUTING },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.review_provider_error', {
      mode: request.mode,
      stepKey: request.stepKey,
      // Die MELDUNG des Anbieters, nicht der Prompt und nicht die Antwort.
      message: error instanceof Error ? error.message : String(error),
    })
    return { failure: 'provider_error' }
  }

  const parsed = createBrandSessionReviewSchema(request.mode).safeParse(raw)
  if (!parsed.success) {
    // Der FEHLER, nicht die Antwort: der Grund steht in den Pfaden des Schemas,
    // und die tragen keinen Inhalt.
    logEvent('warn', 'brand.review_schema_error', {
      mode: request.mode,
      stepKey: request.stepKey,
      issues: parsed.error.issues.length,
    })
    return { failure: 'schema_error' }
  }
  return { review: parsed.data }
}

/**
 * DER KAPITEL-MODUS LÄUFT EINMAL JE FASSUNG (§5a „Der Spezialist liest das
 * Kapitel mit").
 *
 * Der Client ruft ihn beim ÖFFNEN der Abnahme-Seite, und die Seite wird beim
 * Durchblättern eines fertigen Brandings neunmal geöffnet — ohne Riegel wäre
 * jeder Blick ein bezahlter Aufruf über das ganze Dokument. Der Riegel ist die
 * `revision` der Kapitel-Zeile: sie bewegt sich bei JEDER inhaltlichen
 * Änderung des Kapitels, also ist „gleiche Fassung" genau die richtige
 * Bedingung für „schon geprüft".
 *
 * ── IM PROZESS, MIT ABSICHT ───────────────────────────────────────────────
 * Eine Map, wie die Gesprächs-Idempotenz (`brandConverse.ts`) und die
 * Generierungs-Sperre, und mit derselben bewussten Grenze: bei mehreren
 * Node-Prozessen kennt jeder nur seine eigenen Schlüssel, und nach einem
 * Neustart ist die Erinnerung weg. Der Schaden ist ein zweiter Aufruf mit
 * Gewicht 2 in einem Eimer von 120 — deutlich kleiner als der Preis einer
 * neuen Spalte, deren einziger Zweck ein Cache-Stempel wäre.
 *
 * Die ANTWORT eines gesperrten Aufrufs ist trotzdem vollständig: die Befunde
 * kommen aus der Tabelle, nicht aus dem Modell (§5a „Ergebnis = Befunde neu
 * laden"). Der Riegel spart den Aufruf, nicht die Auskunft.
 */
const CHAPTER_REVIEW_TTL_MS = 30 * 60_000
const CHAPTER_REVIEW_MAX_KEYS = 500
const CHAPTER_REVIEWS = new Map<string, number>()

/**
 * `true` = dieser Kapitel-Blick darf laufen (und ist ab jetzt vergeben).
 * `false` = diese Fassung wurde in diesem Prozess schon geprüft.
 */
export function claimBrandChapterReview(
  profileId: string,
  stepKey: string,
  revision: number,
  now: number = Date.now(),
): boolean {
  for (const [key, at] of CHAPTER_REVIEWS) {
    if (now - at >= CHAPTER_REVIEW_TTL_MS) CHAPTER_REVIEWS.delete(key)
  }
  while (CHAPTER_REVIEWS.size > CHAPTER_REVIEW_MAX_KEYS) {
    const oldest = CHAPTER_REVIEWS.keys().next()
    if (oldest.done) break
    CHAPTER_REVIEWS.delete(oldest.value)
  }
  const id = `${profileId}:${stepKey}:${revision}`
  if (CHAPTER_REVIEWS.has(id)) return false
  CHAPTER_REVIEWS.set(id, now)
  return true
}

/** Nur für Beweise/Tests. */
export function clearBrandChapterReviews(): void {
  CHAPTER_REVIEWS.clear()
}

/**
 * DER PRÜFBLICK LÄUFT EINMAL JE DOKUMENT-STAND (§10, Paket 7).
 *
 * ── WARUM ÜBERHAUPT EIN RIEGEL, WENN ER DOCH AUF KLICK LÄUFT ─────────────
 * Weil ein Klick nicht der einzige Weg zu einem zweiten Aufruf ist: ein
 * Doppelklick, ein Reload während der Anfrage, ein zweiter Tab. Der Aufruf
 * wiegt 5 im Eimer von 120 — drei versehentliche Wiederholungen sind ein
 * Achtel des Tages für dasselbe Ergebnis.
 *
 * ── DER MERKER LIEGT IM PROZESS, UND ZWAR MANGELS ORT ────────────────────
 * `brand_profiles` hat kein freies JSON-Feld: `storyMeta` gehört der Brand
 * Story (inputHash, generatedAt, editedByUser), alles andere sind getypte
 * Spalten. Eine EIGENE Spalte für einen Cache-Stempel wäre eine Migration,
 * deren einziger Zweck es ist, einen Aufruf zu sparen, den der Mensch selbst
 * auslöst — dieselbe Rechnung, aus der schon der Kapitel-Blick prozess-lokal
 * merkt (s. dort) und die Gesprächs-Idempotenz ebenso.
 *
 * Der Schaden bei mehreren Prozessen oder nach einem Neustart ist EIN weiterer
 * Aufruf mit Gewicht 5; der Preis einer Spalte wäre eine Migration auf jeder
 * Instanz plus ein Feld, das niemand liest.
 *
 * ── EIN EINTRAG JE BRANDING, NICHT JE STAND ──────────────────────────────
 * Anders als beim Kapitel-Blick (`profileId:stepKey:revision`): der
 * Dokument-Stand ändert sich mit JEDER Bestätigung, und alte Stände sind
 * danach wertlos — sie können nicht zurückkommen (`revision` steigt
 * monoton). Ein Eintrag je Branding reicht also, und die Leseroute kann
 * daraus „zuletzt geprüft am" beantworten, ohne einen Schlüssel zu kennen.
 */
export interface BrandDocumentReviewRun {
  revisionKey: string
  /** ISO-Zeitpunkt — die Leseroute meldet ihn als `lastRunAt`. */
  at: string
  /** Die Sessions, deren Urteil dieser Lauf nachgeholt hat. */
  caughtUp: readonly string[]
  reviewedBy: BrandReviewStage | null
}

const DOCUMENT_REVIEW_TTL_MS = 30 * 60_000
const DOCUMENT_REVIEW_MAX_KEYS = 500
const DOCUMENT_REVIEWS = new Map<string, { run: BrandDocumentReviewRun, at: number }>()

function pruneDocumentReviews(now: number): void {
  for (const [key, entry] of DOCUMENT_REVIEWS) {
    if (now - entry.at >= DOCUMENT_REVIEW_TTL_MS) DOCUMENT_REVIEWS.delete(key)
  }
  while (DOCUMENT_REVIEWS.size > DOCUMENT_REVIEW_MAX_KEYS) {
    const oldest = DOCUMENT_REVIEWS.keys().next()
    if (oldest.done) break
    DOCUMENT_REVIEWS.delete(oldest.value)
  }
}

/**
 * `granted: true` = dieser Prüfblick darf laufen. `granted: false` = derselbe
 * Stand wurde in diesem Prozess schon geprüft; `previous` trägt dann das
 * Ergebnis von damals, damit die Antwort vollständig bleibt (die BEFUNDE kommen
 * ohnehin aus der Tabelle — der Riegel spart den Aufruf, nicht die Auskunft).
 */
export function claimBrandDocumentReview(
  profileId: string,
  revisionKey: string,
  now: number = Date.now(),
): { granted: boolean, previous: BrandDocumentReviewRun | null } {
  pruneDocumentReviews(now)
  const entry = DOCUMENT_REVIEWS.get(profileId)
  if (entry && entry.run.revisionKey === revisionKey) return { granted: false, previous: entry.run }
  return { granted: true, previous: null }
}

/** Was dieser Lauf hinterlässt — erst NACH dem Aufruf, mit seinem Ergebnis. */
export function rememberBrandDocumentReview(
  profileId: string,
  run: BrandDocumentReviewRun,
  now: number = Date.now(),
): void {
  pruneDocumentReviews(now)
  DOCUMENT_REVIEWS.set(profileId, { run, at: now })
}

/** „Zuletzt geprüft" für die Leseroute — `null`, solange hier nichts lief. */
export function readBrandDocumentReview(
  profileId: string,
  now: number = Date.now(),
): BrandDocumentReviewRun | null {
  const entry = DOCUMENT_REVIEWS.get(profileId)
  if (!entry) return null
  if (now - entry.at >= DOCUMENT_REVIEW_TTL_MS) {
    DOCUMENT_REVIEWS.delete(profileId)
    return null
  }
  return entry.run
}

/** Nur für Beweise/Tests. */
export function clearBrandDocumentReviews(): void {
  DOCUMENT_REVIEWS.clear()
}

/**
 * DER GANZE AUFRUF: Kill-Switch, Ersatz, Stufe 1, ggf. Stufe 2 (s. Kopf).
 */
export async function runBrandSessionReview(
  request: BrandReviewRequest,
): Promise<BrandReviewOutcome> {
  const started = Date.now()

  // DER KILL-SWITCH ZUERST, wie in jeder anderen KI-Route dieses Layers
  // (`brandAiEnabled`, system-038, fail-closed). Er steht VOR dem Ersatz:
  // „die KI ist aus" heisst hier auch „der Ersatz schweigt", sonst wäre der
  // Schalter im Playground wirkungslos.
  if (!await readBrandAiEnabled(request.event)) {
    return { reviewed: false, reviewedBy: null, review: BRAND_REVIEW_EMPTY, failure: 'ai_disabled' }
  }

  if (reviewStubEnabled()) {
    return { reviewed: true, reviewedBy: 'stage1', review: stubReview(request) }
  }

  /**
   * WAS STUFE 1 WIEGT: 1 für eine Session, 2 für ein ganzes Kapitel, 5 für den
   * PRÜFBLICK über die ganze Foundation (§13). Der Kapitel-Modus liest dieselbe
   * Menge Dokument, aber ein ganzes Kapitel dagegen — er ist der teurere Aufruf
   * und zählt deshalb doppelt; der Prüfblick trägt neun Kapitel im Prompt und
   * zählt fünffach.
   */
  const stage1Weight = request.mode === 'chapter'
    ? (request.scope === 'document'
        ? BRAND_AI_REVIEW_WEIGHTS.document
        : BRAND_AI_REVIEW_WEIGHTS.chapter)
    : BRAND_AI_REVIEW_WEIGHTS.stage1
  const stage1 = await runStage(request, reviewModel(), stage1Weight, promptFor(request))
  if (!stage1.review) {
    return { reviewed: false, reviewedBy: null, review: BRAND_REVIEW_EMPTY, failure: stage1.failure }
  }

  let review = stage1.review
  let reviewedBy: BrandReviewStage = 'stage1'

  if (needsStageTwo(review.findings)) {
    const georgeModel = (await getEffectiveAiConfig(request.event)).model
    const stage2 = await runStage(
      request,
      georgeModel,
      BRAND_AI_REVIEW_WEIGHTS.stage2,
      promptFor(request, review.findings),
    )
    if (stage2.review) {
      // NUR die Befunde — alles andere ist ein Urteil über die Session, und
      // das hat Stufe 1 mit denselben Eingaben gefällt (s. Kopf).
      review = { ...review, findings: stage2.review.findings }
      reviewedBy = 'stage2'
    }
  }

  logEvent('info', 'brand.review_completed', {
    mode: request.mode,
    scope: request.scope ?? 'chapter',
    stepKey: request.stepKey,
    slotId: request.session?.id ?? '',
    reviewedBy,
    findings: review.findings.length,
    promptVersion: BRAND_REVIEW_PROMPT_VERSION,
    ms: Date.now() - started,
  })

  return { reviewed: true, reviewedBy, review }
}
