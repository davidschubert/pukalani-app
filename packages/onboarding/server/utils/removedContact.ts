import { createHash } from 'node:crypto'

/**
 * Idempotenz-Schlüssel der Glocken-Zeile „Nachricht einer entfernten Person"
 * (SEC-030 Teil 2, 2026-11-13) — die ZWEITE, dauerhafte Sicherung hinter dem
 * 7-Tage-Fenster der Bremse: (Community, Absenderin, Kalenderwoche, Empfänger)
 * ergibt GENAU EINE Row-Id, und `notify()` schreibt einen zweiten Versuch
 * derselben Woche nicht (409 ⇒ `duplicate`). Gehasht, weil die vier Werte
 * zusammen länger sind als Appwrites 36 Zeichen; Muster wie
 * `pastDueNoticeRowId`.
 */
export function removedContactRowId(communityId: string, senderId: string, week: number, recipientId: string): string {
  const digest = createHash('sha256').update(`${communityId}|${senderId}|${week}|${recipientId}`).digest('hex')
  return `appeal-${digest.slice(0, 29)}`
}
