import { Query } from 'node-appwrite'
import { TICKET_FILES_BUCKET, TICKET_FILES_TABLE, TICKET_WATCHERS_TABLE, type TicketFileRow, type TicketWatcherRow } from '../../shared/types/ticket'

type TicketAdminClient = Pick<ReturnType<typeof createAdminClient>, 'tablesDB' | 'storage'>

export interface TicketCleanupResult {
  /** Anhänge, deren Datei UND Zeile jetzt weg sind. */
  files: number
  /** Gelöschte Beobachtungen. */
  watchers: number
  /** Einzelschritte, die gescheitert sind — > 0 heißt: das Ticket NICHT löschen. */
  failed: number
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
}

/** Löschen, bei dem „schon weg" als Erfolg zählt. `false` = echter Fehler. */
async function removeIdempotent(remove: () => Promise<unknown>): Promise<boolean> {
  try {
    await remove()
    return true
  }
  catch (error) {
    return isNotFound(error)
  }
}

/**
 * ALLES, WAS AN EINEM TICKET HÄNGT, VOR DEM TICKET SELBST (BE-024, 2026-11-15).
 *
 * Vorher las die Lösch-Route EINE Seite (200 Beobachtungen, 100 Anhänge),
 * schluckte jeden Lese- und Löschfehler und löschte danach das Ticket. Ein
 * Aussetzer hinterließ so Dateien im Bucket, deren Zeile und Ticket weg waren
 * — von keiner Oberfläche mehr erreichbar, also auch nie mehr gelöscht. Die
 * Kartenlöschung einer ganzen Liste räumte gar nichts auf.
 *
 * Jetzt: ALLE Zeilen per `listAllRows` (ein Lesefehler wirft), je Anhang erst
 * die Datei, dann die Zeile — scheitert die Datei, bleibt die Zeile stehen,
 * damit ein zweiter Lauf sie wiederfindet. Ein 404 zählt als „schon weg"
 * (Erfolg), jeder andere Fehler wird GEZÄHLT, nicht geschluckt. Der Aufrufer
 * entscheidet über `failed`: das Ticket bleibt dann stehen, und der ganze
 * Vorgang lässt sich wiederholen.
 */
export async function removeTicketDependents(
  admin: TicketAdminClient,
  databaseId: string,
  ticketId: string,
): Promise<TicketCleanupResult> {
  const { tablesDB, storage } = admin
  const fileRows = await listAllRows<TicketFileRow>(tablesDB, databaseId, TICKET_FILES_TABLE, [Query.equal('ticketId', ticketId)])
  const watcherRows = await listAllRows<TicketWatcherRow>(tablesDB, databaseId, TICKET_WATCHERS_TABLE, [Query.equal('ticketId', ticketId)])

  const result: TicketCleanupResult = { files: 0, watchers: 0, failed: 0 }

  for (const file of fileRows) {
    const fileGone = await removeIdempotent(() => storage.deleteFile({ bucketId: TICKET_FILES_BUCKET, fileId: file.fileId }))
    if (!fileGone) {
      result.failed++
      continue
    }
    const rowGone = await removeIdempotent(() => tablesDB.deleteRow({ databaseId, tableId: TICKET_FILES_TABLE, rowId: file.$id }))
    if (rowGone) result.files++
    else result.failed++
  }

  for (const watcher of watcherRows) {
    const gone = await removeIdempotent(() => tablesDB.deleteRow({ databaseId, tableId: TICKET_WATCHERS_TABLE, rowId: watcher.$id }))
    if (gone) result.watchers++
    else result.failed++
  }

  return result
}

/**
 * Aufräumen ODER die Lösch-Route abbrechen — EINE Antwort für Ticket- und
 * Listen-Löschung: unvollständig (`failed > 0`) oder ein Lesefehler ⇒ eine
 * strukturierte Logzeile und 502 `ticket_cleanup_incomplete`. Der Aufrufer
 * löscht das Ticket nur, wenn diese Funktion zurückkehrt. Die Fehlermeldung
 * von Appwrite bleibt im Server (Log), nie in der Antwort.
 */
export async function requireTicketCleanup(
  admin: TicketAdminClient,
  databaseId: string,
  ticketId: string,
): Promise<TicketCleanupResult> {
  let result: TicketCleanupResult
  try {
    result = await removeTicketDependents(admin, databaseId, ticketId)
  }
  catch (error) {
    // Das Lesen selbst scheiterte: nichts wurde angefasst, der eine
    // gescheiterte Schritt ist der Lesevorgang (`stage: 'read'`).
    logEvent('error', 'tickets.cleanup_incomplete', {
      ticketId, files: 0, watchers: 0, failed: 1, stage: 'read',
      message: error instanceof Error ? error.message : String(error),
    })
    throw ticketCleanupIncomplete()
  }
  if (result.failed > 0) {
    logEvent('error', 'tickets.cleanup_incomplete', { ticketId, ...result })
    throw ticketCleanupIncomplete()
  }
  return result
}

function ticketCleanupIncomplete() {
  return createError({ status: 502, statusText: 'Ticket cleanup incomplete', data: { code: 'ticket_cleanup_incomplete' } })
}
