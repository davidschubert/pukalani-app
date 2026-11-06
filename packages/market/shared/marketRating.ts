/**
 * DIE EINE FREIWILLIGE FRAGE — PUR (Plan §2.10; MV1 M5).
 *
 * Zwei Dinge, die Route und Oberfläche gemeinsam brauchen: der Deckel für den
 * Satz und der Schlüssel, unter dem die Antwort genau einmal gezählt wird. Sie
 * stehen hier und nicht in der Route, weil die Seite denselben Deckel braucht
 * (sonst zählt der Zähler unter dem Feld etwas anderes, als der Server
 * annimmt) — dieselbe Begründung wie bei `marketLimits.ts`.
 */

/**
 * Wie lang der eine Satz sein darf (§2.10: „optional ein Satz ≤ 200
 * Zeichen"). Er wird vor dem Speichern PII-gefiltert; der Deckel gilt nach dem
 * Filter noch einmal, weil ein Filter Text auch verlängern kann (er ersetzt
 * Funde durch `[entfernt]`).
 */
export const MARKET_RATING_NOTE_MAX = 200

/** Die möglichen Noten — 1 bis 5, als Liste für die Knopfreihe. */
export const MARKET_RATING_SCORES = [1, 2, 3, 4, 5] as const

export type MarketRatingScore = (typeof MARKET_RATING_SCORES)[number]

/**
 * DER IDEMPOTENZ-SCHLÜSSEL: eine Zeilen-Id, die sich aus dem Branding ergibt.
 *
 * Appwrite lässt bis 36 Zeichen aus `a-zA-Z0-9._-` zu und kein führendes
 * Sonderzeichen. Eine Profil-Id ist 20 Zeichen, das Präfix vier — 24, also
 * reichlich Luft. Ein zweiter Versuch trifft dieselbe Id und bekommt 409;
 * genau das ist die Zusage „einmal je Branding" (die Route liest das 409 als
 * `counted: false`).
 *
 * DER SCHLÜSSEL TRÄGT DAS BRANDING UND NICHT DAS KONTO: gefragt wird nach dem
 * VERGLEICH, und den gibt es je Branding. Wer zwei Marken führt, darf zu
 * beiden etwas sagen.
 */
export function marketRatingEventRowId(profileId: string): string {
  return `mkr-${profileId}`
}

/**
 * Die Marke im `localStorage` — reine Bequemlichkeit, damit der Block nach dem
 * Klick sofort verschwindet und nicht erst nach einem Neuladen. Die ZUSAGE
 * „einmal" hält der Server (s. `marketRatingEventRowId`); dieser Schlüssel
 * hält nur den Browser ruhig.
 */
export function marketRatingSeenKey(profileId: string): string {
  return `market:rated:${profileId}`
}
