import { mergeBrandSlotFacts } from '../../../../../../../../../shared/brandJourney'
import type { BrandSessionImpactResponse } from '../../../../../../../../../shared/types/brand'
import { requireSessionParam } from '../../../../../../../../utils/brandAcceptance'
import { brandCorrectionImpactView } from '../../../../../../../../utils/brandCorrection'
import { loadBrandStepContext, toStepFacts } from '../../../../../../../../utils/brandStore'

/**
 * WAS DIE KORREKTUR DIESES FELDES BERÜHRT (BW2 Paket 6, Plan §9 Schritt 1) —
 * OHNE KI, ohne einen einzigen Schreibvorgang.
 *
 * ── DIE UMKEHRUNG IST EINE RECHNUNG, KEINE LISTE ─────────────────────────
 * `confirmedDependents` läuft über dieselbe Registry, die auch sagt, woraus
 * eine Session schöpft. Eine gepflegte Liste „was hängt an a.pitch" wäre am
 * Tag ihrer zweiten Änderung falsch — und der Mensch bekäme eine Warnung, die
 * nicht stimmt, oder gar keine.
 *
 * ── WARUM DER BROWSER SIE TROTZDEM ABHOLT ────────────────────────────────
 * Er könnte sie selbst rechnen (die Funktion ist pur und liegt im Bündel) —
 * aber nur über die Felder, die er kennt: die Werkstatt lädt EIN Kapitel, die
 * Hülle von `a.customerPraise` liegt in sieben. Und den ACK kann er gar nicht
 * rechnen: er ist sha256 und die Durchsetzung des 409 (`impact_unacknowledged`
 * im Autosave-PATCH). Ein Layer, dessen Zustimmung der Server nicht prüft,
 * wäre Theater.
 *
 * ── LEERE HÜLLE IST EINE GÜLTIGE ANTWORT ─────────────────────────────────
 * `count: 0` heisst „korrigiere ruhig, hier hängt nichts dran" — die
 * Oberfläche springt dann sofort ins Feld, wie vor Paket 6. Rund die Hälfte
 * der 68 Sessions ist so (Anhang A, Spalte „berührt": `a.challenge`,
 * `f.decision`, alle `ep.*`).
 *
 * ── OHNE BESTÄTIGTEN WERT WIRD NICHTS KORRIGIERT ─────────────────────────
 * Die Route antwortet trotzdem — sie ist ein LESER. Ob überhaupt korrigiert
 * wird, entscheidet der PATCH (nur ein bestätigter Slot, der `confirmed:
 * false` bekommt, braucht ein Ack); eine zweite Bedingung hier hiesse, dass
 * zwei Stellen wissen müssen, was eine Korrektur ist.
 */
export default defineEventHandler(async (event): Promise<BrandSessionImpactResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { stepKey, stepRow, stepRows } = await loadBrandStepContext(event, userId, betaAccount)
  const session = requireSessionParam(event, stepKey)

  // Über ALLE Kapitel: eine Session liest ausdrücklich über Kapitelgrenzen,
  // also hängt auch ihre Hülle über Kapitelgrenzen (`mergeBrandSlotFacts`).
  const allFacts = mergeBrandSlotFacts(toStepFacts(stepRows))

  return brandCorrectionImpactView(session.id, stepKey, stepRow.revision ?? 0, allFacts)
})
