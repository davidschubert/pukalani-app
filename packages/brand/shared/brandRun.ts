import { AI_ENDPOINT_UNAVAILABLE_CODE } from '../../core/shared/aiProviderRouting'
import type { RunLeaseSnapshot, RunLeaseState } from '../../core/shared/runLease'
import { parseRunLeaseDetail, runLeaseState } from '../../core/shared/runLease'

/**
 * EIN LAUF DES MARKENBERATERS AN SEINER ZEILE (LL1 b, 2026-11-17) — was ein
 * langer Weg in `brand_runs` hinterlässt, und wie die Seite es zurückliest.
 *
 * ── WARUM ES DAS GIBT ────────────────────────────────────────────────────
 * Vier Wege rechneten in der Anfrage und konnten länger brauchen, als der
 * Webserver wartet (60 s): Zeichen-Entwürfe, Vorbilder lesen, Fundament-Check
 * und der öffentliche Brand-Check. Der Mensch sah dann einen Fehler, obwohl
 * der Lauf gelang — und ein zweiter Klick bezahlte doppelt. Jetzt antwortet
 * der Start sofort (`202`), der Lauf rechnet hinter der Antwort, und die
 * Seite fragt den Stand ab. Die Mechanik (Sperre, Herzschlag, Zustand) ist
 * die gemeinsame Hilfe aus `core/shared/runLease.ts`; hier steht nur, was
 * DIESER Layer an die Zeile schreibt.
 *
 * ── EINE TABELLE, VIER ARTEN ─────────────────────────────────────────────
 * `scope` nennt den Weg, `subject` den Gegenstand (die Marke; beim
 * öffentlichen Check ein Hash aus Adresse und Besucher). Ein Lauf je (Art,
 * Gegenstand) zur selben Zeit — zwei verschiedene Arten derselben Marke
 * dürfen nebeneinander laufen.
 *
 * ── DER AUSGANG STEHT IN `outcome`, DIE ZAHLEN IM `detail` ───────────────
 * `outcome` ist `done` oder ein kurzer Grund (höchstens 32 Zeichen). Es sind
 * DIESELBEN Wörter, die die Route früher als `data.code` geworfen hat — die
 * Seite bildet sie auf dieselben Sätze ab. Im `detail` stehen nur Zahlen und
 * Kennungen (Regel der Lauf-Sperre): nie ein Name, nie ein Text der Marke.
 *
 * ── `booked` UND `refunded` ──────────────────────────────────────────────
 * Gebucht wird VOR der Antwort, der Zähler steht deshalb schon in der
 * Antwort des Starts. Endet ein Entwurfs-Lauf ohne ein Bild oder eine Lesung
 * der Vorbilder ohne eine Lesung, geht der sichtbare Zähler zurück (BE-004,
 * LL1 c) — `refunded` sagt der Seite, dass ihr
 * „noch x von y" wieder einen mehr zeigt. Stirbt ein Lauf mittendrin (Deploy,
 * Absturz), kann er selbst nichts mehr zurückbuchen; der NÄCHSTE Start tut es
 * für ihn (`brandRunOwesRefund`) — dieselbe Zusage, nur einen Start später.
 *
 * ── DER PARSER KLEMMT, ER LEHNT NICHT AB ─────────────────────────────────
 * Eine Zeile kann aus einer älteren Fassung stammen oder gar kein Detail
 * tragen. Jeder Wert wird einzeln geprüft und sonst auf eine sichere Vorgabe
 * gesetzt.
 */

/**
 * Wie lange EINE Nachfrage der Seite höchstens warten darf. Eine Abfrage, die
 * hängen bleibt (Ausliefern mitten in der Anfrage, Netz-Aussetzer), hielte
 * sonst das ganze Nachfragen an: der nächste Takt wartet, bis der laufende
 * zu Ende ist. Mit der Frist scheitert sie, und der nächste Takt fragt neu.
 */
export const BRAND_RUN_POLL_TIMEOUT_MS = 10_000

/** Die Arten in `brand_runs.scope` (varchar 32). */
export const BRAND_RUN_SCOPES = {
  /** Zeichen-Entwürfe — subject = Profil-Id. */
  drafts: 'drafts',
  /** Vorbilder lesen — subject = Profil-Id. */
  reading: 'reading',
  /** Fundament-Check — subject = Profil-Id. */
  documentCheck: 'doc-check',
  /**
   * Dokument-Prüfung (LL1 d) — subject = Profil-Id. Im `detail` steht unter
   * `created` die Zahl der nachgeholten Sitzungen und unter `ref` der
   * Stand-Schlüssel (sha256 hex, 64 Zeichen), für den der Lauf gilt: er ist
   * der Merker „für diesen Stand schon geprüft".
   */
  documentReview: 'doc-review',
  /** Öffentlicher Brand-Check — subject = Schlüssel-Hash aus Adresse und Besucher. */
  check: 'check',
} as const

export type BrandRunScope = (typeof BRAND_RUN_SCOPES)[keyof typeof BRAND_RUN_SCOPES]

/** Die Arten, deren Gegenstand eine Marke ist — sie verschwinden mit ihr. */
export const BRAND_RUN_PROFILE_SCOPES: readonly BrandRunScope[] = [
  BRAND_RUN_SCOPES.drafts,
  BRAND_RUN_SCOPES.reading,
  BRAND_RUN_SCOPES.documentCheck,
  BRAND_RUN_SCOPES.documentReview,
]

/** Gemeinsame Ausgänge neben `done` und den Gründen der einzelnen Wege. */
export const BRAND_RUN_OUTCOMES = {
  done: 'done',
  /** Ein Wurf, den der Weg nicht selbst benannt hat. */
  failed: 'failed',
  /** Der Herzschlag ging verloren — ein anderer Start darf übernehmen. */
  leaseLost: 'lease_lost',
  /** Die Marke gibt es nicht mehr (während des Laufs gelöscht). */
  profileGone: 'profile_gone',
  /** Kein Endpunkt unter der Datenschutz-Bindung (KI1 d) — nur dieser Code. */
  aiEndpointUnavailable: AI_ENDPOINT_UNAVAILABLE_CODE,
  /**
   * Dokument-Prüfung: der Blick über das ganze Dokument kam nicht zustande
   * (KI aus, Drossel, Anbieter, Schema). Schon nachgeholte Sitzungen bleiben
   * geprüft; ihre Zahl steht in `created`.
   */
  reviewUnavailable: 'review_unavailable',
} as const

export interface BrandRunDetail {
  /** Der Lauf hat ein Kontingent belegt. */
  booked: boolean
  /** Der sichtbare Zähler ist zurückgebucht (Lauf ohne Ergebnis). */
  refunded: boolean
  /** Wie viel der Lauf abgelegt hat (Entwürfe, gelesene Vorbilder). */
  created: number
  /** Stand des sichtbaren Zählers NACH der Buchung dieses Laufs. */
  used: number
  /** Deckel des sichtbaren Zählers; 0 = der Weg zeigt keinen. */
  limit: number
  /** Kennung des Ergebnisses (Zeilen-Id eines Checks) — nie ein Inhalt. */
  ref: string
  /** Modell-Kennung des Laufs, für die Zeile unter dem Knopf. */
  model: string
  /**
   * Öffentlicher Check: der Zufallswert des Laufs. Das Kennzeichen, das nur
   * der Starter bekommt, ist eine Unterschrift darüber
   * (`server/utils/brandCheckRunToken.ts`); er verlässt den Server nie.
   */
  key: string
}

export function emptyBrandRunDetail(input: Partial<BrandRunDetail> = {}): BrandRunDetail {
  return {
    booked: false,
    refunded: false,
    created: 0,
    used: 0,
    limit: 0,
    ref: '',
    model: '',
    key: '',
    ...input,
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function shortText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/** Das Detail aus der Spalte — kaputt, fremd oder leer ⇒ sichere Vorgaben. */
export function parseBrandRunDetail(raw: string | null | undefined): BrandRunDetail {
  const value = parseRunLeaseDetail(raw)
  return {
    booked: value.booked === true,
    refunded: value.refunded === true,
    created: count(value.created),
    used: count(value.used),
    limit: count(value.limit),
    ref: shortText(value.ref, 64),
    model: shortText(value.model, 120),
    key: shortText(value.key, 64),
  }
}

/** Der sichtbare Zähler eines Laufs — „noch x von y". */
export interface BrandRunQuota {
  used: number
  limit: number
  remaining: number
}

/**
 * Was die Seite von einem Lauf sieht. `failure` ist nur bei `failed` gesetzt
 * und trägt den kurzen Grund; `key` verlässt den Server nie.
 */
export interface BrandRunView {
  state: RunLeaseState
  startedAt: string
  finishedAt: string
  failure: string
  created: number
  refunded: boolean
  quota: BrandRunQuota | null
  ref: string
  model: string
}

export function noBrandRunView(): BrandRunView {
  return {
    state: 'none',
    startedAt: '',
    finishedAt: '',
    failure: '',
    created: 0,
    refunded: false,
    quota: null,
    ref: '',
    model: '',
  }
}

/**
 * Der Zähler, wie ihn die Seite zeigen soll: nach einer Rückbuchung ist der
 * Lauf nicht mehr mitgezählt.
 */
export function brandRunQuota(detail: Pick<BrandRunDetail, 'used' | 'limit' | 'refunded'>): BrandRunQuota | null {
  if (detail.limit <= 0) return null
  const used = Math.min(detail.limit, Math.max(0, detail.used - (detail.refunded ? 1 : 0)))
  return { used, limit: detail.limit, remaining: Math.max(0, detail.limit - used) }
}

/** Die Lauf-Zeile als Ansicht — gegen die SERVER-Uhr gerechnet. */
export function toBrandRunView(lease: RunLeaseSnapshot | null, nowMs: number): BrandRunView {
  if (!lease) return noBrandRunView()
  const state = runLeaseState(lease, nowMs)
  const detail = parseBrandRunDetail(lease.detail)
  return {
    state,
    startedAt: lease.startedAt,
    finishedAt: lease.finishedAt,
    failure: state === 'failed' ? lease.outcome : '',
    created: detail.created,
    refunded: detail.refunded,
    quota: brandRunQuota(detail),
    ref: detail.ref,
    model: detail.model,
  }
}

/**
 * WELCHE GEGENSTÄNDE GERADE EINEN LAUF HABEN — für eine Übersicht über viele
 * Marken (LL1 c, 2026-11-18: die Liste der Brand-Scores zeigte nach dem
 * Neuladen nicht, dass ein Fundament-Check rechnet).
 *
 * Die Route liest dafür EINMAL alle Zeilen einer Art mit frischem Herzschlag
 * (`heartbeatAt` jünger als die Frist — das Ende setzt ihn ebenfalls), statt
 * je Marke `latest()` zu fragen. Gezählt wird je Gegenstand nur die JÜNGSTE
 * Zeile (höchste `seq`): ein beendeter Nachfolger schlägt einen älteren
 * Vorgänger, und der Zustand kommt aus derselben Rechnung wie überall
 * (`runLeaseState`).
 */
export function runningBrandRunSubjects(
  rows: readonly (Pick<RunLeaseSnapshot, 'seq' | 'heartbeatAt' | 'finishedAt' | 'outcome'> & { subject: string })[],
  nowMs: number,
): Set<string> {
  const latest = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const seen = latest.get(row.subject)
    if (!seen || row.seq > seen.seq) latest.set(row.subject, row)
  }
  const running = new Set<string>()
  for (const [subject, row] of latest) {
    if (runLeaseState(row, nowMs) === 'running') running.add(subject)
  }
  return running
}

/** Wie lange eine Übersicht auf einen gescheiterten oder abgebrochenen Lauf hinweist. */
export const BRAND_RUN_NOTICE_MS = 24 * 60 * 60_000

/**
 * SOLL EINE ÜBERSICHT NOCH AUF DIESEN LAUF HINWEISEN?
 *
 * Ein gescheiterter oder abgebrochener Lauf ist eine Auskunft für den, der
 * ihn gerade gestartet hat — nicht für jeden Besuch der Seite in den Wochen
 * danach. Eine Übersicht (die Score-Seite) zeigt den Hinweis deshalb nur
 * einen Tag lang; die Werkstatt-Abschnitte zeigen ihn, bis der nächste Lauf
 * startet (dort steht er direkt am Knopf).
 */
export function brandRunNoticeDue(view: Pick<BrandRunView, 'state' | 'startedAt'>, nowMs: number): boolean {
  if (view.state !== 'failed' && view.state !== 'stalled') return false
  const startedMs = Date.parse(view.startedAt)
  return !Number.isNaN(startedMs) && nowMs - startedMs < BRAND_RUN_NOTICE_MS
}

/**
 * SCHULDET DER VORGÄNGER NOCH EINE RÜCKBUCHUNG?
 *
 * Ein Entwurfs-Lauf ohne ein abgelegtes Bild und eine Vorbilder-Lesung ohne
 * eine geschriebene Lesung geben den sichtbaren Zähler zurück (BE-004,
 * LL1 c). Ein Lauf, der mittendrin stirbt, kommt nicht mehr dazu.
 * Der nächste Start holt es nach — aber nur, wenn alle vier Dinge stimmen:
 * der Vorgänger ist ABGEBROCHEN (nicht fertig, nicht gescheitert — die buchen
 * selbst zurück), er hatte gebucht, er hat nichts abgelegt, und es ist noch
 * nicht zurückgebucht. Konto- und Instanz-Deckel bleiben wie bei BE-004
 * gebucht: sie sind das Netz gegen provozierte Leer-Läufe.
 *
 * Gerufen wird das NACH dem Nehmen der Sperre: nur der eine Gewinner sieht
 * diesen Vorgänger, also bucht auch nur einer zurück.
 */
export function brandRunOwesRefund(
  previousState: RunLeaseState,
  previousDetail: string | null | undefined,
): boolean {
  if (previousState !== 'stalled') return false
  const detail = parseBrandRunDetail(previousDetail)
  return detail.booked && !detail.refunded && detail.created === 0
}
