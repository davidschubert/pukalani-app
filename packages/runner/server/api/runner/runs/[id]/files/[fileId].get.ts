import { FILE_RESPONSE_HEADERS, decideFileDelivery } from '../../../../../../../core/shared/fileDelivery'
import { parseRunAttachments } from '../../../../../../shared/runAttachments'
import { RUNNER_FILES_BUCKET, RUNS_TABLE, type RunRow } from '../../../../../../shared/types/runner'

/**
 * Einen Anhang ausliefern — docs/archiv/AI-RUNNER.md § 6, RUNNER-Seite
 * (Bearer-Secret). Der Bucket `runner-files` hat bewusst KEINE Permissions;
 * ausgeliefert wird ausschliesslich hier.
 *
 * ZWEI SCHRANKEN, UND BEIDE WERDEN GEBRAUCHT:
 *
 *  1. `requireOwnRun` — es ist der Lauf des Aufrufers.
 *  2. Die `fileId` STEHT IN DER LISTE DIESES LAUFS. Ohne diese Zeile wäre die
 *     Route ein freier Bucket-Zugriff über geratene Ids: in demselben Bucket
 *     liegen die TRANSKRIPTE aller Läufe (`transcript.post.ts`, Datei-Id =
 *     Run-Id), und eine Run-Id steht in jeder Claim-Antwort. Ein Runner könnte
 *     sich also das Protokoll eines fremden Laufs holen, obwohl er den Lauf
 *     selbst nie zu sehen bekommt. Die Anhang-Liste ist die ERLAUBNIS, nicht
 *     nur ein Inhaltsverzeichnis.
 */
export default defineEventHandler(async (event) => {
  // Schutz-Kopfzeilen auf JEDER Antwort, auch auf Ablehnungen (SEC-001).
  for (const [name, value] of Object.entries(FILE_RESPONSE_HEADERS)) {
    setHeader(event, name, value)
  }
  const caller = await requireRunner(event)
  const id = getRouterParam(event, 'id')
  const fileId = getRouterParam(event, 'fileId')
  if (!id || !fileId) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const run = await admin.tablesDB.getRow<RunRow>({
    databaseId: config.public.appwriteDatabaseId, tableId: RUNS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  requireOwnRun(caller.$id, run.runnerId)

  const attachment = parseRunAttachments(run.attachmentsJson).find(entry => entry.fileId === fileId)
  // 404 und nicht 403: für diesen Lauf gibt es die Datei nicht. Ob sie im
  // Bucket liegt, geht den Aufrufer nichts an.
  if (!attachment) throw createError({ status: 404, statusText: 'Attachment not found' })

  const bytes = await admin.storage.getFileView({ bucketId: RUNNER_FILES_BUCKET, fileId }).catch((error) => {
    throw toH3Error(error, 'Could not read attachment')
  })

  const body = Buffer.from(bytes as ArrayBuffer)
  // Immer Download (`allowInlineImages: false`): der Empfänger ist ein
  // Programm, das die Datei auf die Platte schreibt — eine Inline-Vorschau hat
  // hier kein Publikum. Der Typ aus der Anhang-Liste geht nicht durch
  // (`core/shared/fileDelivery.ts`, SEC-001); der Dienst liest ihn nicht.
  const delivery = decideFileDelivery({ storedType: attachment.mimeType, bytes: body, name: attachment.name, allowInlineImages: false })
  setHeader(event, 'Content-Type', delivery.contentType)
  setHeader(event, 'Content-Disposition', delivery.disposition)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return body
})
