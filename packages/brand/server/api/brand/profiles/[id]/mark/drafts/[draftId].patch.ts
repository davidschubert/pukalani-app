import { z } from 'zod'
import {
  BRAND_MARK_DRAFTS_MAX,
  BRAND_MARK_DRAFT_TITLE_MAX,
  clampBrandMarkDraftTitle,
} from '../../../../../../../shared/brandMarkDrafts'
import type { BrandMarkDraftWriteResponse } from '../../../../../../../shared/types/brand'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'
import { requireBrandMarkContext } from '../../../../../../utils/brandMarkBrief'
import {
  listBrandMarkDrafts,
  loadBrandMarkDraftRow,
  syncBrandMarkDraftsSlot,
  toBrandMarkDraftEntry,
  updateBrandMarkDraft,
} from '../../../../../../utils/brandMarkDrafts'

/**
 * EINEN ENTWURF BEHALTEN ODER UMBENENNEN (Konzept §2.5 Stufe 3, Paket D5c).
 *
 * ── ZWEI FELDER, ZWEI HANDLUNGEN, EINE ROUTE ─────────────────────────────
 * `kept` ist die Entscheidung des Menschen („der hier ist eine Idee, die ich
 * dem Designer zeige"), `title` seine Beschriftung. Beide sind optional, aber
 * nicht beide zugleich abwesend: ein PATCH ohne Feld ist ein Bedienfehler und
 * kein No-op mit 200 — er sähe wie eine erfolgreiche Änderung aus (dieselbe
 * Regel wie beim Vorbild-PATCH).
 *
 * ── DAS BILD SELBST ÄNDERT SICH NIE ───────────────────────────────────────
 * Ein anderer Entwurf ist ein anderer Lauf. Ein PATCH auf den Datei-INHALT
 * hiesse, dass die Herkunfts-Zeile (Modell, Prompt-Hash) auf einmal ein
 * anderes Bild beschreibt — und genau die ist die Leitplanke aus §1.11 b.
 *
 * ── DER SLOT ZIEHT MIT, DAS EREIGNIS AUCH ────────────────────────────────
 * `kept` ist das einzige, was `j.drafts` beschreibt (`syncBrandMarkDraftsSlot`);
 * ein Umbenennen ändert dort nur den Namen eines behaltenen Entwurfs. Das
 * Ereignis `design.drafts.kept` schreibt NUR die Zahl der behaltenen Entwürfe
 * — nie einen Namen, nie ein Bild.
 *
 * Die Zugehörigkeit belegt `loadBrandMarkDraftRow` VOR der Aktion
 * (Datentür-Regel); eine fremde Zeilen-Id endet mit 404.
 */
const patchSchema = z.object({
  kept: z.boolean().optional(),
  title: z.string().max(BRAND_MARK_DRAFT_TITLE_MAX).optional(),
}).refine(body => body.kept !== undefined || body.title !== undefined, {
  message: 'empty_patch',
})

export default defineEventHandler(async (event): Promise<BrandMarkDraftWriteResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandMarkContext(event, userId, betaAccount)

  const draftId = getRouterParam(event, 'draftId')
  if (!draftId || draftId.length > 64) throw createError({ status: 400, statusText: 'Missing id' })

  const parsed = patchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some(issue => issue.path[0] === 'title')
    throw createError({
      status: 400,
      statusText: 'Invalid draft payload',
      data: { code: tooLong ? 'draft_title_too_long' : 'invalid_body' },
    })
  }
  const body = parsed.data
  const title = body.title === undefined ? undefined : clampBrandMarkDraftTitle(body.title)

  const row = await loadBrandMarkDraftRow(event, profile.$id, draftId)

  let item = toBrandMarkDraftEntry(row)
  // NO-OP SCHREIBT NICHT (bodyToSave-Prinzip): wer zweimal auf „Behalten"
  // klickt, bewegt weder `$updatedAt` noch die Fassung des Kapitels.
  const unchanged = (body.kept === undefined || body.kept === item.kept)
    && (title === undefined || title === item.title)
  if (!unchanged) {
    item = await updateBrandMarkDraft(event, profile.$id, draftId, {
      ...(body.kept !== undefined ? { kept: body.kept } : {}),
      ...(title !== undefined ? { title } : {}),
    })
  }

  const items = await listBrandMarkDrafts(event, profile.$id)
  await syncBrandMarkDraftsSlot(event, profile, stepRows, items)

  if (!unchanged && body.kept !== undefined) {
    await recordBrandEvent(event, {
      type: 'design.drafts.kept',
      profileId: profile.$id,
      userId,
      payload: { kept: items.filter(entry => entry.kept).length, total: items.length },
    })
  }

  return { ok: true, item, items, max: BRAND_MARK_DRAFTS_MAX }
})
