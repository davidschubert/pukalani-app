import type { Comment } from './types/comment'

/**
 * WORAN DARF EINE ANTWORT HÄNGEN? (SEC-035, seit 2026-11-13)
 *
 * EINE Regel für beide Schreibwege — Konto (`index.post.ts`) und Gast
 * (`guest.post.ts`). Bis dahin prüfte nur der Gast-Weg den Faden und keiner
 * der beiden den Zustand des Eltern-Kommentars: eine Antwort ließ sich an
 * einen Kommentar unter einem ANDEREN Ziel hängen (sie stand dann im fremden
 * Faden, erzeugte aber Aktivität und Benachrichtigungen am eigenen Ziel) und
 * an einen ausgeblendeten oder gelöschten Kommentar (dessen Autor bekam eine
 * Benachrichtigung über einen Faden, den niemand mehr sieht).
 *
 * Reihenfolge mit Grund: „nicht aktiv" kommt ZUERST und wird wie „nicht
 * gefunden" beantwortet (404) — ein ausgeblendeter Kommentar soll über diese
 * Route nichts mehr über sich verraten, auch nicht, zu welchem Faden er
 * gehört. Erst ein aktiver Kommentar aus einem fremden Faden ergibt den
 * fachlichen Fehler (422).
 */

export type ReplyParentDenial = 'not_active' | 'other_thread'

export interface ReplyTarget {
  targetType: string
  targetId: string
}

export function replyParentDenial(
  parent: Pick<Comment, 'status' | 'targetType' | 'targetId'>,
  target: ReplyTarget,
): ReplyParentDenial | null {
  if (parent.status !== 'active') return 'not_active'
  if (parent.targetType !== target.targetType || parent.targetId !== target.targetId) return 'other_thread'
  return null
}
