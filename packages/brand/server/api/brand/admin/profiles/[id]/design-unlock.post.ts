import type { BrandDesignUnlockResponse } from '../../../../../../shared/types/brand'
import {
  brandDesignUnlockUnavailable,
  brandFoundationIsComplete,
  ensureBrandDesignStepRows,
  loadBrandProfileForOperator,
  requireBrandUnlockOperator,
  requireBrandUnlockProfileId,
  toBrandDesignUnlockItem,
} from '../../../../../utils/brandDesignUnlock'
import { BRAND_PROFILES_TABLE, brandDb, type BrandProfileRow } from '../../../../../utils/brandStore'
import { recordBrandEvent } from '../../../../../utils/brandEvents'

/**
 * BETREIBER: BRAND DESIGN FÜR EINE MARKE FREISCHALTEN (`users.manage`,
 * Konzept docs/archiv/BRAND-DESIGN.md §2.10, Paket D1).
 *
 * ── DIE HÄLFTE, DIE HIER ENTSCHIEDEN WIRD ─────────────────────────────────
 * Schicht 2 öffnet, wenn (a) die Foundation ihr Ergebnis-Kapitel abgeschlossen
 * hat UND (b) die Marke freigeschaltet ist (§2.1). Diese Route setzt (b). Sie
 * PRÜFT (a) trotzdem und lehnt sonst mit 409 `foundation_incomplete` ab — nicht
 * weil die Journey es bräuchte (die sperrt ohnehin weiter), sondern weil eine
 * Freischaltung, die nichts öffnet, eine Lüge in der Betreiber-Liste wäre:
 * dort stünde „freigeschaltet", während der Kunde weiter vor der Schranke
 * steht. Der Knopf in der Liste ist aus demselben Grund AUS — die Regel steht
 * an beiden Enden.
 *
 * ── ZWEITER KLICK IST KEIN FEHLER ─────────────────────────────────────────
 * Eine bereits freigeschaltete Marke bekommt kein neues Datum und keine zweite
 * Ereignis-Zeile: die Route antwortet mit der unveränderten Zeile. Die Frage
 * lautet „ist offen?", nicht „wie oft wurde geklickt?" — und ein erneuertes
 * Datum machte aus einer Auskunft („seit dem 7. September") eine wandernde
 * Zahl.
 *
 * ── ERST DIE ZEILEN, DANN DER STEMPEL ─────────────────────────────────────
 * `ensureBrandDesignStepRows` legt die sechs `brand_steps`-Zeilen an, falls
 * sie fehlen (Bestandsmarke aus der Zeit vor D0 — Begründung im Kopf von
 * `brandDesignUnlock.ts`). In dieser Reihenfolge, weil die umgekehrte im
 * Fehlerfall eine freigeschaltete Marke ohne Kapitel-Zeilen zurückliesse — der
 * Kunde bekäme dann auf `/brand/:id/dna` einen 404 statt der Schranke. So
 * herum sind im schlimmsten Fall sechs `locked`-Zeilen entstanden, die die
 * Journey ohnehin sperrt; das kostet nichts und heilt der nächste Klick.
 */
export default defineEventHandler(async (event): Promise<BrandDesignUnlockResponse> => {
  const operator = requireBrandUnlockOperator(event)
  const profileId = requireBrandUnlockProfileId(event)
  const profile = await loadBrandProfileForOperator(event, profileId)

  const foundationDone = await brandFoundationIsComplete(event, profile)

  if (profile.designUnlockedAt) {
    return { ok: true, item: toBrandDesignUnlockItem(profile, foundationDone) }
  }

  if (!foundationDone) {
    throw createError({
      status: 409,
      statusText: 'Brand foundation is not complete',
      data: { code: 'foundation_incomplete' },
    })
  }

  const createdRows = await ensureBrandDesignStepRows(event, profileId)

  const unlockedAt = new Date().toISOString()
  const { tablesDB, databaseId } = brandDb(event)
  let updated: BrandProfileRow
  try {
    updated = await tablesDB.updateRow<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      rowId: profileId,
      data: { designUnlockedAt: unlockedAt, designUnlockedBy: operator.$id },
    })
  }
  catch (error) {
    throw brandDesignUnlockUnavailable(error, { profileId, stage: 'unlock' })
  }

  // Kennzahlen, kein Inhalt (Regel 1 im Kopf von `brandEvents.ts`): kein Titel,
  // keine Adresse. `createdRows` erzählt, ob eine Bestandsmarke nachgezogen
  // wurde — genau die Frage, die man nach dem ersten Prod-Lauf stellen wird.
  await recordBrandEvent(event, {
    type: 'design.unlocked',
    profileId,
    userId: operator.$id,
    payload: { createdRows, progressPct: profile.progressPct ?? 0 },
  })

  return { ok: true, item: toBrandDesignUnlockItem(updated, foundationDone) }
})
