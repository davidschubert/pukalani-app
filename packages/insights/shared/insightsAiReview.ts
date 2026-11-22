import { z } from 'zod'
import type { RunLeaseSnapshot, RunLeaseState } from '../../core/shared/runLease'
import { runLeaseState } from '../../core/shared/runLease'
import { INSIGHTS_LOCALES, insightsBodyOf, insightsPostEditSchema } from './insightsPost'
import type { InsightsLocale, InsightsPostEdit } from './insightsPost'

/**
 * DIE KI-PRÜFUNG EINES ARTIKELS (IN1 a, 2026-11-22) — der pure Teil.
 *
 * Ein Knopf im Editor liest die AKTUELLE Fassung (auch ungespeichert) und
 * meldet, was unstimmig wirkt, was inhaltlich fehlt und wie der Artikel für
 * Leser und Suche besser wird. Die Prüfung BERÄT nur: sie sperrt nichts,
 * schreibt nichts in den Artikel und darf falsch warnen. Die Sperre bleiben
 * die festen Prüfregeln (`insightsReviewIssues`, Gate auf dem Server).
 *
 * Hier steht, was Server und Seite GLEICH lesen müssen: die Form der Anfrage,
 * die Klemme der Antwort und die Ansicht eines Laufs. Wo das Ergebnis liegt
 * (im Speicher des Prozesses, nicht an der Lauf-Zeile) und warum, steht im
 * Kopf von `server/utils/insightsAiReviewRun.ts`.
 */

/** Die Art des Laufs in `insights_runs.scope`; Gegenstand = Beitrags-Id. */
export const INSIGHTS_AI_REVIEW_RUN_SCOPE = 'review'

/** 409: auf diesem Beitrag läuft schon eine Prüfung (die Seite zeigt einen ruhigen Hinweis). */
export const INSIGHTS_AI_REVIEW_RUNNING_CODE = 'review_running'

/** 409: die Grundfassung hat keinen Fliesstext — nichts, wofür sich ein Lauf lohnt. */
export const INSIGHTS_AI_REVIEW_NOTHING_CODE = 'nothing_to_review'

/**
 * Die Frist JEDER Abfrage der Seite (`lange-laeufe.md`): `useRunPolling`
 * überlappt nicht, eine hängende Abfrage hielte das Abfragen an.
 */
export const INSIGHTS_AI_REVIEW_POLL_TIMEOUT_MS = 10_000

/** Die drei Arten eines Fundes — dieselben drei Fragen wie im Auftrag. */
export const INSIGHTS_AI_REVIEW_KINDS = ['inconsistency', 'missing', 'improvement'] as const
export type InsightsAiReviewKind = (typeof INSIGHTS_AI_REVIEW_KINDS)[number]

/** Höchstens so viele Punkte zeigt die Seite — mehr ist kein Rat, sondern eine Liste. */
export const INSIGHTS_AI_REVIEW_FINDINGS_MAX = 12

/** Höchstens so lang wird ein Punkt (gekürzt, nicht verworfen). */
export const INSIGHTS_AI_REVIEW_FINDING_MAX = 400

/**
 * Kurze Ausgangs-Codes an der Lauf-Zeile (`outcome`, höchstens 32 Zeichen).
 * `done` heisst: Ergebnis liegt (oder lag) im Speicher; alles andere ist ein
 * gescheiterter Lauf mit dem Grund als Wort.
 */
export const INSIGHTS_AI_REVIEW_OUTCOMES = {
  done: 'done',
  empty: 'ai_empty',
  failed: 'review_failed',
  aiDisabled: 'ai_disabled',
  aiEndpointUnavailable: 'ai_endpoint_unavailable',
  leaseLost: 'lease_lost',
  leaseUnwritable: 'lease_unwritable',
} as const

/**
 * DIE ANFRAGE: der UNGESPEICHERTE Formularstand (dasselbe Schema wie das
 * Speichern) und die Sprache, in der die Rückmeldung kommen soll — die der
 * Oberfläche, nicht die des Artikels.
 *
 * Ein eigenes Objekt statt `.extend()`: `insightsPostEditSchema` trägt ein
 * `superRefine` (Form-Regeln), und das lässt sich nicht erweitern, ohne die
 * Regeln zu verlieren.
 */
export const insightsAiReviewRequestSchema = z.object({
  post: insightsPostEditSchema,
  locale: z.enum(INSIGHTS_LOCALES),
})

export type InsightsAiReviewRequest = z.infer<typeof insightsAiReviewRequestSchema>

/** Gibt es etwas zu prüfen? Der Fliesstext der Grundfassung, ohne Leerraum. */
export function insightsAiReviewHasText(post: Pick<InsightsPostEdit, 'baseLocale' | 'bodyDe' | 'bodyEn'>): boolean {
  return insightsBodyOf(post, post.baseLocale).trim().length > 0
}

export interface InsightsAiReviewFinding {
  kind: InsightsAiReviewKind
  text: string
}

function clampFindingText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length <= INSIGHTS_AI_REVIEW_FINDING_MAX) return flat
  return `${flat.slice(0, INSIGHTS_AI_REVIEW_FINDING_MAX - 1).trimEnd()}…`
}

/**
 * WAS AUS DER ANTWORT WIRD — NACH dem bezahlten Aufruf wird geklemmt, nicht
 * abgelehnt (Muster: `insightsChangeNoteSuggestionSchema`):
 *  - keine Liste / kein Objekt ⇒ keine Funde,
 *  - ein Punkt ohne Text oder mit unbekannter Art fällt weg (die Seite
 *    ordnet nach Art — ein Punkt ohne Art hätte keinen Platz),
 *  - zu langer Text ⇒ gekürzt mit „…",
 *  - mehr als `INSIGHTS_AI_REVIEW_FINDINGS_MAX` Punkte ⇒ die ersten.
 * Ob „keine Funde" ein gescheiterter Lauf ist, entscheidet der Lauf (ja:
 * `ai_empty` — ein Modell, das nichts zu sagen hat, sagt das in einem Satz).
 */
export const insightsAiReviewResultSchema = z.unknown().transform((value): InsightsAiReviewFinding[] => {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const raw = Array.isArray(record.findings) ? record.findings : []
  const findings: InsightsAiReviewFinding[] = []
  for (const entry of raw) {
    if (findings.length >= INSIGHTS_AI_REVIEW_FINDINGS_MAX) break
    const item = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
    const kind = INSIGHTS_AI_REVIEW_KINDS.find(candidate => candidate === item.kind)
    const text = clampFindingText(item.text)
    if (kind && text) findings.push({ kind, text })
  }
  return findings
})

/**
 * DER STAND EINES LAUFS, wie die Seite ihn liest.
 *
 * `state` rechnet die Server-Uhr (`runLeaseState`). `findings` steht nur bei
 * `done` UND wenn das Ergebnis noch im Speicher liegt; `gone` sagt ehrlich,
 * dass der Lauf fertig war, sein Ergebnis aber nicht mehr da ist (Neustart,
 * abgelaufen) — die Seite bittet dann, noch einmal zu prüfen.
 */
export interface InsightsAiReviewView {
  state: RunLeaseState
  startedAt: string
  finishedAt: string
  /** Nur bei `failed`: das kurze Wort des Ausgangs, sonst leer. */
  failure: string
  /** In welcher Sprache die Rückmeldung geschrieben ist (nur mit `findings`). */
  locale: InsightsLocale | ''
  findings: InsightsAiReviewFinding[] | null
  gone: boolean
}

/** Was der Speicher des Prozesses zu einem fertigen Lauf hält. */
export interface InsightsAiReviewStored {
  locale: InsightsLocale
  findings: InsightsAiReviewFinding[]
}

export function toInsightsAiReviewView(
  lease: Pick<RunLeaseSnapshot, 'startedAt' | 'heartbeatAt' | 'finishedAt' | 'outcome'> | null,
  nowMs: number,
  stored: InsightsAiReviewStored | null,
): InsightsAiReviewView {
  const state = runLeaseState(lease, nowMs)
  const done = state === 'done'
  return {
    state,
    startedAt: lease?.startedAt ?? '',
    finishedAt: lease?.finishedAt ?? '',
    failure: state === 'failed' ? (lease?.outcome ?? '') : '',
    locale: done && stored ? stored.locale : '',
    findings: done && stored ? stored.findings : null,
    gone: done && !stored,
  }
}
