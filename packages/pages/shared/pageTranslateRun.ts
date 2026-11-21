import type { RunLeaseSnapshot } from '../../core/shared/runLease'
import { parseRunLeaseDetail, runLeaseState } from '../../core/shared/runLease'
import { MAX_PAGE_TITLE, MAX_PAGE_TRANSLATE_BODY } from '../schemas/page'
import type { PageTranslateResponse, PageTranslateRunView } from './types/page'

/**
 * DIE ÜBERSETZUNG EINER SEITE IM HINTERGRUND — der pure Teil (LL1 d,
 * 2026-11-18). Der Server-Teil steht in `server/utils/pageTranslateRun.ts`,
 * die Regel in `.claude/rules/lange-laeufe.md` („LANGE ARBEIT
 * GEHÖRT NICHT IN DIE ANFRAGE").
 *
 * ── WARUM ────────────────────────────────────────────────────────────────
 * Ein Rechtstext mit 12.000 Zeichen braucht beim Modell länger als die 60 s,
 * die der Webserver wartet (die Route gab ihm 120 s). Dauerte es länger, sah
 * der Mensch einen Fehler, obwohl der bezahlte Lauf gelang — und klickte noch
 * einmal. Jetzt antwortet der Start sofort mit `202`, der Lauf rechnet hinter
 * der Antwort, und die Seite holt den Vorschlag ab.
 *
 * ── WAS AN DER LAUF-ZEILE STEHT ──────────────────────────────────────────
 *  - `detail` (Zahlen und Kennungen, nie Text): Zielsprache, Modell, `paid`.
 *  - `result` (MEDIUMTEXT, nur an dieser Tabelle): Titel und Text des
 *    Vorschlags als JSON — bis der NÄCHSTE Lauf derselben Seite startet
 *    (er leert ihn am Vorgänger) oder die Seite gelöscht wird.
 */

/** Die Art des Laufs (Spalte `scope`). Eine Art je Tabelle genügt heute. */
export const PAGE_TRANSLATE_RUN_SCOPE = 'translate'

/** Wie ein Lauf endet — `done` oder ein kurzes Wort (Spalte `outcome`, 32 Zeichen). */
export const PAGE_TRANSLATE_RUN_OUTCOMES = {
  done: 'done',
  /** Das Modell gab weder Titel noch Text zurück. */
  empty: 'empty',
  /** Ein Abschalter stand zwischen Start und Aufruf auf „aus". */
  aiDisabled: 'ai_disabled',
  /** Kein Modell unter der Datenschutz-Bindung erreichbar (P17). */
  aiEndpointUnavailable: 'ai_endpoint_unavailable',
  /** Der `paid`-Vermerk liess sich nicht schreiben — dann kein Aufruf. */
  leaseUnwritable: 'lease_unwritable',
  /** Der Herzschlag ging verloren, bevor der Aufruf begann. */
  leaseLost: 'lease_lost',
  failed: 'failed',
} as const

/**
 * Wie lange ein fertiger Vorschlag abgeholt werden kann. Danach liefert die
 * lesende Route ihn nicht mehr aus: ein Vorschlag von gestern ist älter als
 * das, was inzwischen im Formular steht, und gehört nicht unaufgefordert
 * hinein. (Die Zeile selbst leert erst der nächste Lauf — kein Aufräumer.)
 */
export const PAGE_TRANSLATE_RESULT_TTL_MS = 60 * 60_000

/** Wie lange die Seite nach dem Neuladen auf einen gescheiterten oder abgebrochenen Lauf hinweist. */
export const PAGE_TRANSLATE_NOTICE_MS = 15 * 60_000

/** Frist je Abfrage des Stands — `useRunPolling` überlappt nicht, eine hängende Abfrage hielte es an. */
export const PAGE_TRANSLATE_POLL_TIMEOUT_MS = 10_000

/** Was im `detail` der Lauf-Zeile steht — nur Kennungen. */
export interface PageTranslateRunDetail {
  locale: string
  model: string
  /** Gesetzt, BEVOR der bezahlte Aufruf beginnt. */
  paid: boolean
}

function shortText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function parsePageTranslateRunDetail(raw: string | null | undefined): PageTranslateRunDetail {
  const value = parseRunLeaseDetail(raw)
  return {
    locale: shortText(value.locale, 16),
    model: shortText(value.model, 120),
    paid: value.paid === true,
  }
}

/**
 * Titel und Text des Vorschlags, geklemmt wie früher die Antwort der Route —
 * die Antwort des Modells ist eine Behauptung, und sie geht in ein Formular,
 * dessen Schema dieselben Grenzen kennt. Leer heisst „kein Vorschlag" für
 * dieses Feld.
 */
export function clampPageTranslateSuggestion(parsed: { title?: unknown, body?: unknown }): { title: string, body: string } {
  return {
    title: String(parsed.title ?? '').trim().slice(0, MAX_PAGE_TITLE),
    body: String(parsed.body ?? '').trim().slice(0, MAX_PAGE_TRANSLATE_BODY),
  }
}

/** Den abgelegten Vorschlag lesen; kaputt oder leer ⇒ `null`. */
export function parsePageTranslateResult(raw: string | null | undefined): { title: string, body: string } | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const clamped = clampPageTranslateSuggestion(parsed as { title?: unknown, body?: unknown })
  return clamped.title || clamped.body ? clamped : null
}

export function noPageTranslateRunView(): PageTranslateRunView {
  return { state: 'none', startedAt: '', finishedAt: '', failure: '', locale: '', result: null }
}

/**
 * Die Lauf-Zeile als Ansicht — gegen die SERVER-Uhr gerechnet. Der
 * Vorschlag steht nur an einem fertigen Lauf, dessen Ende höchstens
 * `PAGE_TRANSLATE_RESULT_TTL_MS` zurückliegt.
 */
export function toPageTranslateRunView(
  lease: (Pick<RunLeaseSnapshot, 'startedAt' | 'heartbeatAt' | 'finishedAt' | 'outcome' | 'detail'> & { result?: string }) | null,
  nowMs: number,
): PageTranslateRunView {
  if (!lease) return noPageTranslateRunView()
  const state = runLeaseState(lease, nowMs)
  const detail = parsePageTranslateRunDetail(lease.detail)
  let result: PageTranslateResponse | null = null
  if (state === 'done') {
    const finishedMs = Date.parse(lease.finishedAt)
    const fresh = !Number.isNaN(finishedMs) && nowMs - finishedMs < PAGE_TRANSLATE_RESULT_TTL_MS
    const suggestion = fresh ? parsePageTranslateResult(lease.result) : null
    if (suggestion) result = { locale: detail.locale, model: detail.model, ...suggestion }
  }
  return {
    state,
    startedAt: lease.startedAt,
    finishedAt: lease.finishedAt,
    failure: state === 'failed' ? lease.outcome : '',
    locale: detail.locale,
    result,
  }
}

/**
 * SOLL DIE SEITE NOCH AUF DIESEN LAUF HINWEISEN? Ein gescheiterter oder
 * abgebrochener Lauf ist eine Auskunft für den, der ihn eben gestartet hat —
 * nicht für jeden, der die Seite in den Tagen danach öffnet.
 */
export function pageTranslateNoticeDue(view: Pick<PageTranslateRunView, 'state' | 'startedAt'>, nowMs: number): boolean {
  if (view.state !== 'failed' && view.state !== 'stalled') return false
  const startedMs = Date.parse(view.startedAt)
  return !Number.isNaN(startedMs) && nowMs - startedMs < PAGE_TRANSLATE_NOTICE_MS
}
