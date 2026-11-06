import { createBrandPublicationFeatureSchema } from '../../../../../../schemas/brandPublication'
import { brandPublicationIsPublic } from '../../../../../../shared/brandPublication'
import type { BrandPublicationFlagResponse } from '../../../../../../shared/types/brand'
import {
  BRAND_PUBLICATIONS_TABLE,
  brandPublicationAdminUnavailable,
  brandPublicationStatusOf,
  clearOtherFeaturedBrandPublications,
  loadBrandPublicationRow,
  requireBrandPublicationOperator,
  requireBrandPublicationRouteId,
} from '../../../../../utils/brandPublications'
import { brandDb } from '../../../../../utils/brandStore'

/**
 * BETREIBER: BRAND OF THE DAY SETZEN ODER ENTFERNEN (`users.manage`,
 * Davids Entscheidung 6: „genau eine, letzte gewinnt").
 *
 * ── DIE REGEL SITZT IM SERVER, NICHT IM SCHALTER ──────────────────────────
 * Der Klickdummy erlaubt bewusst mehrere gleichzeitig, damit man sieht, dass
 * hier entschieden wird: Setzen räumt JEDE andere Zeile mit `featuredAt` ab.
 * Ein Schalter, der sich auf „ich habe die anderen ja ausgeschaltet" verliesse,
 * verlöre gegen zwei offene Browser-Fenster.
 *
 * ── ERST SETZEN, DANN ABRÄUMEN ────────────────────────────────────────────
 * Die umgekehrte Reihenfolge liesse bei einem Ausfall dazwischen GAR KEINE
 * Brand of the Day zurück; diese hier lässt im schlimmsten Fall zwei stehen,
 * und das heilt der nächste Klick. Zwei sind ein Schönheitsfehler, keine ist
 * ein Loch in der Galerie.
 *
 * ── NUR WAS ÖFFENTLICH STEHT ──────────────────────────────────────────────
 * Eine wartende oder ausgeblendete Marke als Brand of the Day zeigte auf eine
 * 404. Das ENTFERNEN ist davon ausgenommen: einen Stempel abzuräumen muss auch
 * dann gehen, wenn die Zeile inzwischen den Zustand gewechselt hat.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationFlagResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)
  const body = await readValidatedBody(event, createBrandPublicationFeatureSchema().parse)

  const row = await loadBrandPublicationRow(event, id)
  const status = brandPublicationStatusOf(row)
  if (body.featured && !brandPublicationIsPublic(status ?? 'none')) {
    throw createError({
      status: 409,
      statusText: 'Only a published brand can be featured',
      data: { code: 'not_published' },
    })
  }

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      rowId: row.$id,
      data: { featuredAt: body.featured ? new Date().toISOString() : null },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'feature' })
  }

  const replacedId = body.featured
    ? await clearOtherFeaturedBrandPublications(event, row.$id)
    : ''

  logEvent('info', 'brand.publication_featured', {
    slug: row.slug,
    featured: body.featured,
    replacedId,
  })

  return { ok: true, featured: body.featured, example: row.example === true, replacedId }
})
