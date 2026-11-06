import type { BrandUnlockResponse } from '../../../../../../shared/types/brand'
import {
  brandFoundationIsComplete,
  loadBrandProfileForOperator,
  requireBrandUnlockOperator,
  requireBrandUnlockProfileId,
} from '../../../../../utils/brandDesignUnlock'
import {
  applyBrandDerivationUnlock,
  toBrandUnlockItem,
} from '../../../../../utils/brandDerivationUnlock'
import { loadBrandBetaAccounts } from '../../../../../utils/brandAccess'
import { recordBrandEvent } from '../../../../../utils/brandEvents'

/**
 * BETREIBER: DIE FREISCHALTUNG DER ABLEITUNG ZURÜCKNEHMEN (`users.manage`,
 * Konzept docs/plans/BRAND-BOOK-KIT.md §2.8, Paket K1).
 *
 * ── SIE LÖSCHT NICHTS ────────────────────────────────────────────────────
 * Geleert werden die drei Spalten, mehr nicht. Die drei `brand_steps`-Zeilen
 * bleiben mit ihren Slots liegen — dieselbe Regel wie bei der Weiche (§3e:
 * „entfallene Daten werden INAKTIV, nie gelöscht"). Wer wieder freischaltet,
 * findet den Stand vor. Wirksam ist die Rücknahme trotzdem sofort: die Journey
 * rechnet die Sperre bei jedem Aufruf neu.
 *
 * ── SIE NIMMT EINEM BETA-KONTO NICHTS ────────────────────────────────────
 * Ist der Eigentümer ein Beta-Konto, bleibt die Ableitung nach der Rücknahme
 * OFFEN (`grant: 'beta'`) — die Antwort sagt das, statt eine Sperre zu
 * behaupten, die es nicht gibt. Wer einem Beta-Konto wirklich etwas nehmen
 * will, widerruft den Beta-Zugang (`brand_access`); das ist eine Entscheidung
 * über ein KONTO und gehört nicht an eine Marke.
 *
 * ── ALLE DREI SPALTEN, IMMER ZUSAMMEN ────────────────────────────────────
 * Ein `derivationUnlockedVia` ohne `…At` wäre die Behauptung einer
 * Freischaltung, die es nicht mehr gibt (s. Kopf von brand-025).
 *
 * Eine bereits gesperrte Marke ist kein Fehler: die Route antwortet mit der
 * unveränderten Zeile und schreibt kein zweites Ereignis.
 */
export default defineEventHandler(async (event): Promise<BrandUnlockResponse> => {
  const operator = requireBrandUnlockOperator(event)
  const profileId = requireBrandUnlockProfileId(event)
  const profile = await loadBrandProfileForOperator(event, profileId)

  const foundationDone = await brandFoundationIsComplete(event, profile)
  const beta = await loadBrandBetaAccounts(event, [profile.ownerId])
  const betaAccount = beta.has(profile.ownerId)

  if (!profile.derivationUnlockedAt) {
    return { ok: true, item: toBrandUnlockItem(profile, foundationDone, betaAccount) }
  }

  const updated = await applyBrandDerivationUnlock(event, profileId, null)

  // Kennzahlen, kein Inhalt (Regel 1 im Kopf von `brandEvents.ts`). `days`
  // beantwortet die einzige Frage, die eine Rücknahme interessant macht: wie
  // lange war das Produkt offen? `via` sagt, WAS zurückgenommen wurde — eine
  // Betreiber-Zusage oder ein Kauf (ab BS1 Z1 ist beides möglich, und der
  // Unterschied ist im Zweifel eine Geldfrage).
  const openedMs = Date.now() - new Date(profile.derivationUnlockedAt).getTime()
  await recordBrandEvent(event, {
    type: 'derivation.locked',
    profileId,
    userId: operator.$id,
    payload: {
      via: profile.derivationUnlockedVia === 'purchase' ? 'purchase' : 'operator',
      days: Number.isFinite(openedMs) ? Math.max(0, Math.round(openedMs / 86_400_000)) : -1,
      beta: betaAccount,
    },
  })

  return { ok: true, item: toBrandUnlockItem(updated, foundationDone, betaAccount) }
})
