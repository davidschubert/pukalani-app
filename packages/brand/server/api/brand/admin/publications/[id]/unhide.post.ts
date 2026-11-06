import { decideBrandPublication } from '../../../../../../shared/brandPublication'
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
 * BETREIBER: EINE AUSGEBLENDETE MARKE WIEDER EINBLENDEN (`users.manage`, §4.4).
 *
 * ── OHNE NEUE FREIGABE, UND ZWAR MIT ABSICHT ──────────────────────────────
 * Der Stand, der zurückkommt, ist derselbe, den derselbe Kreis schon einmal
 * freigegeben hat — ihn ein zweites Mal zu prüfen prüfte nichts Neues und
 * machte aus einem korrigierten Fehlgriff einen Vorgang. Der Kunde kann hier
 * ohnehin nichts tun: `hidden` ist für ihn eine Sackgasse (Begründung in
 * `shared/brandPublication.ts`), und genau deshalb braucht der Betreiber die
 * Gegenrichtung.
 *
 * ── DIE BEGRÜNDUNG WIRD GELEERT ───────────────────────────────────────────
 * Sie erklärte die Ausblendung und ist mit dem Einblenden gegenstandslos.
 * Sie stehen zu lassen wäre nicht nur unordentlich, sondern FALSCH: die
 * Leseansicht des Kunden liest `published` + Notiz als „Aktualisierung
 * abgelehnt" (`brandPublicationPendingDeclined`), und das hätte hier
 * niemand entschieden.
 *
 * ── `featuredAt` KOMMT NICHT ZURÜCK ───────────────────────────────────────
 * Das Ausblenden hat es genommen; wer die Marke wieder zur Brand of the Day
 * machen will, sagt das ausdrücklich. Eine Kuration, die sich selbst
 * wiederherstellt, wäre eine Entscheidung ohne Entscheider.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationAdminDecisionResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)

  const row = await loadBrandPublicationRow(event, id)
  const transition = decideBrandPublication(brandPublicationStatusOf(row), 'unhide')
  if (transition.action === 'refuse') {
    throw createError({
      status: 409,
      statusText: 'Publication state does not allow this',
      data: { code: transition.code },
    })
  }

  const now = new Date().toISOString()
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      rowId: row.$id,
      data: {
        status: transition.next,
        decisionNote: '',
        decidedAt: now,
        updatedAt: now,
      },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'unhide' })
  }

  logEvent('info', 'brand.publication_unhidden', { slug: row.slug })

  return { ok: true, status: transition.next, keepsPublicStand: true }
})
