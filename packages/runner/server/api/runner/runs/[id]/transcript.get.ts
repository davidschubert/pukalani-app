import { FILE_RESPONSE_HEADERS } from '../../../../../../core/shared/fileDelivery'
import { RUNNER_FILES_BUCKET, RUNS_TABLE, type RunRow } from '../../../../../shared/types/runner'

/**
 * Das Transkript eines Laufs herunterladen — docs/plans/AI-RUNNER.md § 5/§ 9,
 * BOARD-Seite (Session + `runner.manage`), NICHT die Runner-Naht.
 *
 * Das Gegenstück zu `transcript.post.ts` (der Runner LÄDT HOCH, mit
 * Bearer-Secret): hier LIEST das Board, also über die Session eines
 * Betreibers. Deshalb KEIN `requireRunner`/`requireOwnRun` — ein Admin sieht
 * jeden Lauf, die Grenze ist die Capability, nicht die Zugehörigkeit.
 *
 * Die Datei-Id STEHT IM BERICHT (`resultJson.transcriptFileId`), nicht als
 * geratene Run-Id: fehlt sie, hat der Lauf kein Transkript und die Route
 * antwortet 404 — dann rendert der Bericht auch keinen Download-Link.
 */
export default defineEventHandler(async (event) => {
  // Schutz-Kopfzeilen auf JEDER Antwort, auch auf Ablehnungen (SEC-001). Der
  // Typ ist hier fest (`application/x-ndjson`), nie der gespeicherte.
  for (const [name, value] of Object.entries(FILE_RESPONSE_HEADERS)) {
    setHeader(event, name, value)
  }
  requirePermission(event, 'runner.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const run = await admin.tablesDB.getRow<RunRow>({
    databaseId: config.public.appwriteDatabaseId, tableId: RUNS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })

  const transcriptFileId = readTranscriptFileId(run.resultJson)
  // 404 und nicht 403: für diesen Lauf gibt es kein Transkript. Der Bericht
  // zeigt den Link ohnehin nur, wenn die Id gesetzt ist.
  if (!transcriptFileId) throw createError({ status: 404, statusText: 'Transcript not found' })

  const bytes = await admin.storage.getFileView({
    bucketId: RUNNER_FILES_BUCKET, fileId: transcriptFileId,
  }).catch((error) => {
    throw toH3Error(error, 'Could not read transcript')
  })

  setHeader(event, 'Content-Type', 'application/x-ndjson')
  setHeader(event, 'Content-Disposition', `attachment; filename="transcript-${encodeURIComponent(id)}.jsonl"`)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return Buffer.from(bytes as ArrayBuffer)
})

/**
 * `resultJson` kommt von einem Programm auf einem fremden Rechner (§ 9, wie im
 * Bericht defensiv gelesen): unlesbar oder ohne das Feld ⇒ kein Transkript.
 */
function readTranscriptFileId(resultJson: string | undefined): string {
  if (!resultJson) return ''
  try {
    const value: unknown = JSON.parse(resultJson)
    if (typeof value !== 'object' || value === null) return ''
    const fileId = (value as { transcriptFileId?: unknown }).transcriptFileId
    return typeof fileId === 'string' ? fileId : ''
  }
  catch {
    return ''
  }
}
