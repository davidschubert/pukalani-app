import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { COMMENTS_TABLE, type Comment } from '../../shared/types/comment'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * GELÖSCHT OHNE ANTWORTEN ⇒ GANZ WEG (KC2, Davids Auftrag 2026-11-23).
 *
 * Der Grabstein (`commentTombstone.ts`) hält den Faden zusammen: Antworten
 * anderer hängen über `parentId`/`rootId` an ihm. Hängt NICHTS an ihm, hält er
 * nichts zusammen — dann ist der „[gelöscht]"-Platzhalter nur Rauschen, und er
 * zählte in „X Kommentare" (`count.get`/`counts.get` zählen alles außer
 * `hidden`). Deshalb fällt er nach dem Leeren ganz:
 *
 *  - NUR OHNE KINDER — gezählt wird JEDE Antwort, auch eine ausgeblendete
 *    (`hidden`): die Moderation kann sie wiederherstellen, und dann braucht sie
 *    ihren Eltern-Kommentar.
 *  - NUR OHNE OFFENE MELDUNG: die Warteschlange der Moderation findet ihre
 *    Meldung über die Kommentar-Zeile. Ohne Zeile stünde eine offene Meldung
 *    unsichtbar herum. Ist das nicht prüfbar, bleibt der Platzhalter (er ist
 *    der sichere Zustand, der bis heute galt).
 *  - DANN DER ELTERN-GRABSTEIN: wurde mit dieser Antwort die letzte unter
 *    einem schon gelöschten Kommentar entfernt, gilt für ihn dasselbe —
 *    nach oben, bis ein Kommentar Kinder hat oder nicht gelöscht ist.
 *  - WETTLAUF MIT EINER ANTWORT: die Antwort-Route verlangt einen AKTIVEN
 *    Eltern-Kommentar (`replyParent.ts`), und der Grabstein ist schon
 *    geschrieben, bevor hier gezählt wird. Hat eine Antwort den Eltern-
 *    Kommentar vorher gelesen und legt danach an, findet die Nachzählung nach
 *    dem Löschen sie — dann entsteht der Grabstein mit derselben Id wieder.
 *
 * Unverändert bleiben die Row-Level-Rechte (der wiederhergestellte Grabstein
 * trägt genau seine alten) und das zweiphasige Ausblenden (es betrifft nur
 * `hidden`, das hier nie gelöscht wird).
 */

/** Darf ein Grabstein wegen offener Meldungen NICHT fallen? Fehler = ja (bleibt). */
export type OpenReportsProbe = (event: H3Event, commentId: string) => Promise<boolean>

export const defaultOpenReportsProbe: OpenReportsProbe = async (event, commentId) => {
  const reports = await openReportsForTarget(event, 'comment', commentId)
  return reports.length > 0
}

function rowData(row: Comment): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('$')) data[key] = value
  }
  return data
}

async function hasChildren(ops: TenantDb, commentId: string): Promise<boolean> {
  return (await ops.count(COMMENTS_TABLE, [Query.equal('parentId', commentId)])) > 0
}

/**
 * Den eben geschriebenen Grabstein entfernen, wenn nichts an ihm hängt — und
 * danach seine gelöschten Vorfahren, die dadurch kinderlos werden. Gibt die
 * Ids der entfernten Zeilen zurück (leer = Platzhalter bleibt). Wirft nie:
 * jede Störung lässt den Platzhalter stehen, wie vor KC2.
 */
export async function pruneDeletedComment(
  event: H3Event,
  tombstone: Comment,
  probe: OpenReportsProbe = defaultOpenReportsProbe,
): Promise<string[]> {
  // Operator-Klinke wie das Löschen selbst (`actor: 'member'`: gehandelt hat
  // die Autorin, die Inhalts-Sperre M13 gilt) — DER SERVER SCHREIBT (SEC-002).
  const ops = tenantDb(event, { as: 'operator', actor: 'member' })
  const removed: string[] = []
  let current: Comment | null = tombstone
  while (current && current.status === 'deleted') {
    const row: Comment = current
    try {
      if (await hasChildren(ops, row.$id)) break
      if (await probe(event, row.$id).catch(softFail('comments:utils/commentPrune:openReports', true))) break

      await ops.remove(COMMENTS_TABLE, row.$id, 'Comment not found')

      // Nachzählen: kam zwischen Zählen und Löschen eine Antwort dazu, steht
      // der Grabstein mit derselben Id und denselben Rechten wieder da.
      if (await hasChildren(ops, row.$id)) {
        await ops.create<Comment>(COMMENTS_TABLE, rowData(row), { rowId: row.$id, permissions: row.$permissions })
        logEvent('warn', 'comments.prune_restored', { commentId: row.$id })
        break
      }
      removed.push(row.$id)
    }
    catch (error) {
      logEvent('warn', 'comments.prune_failed', { commentId: row.$id, message: error instanceof Error ? error.message : String(error) })
      break
    }

    if (!row.parentId) break
    current = await ops.get<Comment>(COMMENTS_TABLE, row.parentId, 'Comment not found')
      .catch(softFail('comments:utils/commentPrune:parent', null))
  }
  return removed
}
