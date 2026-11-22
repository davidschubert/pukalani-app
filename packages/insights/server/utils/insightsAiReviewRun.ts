import type { H3Event } from 'h3'
import type { RunLeaseRow, RunLeaseStore } from '../../../core/server/utils/runLease'
import { AI_DISABLED_CODE, AI_ENDPOINT_UNAVAILABLE_CODE } from '../../../core/shared/aiProviderRouting'
import { INSIGHTS_AI_DISABLED_CODE } from '../../shared/insightsAiLimits'
import type { InsightsAiReviewStored } from '../../shared/insightsAiReview'
import { INSIGHTS_AI_REVIEW_OUTCOMES, insightsAiReviewResultSchema } from '../../shared/insightsAiReview'
import type { InsightsLocale, InsightsPostEdit } from '../../shared/insightsPost'
import { INSIGHTS_AI_REVIEW_PROMPT_VERSION, buildInsightsAiReviewPrompt } from '../../shared/insightsPrompts'
import { INSIGHTS_RUNS_TABLE } from '../../shared/insightsRows'
import { BRAND_PROVIDER_ROUTING } from '../contracts/brandContract'
import { insightsDb } from './insightsStore'

/**
 * DIE KI-PRÜFUNG EINES ARTIKELS — der Lauf hinter der Antwort (IN1 a,
 * 2026-11-22). Route: `server/api/insights/posts/[id]/review.post.ts`,
 * Abfrage: `review.get.ts`, pure Regeln: `shared/insightsAiReview.ts`.
 *
 * ══ WARUM DAS ERGEBNIS IM SPEICHER DES PROZESSES LIEGT ═══════════════════
 * Die Lauf-Tabelle `insights_runs` (Migration insights-012) trägt nur die
 * Spalten der Lauf-Sperre: Art, Gegenstand, laufende Nummer, Start,
 * Herzschlag, Ende, Ausgang und ein kleines `detail`. Eine Spalte für das
 * ERGEBNIS hat sie nicht, und eine neue Spalte wäre eine Migration auf
 * Production — für eine Anzeige, die nur einen Moment gelesen wird, war das
 * die falsche Rechnung (Entscheidung beim Bau von IN1 a, 2026-11-22).
 *
 * Deshalb:
 *  - Die LAUF-ZEILE trägt, was die Sperre braucht und was die Diagnose
 *    sehen soll: Sperre, Herzschlag, Ausgang und in `detail` NUR Zahlen
 *    (`paid`, Anzahl der Funde, Token) — nie einen Satz des Artikels oder der
 *    Rückmeldung (`RUN_LEASE_DETAIL_MAX`, `lange-laeufe.md`).
 *  - Das ERGEBNIS lebt in einer Map dieses Prozesses, Schlüssel = Id der
 *    Lauf-Zeile, Ablauf nach `INSIGHTS_AI_REVIEW_RESULT_TTL_MS`, höchstens
 *    `INSIGHTS_AI_REVIEW_RESULTS_MAX` Einträge (der älteste fällt zuerst).
 *    Das trägt, weil jede App mit pm2 `instances: 1` fährt (dieselbe Annahme
 *    wie der Speicher der Drossel ohne Redis): der Prozess, der rechnet, ist
 *    der, der abgefragt wird.
 *  - Fällt das Ergebnis weg (Neustart, Deploy, abgelaufen, verdrängt),
 *    findet die Abfrage eine FERTIGE Lauf-Zeile ohne Eintrag in der Map und
 *    sagt das ehrlich (`gone: true` ⇒ „Ergebnis nicht mehr da — noch einmal
 *    prüfen"). Verloren ist dabei ein Rat für ein paar Cent, kein Inhalt:
 *    die Prüfung schreibt nichts in den Artikel.
 *
 * ══ DER LAUF WIRFT NIE ══════════════════════════════════════════════════
 * Jeder Ausgang steht an der Lauf-Zeile (`done` oder ein kurzes Wort);
 * `runDetached` ist nur das letzte Netz. Das Ergebnis wird VOR dem Ende der
 * Zeile in die Map gelegt — wer „fertig" liest, findet es schon vor.
 *
 * ══ BEZAHLT IST, WAS DEN VERMERK TRÄGT ═════════════════════════════════
 * `paid: true` steht an der Zeile, BEVOR der Anbieter gerufen wird; ohne
 * geschriebenen Vermerk kein Aufruf (`lange-laeufe.md`, „Kontingent nach
 * Abbruch"). Zurückgebucht wird nichts: das Kontingent der Redaktion bucht
 * das Anstossen, nicht den Erfolg (Kopf von `insightsAi.ts`).
 */

/** Wie lange ein Ergebnis abholbar bleibt. */
export const INSIGHTS_AI_REVIEW_RESULT_TTL_MS = 60 * 60_000

/** Wie viele Ergebnisse der Prozess höchstens hält — eine Redaktion braucht eine Handvoll. */
export const INSIGHTS_AI_REVIEW_RESULTS_MAX = 200

/**
 * Die Frist des einen Modell-Aufrufs. Sie gilt HINTER der Antwort und damit
 * nicht gegen die 60 s des Webservers — nur gegen ein Modell, das gar nicht
 * antwortet. Ein langer Artikel ist schnell 40.000 Zeichen Eingabe.
 */
export const INSIGHTS_AI_REVIEW_TIMEOUT_MS = 120_000

interface StoredEntry extends InsightsAiReviewStored {
  storedAtMs: number
}

const results = new Map<string, StoredEntry>()

/** Das Ergebnis eines fertigen Laufs ablegen (Schlüssel = Id der Lauf-Zeile). */
export function rememberInsightsAiReview(leaseId: string, stored: InsightsAiReviewStored, nowMs = Date.now()): void {
  pruneInsightsAiReviews(nowMs)
  results.delete(leaseId)
  results.set(leaseId, { ...stored, storedAtMs: nowMs })
  // Map hält die Einfüge-Reihenfolge: der erste Schlüssel ist der älteste.
  while (results.size > INSIGHTS_AI_REVIEW_RESULTS_MAX) {
    const oldest = results.keys().next().value
    if (oldest === undefined) break
    results.delete(oldest)
  }
}

/** Das Ergebnis zu einer Lauf-Zeile — oder `null` (nie gerechnet, abgelaufen, Neustart). */
export function recallInsightsAiReview(leaseId: string, nowMs = Date.now()): InsightsAiReviewStored | null {
  const entry = results.get(leaseId)
  if (!entry) return null
  if (nowMs - entry.storedAtMs >= INSIGHTS_AI_REVIEW_RESULT_TTL_MS) {
    results.delete(leaseId)
    return null
  }
  return { locale: entry.locale, findings: entry.findings }
}

/** Abgelaufene Einträge räumen — beim Ablegen, damit die Map nicht wächst. */
function pruneInsightsAiReviews(nowMs: number): void {
  for (const [key, entry] of results) {
    if (nowMs - entry.storedAtMs >= INSIGHTS_AI_REVIEW_RESULT_TTL_MS) results.delete(key)
  }
}

/** NUR für Tests: ein Neustart des Prozesses — alle Ergebnisse weg. */
export function forgetInsightsAiReviews(): void {
  results.clear()
}

/** Der Store über `insights_runs` (server-only, ohne Rechte für Konten). */
export function insightsAiReviewStore(event: H3Event): RunLeaseStore {
  return appwriteRunLeaseStore({ ...insightsDb(event), tableId: INSIGHTS_RUNS_TABLE })
}

/** Der `paid`-Vermerk liess sich nicht schreiben — ohne ihn kein Modell-Aufruf. */
class InsightsAiReviewLeaseUnwritable extends Error {}

function outcomeOf(error: unknown): string {
  if (error instanceof InsightsAiReviewLeaseUnwritable) return INSIGHTS_AI_REVIEW_OUTCOMES.leaseUnwritable
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code
  if (code === AI_ENDPOINT_UNAVAILABLE_CODE) return INSIGHTS_AI_REVIEW_OUTCOMES.aiEndpointUnavailable
  if (code === AI_DISABLED_CODE || code === INSIGHTS_AI_DISABLED_CODE) return INSIGHTS_AI_REVIEW_OUTCOMES.aiDisabled
  return INSIGHTS_AI_REVIEW_OUTCOMES.failed
}

/** Die Zahlen an der Lauf-Zeile — nur Zahlen und Kennungen. */
interface InsightsAiReviewRunDetail {
  paid: boolean
  findings: number
  promptTokens?: number
  completionTokens?: number
}

export interface InsightsAiReviewRunInput {
  store: RunLeaseStore
  lease: Pick<RunLeaseRow, '$id'>
  postId: string
  post: InsightsPostEdit
  locale: InsightsLocale
  model: string
}

/**
 * Den Artikel prüfen lassen und das Ergebnis ablegen. Wirft nie (s. Kopf).
 */
export async function runInsightsAiReview(event: H3Event, input: InsightsAiReviewRunInput): Promise<void> {
  const startedAtMs = Date.now()
  const alive = keepRunLeaseAlive(input.store, input.lease)
  const detail: InsightsAiReviewRunDetail = { paid: false, findings: 0 }
  let outcome: string = INSIGHTS_AI_REVIEW_OUTCOMES.done
  // AUSSERHALB des try: auch ein Lauf, dessen Antwort leer ist, ist bezahlt
  // und kennt seine Zahlen (dieselbe Teilung wie in `change-note.post.ts`).
  let completion: { promptTokens?: number, completionTokens?: number, finishReason?: string } | undefined

  try {
    if (alive.lost()) {
      outcome = INSIGHTS_AI_REVIEW_OUTCOMES.leaseLost
    }
    else {
      // AB HIER KOSTET ES — der Vermerk steht VOR dem Aufruf.
      detail.paid = true
      try {
        await touchRunLease(input.store, input.lease, { detail })
      }
      catch {
        throw new InsightsAiReviewLeaseUnwritable()
      }

      const answer = await aiCompleteJsonDetailed<unknown>(
        event,
        buildInsightsAiReviewPrompt({ post: input.post, locale: input.locale }),
        {
          model: input.model,
          providerRouting: { ...BRAND_PROVIDER_ROUTING },
          label: 'insights',
          // Grosszügig, wie beim Hinweis-Vorschlag: zwölf Punkte à zwei Sätze
          // brauchen keine 1.500 Token, aber eine gerissene Decke zerstört
          // den bezahlten Lauf, statt Geld zu sparen.
          maxTokens: 4000,
          temperature: 0.2,
          timeoutMs: INSIGHTS_AI_REVIEW_TIMEOUT_MS,
        },
      )
      completion = answer
      const findings = insightsAiReviewResultSchema.parse(answer.value)
      detail.findings = findings.length
      if (findings.length === 0) {
        outcome = INSIGHTS_AI_REVIEW_OUTCOMES.empty
      }
      else {
        // ERST ablegen, DANN die Zeile beenden: wer „fertig" liest, findet es.
        rememberInsightsAiReview(input.lease.$id, { locale: input.locale, findings })
      }
    }
  }
  catch (error) {
    outcome = outcomeOf(error)
  }
  finally {
    alive.stop()
  }

  if (completion?.promptTokens !== undefined) detail.promptTokens = completion.promptTokens
  if (completion?.completionTokens !== undefined) detail.completionTokens = completion.completionTokens

  // Ohne Inhalt: Kennungen und Zahlen (SEC-017).
  const logData = {
    postId: input.postId,
    format: input.post.format,
    model: input.model,
    promptVersion: INSIGHTS_AI_REVIEW_PROMPT_VERSION,
    durationMs: Date.now() - startedAtMs,
    promptTokens: completion?.promptTokens,
    completionTokens: completion?.completionTokens,
    finishReason: completion?.finishReason,
  }
  if (outcome === INSIGHTS_AI_REVIEW_OUTCOMES.done) insightsLogAi('completed', 'review', logData)
  else insightsLogAi('failed', 'review', { ...logData, errorCode: outcome })

  try {
    await finishRunLease(input.store, input.lease, { outcome, detail })
  }
  catch (error) {
    // Bleibt das Ende ungeschrieben, wird die Zeile nach der Frist `stalled`
    // — die Seite sagt dann „abgebrochen", nie „läuft für immer".
    logEvent('warn', 'insights.review_run_unfinished', {
      code: outcome,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}
