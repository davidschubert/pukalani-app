import { z } from 'zod'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsEvidenceResponse } from '../../../../../shared/types/insightsApi'

/**
 * DIE BELEG-AMPEL EINER EINZELNEN QUELLE (`insights.manage`, §9.4).
 *
 * ── DETERMINISTISCH, NICHT MIT KI ────────────────────────────────────────
 * Die Frage lautet „steht dieses Zitat WÖRTLICH auf dieser Seite?" — das ist
 * rechenbar, und es wird gerechnet: `evidenceIsGrounded` aus dem Fundament,
 * derselbe Riegel wie im Marktvergleich („kein zweiter, kein weicherer").
 * Ein Modell würde hier „passt sinngemäß" antworten, und genau das ist bei
 * § 51 UrhG die falsche Antwort.
 *
 * ── ES WIRD NICHTS GESPEICHERT ───────────────────────────────────────────
 * Die Ampel ist eine AUSKUNFT über den Stand von jetzt. Eine gespeicherte
 * Ampel wäre morgen eine Behauptung über eine Seite, die sich geändert haben
 * kann — und das Zustands-Gate prüft ohnehin selbst, bevor etwas öffentlich
 * wird.
 *
 * ── DER INDEX KOMMT AUS DER GESPEICHERTEN ZEILE, NICHT AUS DEM KÖRPER ────
 * Geprüft wird die Quelle, wie sie IN DER ZEILE steht. Eine Adresse aus dem
 * Körper wäre ein offener Abruf-Dienst hinter einer Betreiber-Session — der
 * SSRF-Schutz hielte ihn, aber die Zusage „wir holen nur, was in einem Beitrag
 * steht" wäre weg. Wer eine neue Quelle prüfen will, speichert sie zuerst.
 */
const bodySchema = z.object({ sourceIndex: z.number().int().min(0).max(39) })

export default defineEventHandler(async (event): Promise<InsightsEvidenceResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const { sourceIndex } = await readValidatedBody(event, bodySchema.parse)
  const post = toInsightsPost(await loadInsightsPostRow(event, id))
  const source = post.sources[sourceIndex]
  if (!source) {
    throw createError({ status: 404, statusText: 'Source not found', data: { code: 'source_not_found' } })
  }

  const outcome = await insightsCheckEvidence(source)
  return { ...outcome, checkedAt: new Date().toISOString() }
})
