import { detectBrandInspirationImage } from '../../../../../../../shared/brandInspiration'
import {
  BRAND_INSPIRATION_BUCKET,
  brandInspirationUnavailable,
  loadBrandInspirationRow,
  requireBrandInspirationContext,
} from '../../../../../../utils/brandInspirationStore'

/**
 * EIN VORBILD AUSLIEFERN — NUR AN SEINEN BESITZER (Konzept §2.13, Paket D2a).
 *
 * ── DAS IST DIE EINZIGE TÜR ZUM BUCKET ────────────────────────────────────
 * `brand-inspiration` hat `permissions: []` und `fileSecurity: false`
 * (Migration brand-024): es gibt keine Appwrite-Adresse, die ein Browser
 * aufrufen könnte, und keine Row-Permission, die im Zweifel noch abfinge. Wer
 * das Bild sehen will, kommt hier durch — und hier stehen dieselben drei
 * Schranken wie an jeder anderen Route dieser Fläche (Zugang, Besitz der
 * Marke, Kapitel auf dem Weg) plus die Belegung, dass die Zeile zu DIESER
 * Marke gehört. Alle antworten mit 404.
 *
 * ── `private, no-store` UND KEIN `max-age` ────────────────────────────────
 * Anders als der Lauf-Anhang des Runners (`private, max-age=300`): dort ist
 * der Empfänger ein Programm auf dem eigenen Rechner, hier ein Browser, der
 * unter Umständen auf einem geteilten Gerät läuft. Ein Fremdwerk, das nach dem
 * Abmelden noch aus dem Plattenspeicher käme, wäre ein Rest, den niemand mehr
 * einsammeln kann — §2.13 sagt `no-store`, und das ist es wörtlich.
 *
 * ── DER CONTENT-TYPE KOMMT AUS DEN BYTES ──────────────────────────────────
 * Nicht aus der Endung und nicht aus einer gespeicherten Angabe: die Datei ist
 * die Wahrheit, und `detectBrandInspirationImage` ist dieselbe Erkennung, mit
 * der die Upload-Route sie hereingelassen hat. Bytes, die dieser Erkennung
 * heute nicht mehr entsprechen, bekommen `application/octet-stream` — ein
 * Bild-Typ, den wir nicht belegen können, wird nicht behauptet.
 *
 * KEIN `getFilePreview`: das Community-Favicon schneidet mittig zu, weil es
 * ein ICON wird. Ein Vorbild ist ein Beleg — es zu beschneiden hiesse, dem
 * Vision-Modell und dem Menschen zwei verschiedene Bilder zu zeigen.
 */
export default defineEventHandler(async (event) => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile } = await requireBrandInspirationContext(event, userId, betaAccount)

  const fileId = getRouterParam(event, 'fileId')
  if (!fileId || fileId.length > 64) throw createError({ status: 400, statusText: 'Missing id' })

  await loadBrandInspirationRow(event, profile.$id, fileId)

  const admin = createAdminClient(event)
  const bytes = await admin.storage
    .getFileView({ bucketId: BRAND_INSPIRATION_BUCKET, fileId })
    .catch((error) => {
      throw brandInspirationUnavailable(error, { profileId: profile.$id, fileId, stage: 'view' })
    })

  const buffer = Buffer.from(bytes as ArrayBuffer)
  const kind = detectBrandInspirationImage(buffer)
  setHeader(event, 'Content-Type', kind?.mime ?? 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, no-store')
  return buffer
})
