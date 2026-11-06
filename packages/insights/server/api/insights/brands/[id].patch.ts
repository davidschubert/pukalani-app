import type { InsightsBrand } from '../../../../shared/insightsPost'
import { insightsBrandEditSchema } from '../../../../shared/insightsPost'
import { toInsightsBrand } from '../../../../shared/insightsRows'
import type { InsightsBrandSavedResponse } from '../../../../shared/types/insightsApi'

/**
 * EINE MARKEN-ZEILE SPEICHERN (`insights.manage`, BI1 I2-Rest).
 *
 * ── DER KÖRPER TRÄGT NUR, WAS EIN MENSCH ENTSCHEIDET ─────────────────────
 * `insightsBrandEditSchema` lässt `slugHistory`, `removedAt` und `claimedBy`
 * gar nicht erst herein (`INSIGHTS_BRAND_SERVER_OWNED_FIELDS`, Begründung
 * dort). Der Server setzt sie aus dem BESTAND bzw. aus der Handlung.
 *
 * ── ZWEI DINGE RECHNET DER SERVER SELBST ─────────────────────────────────
 *  1. `slugHistory`, wenn sich die Adresse ändert — sonst bricht jede
 *     Umbenennung still jeden Link (§9.2). Dieselbe Funktion wie beim
 *     Beitrag, nur mit `table: 'brands'`.
 *  2. `removedAt` am ÜBERGANG, nicht am Zustand: wer nach `removed` geht,
 *     bekommt JETZT als Datum; wer zurückgeht, verliert es wieder. Das Datum
 *     einfach stehen zu lassen wäre die Behauptung, die Marke sei entfernt —
 *     an einer Zeile, die wieder sichtbar ist. Ein BESTEHENDES `removedAt`
 *     bleibt dagegen unangetastet: ein zweites Speichern einer entfernten
 *     Marke (Grund nachschärfen, Quelle nachtragen) darf den Zeitpunkt der
 *     Zusage nicht verschieben — genau danach fragt Anwaltsfrage 3.
 *
 * ── DER GRUND IST PFLICHT, UND ZWAR IM SCHEMA ────────────────────────────
 * `state: 'removed'` ohne `removalReason` fällt schon an
 * `insightsBrandEditSchema` (400) — dieselbe Regel, die auch der volle
 * Vertrag durchsetzt. Eine Entfernung ohne dokumentierten Grund ist der eine
 * Fall, in dem uns später die Antwort fehlt.
 */
export default defineEventHandler(async (event): Promise<InsightsBrandSavedResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsBrandMissing()

  const body = await readValidatedBody(event, insightsBrandEditSchema.parse)
  const row = await loadInsightsBrandRow(event, id)
  const current = toInsightsBrand(row)

  const { slug, slugHistory } = await applyInsightsSlugChange(event, 'brands', id, current, body.slug)

  const now = new Date().toISOString()
  const removedAt = body.state === 'removed'
    ? (current.removedAt || now)
    : ''

  const next: InsightsBrand = {
    ...body,
    slug,
    slugHistory,
    removedAt,
    // Der Bestand entscheidet: `claimedBy` entsteht auf dem Kontakt-Weg, nicht
    // in diesem Formular.
    claimedBy: current.claimedBy,
  }

  const saved = await saveInsightsBrandRow(event, id, next)

  if (current.state !== next.state) {
    logEvent('info', 'insights.brand_state_changed', { rowId: saved.$id, from: current.state, to: next.state })
  }

  return {
    brand: toInsightsBrand(saved),
    id: saved.$id,
    listItem: toInsightsBrandListItem(saved),
  }
})
