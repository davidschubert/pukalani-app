import { createHash } from 'node:crypto'
import { AppwriteException, Query, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * MELDUNGEN MIT AUSZUG — eine feste Id je Kommentar, damit sie wieder gehen
 * können (SEC-032, 2026-11-15 — Davids Entscheidung „Gelöschte Kommentare,
 * Übersetzungen und Vorschauen werden wirklich geleert").
 *
 * `reply`, `mention` und `reply.guest` tragen im `body` den Anfang des
 * Kommentars (`commentSnippet`). Löscht die Autorin ihn oder blendet die
 * Moderation ihn aus, stand dieser Satz bis hierher weiter in FREMDEN Glocken:
 * die Zeilen ließen sich keinem Kommentar zuordnen — der Link zeigt auf die
 * SEITE, die Row-Id war zufällig. Über Absender + Seite + Text zu suchen,
 * träfe nach einer Bearbeitung nicht mehr und bei gleichem Text den falschen.
 *
 * Deshalb entsteht jede dieser Meldungen unter einer FESTEN Row-Id aus
 * (Typ, Community, Kommentar, Empfänger) — dasselbe Muster wie
 * `postMentionNotificationId` im posts-Layer. Nebenwirkung, gewollt: die Id
 * ist zugleich der Idempotenz-Schlüssel von `notify()`. Pro Kommentar und
 * Empfänger gibt es ohnehin höchstens eine Meldung je Typ; ein zweiter
 * Versuch (Retry) wäre ein 409 und damit weder Zeile noch Mail. Eine zweite
 * ANTWORT ist ein anderer Kommentar und damit eine andere Id — „eine Antwort
 * auf denselben Kommentar meldet zweimal" (Kopf von `notify()`) bleibt wahr.
 *
 * BESTAND: Meldungen von VOR dieser Änderung tragen eine zufällige Id und
 * werden von hier aus NICHT gefunden — sie bleiben, bis ihr Empfänger sie
 * löscht oder sein Konto geht. Wenn überhaupt, räumt sie ein einmaliger Lauf
 * außerhalb der App; eine Suche über Text wäre hier genau das Raten, das diese
 * Datei vermeidet.
 */

/** Tabelle der Glocke (Eigentum: core/system) — Zeichenkette, s. `removeCommentNotifications`. */
const NOTIFICATIONS_TABLE = 'notifications'

/** Die Typen dieses Layers, die einen Auszug tragen. */
export type CommentNotificationType = 'reply' | 'mention' | 'reply.guest'

/** Typen MIT Absender — sie findet die Räumung über `senderId`. */
const SENT_TYPES: ReadonlySet<string> = new Set<CommentNotificationType>(['reply', 'mention'])

export interface CommentNotificationKey {
  /** Ablage-Wert der Community (`commentNotificationCommunityId`), im Silo `''`. */
  communityId: string
  commentId: string
  recipientId: string
  type: string
}

/**
 * Die feste Row-Id. Gehasht, weil vier Werte zusammen länger sind als die 36
 * Zeichen einer Appwrite-Row-Id; der Präfix hält den Anfang frei von
 * Sonderzeichen (3 + 32 = 35 Zeichen, nur `[a-z0-9]`). Der Typ steht IM Hash:
 * Antwort und Erwähnung an dieselbe Person sind zwei Zeilen.
 */
export function commentNotificationRowId(key: CommentNotificationKey): string {
  const digest = createHash('sha256')
    .update(`${key.type}|${key.communityId}|${key.commentId}|${key.recipientId}`)
    .digest('hex')
  return `cmn${digest.slice(0, 32)}`
}

/**
 * Welcher Community-Wert in die Id geht: im Pool der Mandant des Requests,
 * im Silo `''` (die Instanz IST die Community) — dieselbe Zeile wie bei den
 * Erwähnungen in Beiträgen. Schreiben und Räumen fragen beide HIER, damit
 * beide Seiten nachweislich dieselbe Zahl benutzen.
 */
export function commentNotificationCommunityId(event: H3Event): string {
  const tenant = useTenant(event)
  return tenant?.mode === 'pool' ? tenant.tenantId : ''
}

type NotificationRow = Models.Row & { recipientId?: string, senderId?: string, type?: string }

export interface RemoveCommentNotificationsInput {
  commentId: string
  communityId: string
  /** Konto der Autorin; `''` bei einem Gast-Kommentar. */
  authorId: string
  /**
   * Autor des Eltern-Kommentars — nur für `reply.guest` nötig: die Gast-
   * Antwort hat keinen Absender, ihr einziger möglicher Empfänger ist er.
   */
  parentAuthorId?: string | null
}

/**
 * Entfernt die Meldungen EINES Kommentars aus den Glocken anderer Menschen.
 *
 *  - MIT Absender (`reply`, `mention`): gesucht über `senderId` (Index
 *    `sender`, system-008), ENTSCHIEDEN über Typ und Id — nur eine Zeile, deren
 *    Id genau diesem Kommentar und genau ihrem Empfänger entspricht, fällt. Ein
 *    anderer Kommentar derselben Autorin ergibt einen anderen Hash.
 *  - OHNE Absender (`reply.guest`): der Empfänger ist bekannt (Eltern-Autor),
 *    die Id also berechenbar — direkt löschen, 404 heißt „nichts da".
 *
 * WARUM AM ADMIN-CLIENT VORBEI AN DER DATENTÜR (die begründete Ausnahme zu
 * `tenantDb`): die Zeilen gehören den EMPFÄNGERN (Row-Permissions nur für sie)
 * und der Tabelle des Core; die Tür eines Mandanten könnte sie gar nicht sehen,
 * und `notify()` kennt kein Aufräumen über mehrere Glocken. Kandidat für einen
 * Core-Vertrag „Meldungen zu einem Objekt entfernen", sobald ein dritter Layer
 * ihn braucht (der zweite ist posts, `postMentionCleanup.ts`).
 *
 * BEST EFFORT wie die Aktivitäts-Räumung daneben: wirft nie — ein Löschen oder
 * Ausblenden darf nicht an einer fremden Glocke scheitern —, loggt jeden Fehler
 * mit Kennungen und Zahlen. Rückgabe = entfernte Meldungen.
 *
 * KONTOLÖSCHUNG ruft das NICHT: der system-Layer löscht dort alle Meldungen
 * per `senderId` (und die empfangenen per `recipientId`) — das deckt `reply`
 * und `mention` vollständig. `reply.guest` hat keinen Absender, aber einen
 * Gast, dessen Konto gelöscht werden könnte, gibt es nicht.
 */
export async function removeCommentNotifications(
  event: H3Event,
  input: RemoveCommentNotificationsInput,
): Promise<number> {
  let removed = 0
  try {
    const config = useRuntimeConfig(event)
    const databaseId = config.public.appwriteDatabaseId
    const { tablesDB } = createAdminClient(event)
    const rowIdFor = (type: string, recipientId: string) =>
      commentNotificationRowId({ communityId: input.communityId, commentId: input.commentId, recipientId, type })

    if (input.authorId) {
      const candidates = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS_TABLE, [
        Query.equal('senderId', input.authorId),
      ])
      for (const row of candidates) {
        // Typ im Code statt in der Abfrage: indiziert ist nur `senderId`.
        if (!row.type || !SENT_TYPES.has(row.type) || !row.recipientId) continue
        if (row.$id !== rowIdFor(row.type, row.recipientId)) continue
        await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS_TABLE, rowId: row.$id })
        removed++
      }
    }
    else if (input.parentAuthorId) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS_TABLE, rowId: rowIdFor('reply.guest', input.parentAuthorId) })
        removed++
      }
      catch (error) {
        if (!(error instanceof AppwriteException && error.code === 404)) throw error
      }
    }
  }
  catch (error) {
    logEvent('warn', 'comments.notification_cleanup_failed', {
      commentId: input.commentId,
      removed,
      code: error instanceof AppwriteException ? error.code : undefined,
    })
  }
  return removed
}
