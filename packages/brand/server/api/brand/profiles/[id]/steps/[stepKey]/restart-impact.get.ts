import type { BrandRestartImpactResponse } from '../../../../../../../shared/types/brand'
import {
  brandRestartImpactView,
  loadBrandAcceptanceContext,
} from '../../../../../../utils/brandAcceptance'

/**
 * WAS „NOCHMAL VON VORN" KOSTET — der Inhalt des Schutz-Layers (Plan §5a
 * Schritt 1), OHNE KI und ohne einen einzigen Schreibvorgang.
 *
 * ── ZWEI ZAHLEN, ZWEI EBENEN ─────────────────────────────────────────────
 * `chapter` sagt, was in DIESEM Kapitel verloren geht (bestätigte Werte,
 * Notizen, Abnahmen). `downstream` sagt, was SPÄTER daran hängt — bestätigte
 * Felder späterer Kapitel, die aus diesem schöpfen. Die zweite Zahl ist die
 * eigentliche Warnung: das eigene Kapitel wollte man ja neu machen, die
 * vierzehn Felder in drei anderen nicht.
 *
 * ── `ack` IST DIE DURCHSETZUNG, NICHT DIE OBERFLÄCHE ─────────────────────
 * Der Hash bindet Kapitel, `revision` und die sortierte Hülle zusammen. Der
 * Restart trägt ihn zurück; passt er nicht mehr, hat sich seither etwas
 * bewegt, und der Layer zeigt neu, statt zu löschen. Das getippte Wort
 * („bestätigen") ist Reibung gegen den Fehlklick und gehört der Oberfläche —
 * der Server prüft `acknowledge` und diesen Hash (§5a Schritt 2).
 */
export default defineEventHandler(async (event): Promise<BrandRestartImpactResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { stepKey, stepRow, records, allFacts } = await loadBrandAcceptanceContext(event, userId, betaAccount)

  return brandRestartImpactView(stepKey, stepRow.revision ?? 0, records, allFacts)
})
