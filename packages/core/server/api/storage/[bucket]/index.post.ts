import { ID, Permission, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { createAdminClient } from '../../../lib/appwrite'
import { AVATAR_MAX_BYTES, avatarFileName, isAvatarImageMime, sniffImageMime } from '../../../../shared/avatarImage'

/**
 * Profilbild-Upload (SEC-001). Die Route ist die EINZIGE Tür in den Bucket:
 * Appwrite ist unter eigener Adresse direkt erreichbar, ein Schreibrecht am
 * Bucket gälte deshalb neben dieser Route und ihren Prüfungen. Der Bucket trägt
 * darum kein Recht für Konten (system-039), und geschrieben wird hier mit dem
 * ADMIN-Client — erst NACHDEM alle Prüfungen bestanden sind (angemeldet,
 * erlaubter Bucket, erlaubter Typ, Inhalt passt per Magic Bytes, Größe).
 *
 * Buckets gehören der App (Core besitzt keine Appwrite-Ressourcen).
 * Datei-Rechte: öffentlich lesbar (Avatare überall sichtbar), nur der
 * Besitzer darf ersetzen/löschen — die Lösch-Route und profile.put.ts löschen
 * mit dem Session-Client über genau dieses Recht.
 * Der gespeicherte Name kommt aus dem ERKANNTEN Typ (`avatar.<endung>`), nicht
 * vom Aufrufer: der Bucket prüft die Endung.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const bucketId = getRouterParam(event, 'bucket')
  if (!bucketId) {
    throw createError({ status: 400, statusText: 'Missing bucket id' })
  }
  // Allowlist: nur der App-Avatars-Bucket — kein Schreiben in beliebige Buckets
  const config = useRuntimeConfig(event)
  if (!config.public.appwriteAvatarsBucket || bucketId !== config.public.appwriteAvatarsBucket) {
    throw createError({ status: 403, statusText: 'Unknown bucket' })
  }

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }
  // Typ MUSS vorhanden + erlaubt sein (fehlender Typ darf den Check nicht umgehen)
  if (!isAvatarImageMime(filePart.type)) {
    throw createError({ status: 415, statusText: 'Unsupported file type' })
  }
  // … und der Inhalt muss zum deklarierten Typ passen (Magic Bytes)
  const sniffed = sniffImageMime(filePart.data)
  if (!sniffed || sniffed !== filePart.type) {
    throw createError({ status: 415, statusText: 'File content does not match its type' })
  }
  if (filePart.data.length > AVATAR_MAX_BYTES) {
    throw createError({ status: 413, statusText: 'File too large' })
  }

  const { storage } = createAdminClient(event)
  const userId = event.context.user.$id

  return await storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, avatarFileName(sniffed)),
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  })
})
