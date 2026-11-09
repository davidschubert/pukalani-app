/**
 * KOMMENTARE UNTER EINEM INSIGHTS-BEITRAG (BI2 K7, 2026-11-09).
 *
 * Der `comments`-Layer hängt seine Zeilen an ein Paar aus `targetType` und
 * `targetId` — er muss dafür nicht wissen, was ein Insights-Beitrag ist
 * (CONCEPT A14). Diese Datei ist die EINE Stelle, an der der Begriff steht:
 * die öffentliche Seite benutzt ihn, der Schreib-Wächter
 * (`server/plugins/comments-target.ts`) und die Moderation lesen denselben.
 * Liefen sie auseinander, stünde ein Formular unter einem Beitrag, dessen
 * Absenden garantiert am Wächter scheitert.
 *
 * ── WARUM DIE ROW-ID UND NICHT DER SLUG ────────────────────────────────────
 * Ein Insights-Beitrag darf umbenannt werden; der alte Slug lebt in
 * `slugHistory` weiter und leitet per 301 um (BI1 I3). Hinge der Faden am
 * Slug, verwaiste er bei genau dieser Umbenennung — die Kommentare wären noch
 * da und niemand fände sie. Die Row-Id ändert sich nie.
 */

/** `comments.targetType` aller Kommentare unter einem Insights-Beitrag. */
export const INSIGHTS_COMMENT_TARGET = 'insights'

/**
 * Der interne Pfad, auf dem der Kommentar lebt — `comments.targetUrl`.
 *
 * Er wandert in die Antwort-Benachrichtigung („jemand hat dir geantwortet" →
 * Link). Bewusst OHNE Sprach-Präfix: der Empfänger liest in seiner eigenen
 * Sprache, und `localePath()` legt sie beim Rendern davor. Bewusst auch ohne
 * Host — die Mail-Links lösen ihn über `notificationLinks.ts` auf (D5).
 */
export function insightsCommentUrl(slug: string): string {
  return `/insights/${slug}`
}
