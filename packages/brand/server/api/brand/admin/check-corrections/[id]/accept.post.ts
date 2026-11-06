import {
  decideBrandCheckCorrection,
  normalizeBrandCheckCorrectionStatus,
} from '../../../../../../shared/brandCheckCorrections'
import { isBrandIndustryValue } from '../../../../../../shared/brandIndustries'
import type { BrandCheckCorrectionDecisionResponse } from '../../../../../../shared/types/brand'
import {
  brandCheckAdminUnavailable,
  loadBrandCheckCorrectionRow,
  loadBrandCheckRow,
  requireBrandCheckOperator,
  requireBrandCheckRouteId,
} from '../../../../../utils/brandCheckAdmin'
import {
  BRAND_CHECKS_TABLE,
  BRAND_CHECK_CORRECTIONS_TABLE,
  brandDb,
} from '../../../../../utils/brandStore'

/**
 * BETREIBER: EINEN KORREKTURVORSCHLAG ANNEHMEN (`users.manage`, Plan §3b).
 *
 * Annehmen heisst: der vorgeschlagene Wert wird in `brand_checks.<field>`
 * geschrieben, und der Vorschlag ist `accepted`.
 *
 * ── DER WERT WIRD BEIM ANNEHMEN ERNEUT GEPRÜFT ────────────────────────────
 * Obwohl das öffentliche Schema ihn schon gegen den Katalog gemessen hat. Der
 * Grund ist die ZEIT: zwischen Vorschlag und Entscheidung liegen Tage, und in
 * dieser Zeit kann eine Branche aus dem Katalog verschwunden sein. Ein
 * Schreibvorgang, dessen Gültigkeit von einer Prüfung aus der Vergangenheit
 * abhängt, ist keine Prüfung. 409 `invalid_value` — die Zeile bleibt offen,
 * damit der Betreiber sie ablehnen kann statt sie zu verlieren.
 *
 * ── DIE REIHENFOLGE: ERST DER CHECK, DANN DER STEMPEL ─────────────────────
 * Scheitert das Schreiben in `brand_checks`, bleibt der Vorschlag OFFEN. Der
 * umgekehrte Weg („angenommen" stempeln, dann schreiben) hinterliesse bei
 * einem Ausfall eine Zeile, die eine Annahme behauptet, die nie stattfand —
 * und `decideBrandCheckCorrection` gäbe ihr danach keine zweite Gelegenheit.
 * Dieselbe Sorgfalt wie bei „kein Code ohne Mail" in der Warteliste.
 *
 * ── ZWEIMAL ANNEHMEN IST KEIN FEHLER ──────────────────────────────────────
 * `accepted` ⇒ dieselbe 200-Antwort mit `changed: false`, ohne Schreibvorgang.
 * Eine bereits ABGELEHNTE Zeile anzunehmen ist dagegen ein 409: das wäre eine
 * stille Umkehr einer Entscheidung, die der Betreiber sichtbar treffen soll
 * (der Nachbar dafür ist `PATCH /api/brand/admin/checks/<id>`).
 */
export default defineEventHandler(async (event): Promise<BrandCheckCorrectionDecisionResponse> => {
  requireBrandCheckOperator(event)
  const id = requireBrandCheckRouteId(event)

  const row = await loadBrandCheckCorrectionRow(event, id)
  const decision = decideBrandCheckCorrection(
    normalizeBrandCheckCorrectionStatus(row.status),
    'accepted',
  )

  if (decision.action === 'refuse') {
    throw createError({ status: 409, statusText: 'Already decided', data: { code: decision.code } })
  }
  if (decision.action === 'noop') {
    return { ok: true, status: 'accepted', changed: false }
  }

  const field = row.field || 'industry'
  if (field !== 'industry' || !isBrandIndustryValue(row.proposed)) {
    throw createError({
      status: 409,
      statusText: 'Proposed value is not valid any more',
      data: { code: 'invalid_value' },
    })
  }

  // Der Check MUSS existieren — sonst gibt es nichts zu korrigieren. 404 aus
  // `loadBrandCheckRow`; ein ausgeblendeter Check kommt bewusst zurück (der
  // Betreiber darf auch dort noch aufräumen).
  const check = await loadBrandCheckRow(event, row.checkId)

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      rowId: check.$id,
      data: { industry: row.proposed },
    })
  }
  catch (error) {
    throw brandCheckAdminUnavailable(error, { rowId: check.$id, stage: 'apply' })
  }

  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_CHECK_CORRECTIONS_TABLE,
      rowId: row.$id,
      data: { status: 'accepted', decidedAt: new Date().toISOString() },
    })
  }
  catch (error) {
    // Der Wert STEHT bereits — nur der Stempel fehlt. Das ist ein 503, und der
    // nächste Klick heilt ihn: die Zeile ist noch `open`, der Vorschlag also
    // erneut annehmbar, und das zweite Schreiben in `brand_checks` setzt
    // denselben Wert.
    throw brandCheckAdminUnavailable(error, { rowId: row.$id, stage: 'accept' })
  }

  logEvent('info', 'brand.check_correction_accepted', {
    rowId: row.$id,
    checkId: check.$id,
    field,
    proposed: row.proposed,
  })

  return { ok: true, status: 'accepted', changed: true }
})
