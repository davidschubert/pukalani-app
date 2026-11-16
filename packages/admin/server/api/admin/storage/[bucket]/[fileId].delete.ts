/**
 * Eine Storage-Datei löschen (Admin-Key, umgeht File-Permissions).
 *
 * Nur in Ablagen der ERLAUBNISLISTE (`bucketDeletable`,
 * server/utils/storageBuckets.ts — Begründung und Liste dort): eine neue
 * Ablage ist hier zuerst nur-lesend, `gdpr-exports` bleibt immer draußen
 * (eigene Frist und eigene Seite). Danach wird der Bucket zusätzlich gegen
 * die Instanz geprüft.
 */

export default defineEventHandler(async (event) => {
  requirePermission(event, 'storage.manage')

  const bucketId = getRouterParam(event, 'bucket')
  const fileId = getRouterParam(event, 'fileId')
  if (!bucketId || !fileId) {
    throw createError({ status: 400, statusText: 'Missing bucket or file id' })
  }
  if (!bucketDeletable(event, bucketId)) {
    throw createError({ status: 403, statusText: 'Bucket is read-only here' })
  }

  const admin = createAdminClient(event)
  // Zusätzlich zur Erlaubnisliste: nur echte Buckets der Instanz
  await admin.storage.getBucket({ bucketId })
    .catch((error) => { throw toH3Error(error, 'Bucket not found') })

  await admin.storage.deleteFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })

  await recordAudit(event, { action: 'storage.file_deleted', targetType: 'file', targetId: fileId, targetName: bucketId })

  return { ok: true }
})
