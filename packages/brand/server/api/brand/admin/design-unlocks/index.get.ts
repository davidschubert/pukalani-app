import { createBrandDesignUnlockListQuerySchema } from '../../../../../schemas/brandDesignUnlock'
import type { BrandDesignUnlockListResponse } from '../../../../../shared/types/brand'
import {
  listBrandProfilesForOperator,
  loadBrandFoundationDone,
  requireBrandUnlockOperator,
  toBrandDesignUnlockItem,
} from '../../../../utils/brandDesignUnlock'

/**
 * BETREIBER: DIE BRANDINGS MIT IHREM BRAND-DESIGN-ZUSTAND (`users.manage`,
 * Konzept docs/archiv/BRAND-DESIGN.md §2.10, Paket D1).
 *
 * ── ALLE, NICHT NUR DIE FREIGESCHALTETEN ──────────────────────────────────
 * Die Liste ist eine ARBEITSLISTE: sie muss gerade die Marken finden, die noch
 * KEIN Brand Design haben — sonst wäre der Knopf auf einer Seite, die man nur
 * erreicht, wenn man ihn schon gedrückt hat. Deshalb kein Filter und kein
 * Index (s. Kopf von brand-022).
 *
 * ── EIN NACHSCHLAG FÜR DIE GANZE SEITE ────────────────────────────────────
 * „Ist die Foundation fertig?" steht nicht am Profil, sondern in der
 * `result`-Zeile von `brand_steps`. Sie wird für die ganze Seite in EINER
 * Abfrage geholt (`loadBrandFoundationDone`) — eine Liste mit fünfzig Marken
 * darf nicht fünfzig Fragen stellen. Fail-soft: geht sie schief, ist jeder
 * Knopf AUS, und das ist die sichere Richtung.
 *
 * ── WAS NICHT MITREIST ────────────────────────────────────────────────────
 * Kein Slot, kein Snapshot, kein Story-Text. Der Betreiber entscheidet hier
 * über einen ZUGANG, er liest keine fremde Markenarbeit — und was eine Route
 * nicht ausliefert, kann auch nicht versehentlich in einer Tabellenzeile
 * landen.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT `users.manage`
 * (dieselbe Begründung wie bei den Nachbar-Betreiberrouten).
 */
export default defineEventHandler(async (event): Promise<BrandDesignUnlockListResponse> => {
  requireBrandUnlockOperator(event)

  const query = await getValidatedQuery(event, createBrandDesignUnlockListQuerySchema().parse)
  const { rows, total } = await listBrandProfilesForOperator(event, {
    limit: query.limit,
    cursor: query.cursor,
  })

  const foundationDone = await loadBrandFoundationDone(event, rows.map(row => row.$id))

  return {
    items: rows.map(row => toBrandDesignUnlockItem(row, foundationDone.has(row.$id))),
    total,
    // Eine volle Seite KANN die letzte sein — dann liefert der nächste Aufruf
    // eine leere Liste. Billiger als eine Zähl-Abfrage je Seite und für den
    // Leser folgenlos (dieselbe Regel wie bei Warteliste und Galerie).
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
  }
})
