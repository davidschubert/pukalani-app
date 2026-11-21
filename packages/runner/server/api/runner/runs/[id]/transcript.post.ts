import { InputFile } from 'node-appwrite/file'
import { RUNNER_FILES_BUCKET, RUNS_TABLE, type RunRow, type TranscriptUploadResponse } from '../../../../../shared/types/runner'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * Das volle Transkript als Datei — docs/archiv/AI-RUNNER.md § 4/§ 7.2 Schritt 9.
 *
 * EIGENER Bucket `runner-files`, ausdrücklich NICHT `ticket-files`: dessen
 * Upload-Route verlangt Session + `tickets.manage`, der Runner hat nur sein
 * Bearer-Secret — und `runner` kennt `tickets` ohnehin nicht (A14).
 *
 * Deckel wie im Bucket (10 MB, `runner-001`). Ein Transkript ist Text; wer
 * mehr produziert, hat einen Lauf, der aus dem Ruder gelaufen ist, und dessen
 * Protokoll gehört nicht auf die geteilte Platte.
 */
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async (event): Promise<TranscriptUploadResponse> => {
  const caller = await requireRunner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const run = await admin.tablesDB.getRow<RunRow>({
    databaseId: config.public.appwriteDatabaseId, tableId: RUNS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  requireOwnRun(caller.$id, run.runnerId)

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(part => part.name === 'file' && part.data?.length)
  if (!filePart?.data) throw createError({ status: 400, statusText: 'Missing file' })
  if (filePart.data.length > MAX_TRANSCRIPT_BYTES) {
    throw createError({ status: 413, statusText: 'Transcript too large', data: { code: 'transcript_too_large' } })
  }

  /**
   * FILE-ID = RUN-ID, deterministisch. Ein Lauf hat genau EIN Transkript, und
   * der Bericht muss es finden können, ohne eine zweite Tabelle nach der
   * Datei-Id zu fragen. Der Preis ist der 409 beim Wiederholungsversuch — und
   * den fängt der Zweig unten: ein Retry nach Netzabbruch darf nicht daran
   * scheitern, dass der erste Versuch doch angekommen war.
   *
   * KEINE Magic-Bytes-Prüfung wie bei den Ticket-Anhängen: dort lädt ein
   * Mensch eine beliebige Datei hoch, hier schreibt ein authentifizierter
   * Dienst sein eigenes Protokoll, und ausgeliefert wird es nur über eine
   * eigene Route an Admins.
   */
  const filename = `run-${id}.jsonl`
  const upload = () => admin.storage.createFile({
    bucketId: RUNNER_FILES_BUCKET,
    fileId: id,
    file: InputFile.fromBuffer(filePart.data!, filename),
  })

  const stored = await upload().catch(async (error) => {
    const code = (error as { code?: number }).code
    if (code !== 409) throw toH3Error(error, 'Could not store transcript')
    await admin.storage.deleteFile({ bucketId: RUNNER_FILES_BUCKET, fileId: id }).catch(softFail('runner:api/runner/runs/[id]/transcript.post:deleteFile', undefined))
    return await upload().catch((retryError) => {
      throw toH3Error(retryError, 'Could not store transcript')
    })
  })

  return { fileId: stored.$id }
})
