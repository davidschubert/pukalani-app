import { createBrandSessionAcceptSchema } from '../../../../../../../../../schemas/brandStep'
import type { BrandSessionAcceptResponse } from '../../../../../../../../../shared/types/brand'
import { loadBrandAcceptanceContext } from '../../../../../../../../utils/brandAcceptance'
import { writeBrandSessionFlag } from '../../../../../../../../utils/brandSessionWrite'

/**
 * ABNEHMEN — der Haken je Zeile auf der Finalen Abnahme (Plan §5a).
 *
 * ── WARUM ES DEN ZWEITEN ZUSTAND ÜBERHAUPT GIBT ───────────────────────────
 * `confirmed` heisst „in der Session so gesagt", `accepted` heisst „auf der
 * Abnahme-Seite neben allem anderen des Kapitels gelesen und für gut
 * befunden". Das sind zwei verschiedene Augenblicke: im Gespräch sieht der
 * Mensch EIN Feld, auf der Abnahme-Seite sieht er zehn nebeneinander — und
 * erst dort fällt auf, dass zwei davon dasselbe sagen. Davids Entscheidung
 * vom 2026-09-04 (zweite Fassung; die erste hatte kein Häkchen je Zeile).
 *
 * ── EIN GEÄNDERTER WERT VERLIERT DIE ABNAHME AUTOMATISCH ──────────────────
 * Und zwar durch den SERVER (Autosave-PATCH, Sammel-Session, Generator), nie
 * durch die Oberfläche. Sonst hinge der wichtigste Satz des Kapitels an einer
 * Zeile Markup, die beim nächsten Umbau verschwindet.
 *
 * ── 409, NICHT 400, WENN NICHTS BESTÄTIGT IST ─────────────────────────────
 * `not_confirmed` ist kein kaputter Rumpf, sondern ein KONFLIKT mit dem
 * Serverstand: der Mensch sah eine Zeile mit Wert, inzwischen ist die
 * Bestätigung weg. Dieselbe Familie wie `revision_conflict` — die Oberfläche
 * lädt neu, statt einen Eingabefehler zu melden, den niemand gemacht hat.
 */
export default defineEventHandler(async (event): Promise<BrandSessionAcceptResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const body = await readValidatedBody(event, createBrandSessionAcceptSchema().parse)

  return writeBrandSessionFlag(event, context, body.revision, slotId => ({ kind: 'acceptSlot', slotId }))
})
