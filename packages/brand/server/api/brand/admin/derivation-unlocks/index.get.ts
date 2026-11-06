import { createBrandDesignUnlockListQuerySchema } from '../../../../../schemas/brandDesignUnlock'
import type { BrandUnlockListResponse } from '../../../../../shared/types/brand'
import { loadBrandBetaAccounts } from '../../../../utils/brandAccess'
import {
  listBrandProfilesForOperator,
  loadBrandFoundationDone,
  requireBrandUnlockOperator,
} from '../../../../utils/brandDesignUnlock'
import { toBrandUnlockItem } from '../../../../utils/brandDerivationUnlock'

/**
 * BETREIBER: DIE BRANDINGS MIT BEIDEN SCHRANKEN (`users.manage`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.9, Entscheidung §2.20 Nr. 5, Paket K1).
 *
 * ── SIE TRÄGT AUCH DIE DESIGN-SPALTE, UND DAS IST ABSICHT ────────────────
 * Die Betreiber-Seite ist EINE Tabelle mit zwei Spalten („Brand Design" ·
 * „Ableitung", §2.20 Nr. 5). Beide Zustände stehen in DERSELBEN
 * `brand_profiles`-Zeile — eine zweite Abfrage über dieselbe Tabelle wäre
 * derselbe Lesevorgang zweimal, und zwei Listen müssten obendrein Seite für
 * Seite zueinander passen. Die schmale Design-Liste
 * (`/api/brand/admin/design-unlocks`) bleibt unangetastet daneben stehen: sie
 * hat ihren eigenen Beweis (`verify-brand-sessions.mjs`) und ihre eigene
 * Antwortform.
 *
 * ── ALLE, NICHT NUR DIE FREIGESCHALTETEN ────────────────────────────────
 * Die Liste ist eine ARBEITSLISTE: sie muss gerade die Marken finden, die noch
 * KEINE Ableitung haben — sonst wäre der Knopf auf einer Seite, die man nur
 * erreicht, wenn man ihn schon gedrückt hat. Deshalb kein Filter und kein Index
 * (s. Kopf von brand-025).
 *
 * ── ZWEI NACHSCHLÄGE FÜR DIE GANZE SEITE ────────────────────────────────
 * „Ist die Foundation fertig?" steht in `brand_steps`, „ist der EIGENTÜMER ein
 * Beta-Konto?" in `brand_access`. Beides wird für die ganze Seite in je EINER
 * Abfrage geholt — eine Liste mit fünfzig Marken darf nicht hundert Fragen
 * stellen. Beide sind fail-soft in dieselbe Richtung: im Zweifel „nicht so
 * weit" bzw. „kein Beta-Konto", also der Zustand, in dem der Betreiber handeln
 * kann, statt einer behaupteten Freischaltung.
 *
 * ── WAS NICHT MITREIST ──────────────────────────────────────────────────
 * Kein Slot, kein Snapshot, kein Story-Text (wörtlich wie bei der Design-
 * Liste): der Betreiber entscheidet hier über einen ZUGANG, er liest keine
 * fremde Markenarbeit.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT `users.manage`.
 */
export default defineEventHandler(async (event): Promise<BrandUnlockListResponse> => {
  requireBrandUnlockOperator(event)

  const query = await getValidatedQuery(event, createBrandDesignUnlockListQuerySchema().parse)
  const { rows, total } = await listBrandProfilesForOperator(event, {
    limit: query.limit,
    cursor: query.cursor,
  })

  const [foundationDone, beta] = await Promise.all([
    loadBrandFoundationDone(event, rows.map(row => row.$id)),
    loadBrandBetaAccounts(event, rows.map(row => row.ownerId)),
  ])

  return {
    items: rows.map(row => toBrandUnlockItem(
      row,
      foundationDone.has(row.$id),
      beta.has(row.ownerId),
    )),
    total,
    // Eine volle Seite KANN die letzte sein — dann liefert der nächste Aufruf
    // eine leere Liste. Billiger als eine Zähl-Abfrage je Seite und für den
    // Leser folgenlos (dieselbe Regel wie bei Warteliste und Galerie).
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.$id ?? '') : '',
  }
})
