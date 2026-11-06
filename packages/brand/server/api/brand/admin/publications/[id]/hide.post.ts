import { createBrandPublicationDecisionSchema } from '../../../../../../schemas/brandPublication'
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
 * BETREIBER: EINE VERÖFFENTLICHTE MARKE AUSBLENDEN (`users.manage`, §4.4,
 * Davids Entscheidung 8 „Ausblenden mit Begründung").
 *
 * Das ist die Antwort auf eine berechtigte Meldung oder einen Rechtsverstoss:
 * die Anatomie antwortet danach 404, die Zeile und der Snapshot bleiben.
 *
 * ── AUSBLENDEN LÖSCHT NICHT ───────────────────────────────────────────────
 * Dieselbe Entscheidung wie beim Ablehnen einer Warteliste-Zeile und beim
 * Entfernen eines Community-Mitglieds: die Zeile bleibt stehen. Ohne sie
 * verlöre man die Adresse (jemand anders könnte sie beantragen), die Historie
 * und die Möglichkeit, den Griff zurückzunehmen.
 *
 * ── DIE BEGRÜNDUNG IST PFLICHT, UND SIE IST DAS EIGENTLICHE ────────────────
 * Der Kunde sieht sie in seiner Leseansicht neben „Ausgeblendet"; ohne sie
 * verschwände seine Marke kommentarlos aus der Galerie. `hidden` ist für ihn
 * eine Sackgasse (die Regel in `brandPublication.ts` sagt warum) — umso mehr
 * muss er erfahren, worüber er mit uns reden soll.
 *
 * ── NUR AUS `published` ───────────────────────────────────────────────────
 * Was nicht öffentlich steht, kann man nicht ausblenden. Der Weg zurück ist
 * `unhide`, und den hat nur der Betreiber.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationAdminDecisionResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)
  const body = await readValidatedBody(event, createBrandPublicationDecisionSchema().parse)

  const row = await loadBrandPublicationRow(event, id)
  const transition = decideBrandPublication(brandPublicationStatusOf(row), 'hide')
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
        decisionNote: body.decisionNote,
        decidedAt: now,
        updatedAt: now,
        // Eine ausgeblendete Marke ist keine Brand of the Day. Der Stempel
        // fällt hier mit, sonst zeigte die Galerie auf eine 404.
        featuredAt: null,
      },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'hide' })
  }

  logEvent('info', 'brand.publication_hidden', { slug: row.slug })

  return { ok: true, status: transition.next, keepsPublicStand: false }
})
