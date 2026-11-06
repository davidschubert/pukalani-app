import type { BrandDesignUnlockResponse } from '../../../../../../shared/types/brand'
import {
  brandDesignUnlockUnavailable,
  brandFoundationIsComplete,
  loadBrandProfileForOperator,
  requireBrandUnlockOperator,
  requireBrandUnlockProfileId,
  toBrandDesignUnlockItem,
} from '../../../../../utils/brandDesignUnlock'
import { BRAND_PROFILES_TABLE, brandDb, type BrandProfileRow } from '../../../../../utils/brandStore'
import { recordBrandEvent } from '../../../../../utils/brandEvents'

/**
 * BETREIBER: DIE FREISCHALTUNG ZURÜCKNEHMEN (`users.manage`, Konzept
 * docs/archiv/BRAND-DESIGN.md §2.10, Paket D1).
 *
 * ── SIE LÖSCHT NICHTS ─────────────────────────────────────────────────────
 * Geleert werden die zwei Spalten, mehr nicht. Die sechs `brand_steps`-Zeilen
 * bleiben mit ihren Slots liegen — dieselbe Regel wie bei der Weiche (§3e:
 * „entfallene Daten werden INAKTIV, nie gelöscht"). Wer wieder freischaltet,
 * findet den Stand vor. Wirksam ist die Rücknahme trotzdem sofort: die Journey
 * prüft die Sperre VOR dem gespeicherten `done`, ein halbfertiges Kapitel steht
 * also im nächsten Aufruf wieder hinter der Schranke.
 *
 * ── BEIDE SPALTEN, IMMER ZUSAMMEN ─────────────────────────────────────────
 * Ein `designUnlockedBy` ohne `designUnlockedAt` wäre die Behauptung einer
 * Freischaltung, die es nicht mehr gibt — und stünde in der Betreiber-Liste
 * als „von …" neben einem leeren Datum.
 *
 * Eine bereits gesperrte Marke ist kein Fehler: die Route antwortet mit der
 * unveränderten Zeile und schreibt kein zweites Ereignis (dieselbe Regel wie
 * beim zweiten Klick auf „freischalten").
 */
export default defineEventHandler(async (event): Promise<BrandDesignUnlockResponse> => {
  const operator = requireBrandUnlockOperator(event)
  const profileId = requireBrandUnlockProfileId(event)
  const profile = await loadBrandProfileForOperator(event, profileId)

  const foundationDone = await brandFoundationIsComplete(event, profile)

  if (!profile.designUnlockedAt) {
    return { ok: true, item: toBrandDesignUnlockItem(profile, foundationDone) }
  }

  const { tablesDB, databaseId } = brandDb(event)
  let updated: BrandProfileRow
  try {
    updated = await tablesDB.updateRow<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      rowId: profileId,
      data: { designUnlockedAt: null, designUnlockedBy: null },
    })
  }
  catch (error) {
    throw brandDesignUnlockUnavailable(error, { profileId, stage: 'lock' })
  }

  // Kennzahlen, kein Inhalt (Regel 1 im Kopf von `brandEvents.ts`). `days`
  // beantwortet die einzige Frage, die eine Rücknahme interessant macht: wie
  // lange war das Produkt offen, bevor es wieder zuging?
  const openedMs = Date.now() - new Date(profile.designUnlockedAt).getTime()
  await recordBrandEvent(event, {
    type: 'design.locked',
    profileId,
    userId: operator.$id,
    payload: { days: Number.isFinite(openedMs) ? Math.max(0, Math.round(openedMs / 86_400_000)) : -1 },
  })

  return { ok: true, item: toBrandDesignUnlockItem(updated, foundationDone) }
})
