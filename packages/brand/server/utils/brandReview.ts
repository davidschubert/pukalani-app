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
import { brandDevStubEnabled, readBrandAiEnabled, retainBrandGeneration } from './brandGenerators'
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
 * wer sie geschrieben hat. Dasselbe gilt, wenn ein Zeitdeckel (`budgetMs`,
 * nur die zwei Routen in der Anfrage) für Stufe 2 keinen sinnvollen Rest
 * mehr lässt: dann läuft sie gar nicht (`brand.review_stage2_skipped`).
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
  /**
   * EIN ZEITDECKEL ÜBER BEIDE STUFEN (ms, ab Beginn des Aufrufs) — NUR die
   * zwei Routen, die in der Anfrage prüfen, setzen ihn
   * (`BRAND_REVIEW_INLINE_BUDGET_MS`, s. dort). Ohne Angabe bekommt jede
   * Stufe ihre volle Frist wie bisher.
   */
  budgetMs?: number
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
export const BRAND_REVIEW_TIMEOUT_MS = 60_000

/**
 * EIN ZEITDECKEL ÜBER BEIDE STUFEN — NUR FÜR DIE PRÜFUNG IN DER ANFRAGE (LL1 d).
 *
 * Die Kapitel-Prüfung und das Schliessen einer Sitzung rechnen in der Anfrage,
 * und der Webserver wartet 60 s (`proxy_read_timeout`, wird nicht angehoben).
 * Zwei Stufen à `BRAND_REVIEW_TIMEOUT_MS` hintereinander wären bis 120 s — der
 * Mensch sähe einen Fehler, während Node weiterrechnet. Deshalb bekommen diese
 * zwei Routen EINEN Deckel über beide Stufen (`budgetMs`): Stufe 1 endet
 * spätestens am Deckel, Stufe 2 bekommt nur den REST.
 *
 * WARUM HIER EIN ZEITDECKEL STATT LAUF-SPERRE UND 202 GENÜGT: ein Ergebnis nur
 * aus Stufe 1 ist im Datenmodell vorgesehen (`reviewedBy: 'stage1'`) und
 * schon heute der Ausgang, wenn Stufe 2 scheitert — ein ehrliches
 * Teil-Ergebnis, kein verschwiegener Abbruch. Üblich ist eine Stufe in
 * wenigen Sekunden; der Deckel greift nur im seltenen langsamen Fall.
 *
 * 50 s lassen 10 s Luft für Datenbank, Buchung und Antwort. Die
 * Dokument-Prüfung und alle anderen Aufrufer setzen keinen Deckel und
 * behalten die vollen Fristen.
 */
export const BRAND_REVIEW_INLINE_BUDGET_MS = 50_000

/**
 * DIE MINDESTFRIST FÜR STUFE 2 UNTER DEM DECKEL. Ein Lauf des George-Modells
 * über das Dokument braucht üblich einige Sekunden; mit weniger als 10 s
 * Rest wäre der Versuch fast sicher ein bezahlter Abbruch (die Buchung fiele
 * vor dem Aufruf). Dann läuft Stufe 2 nicht, und Stufe 1 gilt.
 */
export const BRAND_REVIEW_STAGE2_MIN_MS = 10_000

/**
 * WIE VIEL FRIST BEKOMMT STUFE 2? — pur, damit die Uhr im Test stellbar ist.
 *
 * `null` heisst: der Rest unter dem Deckel reicht nicht für einen sinnvollen
 * Versuch, Stufe 2 läuft nicht. Sonst der Rest, höchstens die volle Frist
 * einer Stufe. Ohne Deckel (`budgetMs` fehlt) die volle Frist wie bisher.
 */
export function brandReviewStageTwoTimeout(
  budgetMs: number | undefined,
  elapsedMs: number,
): number | null {
  if (budgetMs === undefined) return BRAND_REVIEW_TIMEOUT_MS
  const rest = Math.floor(budgetMs - Math.max(0, elapsedMs))
  if (rest < BRAND_REVIEW_STAGE2_MIN_MS) return null
  return Math.min(rest, BRAND_REVIEW_TIMEOUT_MS)
}

/**
 * Die Frist eines Aufrufs unmittelbar davor: die volle Frist, unter einem
 * Deckel höchstens bis zu seinem Ende (`deadlineAt`, Server-Uhr). Nie unter
 * 1 ms — ein Aufruf mit 0 würde nicht abbrechen, sondern ohne Frist laufen.
 */
function stageTimeoutMs(deadlineAt: number | undefined): number {
  if (deadlineAt === undefined) return BRAND_REVIEW_TIMEOUT_MS
  return Math.max(1, Math.min(BRAND_REVIEW_TIMEOUT_MS, Math.floor(deadlineAt - Date.now())))
}

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
 * EINE STUFE: belegen, buchen, rufen, prüfen. Sie wirft NIE — jeder Ausgang ist
 * entweder ein geprüftes Urteil oder ein Grund fürs Log.
 *
 * DER PARALLEL-PLATZ (P17, BE-006): bis hierher buchte die Stufe Kontingent,
 * belegte aber als einziger bezahlter Weg keinen Platz — gleichzeitige
 * Schliess-Aufrufe liefen am Burst-Deckel vorbei. Jetzt wie in den Routen:
 * erst belegen, dann buchen (Begründung im Kopf von `brandAiQuota.ts`), und
 * freigegeben wird im `finally`, auf JEDEM Ausgang. Belegt wird je Stufe, nie
 * über beide: Stufe 2 läuft erst, wenn Stufe 1 fertig ist.
 */
async function runStage(
  request: BrandReviewRequest,
  model: string,
  weight: number,
  prompt: string,
  deadlineAt?: number,
): Promise<StageResult> {
  if (!model) return { failure: 'provider_error' }

  const burst = retainBrandGeneration(request.userId)
  try {
    return await runStageCall(request, model, weight, prompt, deadlineAt)
  }
  finally {
    burst.release()
  }
}

async function runStageCall(
  request: BrandReviewRequest,
  model: string,
  weight: number,
  prompt: string,
  deadlineAt: number | undefined,
): Promise<StageResult> {
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
      // Die Decke bleibt, wie sie ist — gekürzt wird nur die FRIST, und die
      // erst unmittelbar vor dem Aufruf (nach Belegen und Buchen) gerechnet,
      // damit auch diese Zeit unter dem Deckel liegt.
      maxTokens: BRAND_REVIEW_MAX_TOKENS,
      timeoutMs: stageTimeoutMs(deadlineAt),
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

/*
 * DER PRÜFBLICK (Dokument-Prüfung) HAT SEIT LL1 d (2026-11-18) KEINEN MERKER
 * MEHR IM PROZESS: er rechnet hinter der Antwort, die Lauf-Sperre in
 * `brand_runs` hält den zweiten Start auf, und „für diesen Stand schon
 * geprüft" steht als Stand-Schlüssel an der Lauf-Zeile
 * (`brandDocumentReviewRun.ts`).
 */

/**
 * DER GANZE AUFRUF: Kill-Switch, Ersatz, Stufe 1, ggf. Stufe 2 (s. Kopf).
 */
export async function runBrandSessionReview(
  request: BrandReviewRequest,
): Promise<BrandReviewOutcome> {
  const started = Date.now()
  // Das Ende des Deckels auf der Server-Uhr — `undefined` ohne Deckel.
  const deadlineAt = request.budgetMs === undefined ? undefined : started + request.budgetMs

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
  const stage1 = await runStage(request, reviewModel(), stage1Weight, promptFor(request), deadlineAt)
  if (!stage1.review) {
    return { reviewed: false, reviewedBy: null, review: BRAND_REVIEW_EMPTY, failure: stage1.failure }
  }

  let review = stage1.review
  let reviewedBy: BrandReviewStage = 'stage1'

  if (needsStageTwo(review.findings)) {
    const georgeModel = (await getEffectiveAiConfig(request.event)).model
    // UNTER DEM DECKEL: reicht der Rest nicht, läuft Stufe 2 gar nicht — sie
    // wird dann auch nicht gebucht. Stufe 1 gilt, wie wenn Stufe 2 scheitert.
    const stage2Ms = brandReviewStageTwoTimeout(request.budgetMs, Date.now() - started)
    const stage2 = stage2Ms === null
      ? null
      : await runStage(
          request,
          georgeModel,
          BRAND_AI_REVIEW_WEIGHTS.stage2,
          promptFor(request, review.findings),
          deadlineAt,
        )
    if (stage2Ms === null) {
      logEvent('info', 'brand.review_stage2_skipped', {
        mode: request.mode,
        stepKey: request.stepKey,
        slotId: request.session?.id ?? '',
        ms: Date.now() - started,
        budgetMs: request.budgetMs ?? 0,
      })
    }
    if (stage2?.review) {
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
