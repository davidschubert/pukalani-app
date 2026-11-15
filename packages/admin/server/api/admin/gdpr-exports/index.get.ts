import { Query } from 'node-appwrite'

/**
 * GDPR-Snapshots listen (Admin). Räumt dabei Abgelaufenes mit ab (älter als
 * die Aufbewahrungsfrist, 30 Tage) — das ist nur noch ein zusätzliches Netz:
 * die Frist GARANTIERT seit SEC-009 der stündliche Lauf
 * (core/server/plugins/gdpr-export-prune.ts), nicht der Blick in diese Liste.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) return { total: 0, files: [] }

  await cleanupExpiredGdprExports(event).catch(() => {})

  const admin = createAdminClient(event)
  const res = await admin.storage.listFiles({
    bucketId,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not list exports') })

  return {
    total: res.total,
    files: res.files.map(f => ({
      $id: f.$id,
      name: f.name,
      sizeOriginal: f.sizeOriginal,
      $createdAt: f.$createdAt,
    })),
  }
})
