import { INSIGHTS_DRAFT_WORDS_MAX, INSIGHTS_DRAFT_WORDS_MIN } from './insightsPrompts'

/**
 * DIE TOKEN-DECKE EINES ENTWURFS, AUS DEM BESTELLTEN UMFANG GERECHNET
 * (BI4, 2026-11-08 — Plan BRAND-INSIGHTS-KURATION §16).
 *
 * ── WAS GEMESSEN WURDE, BEVOR HIER EINE ZAHL STAND ───────────────────────
 * 52 echte Läufe gegen `anthropic/claude-haiku-4.5` (Amazon Bedrock, ZDR,
 * `data_collection: deny`) mit dem ECHTEN Entwurfs-Prompt:
 *
 *   Bestellt | gelieferte Wörter | Tokens (min–max) | Tokens je Wort
 *   ---------|-------------------|------------------|---------------
 *   200      | 163–175           |   477–510        | ~2,9
 *   700      | 436–596           | 1.116–1.469      | ~2,5
 *   2.000    | 963–1.582         | 2.195–3.621      | ~2,3
 *
 * In ALLEN 52 Läufen stand `finish_reason: 'stop'`. Die feste Decke von
 * 8.000 Tokens ist NIE gerissen — der höchste gemessene Wert war 3.621. Die
 * Token-Decke war also NICHT die Ursache von BI4 (das war ein nicht
 * escaptes `"`, siehe `core/shared/aiJson.ts`).
 *
 * ── WARUM DANN ÜBERHAUPT RECHNEN — UND WARUM NACH OBEN ───────────────────
 * Weil `max_tokens` kein Budget ist, sondern eine GUILLOTINE. Bezahlt wird,
 * was erzeugt wurde; eine niedrigere Decke spart keinen Cent und kann nur
 * eines bewirken: einen Lauf, der zu lang geworden wäre, mitten im JSON
 * abschneiden — und damit vollständig vernichten. Die zweite Option aus dem
 * BI4-Eintrag („den erlaubten Bereich auf das senken, was 8.000 Tokens
 * tragen") beantwortet deshalb eine Frage, die sich nicht gestellt hat, und
 * nimmt der Redaktion eine Möglichkeit, um nichts zu gewinnen.
 *
 * Gerechnet wird trotzdem, aber in die ANDERE Richtung als vermutet: die
 * Decke wächst mit dem Auftrag. Bei 2.000 Wörtern steht sie jetzt bei
 * 15.400 statt 8.000 Tokens — denn liefert ein Modell einmal wirklich die
 * bestellten 2.000 Wörter (gemessenes Maximum: 1.582), kostet das rund
 * 5.000 Tokens, und die alte Decke hätte nur noch 1,6-fachen Abstand
 * gehabt. Bei 200 Wörtern steht sie bei 1.900 statt 8.000: dort ist sie die
 * Notbremse gegen ein durchgegangenes Modell, das sonst das Vierzigfache
 * des Bestellten schreiben dürfte.
 *
 * ── DER AUFSCHLAG IST DREIFACH, UND DAS IST ABSICHT ──────────────────────
 * `TOKENS_PER_WORD` ist der höchste gemessene Schnitt (2,5 statt 2,3), und
 * `HEADROOM` verdreifacht ihn. Jedes Reissen dieser Decke ist ein bezahlter,
 * verlorener Lauf — der Abstand gehört also grosszügig, nicht knapp. Der
 * Aufschlag deckt zugleich, was die Wortzahl nicht sieht: die Streuung der
 * Lieferung (gemessen 1,6-fach), Markdown-Auszeichnung, das Escaping im
 * JSON-String und die beiden Felder neben dem Fließtext — für die zusätzlich
 * `OVERHEAD` steht (Titel 200 und Vorspann 400 Zeichen laut §9.3, plus das
 * JSON-Gerüst).
 *
 * Gegenprobe gegen die Messung: bei 700 Wörtern deckelt die Regel bei 5.650
 * (höchster Messwert 1.469 — 3,8-facher Abstand), bei 2.000 bei 15.400
 * (höchster Messwert 3.621 — 4,3-facher Abstand). Im normalen Betrieb kann
 * sie nicht greifen; greift sie doch, SAGT es der Transport seit BI4
 * (`finish_reason: 'length'` ⇒ `ai_truncated`) statt „AI returned no JSON".
 */

/** Höchster gemessener Schnitt: Tokens je geliefertes Wort, inkl. Escaping. */
export const INSIGHTS_DRAFT_TOKENS_PER_WORD = 2.5

/** Dreifacher Abstand — jedes Reissen der Decke kostet einen bezahlten Lauf. */
export const INSIGHTS_DRAFT_TOKEN_HEADROOM = 3

/** Titel, Vorspann und JSON-Gerüst, die neben dem Fließtext mitreisen. */
export const INSIGHTS_DRAFT_TOKEN_OVERHEAD = 400

/**
 * Die Token-Decke für einen Entwurf von `targetWords` Wörtern.
 *
 * Die Wortzahl wird in den erlaubten Bereich geklemmt, bevor gerechnet wird:
 * die Route validiert sie zwar schon (`bodySchema`), aber eine reine Regel,
 * die bei einer 0 oder einer Million eine sinnlose Decke zurückgibt, wäre
 * eine Falle für die nächste Aufrufstelle.
 */
export function insightsDraftMaxTokens(targetWords: number): number {
  const words = Math.min(
    INSIGHTS_DRAFT_WORDS_MAX,
    Math.max(INSIGHTS_DRAFT_WORDS_MIN, Math.round(Number.isFinite(targetWords) ? targetWords : INSIGHTS_DRAFT_WORDS_MIN)),
  )
  return INSIGHTS_DRAFT_TOKEN_OVERHEAD
    + Math.ceil(words * INSIGHTS_DRAFT_TOKENS_PER_WORD * INSIGHTS_DRAFT_TOKEN_HEADROOM)
}
