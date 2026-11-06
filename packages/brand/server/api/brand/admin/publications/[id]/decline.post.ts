import { createBrandPublicationDecisionSchema } from '../../../../../../schemas/brandPublication'
import {
  brandPublicationDeclineOutcome,
  decideBrandPublication,
} from '../../../../../../shared/brandPublication'
import type { BrandPublicationAdminDecisionResponse } from '../../../../../../shared/types/brand'
import {
  BRAND_PUBLICATIONS_TABLE,
  brandPublicationAdminUnavailable,
  brandPublicationStatusOf,
  loadBrandPublicationRow,
  requireBrandPublicationOperator,
  requireBrandPublicationRouteId,
} from '../../../../../utils/brandPublications'
import { brandDb } from '../../../../../utils/brandStore'

/**
 * BETREIBER: EINE EINREICHUNG ABLEHNEN (`users.manage`,
 * docs/plans/DISCOVER-BRANDS.md §4.4/§3.4).
 *
 * ── DIE BEGRÜNDUNG IST PFLICHT ────────────────────────────────────────────
 * Anders als bei den Korrekturvorschlägen, wo ein leerer String gilt. Der
 * Unterschied ist der LESER: dort liest niemand die Notiz ausser dem
 * Betreiber selbst, hier steht sie in der Leseansicht des Kunden (§3.4). Eine
 * Ablehnung ohne Satz wäre für ihn eine geschlossene Tür ohne Klinke — er
 * weiss nicht, was zu ändern ist, und reicht dasselbe erneut ein.
 *
 * ── ZWEI AUSGÄNGE, WEIL ES ZWEI FÄLLE SIND ────────────────────────────────
 * Steht noch NICHTS draussen, wird die Zeile `declined`. Steht schon ein
 * FREIGEGEBENER Stand draussen, bleibt sie `published`: abgelehnt wurde die
 * AKTUALISIERUNG, nicht die Marke, und sie deswegen aus der Galerie zu nehmen
 * wäre eine Strafe für einen Verbesserungsversuch (dazu stürbe ein geteilter
 * Link an einem Vorgang, der ihn nicht betraf). Die Regel dazu steht pur in
 * `brandPublicationDeclineOutcome`; der Kunde erkennt den zweiten Fall an
 * `pendingDecision` im GET.
 *
 * In BEIDEN Fällen wird `pendingSnapshot` geleert (er ist entschieden) und
 * `snapshot` NICHT angefasst.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationAdminDecisionResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)
  const body = await readValidatedBody(event, createBrandPublicationDecisionSchema().parse)

  const row = await loadBrandPublicationRow(event, id)
  const transition = decideBrandPublication(brandPublicationStatusOf(row), 'decline')
  if (transition.action === 'refuse') {
    logEvent('info', 'brand.publication_action_rejected', { action: 'decline', slug: row.slug, status: row.status ?? '' })
    throw createError({
      status: 409,
      statusText: 'Already decided',
      data: { code: 'already_decided' },
    })
  }

  /**
   * „Es steht schon etwas draussen" heisst: die Zeile war einmal freigegeben
   * UND hat einen öffentlichen Stand. Beides zusammen, nicht eines von beiden
   * — ein `publishedAt` ohne `snapshot` wäre eine Marke, die auf eine leere
   * Anatomie zeigt, und die will man nicht am Leben lassen.
   */
  const hasPublicStand = Boolean(row.publishedAt) && Boolean(row.snapshot)
  const outcome = brandPublicationDeclineOutcome(hasPublicStand)

  const now = new Date().toISOString()
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      rowId: row.$id,
      data: {
        status: outcome.next,
        pendingSnapshot: '',
        decisionNote: body.decisionNote,
        decidedAt: now,
        updatedAt: now,
      },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'decline' })
  }

  logEvent('info', 'brand.publication_declined', {
    slug: row.slug,
    status: outcome.next,
    keepsPublicStand: outcome.keepsPublicStand,
  })

  return { ok: true, status: outcome.next, keepsPublicStand: outcome.keepsPublicStand }
})
