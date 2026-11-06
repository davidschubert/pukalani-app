import { createBrandWaitlistNoteSchema } from '../../../../../../schemas/brandWaitlist'
import type { BrandWaitlistNoteResponse } from '../../../../../../shared/types/brand'
import { BRAND_WAITLIST_TABLE, brandDb } from '../../../../../utils/brandStore'
import {
  brandWaitlistUnavailable,
  loadBrandWaitlistRow,
  requireBrandWaitlistId,
  requireBrandWaitlistOperator,
} from '../../../../../utils/brandWaitlistAdmin'

/**
 * BETREIBER: DIE NOTIZ ZU EINER ZEILE (`users.manage`).
 *
 * `brand_waitlist.note` gehört dem Betreiber und niemandem sonst — deshalb
 * schreibt KEINE andere Route hinein: die Einladung stempelt nur `status`, das
 * öffentliche Formular fasst eine bestehende Zeile ohnehin nicht an (es
 * erneuert bei einer unbestätigten nur den Token). Eine automatisch gesetzte
 * Notiz („Code am 5.9. verschickt") wäre eine zweite Wahrheit neben dem Status
 * und stünde irgendwann im Weg, wenn jemand etwas Eigenes hinschreiben will.
 *
 * Ein leerer String ist ein gültiger Wert: „Notiz löschen" ist eine Handlung
 * und braucht keinen zweiten Endpunkt. Der Deckel (500) ist die Spaltengröße
 * aus brand-012 — er steht im Schema, damit ein 400 aus der Validierung kommt
 * und nicht als Appwrite-Fehler aus der Ablage.
 *
 * ZUERST LADEN, DANN SCHREIBEN: ohne das Laden wäre eine unbekannte Id ein 404
 * aus der Appwrite-Schicht, dessen Text niemand kontrolliert.
 */
export default defineEventHandler(async (event): Promise<BrandWaitlistNoteResponse> => {
  requireBrandWaitlistOperator(event)
  const id = requireBrandWaitlistId(event)
  const body = await readValidatedBody(event, createBrandWaitlistNoteSchema().parse)

  const row = await loadBrandWaitlistRow(event, id)

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_WAITLIST_TABLE,
      rowId: row.$id,
      data: { note: body.note },
    })
  }
  catch (error) {
    throw brandWaitlistUnavailable(error, { rowId: row.$id, stage: 'note' })
  }

  return { ok: true }
})
