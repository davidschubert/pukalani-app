import { z } from 'zod'
import { slotById } from '../../../../../../../shared/slotRegistry'
import type { BrandGenerationVersionsResponse } from '../../../../../../../shared/types/brand'
import {
  brandSlotStoredValue,
  loadBrandStepContext,
  parseGenerations,
  parseSlotRecords,
} from '../../../../../../utils/brandStore'

/**
 * FRÜHERE FASSUNGEN EINES SLOTS — die einzige Route, die
 * Generations-INHALTE herausgibt.
 *
 * ── WARUM SIE ÜBERHAUPT GETRENNT IST ──────────────────────────────────────
 * Die Baustein-Detailantwort trägt dieselben Einträge OHNE `draft`
 * (`stripBrandGenerationDrafts`) — sie beantwortet „wie kam das zustande?".
 * Diese hier beantwortet „was stand da vorher?" und wird nur geöffnet, wenn
 * jemand danach fragt. Die Trennung ist kein Datenschutz (beides gehört
 * demselben Konto), sondern Sparsamkeit: die Werkstatt lädt sonst bei jedem
 * Baustein-Wechsel bis zu zehn alte Fassungen mit, die niemand ansieht.
 *
 * ── DIE ERSTE FASSUNG HAT KEINEN GENERATIONS-EINTRAG ──────────────────────
 * `firstDraft` steht im SLOT, nicht in der Historie — er kann von George
 * stammen oder vom Menschen (Versions-Vertrag, Schema-Anhang §2). Er reist
 * deshalb als eigenes Feld und nicht als elfter Eintrag: ein erfundener
 * Generations-Eintrag müsste Modell und Zeitpunkt behaupten, die es nie gab.
 *
 * ── GATES WIE IMMER ───────────────────────────────────────────────────────
 * `requireBrandAccess` → Profil + `assertBrandOwnerAccess` → `canEnterBrandStep`
 * (alles in `loadBrandStepContext`) → der Slot muss zu DIESEM Baustein gehören.
 * Ein Slot-Parameter aus einem fremden Baustein wird abgewiesen, nicht
 * ignoriert: sonst lieferte ein Tippfehler eine leere Liste, und der Aufrufer
 * hielte sie für „es gab nie eine Fassung".
 */

const querySchema = z.object({
  slotId: z.string().min(1).max(64),
})

export default defineEventHandler(async (event): Promise<BrandGenerationVersionsResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { stepKey, stepRow } = await loadBrandStepContext(event, userId, betaAccount)

  const query = await getValidatedQuery(event, querySchema.parse)

  // DEAKTIVIERTE Slots sind hier ausdrücklich erlaubt: ihre Bestandsdaten
  // müssen lesbar bleiben (Migrationsvertrag) — geschrieben werden dürfen sie
  // trotzdem nicht, das verhindert das Autosave-Schema.
  const slot = slotById(query.slotId)
  if (!slot || slot.stepId !== stepKey) {
    throw createError({ status: 400, statusText: 'Unknown slot', data: { code: 'unknown_slot' } })
  }

  const generations = parseGenerations(stepRow.generations)
  const items = generations.items.filter(item => item.slotId === slot.id)
  const record = parseSlotRecords(stepRow.slots)[slot.id]

  return {
    slotId: slot.id,
    // Jüngste zuerst — so liest man eine Historie, und so steht sie in der Liste.
    items: [...items].reverse(),
    // Die Gesamtzahl bleibt die des BAUSTEINS: sie sagt, wie oft hier generiert
    // wurde, und lässt sich nicht je Slot rekonstruieren (herausgefallene
    // Einträge tragen keinen Slot mehr).
    count: generations.count,
    firstDraft: record?.firstDraft ?? null,
    latestDraft: brandSlotStoredValue(record) || null,
  }
})
