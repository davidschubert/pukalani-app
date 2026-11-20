import { ID } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { parseRunAttachments, runAttachmentsFull, serializeRunAttachments } from '../../../../../shared/runAttachments'
import { MAX_RUN_ATTACHMENTS, RUNNER_FILES_BUCKET, RUNS_TABLE, type RunAttachment, type RunAttachmentAddedResponse, type RunRow } from '../../../../../shared/types/runner'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * Einen Anhang an einen ENTWURF hängen — docs/plans/AI-RUNNER.md § 6,
 * Board-Seite (Session + `runner.manage`).
 *
 * EINE KOPIE, kein Verweis: die Datei landet im Bucket `runner-files` DIESES
 * Layers. Nicht im `ticket-files`-Bucket — `runner` kennt `tickets` nicht
 * (A14), dessen Ausliefer-Route verlangt Session + `tickets.manage`, und der
 * Runner hat nur sein Bearer-Secret. Der Preis ist doppelter Speicher; der
 * Gegenwert ist ein Auftrag, der auch dann noch vollständig ist, wenn jemand
 * den Anhang am Ticket löscht.
 *
 * NUR SOLANGE `draft` (409 sonst): nach der Freigabe ist der Auftrag
 * versiegelt — Begründung im Kopf von `queue.post.ts`.
 */
export default defineEventHandler(async (event): Promise<RunAttachmentAddedResponse> => {
  requirePermission(event, 'runner.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const run = await admin.tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  if (run.status !== 'draft') {
    throw createError({ status: 409, statusText: 'Run is sealed', data: { code: 'run_sealed' } })
  }

  const attachments = parseRunAttachments(run.attachmentsJson)
  if (runAttachmentsFull(attachments)) {
    throw createError({
      status: 409,
      statusText: `At most ${MAX_RUN_ATTACHMENTS} attachments`,
      data: { code: 'too_many_files' },
    })
  }

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(part => part.name === 'file' && part.data?.length)
  if (!filePart?.data) throw createError({ status: 400, statusText: 'Missing file' })

  const filename = (filePart.filename ?? 'datei').slice(0, 200)
  // Der Typ kommt aus dem INHALT, nie aus der Mime-Angabe des Clients.
  const detected = detectRunFileType(filePart.data, filename)
  if (!detected) throw createError({ status: 415, statusText: 'Unsupported file type' })

  const stored = await admin.storage.createFile({
    bucketId: RUNNER_FILES_BUCKET,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filename),
  }).catch((error) => {
    throw toH3Error(error, 'Could not store attachment')
  })

  const attachment: RunAttachment = {
    fileId: stored.$id,
    name: filename,
    mimeType: detected.mimeType,
    size: filePart.data.length,
  }
  const next = [...attachments, attachment]

  await admin.tablesDB.updateRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: id,
    data: { attachmentsJson: serializeRunAttachments(next) },
  }).catch(async (error) => {
    // Ohne Zeile ist die Datei nicht erreichbar (die Liste IST die Erlaubnis) —
    // also weg damit, statt eine Leiche im Bucket zu lassen.
    await admin.storage.deleteFile({ bucketId: RUNNER_FILES_BUCKET, fileId: stored.$id }).catch(softFail('runner:api/runner/runs/[id]/files.post:deleteFile', undefined))
    throw toH3Error(error, 'Could not save attachment')
  })

  setResponseStatus(event, 201)
  return { attachment, attachments: next }
})
