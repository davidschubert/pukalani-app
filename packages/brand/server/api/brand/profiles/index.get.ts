import { Query } from 'node-appwrite'
import type { BrandProfileListResponse } from '../../../../shared/types/brand'
import {
  BRAND_PROFILES_TABLE,
  type BrandProfileRow,
  activeShareProfileIds,
  brandDb,
  isAppwriteNotFound,
  toProfileSummary,
} from '../../../utils/brandStore'

/**
 * „MEINE BRANDINGS" — die Startfläche nach dem Login (Plan §6).
 *
 * ── DIE GRENZE STEHT IN DER ABFRAGE, NICHT IM CODE DANACH ─────────────────
 * `ownerType: 'user'` + `ownerId: <Session-Konto>` — es kommen gar keine
 * fremden Zeilen zurück, die man danach noch aussortieren müsste. Der
 * `community`-Zweig ist Phase 2 und wird hier bewusst NICHT mitgelesen: eine
 * Liste, die schon Zeilen holt, für die es noch keine Berechtigungs-Auflösung
 * gibt, wäre eine Grenze, die auf ein späteres `if` wartet.
 *
 * ── 50 IST EINE ENTSCHEIDUNG, KEIN VERGESSENES LIMIT ──────────────────────
 * Mehrere Profile je Konto sind Erste Klasse (Davids eigene Marke +
 * Kundenmarken + Produktmarken), aber die Übersicht ist eine Kartenwand und
 * keine Datenbank-Ansicht. Wer je über 50 kommt, braucht Suche und Ordner —
 * eine stille Erhöhung wäre die schlechtere Antwort darauf.
 */
export default defineEventHandler(async (event): Promise<BrandProfileListResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { tablesDB, databaseId } = brandDb(event)

  let rows: BrandProfileRow[] = []
  try {
    const res = await tablesDB.listRows<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      queries: [
        Query.equal('ownerType', 'user'),
        Query.equal('ownerId', userId),
        // Zuletzt angefasst zuerst — die Karte, an der jemand gerade arbeitet,
        // steht oben. `lastActivityAt` ist genau dafür da (Schema-Anhang §1).
        Query.orderDesc('lastActivityAt'),
        Query.limit(50),
      ],
    })
    rows = res.rows
  }
  catch (error) {
    // Vor der brand-Migration gibt es die Tabelle nicht. Eine leere Liste ist
    // dann die WAHRE Antwort — dieses Konto hat keine Brandings.
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profiles could not be loaded')
  }

  const shared = await activeShareProfileIds(event, rows.map(row => row.$id))

  return { profiles: rows.map(row => toProfileSummary(row, shared.has(row.$id), betaAccount)) }
})
