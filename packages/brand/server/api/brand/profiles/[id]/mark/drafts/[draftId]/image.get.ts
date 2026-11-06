import { detectBrandInspirationImage } from '../../../../../../../../shared/brandInspiration'
import { requireBrandMarkContext } from '../../../../../../../utils/brandMarkBrief'
import {
  BRAND_MARK_DRAFTS_BUCKET,
  brandMarkDraftsUnavailable,
  loadBrandMarkDraftRow,
} from '../../../../../../../utils/brandMarkDrafts'

/**
 * EINEN ENTWURF AUSLIEFERN — NUR AN SEINEN BESITZER (Konzept §2.13, Paket D5c).
 *
 * ── DAS IST DIE EINZIGE TÜR ZUM BUCKET ────────────────────────────────────
 * `brand-drafts` hat `permissions: []` und `fileSecurity: false` (Migration
 * brand-023): es gibt keine Appwrite-Adresse, die ein Browser aufrufen könnte,
 * und keine Row-Permission, die im Zweifel noch abfinge. Wer das Bild sehen
 * will, kommt hier durch — und hier stehen dieselben drei Schranken wie an
 * jeder anderen Route dieser Fläche (Zugang, Besitz der Marke, Kapitel auf dem
 * Weg) plus die Belegung, dass die Zeile zu DIESER Marke gehört. Alle
 * antworten mit 404.
 *
 * ── `private, no-store` UND KEIN `max-age` ────────────────────────────────
 * Wörtlich wie bei den Vorbildern: der Empfänger ist ein Browser, der unter
 * Umständen auf einem geteilten Gerät läuft. Ein unfertiger Logo-Entwurf, der
 * nach dem Abmelden noch aus dem Plattenspeicher käme, wäre ein Rest, den
 * niemand mehr einsammeln kann — §2.13 sagt `no-store`, und das ist es
 * wörtlich. Die Werkstatt bricht den Cache zusätzlich über `?v=`.
 *
 * ── DER CONTENT-TYPE KOMMT AUS DEN BYTES ──────────────────────────────────
 * Nicht aus der Endung und nicht aus einer gespeicherten Angabe: die Datei ist
 * die Wahrheit. Erkannt wird mit `detectBrandInspirationImage` — derselben
 * Magic-Bytes-Tabelle, mit der die Vorbilder hereinkommen, und derselben
 * Formatmenge (PNG, JPEG, WebP), die der Core-Transport durchlässt und der
 * Bucket erlaubt. Eine zweite Tabelle für dieselben drei Formate wäre die
 * erste Stelle, an der „erlaubt" und „ausgeliefert" auseinanderlaufen. Bytes,
 * die ihr nicht entsprechen, bekommen `application/octet-stream` — ein
 * Bild-Typ, den wir nicht belegen können, wird nicht behauptet.
 */
export default defineEventHandler(async (event) => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile } = await requireBrandMarkContext(event, userId, betaAccount)

  const draftId = getRouterParam(event, 'draftId')
  if (!draftId || draftId.length > 64) throw createError({ status: 400, statusText: 'Missing id' })

  await loadBrandMarkDraftRow(event, profile.$id, draftId)

  const admin = createAdminClient(event)
  const bytes = await admin.storage
    .getFileView({ bucketId: BRAND_MARK_DRAFTS_BUCKET, fileId: draftId })
    .catch((error) => {
      throw brandMarkDraftsUnavailable(error, { profileId: profile.$id, draftId, stage: 'view' })
    })

  const buffer = Buffer.from(bytes as ArrayBuffer)
  const kind = detectBrandInspirationImage(buffer)
  setHeader(event, 'Content-Type', kind?.mime ?? 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, no-store')
  return buffer
})
