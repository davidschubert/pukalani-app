import { createBrandStepAcceptAllSchema } from '../../../../../../../schemas/brandStep'
import type { BrandStepAcceptAllResponse } from '../../../../../../../shared/types/brand'
import { loadBrandAcceptanceContext } from '../../../../../../utils/brandAcceptance'
import { acceptAllBrandSessions } from '../../../../../../utils/brandSessionWrite'

/**
 * ALLE ABNEHMEN — der Sammel-Haken der Finalen Abnahme (Davids Befund 10,
 * 2026-09-09).
 *
 * ── DER ANLASS ────────────────────────────────────────────────────────────
 * Im Kailua-Durchlauf standen elf bestätigte Felder auf „Noch nicht
 * abgenommen", und die Weiche „Passt dieses Kapitel?" erschien erst nach elf
 * Einzelklicks. Bestätigen und Abnehmen sind zwei Augenblicke (s.
 * `accept.post.ts`) — aber wer die Seite ganz gelesen hat, hat sie ALLE
 * gelesen, und dafür braucht es keinen Klick je Zeile.
 *
 * ── EINE ROUTE STATT ELF AUFRUFE ─────────────────────────────────────────
 * Jede Einzel-Abnahme dreht die `revision` weiter; elf Client-Aufrufe wären
 * elf abhängige Roundtrips auf DIESELBE Zeile, mit einem halb abgenommenen
 * Kapitel als Ergebnis, sobald einer davon 409 sagt. Autorisierung
 * (`requireBrandAccess` + `loadBrandAcceptanceContext`), Revisions-Prüfung und
 * Zustandsmaschine sind wörtlich die der Einzel-Route — dieselbe Tür, nur ein
 * Durchgang.
 *
 * ── TEILERFOLG IST ERLAUBT, TEIL-SCHREIBUNG NICHT ────────────────────────
 * Was nicht abgenommen werden kann (unbestätigt, weil ein zweiter Tab
 * korrigiert hat), steht in `failed` — der Rest gilt trotzdem. Geschrieben
 * wird dabei genau EINMAL: entweder die Zeile steht mit allen Häkchen oder
 * mit keinem.
 */
export default defineEventHandler(async (event): Promise<BrandStepAcceptAllResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandAcceptanceContext(event, userId, betaAccount)
  const body = await readValidatedBody(event, createBrandStepAcceptAllSchema().parse)

  return acceptAllBrandSessions(event, context, body.revision)
})
