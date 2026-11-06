import { createBrandPublicationExampleSchema } from '../../../../../../schemas/brandPublication'
import type { BrandPublicationFlagResponse } from '../../../../../../shared/types/brand'
import {
  BRAND_PUBLICATIONS_TABLE,
  brandPublicationAdminUnavailable,
  loadBrandPublicationRow,
  requireBrandPublicationOperator,
  requireBrandPublicationRouteId,
} from '../../../../../utils/brandPublications'
import { brandDb } from '../../../../../utils/brandStore'

/**
 * BETREIBER: DAS BADGE „BEISPIEL" SETZEN ODER ENTFERNEN (`users.manage`,
 * Davids Entscheidung 4: das redaktionelle Beispiel-Branding „Kailua Coffee
 * Co.", Paket D5).
 *
 * ── WARUM ES ÜBERHAUPT EIN BADGE GIBT ─────────────────────────────────────
 * Das Beispiel entsteht wie jede andere Marke — echte Sessions, echte Prüfung,
 * echter Wizard-Weg (D5). Genau deshalb ist es in der Galerie von einer
 * Kunden-Marke nicht zu unterscheiden, und genau das wäre eine stille Lüge:
 * ein Besucher liest die Galerie als „so viele Leute bauen hier schon". Das
 * Badge sagt, was es ist. Es ist damit eine EHRLICHKEITS-Angabe und keine
 * Kuration — deswegen steht es neben `featured` und nicht darin.
 *
 * ── ES GIBT KEINE „genau eine"-REGEL ──────────────────────────────────────
 * Anders als bei der Brand of the Day. Zwei redaktionelle Beispiele sind kein
 * Widerspruch, nur zwei Beispiele; hier ist also nichts abzuräumen.
 *
 * ── UND KEINE ZUSTANDS-BEDINGUNG ──────────────────────────────────────────
 * Das Badge sagt etwas über die HERKUNFT der Marke, nicht über ihren Zustand.
 * Es darf deshalb gesetzt werden, solange sie noch wartet — der Betreiber
 * markiert sein eigenes Beispiel, wenn er es einreicht, nicht später.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationFlagResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)
  const body = await readValidatedBody(event, createBrandPublicationExampleSchema().parse)

  const row = await loadBrandPublicationRow(event, id)

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      rowId: row.$id,
      data: { example: body.example },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'example' })
  }

  logEvent('info', 'brand.publication_example', {
    slug: row.slug,
    example: body.example,
  })

  return { ok: true, featured: Boolean(row.featuredAt), example: body.example, replacedId: '' }
})
