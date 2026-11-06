import { z } from 'zod'
import {
  BRAND_INSPIRATION_MAX,
  BRAND_INSPIRATION_NOTE_MAX,
  isBrandInspirationArea,
} from '../../../../../../shared/brandInspiration'
import type { BrandInspirationWriteResponse } from '../../../../../../shared/types/brand'
import {
  BRAND_INSPIRATION_TABLE,
  brandInspirationUnavailable,
  listBrandInspiration,
  loadBrandInspirationRow,
  requireBrandInspirationContext,
  syncBrandInspirationSlot,
  toBrandInspirationEntry,
} from '../../../../../utils/brandInspirationStore'
import { brandDb } from '../../../../../utils/brandStore'

/**
 * BEREICH UND NOTIZ EINES VORBILDS ÄNDERN (Konzept §2.2 Schritt 2, Paket D2a).
 *
 * ── DAS BILD SELBST ÄNDERT SICH NIE ───────────────────────────────────────
 * Ein anderes Bild ist ein anderes Vorbild: entfernen und neu hochladen. Ein
 * PATCH auf den Datei-INHALT hiesse, dass die Lesung (D2b, `reading` an
 * derselben Zeile) auf einmal ein anderes Bild beschreibt, ohne dass irgendwo
 * steht, dass sie veraltet ist.
 *
 * ── BEIDE FELDER SIND OPTIONAL, ABER NICHT BEIDE ZUGLEICH LEER ────────────
 * Ein PATCH ohne Feld ist ein Bedienfehler und kein No-op mit 200: er sähe wie
 * eine erfolgreiche Änderung aus. Was mitkommt, wird gesetzt; was fehlt,
 * bleibt — nie „fehlt heisst leer" (dieselbe Regel wie `neutral` im
 * Community-Branding-PATCH, CLAUDE.md).
 *
 * Die Zugehörigkeit belegt `loadBrandInspirationRow` VOR der Aktion
 * (Datentür-Regel); eine fremde Zeilen-Id endet mit 404.
 */
const patchSchema = z.object({
  area: z.string().max(24).optional(),
  note: z.string().max(BRAND_INSPIRATION_NOTE_MAX).optional(),
}).refine(body => body.area !== undefined || body.note !== undefined, {
  message: 'empty_patch',
})

export default defineEventHandler(async (event): Promise<BrandInspirationWriteResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandInspirationContext(event, userId, betaAccount)

  const fileId = getRouterParam(event, 'fileId')
  if (!fileId || fileId.length > 64) throw createError({ status: 400, statusText: 'Missing id' })

  const parsed = patchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some(issue => issue.path[0] === 'note')
    throw createError({
      status: 400,
      statusText: 'Invalid inspiration payload',
      data: { code: tooLong ? 'inspiration_note_too_long' : 'invalid_body' },
    })
  }
  const body = parsed.data

  if (body.area !== undefined && !isBrandInspirationArea(body.area)) {
    throw createError({
      status: 400,
      statusText: 'Unknown inspiration area',
      data: { code: 'inspiration_area_invalid' },
    })
  }

  const row = await loadBrandInspirationRow(event, profile.$id, fileId)

  const { tablesDB, databaseId } = brandDb(event)
  let item = toBrandInspirationEntry(row)
  const data = {
    ...(body.area !== undefined ? { area: body.area } : {}),
    ...(body.note !== undefined ? { note: body.note.trim() } : {}),
  }
  // NO-OP SCHREIBT NICHT (bodyToSave-Prinzip): wer denselben Bereich noch
  // einmal wählt, bewegt weder `$updatedAt` noch die Fassung des Kapitels.
  const unchanged = (data.area ?? row.area) === row.area
    && (data.note ?? (row.note ?? '')) === (row.note ?? '')
  if (!unchanged) {
    try {
      const updated = await tablesDB.updateRow<typeof row>({
        databaseId, tableId: BRAND_INSPIRATION_TABLE, rowId: fileId, data,
      })
      item = toBrandInspirationEntry(updated)
    }
    catch (error) {
      throw brandInspirationUnavailable(error, { profileId: profile.$id, fileId, stage: 'patch' })
    }
  }

  const items = await listBrandInspiration(event, profile.$id)
  await syncBrandInspirationSlot(event, profile, stepRows, items)

  return { ok: true, item, items, max: BRAND_INSPIRATION_MAX }
})
