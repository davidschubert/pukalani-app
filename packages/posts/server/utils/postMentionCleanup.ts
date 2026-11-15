import { Query, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { CommunityPost } from '../../shared/types/post'
import { postMentionNotificationId } from './postMentions'

/**
 * Tabelle der Glocke (Eigentum: core/system). Hier als Zeichenkette, weil es
 * für das AUFRÄUMEN fremder Glocken keinen Core-Vertrag gibt — siehe unten.
 */
const NOTIFICATIONS_TABLE = 'notifications'

type MentionNotificationRow = Models.Row & { recipientId?: string, senderId?: string, type?: string }

/**
 * Entfernt die Erwähnungs-Meldungen (`post.mention`) EINES Beitrags aus den
 * Glocken der Genannten (SEC-032, 2026-11-15 — „… Vorschauen werden wirklich
 * geleert"). Jede dieser Meldungen trägt im `body` den Auszug des Beitrags
 * (Titel bzw. Textanfang, `notifyPostMentions`) — nach dem Löschen oder
 * Ausblenden stünde der Satz sonst weiter in fremden Glocken.
 *
 * WARUM DIE ZUORDNUNG HIER SICHER IST (und bei Kommentaren nicht): die Meldung
 * entsteht unter einer FESTEN Row-Id, `postMentionNotificationId(communityId,
 * postId, recipientId)` — ein Hash, der den Beitrag enthält. Gesucht wird über
 * den Absender (Index `sender`, system-008), ENTSCHIEDEN wird über Typ und
 * den Schlüssel: nur eine Zeile, deren Id genau diesem Beitrag und genau ihrem
 * Empfänger entspricht, fällt. Ein anderer Beitrag desselben Autors ergibt
 * einen anderen Hash. Kein Raten über Text oder Link (der Link ist `/feed`).
 *
 * WARUM HIER UND NICHT IM CORE: Aufräumen über die Glocken MEHRERER Empfänger
 * ist kein Vorgang, den `notify()` kennt, und ein neuer Core-Vertrag lag
 * außerhalb dieses Pakets. Der Zugriff geht deshalb bewusst am Admin-Client
 * vorbei an jeder Datentür — die Zeilen gehören den EMPFÄNGERN (Row-
 * Permissions nur für sie), die Tür eines Mandanten könnte sie gar nicht
 * sehen. Kandidat für einen Core-Vertrag „Meldungen zu einem Objekt
 * entfernen", sobald ein zweiter Layer ihn braucht.
 *
 * MANDANT: dieselbe Zahl wie beim Schreiben (`useTenant(event)`, im Silo
 * `''`). Ein Aufruf von einem anderen Host fände nichts — die Aufrufer
 * (eigenes Löschen, Ausblenden) laufen auf dem Host der Community.
 *
 * BEST EFFORT, aber laut: wirft nie (das Löschen eines Beitrags darf nicht an
 * einer fremden Glocke scheitern), loggt jeden Fehler. Rückgabe = entfernte
 * Meldungen.
 */
export async function removePostMentionNotifications(
  event: H3Event,
  post: Pick<CommunityPost, '$id' | 'authorId'>,
): Promise<number> {
  if (!post.authorId) return 0
  let removed = 0
  try {
    const tenant = useTenant(event)
    const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
    const config = useRuntimeConfig(event)
    const databaseId = config.public.appwriteDatabaseId
    const { tablesDB } = createAdminClient(event)

    const candidates = await listAllRows<MentionNotificationRow>(tablesDB, databaseId, NOTIFICATIONS_TABLE, [
      Query.equal('senderId', post.authorId),
    ])
    for (const row of candidates) {
      // Typ im Code statt in der Abfrage: indiziert ist nur `senderId`.
      if (row.type !== 'post.mention' || !row.recipientId) continue
      if (row.$id !== postMentionNotificationId(communityId, post.$id, row.recipientId)) continue
      await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS_TABLE, rowId: row.$id })
      removed++
    }
  }
  catch (error) {
    console.error(`[posts] Erwähnungs-Meldungen zu Beitrag ${post.$id} konnten nicht entfernt werden — der Auszug bleibt in fremden Glocken:`, error)
  }
  return removed
}
