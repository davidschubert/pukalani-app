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
 * BETREIBER: EINE EINREICHUNG FREIGEBEN (`users.manage`,
 * docs/plans/DISCOVER-BRANDS.md §4.4, Davids Entscheidung §9.1).
 *
 * DAS IST DER MOMENT, IN DEM ETWAS ÖFFENTLICH WIRD. Bis hierher hat niemand
 * ausser dem Eigentümer den Stand gesehen.
 *
 * ── DIE FREIGABE IST EIN KOPIERVORGANG ────────────────────────────────────
 * `pendingSnapshot` → `snapshot`, danach `pendingSnapshot` leer. Genau daran
 * hängt die Zusage aus §3.4: der eingereichte Stand liegt bis zur Entscheidung
 * NEBEN dem freigegebenen, nicht darüber. Wer das zu einem Feld
 * zusammenzöge, machte die Freigabe zu einer Formalität nach der
 * Veröffentlichung.
 *
 * ── DIE BEGRÜNDUNG WIRD GELEERT ───────────────────────────────────────────
 * Sie gehörte zur vorigen Ablehnung. Bliebe sie stehen, läse die Leseansicht
 * des Kunden daraus „Aktualisierung abgelehnt" (die Regel dafür ist
 * `brandPublicationPendingDeclined`: `published` + Notiz) — und zwar
 * ausgerechnet in dem Augenblick, in dem sein neuer Stand freigegeben wurde.
 * Das ist keine Kosmetik, sondern die Voraussetzung dieser Regel.
 *
 * ── NUR AUS `pending` ─────────────────────────────────────────────────────
 * 409 `publication_state` sonst. Zwei Betreiber, zwei Fenster, ein Klick zu
 * spät: der zweite darf nicht eine Freigabe über eine Ablehnung schreiben.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationAdminDecisionResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)

  const row = await loadBrandPublicationRow(event, id)
  const transition = decideBrandPublication(brandPublicationStatusOf(row), 'approve')
  if (transition.action === 'refuse') {
    // Auch die ABLEHNUNG hinterlässt eine Zeile (2026-09-08): 4xx protokolliert
    // der zentrale Handler nicht, und ein Klick auf eine schon entschiedene
    // Zeile sah im Log genauso aus wie gar kein Klick.
    logEvent('info', 'brand.publication_action_rejected', { action: 'approve', slug: row.slug, status: row.status ?? '' })
    throw createError({
      status: 409,
      statusText: 'Already decided',
      data: { code: 'already_decided' },
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
        // Der eingereichte Stand wird der öffentliche. Ist er leer (eine Zeile
        // aus einer Zeit vor den zwei Spalten), bleibt der alte stehen —
        // besser eine Marke mit altem Inhalt als eine leere Anatomie.
        snapshot: row.pendingSnapshot || row.snapshot || '',
        pendingSnapshot: '',
        status: transition.next,
        publishedAt: now,
        decidedAt: now,
        updatedAt: now,
        decisionNote: '',
      },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'approve' })
  }

  // LOG-REGEL §6: Slug und Code, nie Inhalte.
  logEvent('info', 'brand.publication_approved', { slug: row.slug })

  return { ok: true, status: transition.next, keepsPublicStand: false }
})
