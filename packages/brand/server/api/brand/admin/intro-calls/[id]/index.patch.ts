import { createBrandIntroPatchSchema } from '../../../../../../schemas/brandIntroCall'
import type { BrandIntroPatchResponse } from '../../../../../../shared/types/brand'
import {
  brandIntroUnavailable,
  loadBrandIntroRow,
  requireBrandIntroId,
  requireBrandIntroOperator,
  toBrandIntroRequestItem,
} from '../../../../../utils/brandIntroCall'
import { BRAND_INTRO_REQUESTS_TABLE, type BrandIntroRequestRow, brandDb } from '../../../../../utils/brandStore'

/**
 * BETREIBER: ZUSTAND ODER NOTIZ EINER ANFRAGE ÄNDERN (`users.manage`, BS1 Z0).
 *
 * EINE Route für beides, weil es dieselbe Zeile und dieselbe Berechtigung ist
 * — anders als bei der Warteliste, wo „einladen" und „ablehnen" eigene Routen
 * haben: dort löst die Aktion etwas AUS (ein Code, eine Mail). Hier ändert sie
 * nur, was der Betreiber über seinen eigenen Arbeitsstand notiert. Eine Route,
 * die nichts auslöst, braucht keinen eigenen Namen je Wert.
 *
 * ── FEHLENDE FELDER WERDEN NICHT ANGEFASST ────────────────────────────────
 * Das Schema verlangt MINDESTENS eins von beiden und lässt jedes einzeln zu
 * (Begründung dort). Hier wird daraus ein Patch-Objekt gebaut, das nur die
 * gesetzten Schlüssel trägt — ein `status: undefined` an Appwrite wäre je nach
 * SDK-Version entweder ein Fehler oder ein stilles Leeren der Spalte.
 *
 * ── DIE ANTWORT TRÄGT DIE GANZE ZEILE ─────────────────────────────────────
 * Damit die Liste nicht neu laden muss und — wichtiger — damit sie den ECHTEN
 * Stand zeigt und nicht den, den der Browser gerade geschickt hat. Was
 * zurückkommt, ist gelesen, nicht angenommen.
 */
export default defineEventHandler(async (event): Promise<BrandIntroPatchResponse> => {
  requireBrandIntroOperator(event)

  const id = requireBrandIntroId(event)
  const body = await readValidatedBody(event, createBrandIntroPatchSchema().parse)

  // Erst nachsehen: ein 404 auf eine unbekannte Id ist eine bessere Auskunft
  // als ein 503 aus einem fehlgeschlagenen Update (s. `loadBrandIntroRow`).
  await loadBrandIntroRow(event, id)

  const data: Record<string, string> = {}
  if (body.status !== undefined) data.status = body.status
  if (body.note !== undefined) data.note = body.note

  try {
    const { tablesDB, databaseId } = brandDb(event)
    const row = await tablesDB.updateRow<BrandIntroRequestRow>({
      databaseId,
      tableId: BRAND_INTRO_REQUESTS_TABLE,
      rowId: id,
      data,
    })
    return { ok: true, item: toBrandIntroRequestItem(row) }
  }
  catch (error) {
    throw brandIntroUnavailable(error, { rowId: id })
  }
})
