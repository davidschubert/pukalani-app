import { normalizeBrandPublicationReportStatus } from '../../../../../../shared/brandPublication'
import type { BrandPublicationReportResolveResponse } from '../../../../../../shared/types/brand'
import {
  BRAND_PUBLICATION_REPORTS_TABLE,
  brandPublicationAdminUnavailable,
  loadBrandPublicationReportRow,
  requireBrandPublicationOperator,
  requireBrandPublicationRouteId,
} from '../../../../../utils/brandPublications'
import { brandDb } from '../../../../../utils/brandStore'

/**
 * BETREIBER: EINE MELDUNG ERLEDIGEN (`users.manage`, §4.4).
 *
 * ── „ERLEDIGT" HEISST NICHT „BERECHTIGT" ──────────────────────────────────
 * Die Meldung ist ANGESEHEN, mehr sagt der Zustand nicht. Was daraus folgt —
 * nichts, ein Ausblenden, ein Anruf beim Kunden — ist eine andere Handlung mit
 * einer anderen Route. Ein gemeinsamer Knopf („erledigen und ausblenden")
 * verschmölze zwei Entscheidungen zu einer und nähme dem Betreiber die
 * häufigste: „gesehen, ist in Ordnung".
 *
 * ── ZWEIMAL ERLEDIGEN IST KEIN FEHLER ─────────────────────────────────────
 * `done` ⇒ dieselbe 200-Antwort mit `changed: false`, ohne Schreibvorgang.
 * Zwei offene Fenster sind der Normalfall, kein Angriff; ein 409 hier wäre ein
 * Fehler ohne Folge und ohne Abhilfe.
 *
 * ── ES GIBT KEINEN WEG ZURÜCK ─────────────────────────────────────────────
 * Bewusst: die Zeile bleibt lesbar, der Reiter „Erledigt" zeigt sie, und wenn
 * derselbe Verstoss zurückkehrt, kommt eine NEUE Meldung (der 409 der
 * öffentlichen Route sperrt nur OFFENE Dubletten). Ein Wieder-Öffnen wäre ein
 * zweiter Zustandspfad für einen Vorgang, der keinen braucht.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationReportResolveResponse> => {
  requireBrandPublicationOperator(event)
  const id = requireBrandPublicationRouteId(event)

  const row = await loadBrandPublicationReportRow(event, id)
  if (normalizeBrandPublicationReportStatus(row.status) === 'done') {
    return { ok: true, status: 'done', changed: false }
  }

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_PUBLICATION_REPORTS_TABLE,
      rowId: row.$id,
      data: { status: 'done', decidedAt: new Date().toISOString() },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { rowId: row.$id, stage: 'resolve' })
  }

  logEvent('info', 'brand.publication_report_resolved', {
    rowId: row.$id,
    publicationId: row.publicationId,
  })

  return { ok: true, status: 'done', changed: true }
})
