import type { H3Event } from 'h3'
import type { CommunityPost } from '../../shared/types/post'
import { postMentionNotificationId } from './postMentions'

/**
 * Entfernt die Erwähnungs-Meldungen (`post.mention`) EINES Beitrags aus den
 * Glocken der Genannten (SEC-032, 2026-11-15 — „… Vorschauen werden wirklich
 * geleert"). Jede dieser Meldungen trägt im `body` den Auszug des Beitrags
 * (Titel bzw. Textanfang, `notifyPostMentions`) — nach dem Löschen oder
 * Ausblenden stünde der Satz sonst weiter in fremden Glocken.
 *
 * Geräumt wird über den Core-Vertrag `removeObjectNotifications`
 * (core/server/utils/notificationCleanup.ts — Suche über den Absender,
 * Entscheidung über die feste Id, Zugriff am Admin-Client vorbei an der
 * Datentür, Bestand, Fehlerverhalten). Hier bleibt das Produktwissen: der
 * Typ `post.mention` und die Id `postMentionNotificationId(communityId,
 * postId, recipientId)`.
 *
 * MANDANT: dieselbe Zahl wie beim Schreiben (`useTenant(event)`, im Silo
 * `''`). Ein Aufruf von einem anderen Host fände nichts — die Aufrufer
 * (eigenes Löschen, Ausblenden) laufen auf dem Host der Community.
 */
export async function removePostMentionNotifications(
  event: H3Event,
  post: Pick<CommunityPost, '$id' | 'authorId'>,
): Promise<number> {
  if (!post.authorId) return 0
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  return removeObjectNotifications(event, {
    kind: 'post',
    objectId: post.$id,
    senderId: post.authorId,
    rowIdFor: (type, recipientId) =>
      type === 'post.mention' ? postMentionNotificationId(communityId, post.$id, recipientId) : null,
  })
}
