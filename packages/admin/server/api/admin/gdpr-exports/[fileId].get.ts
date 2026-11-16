/**
 * GDPR-Snapshot herunterladen (Admin) + Audit.
 *
 * HERAUSGABE VON PERSONENDATEN (BE-021/SEC-034, Davids Entscheidungen
 * 2026-11-16): frische Anmeldung VOR dem ersten Lesen, und ERST der
 * Protokoll-Eintrag, DANN die Datei — scheitert der Eintrag, antwortet die
 * Route 503 `audit_unavailable` und gibt nichts heraus. Der Eintrag trägt nur
 * die Datei-Kennung, nicht den Dateinamen (der enthält die Konto-Id der
 * gelöschten Person).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')
  await requireRecentAuth(event)

  const fileId = getRouterParam(event, 'fileId')
  if (!fileId) {
    throw createError({ status: 400, statusText: 'Missing file id' })
  }

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) {
    throw createError({ status: 404, statusText: 'No GDPR bucket configured' })
  }

  const admin = createAdminClient(event)
  const meta = await admin.storage.getFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'Export not found') })
  const data = await admin.storage.getFileDownload({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'Export not found') })

  await recordAudit(event, { action: 'gdpr_export.downloaded', targetType: 'gdpr_export', targetId: fileId }, { strict: true })

  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Content-Disposition', `attachment; filename="${meta.name.replace(/[^\w.-]/g, '_')}"`)
  // Das SDK parst application/json-Dateien bereits ins Objekt — je nach Typ
  // re-serialisieren statt Buffer.from(objekt) (würde werfen).
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (typeof data === 'string') return data
  return JSON.stringify(data, null, 2)
})
