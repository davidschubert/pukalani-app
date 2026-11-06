import { BRAND_INSPIRATION_MAX } from '../../../../../../shared/brandInspiration'
import { brandReadingState, parseBrandReadingSlotValue } from '../../../../../../shared/brandReading'
import type { BrandInspirationListResponse } from '../../../../../../shared/types/brand'
import { BRAND_READING_SLOT_ID } from '../../../../../utils/brandInspirationReading'
import {
  BRAND_INSPIRATION_STEP_KEY,
  listBrandInspiration,
  requireBrandInspirationContext,
} from '../../../../../utils/brandInspirationStore'
import { brandSlotStoredValue, parseSlotRecords } from '../../../../../utils/brandStore'

/**
 * DIE VORBILDER DIESER MARKE — Bereich, Notiz und Nummer, KEIN Bild
 * (Konzept docs/archiv/BRAND-DESIGN.md §2.2, Paket D2a).
 *
 * Das Bild holt die Werkstatt je Karte über `…/inspiration/:id/image`; eine
 * Liste, die Bild-Bytes trägt, wäre bei zwölf Screenshots ein Vielfaches der
 * Seite — und eine Liste mit Bucket-ADRESSEN wäre das Leck, gegen das die
 * eigene Ausliefer-Route geschrieben ist (§2.13).
 *
 * Die drei Schranken stehen in `requireBrandInspirationContext` (Zugang,
 * Besitz, Kapitel auf dem Weg) und antworten alle mit 404.
 *
 * ── SEIT D2b TRÄGT SIE AUCH DIE LESUNG ────────────────────────────────────
 * Je Bild seine Lesung (aus derselben Zeile, `reading`), dazu der Zustand des
 * Kapitels-Abschnitts (`none`/`stale`/`read`) und das FAZIT. Das Fazit steht
 * nicht in der Tabelle, sondern im Slot-Wert von `g.reading` — die Werkstatt
 * bekäme es sonst nur direkt nach einem Lauf und nach einem Seitenaufbau nie
 * wieder. Gelesen wird es über dieselbe pure Regel, die es geschrieben hat
 * (`parseBrandReadingSlotValue`); ein von Hand bearbeiteter oder formfremder
 * Wert ergibt `null`, und dann zeigt die Werkstatt kein Fazit statt eines
 * falschen.
 */
export default defineEventHandler(async (event): Promise<BrandInspirationListResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandInspirationContext(event, userId, betaAccount)
  const items = await listBrandInspiration(event, profile.$id)

  const dnaRow = stepRows.find(row => row.stepKey === BRAND_INSPIRATION_STEP_KEY)
  const slotValue = dnaRow
    ? brandSlotStoredValue(parseSlotRecords(dnaRow.slots)[BRAND_READING_SLOT_ID])
    : ''
  const view = parseBrandReadingSlotValue(slotValue)

  return {
    items,
    max: BRAND_INSPIRATION_MAX,
    reading: {
      state: brandReadingState(items),
      summary: { keeps: [...(view?.keeps ?? [])], improves: [...(view?.improves ?? [])] },
      runLine: view?.runLine ?? '',
    },
  }
})
