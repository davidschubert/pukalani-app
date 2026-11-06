import { z } from 'zod'
import type { InsightsBrand } from '../../../../shared/insightsPost'
import type { InsightsBrandCreatedResponse } from '../../../../shared/types/insightsApi'

/**
 * EINE MARKEN-ZEILE ANLEGEN (`insights.manage`) — das Nötigste, im Editor.
 *
 * ── WARUM ES DIESE ROUTE IN I2 ÜBERHAUPT GIBT ────────────────────────────
 * Prüfregel 6 verlangt, dass jede genannte Marke eine Zeile hat — „sonst gibt
 * es keinen Ort, an dem ein Korrekturvorschlag ankommen könnte" (§9.4). Ohne
 * eine Anlage-Möglichkeit wäre diese Regel im Editor unerfüllbar: der
 * Redakteur sähe eine Sperre und hätte keinen Weg daran vorbei ausser der
 * Appwrite-Konsole.
 *
 * ── DREI FELDER, NICHT EINUNDZWANZIG ─────────────────────────────────────
 * Name, Homepage, Branche. Zeichen, Historie, Beziehungen und Belege gehören
 * auf die Marken-SEITE, und die ist bewusst nicht Teil von I2 — eine
 * halbfertige Marken-Pflege im Beitrags-Editor wäre eine zweite Oberfläche für
 * dieselbe Sache.
 *
 * ── DER ZUSTAND IST `draft` ──────────────────────────────────────────────
 * Eine frisch angelegte Marke ist nicht veröffentlicht: `/brands/<slug>` (I3)
 * liest `published`. Eine Zeile, die nur als Anker für einen Verweis existiert,
 * soll keine öffentliche Seite bekommen, nur weil sie entstanden ist.
 */
const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  homepage: z.union([z.url().max(512), z.literal('')]).default(''),
  industry: z.string().trim().max(40).default(''),
})

export default defineEventHandler(async (event): Promise<InsightsBrandCreatedResponse> => {
  requirePermission(event, 'insights.manage')

  const body = await readValidatedBody(event, bodySchema.parse)

  const slug = await findFreeInsightsSlug(event, 'brands', body.name, '')
  if (!slug) {
    throw createError({ status: 409, statusText: 'Slug unavailable', data: { code: 'slug_taken' } })
  }

  // JEDE Spalte explizit (CLAUDE.md).
  const brand: InsightsBrand = {
    slug,
    slugHistory: [],
    name: body.name,
    homepage: body.homepage,
    libraryKey: '',
    checkId: '',
    publicationId: '',
    industry: body.industry,
    country: '',
    foundedYear: null,
    archetype: '',
    archetypeSecondary: '',
    paletteId: '',
    marks: [],
    history: [],
    relations: [],
    sources: [],
    state: 'draft',
    removedAt: '',
    removalReason: '',
    claimedBy: '',
  }

  const row = await createInsightsBrandRow(event, brand)
  return { brand: toInsightsBrandListItem(row), id: row.$id }
})
