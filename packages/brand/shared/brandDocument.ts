import { brandGenerationHashInput } from './brandGeneration'
import type { BrandStepKey } from './slotRegistry'

/**
 * DIE REINEN RECHNUNGEN DES DOKUMENTS (BW2 Paket 7,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §10).
 *
 * PUR — kein Appwrite, kein H3, kein i18n, wie `brandSessions.ts` und
 * `brandWorkspaceNav.ts`. Zwei Fragen stehen hier, und beide entscheiden über
 * GELD:
 *
 *  1. `brandDocumentRevisionInput` — „ist das noch derselbe Dokument-Stand?"
 *     Der Prüfblick kostet 5 im Eimer (§13); derselbe Stand darf ihn kein
 *     zweites Mal kosten.
 *  2. `splitBrandDocumentCatchUp` — „wie viele ungeprüfte Sessions holt EIN
 *     Prüfblick nach?" Der Deckel ist die Bremse gegen den Fall, in dem ein
 *     tagelanger Anbieter-Ausfall 68 fail-soft ausgefallene Sessions
 *     hinterlassen hat und ein einziger Klick sie alle bezahlt.
 *
 * Beide sind hier, damit ein Test sie ohne Route stellen kann — und weil die
 * ANTWORT auf „schon geprüft" an zwei Enden gebraucht wird: die Leseroute
 * meldet den letzten Lauf, die Schreibroute entscheidet damit über den Aufruf.
 */

/**
 * WIE VIELE UNGEPRÜFTE SESSIONS EIN PRÜFBLICK NACHHOLT (§10).
 *
 * Zehn ist aus dem Eimer gerechnet, nicht geschätzt: jede Nachholung wiegt 1
 * (Stufe 1 einer gewöhnlichen Session), der Dokument-Blick selbst wiegt 5, der
 * Tages-Eimer trägt 120. Ein Klick kostet damit höchstens 15 — ein Achtel des
 * Tages, und selbst ein Branding, in dem der Anbieter einen ganzen Durchlauf
 * lang ausgefallen war, ist nach sieben Klicks aufgeräumt.
 *
 * Der REST verschwindet nicht: er steht als `stillUnreviewed` in der Antwort,
 * und der nächste Klick nimmt die nächsten zehn. Ein Deckel, der die übrigen
 * verschweigt, wäre eine Zusage, die niemand einlöst.
 */
export const BRAND_DOCUMENT_CATCHUP_MAX = 10

export interface BrandDocumentCatchUpSplit {
  /** Die, die DIESER Prüfblick nachholt — in der Reihenfolge der Eingabe. */
  readonly take: readonly string[]
  /** Die übrigen; sie bleiben ungeprüft und werden gemeldet. */
  readonly rest: readonly string[]
}

/**
 * DIE AUSWAHL DES DECKELS — die ERSTEN `max`, nicht irgendwelche.
 *
 * Die Reihenfolge kommt vom Aufrufer und ist die REGISTRY-Reihenfolge (der
 * Server läuft über `BRAND_SLOTS`). Das ist die richtige: die frühen Felder
 * sind die, aus denen die späteren schöpfen — ein Urteil über `a.pitch` ist
 * mehr wert als eines über `f.decision`, und wer nur zehn bezahlen kann, will
 * die zehn, an denen der Rest hängt.
 *
 * Ein `max` von 0 oder darunter nimmt NICHTS und meldet alles als übrig; die
 * Funktion erfindet keinen Mindestlauf.
 */
export function splitBrandDocumentCatchUp(
  unreviewed: readonly string[],
  max: number = BRAND_DOCUMENT_CATCHUP_MAX,
): BrandDocumentCatchUpSplit {
  const cap = Math.max(0, Math.trunc(max))
  return { take: unreviewed.slice(0, cap), rest: unreviewed.slice(cap) }
}

/** Ein Kapitel, so wie es in den Dokument-Stand eingeht. */
export interface BrandDocumentChapterStamp {
  readonly stepKey: BrandStepKey
  readonly revision: number
}

/**
 * DER STAND DES GANZEN DOKUMENTS ALS KANONISCHE ZEICHENKETTE (§10).
 *
 * ── WARUM DIE `revision` UND NICHT DIE WERTE ─────────────────────────────
 * Die `revision` einer Kapitel-Zeile bewegt sich bei JEDER inhaltlichen
 * Änderung des Kapitels — genau das ist die Bedingung, unter der ein zweiter
 * Blick etwas Neues sehen könnte. Über die Werte zu hashen wäre dieselbe
 * Aussage für sehr viel mehr Arbeit, und sie wäre nicht einmal genauer: eine
 * Notiz oder eine Abnahme ändert keinen Wert und trotzdem das Dokument.
 *
 * Es ist dieselbe Wahl, die der KAPITEL-Blick schon getroffen hat
 * (`claimBrandChapterReview` riegelt je `revision`) — nur eine Ebene höher.
 *
 * ── ÜBERSPRUNGENE KAPITEL GEHÖREN NICHT DAZU ─────────────────────────────
 * Der Aufrufer reicht die Kapitel des WEGES herein. Ein abgewähltes Naming
 * hätte sonst eine `revision`, die niemand mehr bewegt, und ein Umlegen der
 * Weiche änderte den Schlüssel, ohne dass sich am gelesenen Dokument etwas
 * ändert — beides falsch herum.
 *
 * ── DERSELBE BAUER WIE JEDER ANDERE HASH DIESES LAYERS ───────────────────
 * `brandGenerationHashInput` (U+0000-Trennung, Registry-Fassung im Kopf) — wie
 * `computeSourcesHash`. Eine zweite Hash-Regel wäre eine zweite Antwort auf
 * „hat sich etwas bewegt", und die Abweichung sähe man erst an einem Prüfblick,
 * der sich für erledigt hält. Gehasht wird auf dem SERVER (sha256), wie dort:
 * `node:crypto` hat in `shared/` nichts verloren.
 */
export const BRAND_DOCUMENT_HASH_SCOPE = 'document'

export function brandDocumentRevisionInput(
  profileId: string,
  chapters: readonly BrandDocumentChapterStamp[],
): string {
  return brandGenerationHashInput(
    profileId,
    BRAND_DOCUMENT_HASH_SCOPE,
    chapters.map(chapter => ({ slotId: chapter.stepKey, value: String(chapter.revision) })),
  )
}
