import { createBrandCheckCorrectionDeclineSchema } from '../../../../../../schemas/brandCheck'
import {
  decideBrandCheckCorrection,
  normalizeBrandCheckCorrectionStatus,
} from '../../../../../../shared/brandCheckCorrections'
import type { BrandCheckCorrectionDecisionResponse } from '../../../../../../shared/types/brand'
import {
  brandCheckAdminUnavailable,
  loadBrandCheckCorrectionRow,
  requireBrandCheckOperator,
  requireBrandCheckRouteId,
} from '../../../../../utils/brandCheckAdmin'
import { BRAND_CHECK_CORRECTIONS_TABLE, brandDb } from '../../../../../utils/brandStore'

/**
 * BETREIBER: EINEN KORREKTURVORSCHLAG ABLEHNEN (`users.manage`, Plan §3b).
 *
 * ── ABLEHNEN LÖSCHT NICHT ─────────────────────────────────────────────────
 * Dieselbe Entscheidung wie bei der Warteliste und beim Entfernen eines
 * Community-Mitglieds: die Zeile bleibt stehen. Ohne sie stünde derselbe
 * Vorschlag beim nächsten Absenden wieder auf der Arbeitsliste, und der
 * Betreiber entschiede dieselbe Sache ein zweites Mal — nur ohne zu wissen,
 * dass er sie schon einmal entschieden hat.
 *
 * ── DIE BEGRÜNDUNG IST FREIWILLIG, ABER SIE GEHÖRT HIERHER ────────────────
 * Ein leerer String ist ein gültiger Wert. Sie steht trotzdem im Rumpf DIESER
 * Route und nicht in einer eigenen: ein Feld, das man nur mit einem zweiten
 * Klick nachtragen kann, wird nie ausgefüllt — und sie ist das Einzige, was
 * eine Ablehnung von einem Ignorieren unterscheidet.
 *
 * ── ZWEIMAL ABLEHNEN IST KEIN FEHLER ──────────────────────────────────────
 * `declined` ⇒ dieselbe 200-Antwort mit `changed: false`, ohne Schreibvorgang;
 * die bestehende Begründung bleibt stehen. Eine bereits ANGENOMMENE Zeile
 * abzulehnen ist dagegen ein 409 — der Wert steht längst im Check, und eine
 * „Ablehnung" daneben wäre eine Behauptung, die die Daten widerlegen.
 */
export default defineEventHandler(async (event): Promise<BrandCheckCorrectionDecisionResponse> => {
  requireBrandCheckOperator(event)
  const id = requireBrandCheckRouteId(event)
  const body = await readValidatedBody(event, createBrandCheckCorrectionDeclineSchema().parse)

  const row = await loadBrandCheckCorrectionRow(event, id)
  const decision = decideBrandCheckCorrection(
    normalizeBrandCheckCorrectionStatus(row.status),
    'declined',
  )

  if (decision.action === 'refuse') {
    throw createError({ status: 409, statusText: 'Already decided', data: { code: decision.code } })
  }
  if (decision.action === 'noop') {
    return { ok: true, status: 'declined', changed: false }
  }

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_CHECK_CORRECTIONS_TABLE,
      rowId: row.$id,
      data: {
        status: 'declined',
        decisionNote: body.decisionNote,
        decidedAt: new Date().toISOString(),
      },
    })
  }
  catch (error) {
    throw brandCheckAdminUnavailable(error, { rowId: row.$id, stage: 'decline' })
  }

  logEvent('info', 'brand.check_correction_declined', {
    rowId: row.$id,
    checkId: row.checkId,
    field: row.field || 'industry',
  })

  return { ok: true, status: 'declined', changed: true }
})
