import { AppwriteException, Query, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * MELDUNGEN ZU EINEM OBJEKT ENTFERNEN — der Core-Vertrag für das Aufräumen
 * fremder Glocken (EL1 d, 2026-11-17; vorher zwei Kopien in comments und
 * posts, beide mit dem Vermerk „Kandidat für einen Core-Vertrag").
 *
 * Einige Meldungen tragen im `body` einen Auszug ihres Objekts (Antwort,
 * Erwähnung — SEC-032, 2026-11-15, „… Vorschauen werden wirklich geleert").
 * Löscht die Autorin das Objekt oder blendet die Moderation es aus, stünde
 * dieser Satz sonst weiter in FREMDEN Glocken. Diese Funktion räumt sie.
 *
 * ARBEITSTEILUNG: der Core kennt Tabelle, Suche und Löschen — mehr nicht.
 * WELCHE Typen zu einem Objekt gehören und WIE ihre feste Zeilen-Id entsteht,
 * ist Produktwissen und bleibt im Layer (`rowIdFor`, `directRowIds`).
 *
 * WARUM ÜBER DIE FESTE ID UND NICHT ÜBER DEN TEXT: jede dieser Meldungen
 * entsteht unter einer FESTEN Row-Id aus (Typ, Community, Objekt, Empfänger)
 * — zugleich der Idempotenz-Schlüssel von `notify()`. Gesucht wird über den
 * Absender (Index `sender`, system-008), ENTSCHIEDEN über Typ und exakte Id:
 * nur eine Zeile, deren Id genau diesem Objekt und genau ihrem Empfänger
 * entspricht, fällt. Ein anderes Objekt desselben Absenders ergibt eine andere
 * Id. Über Absender + Link + Text zu suchen, träfe nach einer Bearbeitung
 * nicht mehr und bei gleichem Text den falschen.
 *
 * WARUM AM ADMIN-CLIENT VORBEI AN DER DATENTÜR (die begründete Ausnahme zu
 * `tenantDb`): die Zeilen gehören den EMPFÄNGERN (Row-Permissions nur für sie)
 * und der Tabelle von core/system; die Tür eines Mandanten könnte sie gar
 * nicht sehen, und `notify()` kennt kein Aufräumen über mehrere Glocken. Den
 * Mandanten trägt die Id selbst (der Layer rechnet ihn hinein) — ein Aufruf
 * von einem anderen Host fände nichts.
 *
 * BESTAND: Meldungen von VOR dem 2026-11-15 tragen eine zufällige Id und
 * werden von hier aus NICHT gefunden — sie bleiben, bis ihr Empfänger sie
 * löscht oder sein Konto geht. Wenn überhaupt, räumt sie ein einmaliger Lauf
 * außerhalb der App; eine Suche über Text wäre genau das Raten, das dieser
 * Vertrag vermeidet.
 *
 * KONTOLÖSCHUNG ruft das NICHT: der system-Layer löscht dort alle Meldungen
 * per `senderId` (und die empfangenen per `recipientId`).
 *
 * BEST EFFORT, aber laut: wirft nie — ein Löschen oder Ausblenden darf nicht
 * an einer fremden Glocke scheitern —, schreibt bei einem Fehler EINE
 * Log-Zeile mit Kennungen und Zahlen (kein Fehlertext: er kann Inhalte
 * zitieren). Rückgabe = entfernte Meldungen.
 */

/** Tabelle der Glocke (Schema: system-Layer, Zugriff: core — wie `notify()`). */
const NOTIFICATIONS_TABLE = 'notifications'

type NotificationRow = Models.Row & { recipientId?: string, senderId?: string, type?: string }

export interface RemoveObjectNotificationsInput {
  /** Kurze Kennung der Objekt-Art für das Log (`'comment'`, `'post'`). */
  kind: string
  /** Id des Objekts — nur für das Log. */
  objectId: string
  /** Konto der Autorin; leer ⇒ der Absender-Zweig entfällt. */
  senderId: string
  /**
   * Die feste Zeilen-Id, die eine Meldung DIESES Objekts für (Typ, Empfänger)
   * trüge; `null` heißt „dieser Typ gehört nicht dazu".
   */
  rowIdFor: (type: string, recipientId: string) => string | null
  /**
   * Zeilen OHNE Absender, deren Id der Aufrufer berechnen kann (heute: die
   * Gast-Antwort an den Eltern-Autor). Je Id löschen, 404 heißt „nichts da".
   */
  directRowIds?: string[]
}

export async function removeObjectNotifications(
  event: H3Event,
  input: RemoveObjectNotificationsInput,
): Promise<number> {
  let removed = 0
  try {
    const config = useRuntimeConfig(event)
    const databaseId = config.public.appwriteDatabaseId
    const { tablesDB } = createAdminClient(event)

    if (input.senderId) {
      const candidates = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS_TABLE, [
        Query.equal('senderId', input.senderId),
      ])
      for (const row of candidates) {
        // Typ im Code statt in der Abfrage: indiziert ist nur `senderId`.
        if (!row.type || !row.recipientId) continue
        const expected = input.rowIdFor(row.type, row.recipientId)
        if (expected === null || row.$id !== expected) continue
        await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS_TABLE, rowId: row.$id })
        removed++
      }
    }

    for (const rowId of input.directRowIds ?? []) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS_TABLE, rowId })
        removed++
      }
      catch (error) {
        if (!(error instanceof AppwriteException && error.code === 404)) throw error
      }
    }
  }
  catch (error) {
    logEvent('warn', 'notifications.cleanup_failed', {
      kind: input.kind,
      objectId: input.objectId,
      removed,
      code: error instanceof AppwriteException ? error.code : undefined,
    })
  }
  return removed
}
