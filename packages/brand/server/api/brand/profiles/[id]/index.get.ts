import { resolveBrandJourney } from '../../../../../shared/brandJourney'
import type { BrandProfileDetailResponse, BrandStepSummary } from '../../../../../shared/types/brand'
import {
  activeShareProfileIds,
  loadOwnedProfile,
  loadStepRows,
  profileFacts,
  requireProfileIdParam,
  toBrandStepKey,
  toProfileSummary,
  toStepFacts,
  toStepSummary,
  toStoryView,
} from '../../../../utils/brandStore'

/**
 * EIN BRANDING ÖFFNEN — Kopf, Zustandsmaschine und die Kurzform aller
 * Bausteine in EINER Antwort.
 *
 * ── DIE JOURNEY WIRD GERECHNET, NICHT GELESEN ─────────────────────────────
 * `resolveBrandJourney` legt die Weichen des Profils über die gespeicherten
 * Zustände. Der SERVER liefert das Ergebnis mit, statt es dem Client zu
 * überlassen: die UI erzwingt nichts allein (§3e), und wenn beide Seiten
 * dieselbe Rechnung anstellen sollen, muss die Serverfassung die sein, die
 * angezeigt wird — sonst sieht der Mensch ein offenes Kapitel, das die Route
 * danach mit 403 abweist.
 *
 * ── `storedState` NEBEN `journey` IST ABSICHT ─────────────────────────────
 * In der Kurzform steht der GESPEICHERTE Zustand (vier Werte), in der Journey
 * der GELTENDE (fünf, inklusive `skipped`). Beides zu zeigen kostet nichts und
 * macht den Unterschied sichtbar, um den es geht: eine übersprungene Zeile
 * behält ihre Daten und ihren Stand.
 */
export default defineEventHandler(async (event): Promise<BrandProfileDetailResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const stepRows = await loadStepRows(event, profileId)
  const journey = resolveBrandJourney(profileFacts(profile, betaAccount), toStepFacts(stepRows))
  const shared = await activeShareProfileIds(event, [profileId])

  const steps: BrandStepSummary[] = []
  for (const row of stepRows) {
    const stepKey = toBrandStepKey(row.stepKey)
    // Eine Zeile mit unbekanntem stepKey (Katalog-Rückbau) wird ÜBERGANGEN,
    // nicht gelöscht und nicht geraten — sie gehört keinem Baustein mehr an,
    // bleibt aber liegen (Migrationsvertrag).
    if (stepKey) steps.push(toStepSummary(row, stepKey))
  }

  return {
    profile: toProfileSummary(profile, shared.has(profileId), betaAccount),
    story: toStoryView(profile),
    journey: [...journey],
    steps,
  }
})
