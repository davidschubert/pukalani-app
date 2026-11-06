import { z } from 'zod'
import {
  INSIGHTS_CORRECTION_NOTE_MAX,
  insightsCorrectionDecisionAllowed,
} from '../../../../../shared/insightsCorrection'
import { toInsightsCorrection, toInsightsCorrectionListItem } from '../../../../../shared/insightsRows'
import type { InsightsCorrectionDecisionResponse } from '../../../../../shared/types/insightsApi'

/**
 * EINEN KORREKTURVORSCHLAG ENTSCHEIDEN (`insights.manage`, §9.3/§9.4).
 *
 * ── EINE ANNAHME ÄNDERT DAS ZIEL NICHT ───────────────────────────────────
 * Anders als bei `brand_check_corrections`, wo „annehmen" den vorgeschlagenen
 * Wert nach `brand_checks.<field>` schreibt. Dort ist der Vorschlag EIN Wert
 * aus einem geschlossenen Katalog (eine Branche), hier ist er ein Satz über
 * einen redaktionellen Text: „das Gründungsjahr stimmt nicht", „diese
 * Historien-Zeile ist falsch datiert". Was daraus folgt, ist REDAKTIONSARBEIT
 * — ein neuer Beleg, eine geänderte Zeile, vielleicht ein zurückgezogener
 * Beitrag. Ein Automatismus müsste raten, welches Feld gemeint ist, und
 * schriebe im Zweifel ungeprüften Fremdtext in eine öffentliche Seite.
 * `accepted` heisst deshalb: „stimmt, wir kümmern uns" — die Änderung macht
 * der Mensch im Editor bzw. auf der Marken-Seite nebenan.
 *
 * ── EINE ENTSCHIEDENE ZEILE WIRD NICHT ÜBERSCHRIEBEN ─────────────────────
 * 409 `already_decided`, auch beim zweiten Mal DASSELBE (kein nachsichtiges
 * `noop` wie im brand-Layer). Begründung an
 * `insightsCorrectionDecisionAllowed`: diese Zeile ist der NACHWEIS, dass der
 * Korrekturweg funktioniert, und ein `decidedAt`, das beim zweiten Klick
 * weiterrückt, wäre ein Protokoll, das sich selbst umschreibt.
 *
 * ── EINE ABLEHNUNG BRAUCHT EINE NOTIZ ────────────────────────────────────
 * 400 `note_required`. Sie ist das Einzige, was eine Ablehnung von einem
 * Ignorieren unterscheidet — und genau danach fragt Anwaltsfrage 3.
 *
 * ── GESCHRIEBEN WERDEN DREI FELDER ───────────────────────────────────────
 * `status`, `decisionNote`, `decidedAt` (s. `saveInsightsCorrectionDecision`).
 * Was ein Mensch von draussen eingereicht hat, bleibt unangetastet.
 */
const bodySchema = z.object({
  status: z.enum(['accepted', 'declined']),
  decisionNote: z.string().trim().max(INSIGHTS_CORRECTION_NOTE_MAX).default(''),
})

export default defineEventHandler(async (event): Promise<InsightsCorrectionDecisionResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsCorrectionMissing()

  const body = await readValidatedBody(event, bodySchema.parse)
  const row = await loadInsightsCorrectionRow(event, id)
  const current = toInsightsCorrection(row)

  const decision = insightsCorrectionDecisionAllowed(current.status, body.status, body.decisionNote)
  if (!decision.ok) {
    throw decision.code === 'already_decided'
      ? createError({ status: 409, statusText: 'Already decided', data: { code: decision.code } })
      : createError({ status: 400, statusText: 'A decline needs a note', data: { code: decision.code } })
  }

  const saved = await saveInsightsCorrectionDecision(event, row.$id, {
    status: body.status,
    decisionNote: body.decisionNote,
    decidedAt: new Date().toISOString(),
  })

  // KEIN `proposed`, KEIN `reason`, KEINE Adresse im Protokoll: das ist
  // Fremdtext mit Personenbezug (Regel 1 aus `brandEvents.ts`).
  logEvent('info', 'insights.correction_decided', {
    rowId: saved.$id,
    status: body.status,
    targetKind: current.targetKind,
    kind: current.kind,
  })

  return { item: toInsightsCorrectionListItem(saved) }
})
