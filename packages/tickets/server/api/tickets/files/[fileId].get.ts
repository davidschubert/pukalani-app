import { Query } from 'node-appwrite'
import { FILE_RESPONSE_HEADERS, decideFileDelivery } from '../../../../../core/shared/fileDelivery'
import { TICKET_FILES_BUCKET, TICKET_FILES_TABLE, type TicketFileRow } from '../../../../shared/types/ticket'

/**
 * Anhang ausliefern — Permission-geprüft über unsere Route (der Bucket hat
 * bewusst KEINE öffentlichen Permissions).
 *
 * TYP UND DARSTELLUNG NACH DER EINEN REGEL (`core/shared/fileDelivery.ts`,
 * SEC-001): der gespeicherte Typ geht nie durch. Inline nur ein Bild aus der
 * Erlaubnisliste, dessen Inhalt per Magic Bytes eines ist, mit dem ERKANNTEN
 * Typ — das ist die Vorschau im Ticket. Alles andere, auch PDF, kommt als
 * `application/octet-stream` zum Herunterladen.
 *
 * Die Schutz-Kopfzeilen (`nosniff`, CSP mit `sandbox`) stehen auf JEDER
 * Antwort dieser Route, gesetzt vor der ersten Prüfung, damit auch
 * Fehlerantworten sie tragen.
 */
export default defineEventHandler(async (event) => {
  for (const [name, value] of Object.entries(FILE_RESPONSE_HEADERS)) {
    setHeader(event, name, value)
  }
  requirePermission(event, 'tickets.manage')
  const fileId = getRouterParam(event, 'fileId')
  if (!fileId) throw createError({ status: 400, statusText: 'Missing fileId' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const meta = await admin.tablesDB.listRows<TicketFileRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKET_FILES_TABLE,
    queries: [Query.equal('fileId', fileId), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'File not found')
  })
  const file = meta.rows[0]
  if (!file) throw createError({ status: 404, statusText: 'File not found' })

  const bytes = await admin.storage.getFileView({ bucketId: TICKET_FILES_BUCKET, fileId }).catch((error) => {
    throw toH3Error(error, 'Could not read file')
  })

  const body = Buffer.from(bytes as ArrayBuffer)
  const delivery = decideFileDelivery({ storedType: file.mimeType, bytes: body, name: file.name })
  setHeader(event, 'Content-Type', delivery.contentType)
  setHeader(event, 'Content-Disposition', delivery.disposition)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return body
})
