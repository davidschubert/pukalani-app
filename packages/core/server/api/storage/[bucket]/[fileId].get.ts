import { ImageFormat, ImageGravity } from 'node-appwrite'
import { createSessionClient } from '../../../lib/appwrite'
import { STORAGE_FILE_RESPONSE_HEADERS, isAvatarImageMime, sniffImageMime } from '../../../../shared/avatarImage'

/** Query-Param als ganze Zahl in [0, max], sonst 0 */
function clampInt(value: unknown, max: number): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, max)
}

/** Bewusst dieselbe Antwort wie „gibt es nicht" — auch für Dateien, die kein Bild sind. */
function notFound() {
  return createError({ status: 404, statusText: 'File not found' })
}

/**
 * Liefert ein Profilbild aus (SessionClient — anonym ok bei read(any)).
 *
 * Ausgeliefert wird NUR, was ein Bild ist (SEC-001): der bei Appwrite
 * gespeicherte Typ muss in der Erlaubnisliste stehen (`core/shared/
 * avatarImage.ts`), und beim Original entscheidet zusätzlich der INHALT
 * (Magic Bytes) — `Content-Type` ist der erkannte Typ, nie der gespeicherte.
 * Alles andere antwortet 404 wie eine fehlende Datei. Jede Antwort dieser
 * Route trägt `X-Content-Type-Options: nosniff` und eine CSP mit `sandbox`.
 *
 * Mit ?w=&h=&q= eine zugeschnittene WebP-Preview via getFilePreview; fällt
 * auf die Originaldatei zurück, falls die Instanz kein Imagick hat.
 */
export default defineEventHandler(async (event) => {
  for (const [name, value] of Object.entries(STORAGE_FILE_RESPONSE_HEADERS)) {
    setHeader(event, name, value)
  }

  const bucketId = getRouterParam(event, 'bucket')
  const fileId = getRouterParam(event, 'fileId')
  if (!bucketId || !fileId) {
    throw createError({ status: 400, statusText: 'Missing bucket or file id' })
  }
  const config = useRuntimeConfig(event)
  if (!config.public.appwriteAvatarsBucket || bucketId !== config.public.appwriteAvatarsBucket) {
    throw createError({ status: 403, statusText: 'Unknown bucket' })
  }

  const { storage } = createSessionClient(event)

  // Erst die Metadaten: was nicht als Bild gespeichert ist, geht nirgends hin —
  // auch nicht durch die Preview.
  const meta = await storage.getFile({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })
  if (!isAvatarImageMime(meta.mimeType)) {
    throw notFound()
  }

  const query = getQuery(event)
  const width = clampInt(query.w, 2000)
  const height = clampInt(query.h, 2000)
  const quality = clampInt(query.q, 100)

  if (width || height) {
    try {
      const data = await storage.getFilePreview({
        bucketId,
        fileId,
        width: width || undefined,
        height: height || undefined,
        gravity: ImageGravity.Center,
        quality: quality || 85,
        output: ImageFormat.Webp,
      })
      setHeader(event, 'Content-Type', 'image/webp')
      setHeader(event, 'Cache-Control', 'public, max-age=3600')
      return Buffer.from(data)
    }
    catch {
      // Preview nicht verfügbar → Originaldatei unten ausliefern
    }
  }

  const data = await storage.getFileView({ bucketId, fileId })
    .catch((error) => { throw toH3Error(error, 'File not found') })
  const body = Buffer.from(data)
  const sniffed = sniffImageMime(body)
  if (!sniffed) {
    throw notFound()
  }
  setHeader(event, 'Content-Type', sniffed)
  setHeader(event, 'Cache-Control', 'public, max-age=3600')
  return body
})
