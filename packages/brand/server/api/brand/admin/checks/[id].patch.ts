import { createBrandCheckHiddenSchema } from '../../../../../schemas/brandCheck'
import type { BrandCheckHiddenResponse } from '../../../../../shared/types/brand'
import {
  brandCheckAdminUnavailable,
  loadBrandCheckRow,
  requireBrandCheckOperator,
  requireBrandCheckRouteId,
} from '../../../../utils/brandCheckAdmin'
import { BRAND_CHECKS_TABLE, brandDb } from '../../../../utils/brandStore'

/**
 * BETREIBER: EINEN CHECK AUS- ODER WIEDER EINBLENDEN (`users.manage`).
 *
 * Der Entfernen-Weg aus docs/archiv/BRAND-CHECK-SEITE.md §3 („Betreiber?
 * Eintrag entfernen") und §7 — und die Bedingung dafür, dass ein öffentliches
 * Ranking über FREMDE Websites überhaupt tragfähig ist: eine Bewertung
 * Dritter ist zulässig, wenn sie faktenbasiert ist UND der Betroffene sich
 * wehren kann. Dieser Endpunkt ist die zweite Hälfte davon.
 *
 * ── AUSBLENDEN IST KEIN LÖSCHEN, UND DAS AUS ZWEI GRÜNDEN ─────────────────
 * (1) Die Zeile ist der Beleg dafür, was wann behauptet wurde — bei einer
 * Beschwerde ist genau das die Auskunft, die man braucht. (2) Ein gelöschter
 * Check käme beim nächsten Aufruf derselben Adresse frisch zurück (der
 * 7-Tage-Zwischenspeicher fände nichts mehr), und der Wunsch wäre nach dem
 * ersten fremden Klick wieder aufgehoben. `hidden` überlebt jeden neuen
 * Check-Anlauf für dieselbe Adresse, weil er den Zwischenspeicher trifft.
 *
 * ── UMKEHRBAR, WEIL EIN IRRTUM MÖGLICH IST ────────────────────────────────
 * `hidden: false` blendet wieder ein. Deshalb liefert `loadBrandCheckRow` auch
 * ausgeblendete Zeilen — ein Schalter, den man nur in eine Richtung stellen
 * kann, ist eine Falle.
 *
 * ── EIN PATCH MIT GENAU EINEM FELD ────────────────────────────────────────
 * Kein `industry` hier: das läuft über den Korrekturvorschlag-Weg (§3b), der
 * eine Spur hinterlässt, wer was wann vorgeschlagen hat. Zwei Wege zu
 * demselben Feld wären einer zu viel — und der stille wäre der, den man
 * nimmt.
 */
export default defineEventHandler(async (event): Promise<BrandCheckHiddenResponse> => {
  requireBrandCheckOperator(event)
  const id = requireBrandCheckRouteId(event)
  const body = await readValidatedBody(event, createBrandCheckHiddenSchema().parse)

  const row = await loadBrandCheckRow(event, id)

  // Schon so ⇒ dieselbe Antwort ohne Schreibvorgang. Ein 409 auf einen
  // Doppelklick wäre eine Fehlermeldung für etwas, das genau so ausgegangen
  // ist, wie der Betreiber es wollte.
  if ((row.hidden === true) === body.hidden) {
    return { ok: true, hidden: body.hidden }
  }

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      rowId: row.$id,
      data: { hidden: body.hidden },
    })
  }
  catch (error) {
    throw brandCheckAdminUnavailable(error, { rowId: row.$id, stage: 'hidden' })
  }

  logEvent('info', 'brand.check_hidden_changed', {
    rowId: row.$id,
    host: row.host,
    hidden: body.hidden,
  })

  return { ok: true, hidden: body.hidden }
})
