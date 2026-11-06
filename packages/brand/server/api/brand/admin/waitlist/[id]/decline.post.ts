import { decideBrandWaitlistDecline, normalizeBrandWaitlistStatus } from '../../../../../../shared/brandWaitlistAdmin'
import type { BrandWaitlistDeclineResponse } from '../../../../../../shared/types/brand'
import { BRAND_WAITLIST_TABLE, brandDb } from '../../../../../utils/brandStore'
import {
  brandWaitlistUnavailable,
  loadBrandWaitlistRow,
  requireBrandWaitlistId,
  requireBrandWaitlistOperator,
} from '../../../../../utils/brandWaitlistAdmin'

/**
 * BETREIBER: EINE ANFRAGE ABLEHNEN (`users.manage`).
 *
 * ── ABLEHNEN LÖSCHT NICHT ─────────────────────────────────────────────────
 * Dieselbe Entscheidung wie beim Entfernen eines Community-Mitglieds
 * (`community_members.status='removed'`, control-019): die Zeile bleibt stehen.
 * Der Grund ist hier sogar praktischer — ohne sie stünde dieselbe Adresse beim
 * nächsten Formular-Absenden wieder als frische Anfrage auf der Arbeitsliste,
 * und der Betreiber entschiede dieselbe Sache ein zweites Mal. Wer eine Zeile
 * wirklich loswerden will (Löschwunsch nach GDPR), löscht sie in der
 * Appwrite-Konsole; das ist der Handgriff, den brand-012 im Kopf beschreibt.
 *
 * ── AUS `invited` GEHT ES NICHT ───────────────────────────────────────────
 * Dort ist ein Code draußen, und ein „abgelehnt" daneben wäre eine Behauptung,
 * die der Mensch mit dem Code widerlegt. Zurücknehmen heißt dann den CODE
 * widerrufen (`pnpm brand:revoke`) — eine andere Handlung als eine Notiz in
 * der Liste. 409 `already_invited`.
 *
 * ── ZWEIMAL ABLEHNEN IST KEIN FEHLER ──────────────────────────────────────
 * `declined` ⇒ dieselbe 200-Antwort, ohne Schreibvorgang. Ein 409 auf einen
 * Doppelklick wäre eine Fehlermeldung für etwas, das genau so ausgegangen ist,
 * wie der Betreiber es wollte.
 */
export default defineEventHandler(async (event): Promise<BrandWaitlistDeclineResponse> => {
  requireBrandWaitlistOperator(event)
  const id = requireBrandWaitlistId(event)

  const row = await loadBrandWaitlistRow(event, id)
  const decision = decideBrandWaitlistDecline(normalizeBrandWaitlistStatus(row.status))

  if (decision.action === 'refuse') {
    throw createError({
      status: 409,
      statusText: 'Already invited',
      data: { code: decision.code },
    })
  }

  if (decision.action === 'decline') {
    const { tablesDB, databaseId } = brandDb(event)
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_WAITLIST_TABLE,
        rowId: row.$id,
        data: { status: 'declined' },
      })
    }
    catch (error) {
      throw brandWaitlistUnavailable(error, { rowId: row.$id, stage: 'decline' })
    }
    logEvent('info', 'brand.waitlist_declined', { rowId: row.$id, source: row.source })
  }

  return { ok: true, status: 'declined' }
})
