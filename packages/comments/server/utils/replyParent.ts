import { type ReplyTarget, replyParentDenial } from '../../shared/replyParent'
import type { Comment } from '../../shared/types/comment'

/**
 * Die Regel aus `shared/replyParent.ts` als Ablehnung — die eine Stelle, an
 * der beide Schreibwege (Konto und Gast) ihre Antwort prüfen (SEC-035,
 * 2026-11-13). Die Texte sind die, die der Gast-Weg schon trug:
 *  - nicht aktiv ⇒ 404 mit demselben Text wie „Eltern-Kommentar nicht
 *    gefunden" (nichts über den Kommentar verraten),
 *  - fremder Faden ⇒ 422.
 */
export function assertReplyParent(parent: Pick<Comment, 'status' | 'targetType' | 'targetId'>, target: ReplyTarget): void {
  const denial = replyParentDenial(parent, target)
  if (denial === 'not_active') {
    throw createError({ status: 404, statusText: 'Parent comment not found' })
  }
  if (denial === 'other_thread') {
    throw createError({ status: 422, statusText: 'Parent belongs to a different thread' })
  }
}
