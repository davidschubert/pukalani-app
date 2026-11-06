import { createBrandSessionDeferSchema } from '../../../../../../../../../schemas/brandStep'
import type { BrandSessionAcceptResponse } from '../../../../../../../../../shared/types/brand'
import { loadBrandAcceptanceContext } from '../../../../../../../../utils/brandAcceptance'
import { writeBrandSessionFlag } from '../../../../../../../../utils/brandSessionWrite'

/**
 * VERTAGEN — „darauf komme ich zurück" (Plan §3a, `answers.allowDefer`).
 *
 * ── ES GILT JE SESSION, NICHT JE TEIL ─────────────────────────────────────
 * Fables Entscheidung vom 2026-09-04: ein vertagter `collect` behält seinen
 * Zwischenstand (`collected`). Vertagen sagt nichts über den Inhalt, es sagt
 * nur, dass hier gerade nichts entschieden wird — die schon gesammelten Teile
 * wegzuwerfen wäre eine Strafe für Ehrlichkeit.
 *
 * ── WER DARF VERTAGEN ─────────────────────────────────────────────────────
 * Die Session selbst (`answers.allowDefer` aus `sessionContent.ts`, Davids
 * Inhalts-Gate). Eine zweite Liste in der Route liefe ihr davon; deshalb steht
 * die Prüfung in der Zustandsmaschine und diese Datei reicht nur durch.
 *
 * Ein BESTÄTIGTER Wert wird nicht vertagt (`already_confirmed`, 409): er ist
 * ja da. Was ihn wieder öffnet, heisst „Korrigieren" und ist ein anderer Weg.
 */
export default defineEventHandler(async (event): Promise<BrandSessionAcceptResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const body = await readValidatedBody(event, createBrandSessionDeferSchema().parse)

  return writeBrandSessionFlag(
    event,
    context,
    body.revision,
    slotId => ({ kind: 'deferSlot', slotId, deferred: body.deferred }),
  )
})
