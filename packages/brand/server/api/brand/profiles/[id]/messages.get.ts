import { Query } from 'node-appwrite'
import { createBrandMessagesQuerySchema } from '../../../../../schemas/brandAccess'
import { swapBrandChoiceValueLine } from '../../../../../shared/brandChoiceOptions'
import type { BrandMessageView, BrandMessagesResponse } from '../../../../../shared/types/brand'
import {
  BRAND_MESSAGES_TABLE,
  type BrandMessageRow,
  brandDb,
  isAppwriteNotFound,
  loadOwnedProfile,
  loadStepRow,
  requireProfileIdParam,
  toBrandStepKey,
} from '../../../../utils/brandStore'

/**
 * DER GESPRÄCHSVERLAUF — dauerhaft, cursor-paginiert (Schema-Anhang §3).
 *
 * ── WARUM CURSOR UND NICHT OFFSET ─────────────────────────────────────────
 * Der Verlauf WÄCHST, während man ihn liest (George antwortet weiter). Ein
 * Offset verschiebt sich dabei: Seite 2 zeigte Nachrichten, die schon auf Seite
 * 1 standen, und liesse andere aus. Ein Cursor auf `$id` zeigt immer auf
 * dieselbe Stelle im Strom.
 *
 * ── EIN ELEMENT MEHR HOLEN ALS AUSGEBEN ───────────────────────────────────
 * `hasMore` aus „so viele wie das Limit" abzuleiten wäre am Rand falsch: bei
 * genau 50 Nachrichten stünde dort dauerhaft „es gibt mehr", und der Client
 * fragte ewig eine leere Seite nach. Ein Element Vorlauf beantwortet die Frage
 * exakt und kostet eine Zeile.
 *
 * ── ZWEI FILTER, ZWEI FRAGEN (brand-011) ──────────────────────────────────
 * `?stepKey=` schneidet auf ein Kapitel, `?session=` zusätzlich auf EINE
 * Session. Ohne beides kommt der ganze Verlauf des Brandings — die Form, die
 * der Wiedereinstieg und der GDPR-Export brauchen.
 *
 * ── DAUERHAFT HEISST DAUERHAFT ────────────────────────────────────────────
 * Kein Verfallsdatum (Davids Entscheidung 2026-08-27: echter Wiedereinstieg mit
 * Kontext). Weg ist der Verlauf nur mit dem Branding — über die Löschkaskade
 * oder den GDPR-Contributor.
 */
export default defineEventHandler(async (event): Promise<BrandMessagesResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const query = await getValidatedQuery(event, createBrandMessagesQuerySchema().parse)
  // Ein unbekannter Baustein-Schlüssel wird ABGEWIESEN, nicht ignoriert: sonst
  // liefert ein Tippfehler den ganzen Verlauf statt einer leeren Antwort, und
  // der Aufrufer merkt es nie.
  const stepKey = query.stepKey === undefined ? null : toBrandStepKey(query.stepKey)
  if (query.stepKey !== undefined && !stepKey) {
    throw createError({ status: 400, statusText: 'Unknown step', data: { code: 'unknown_step' } })
  }

  /**
   * DER VERLAUFS-SCHNITT nach „Nochmal von vorn" (brand-013, §5a).
   *
   * Die Nachrichten bleiben stehen (Retention brand-003: dauerhaft) — was
   * verschwindet, ist ihre SICHTBARKEIT im neu begonnenen Kapitel. Der Mensch
   * sähe sonst auf der Seite genau das Gespräch, das er gerade verworfen hat,
   * während George es nicht mehr kennt: zwei Wahrheiten über denselben Faden.
   *
   * NUR MIT `?stepKey=`: `restartedAt` gehört EINER Kapitel-Zeile, und der
   * ganze Verlauf eines Brandings (Wiedereinstieg, GDPR-Export) darf davon
   * nichts verlieren. Ein zusätzlicher Lesevorgang, und zwar nur dann.
   */
  const restartedAt = stepKey
    ? (await loadStepRow(event, profileId, stepKey))?.restartedAt ?? null
    : null

  const { tablesDB, databaseId } = brandDb(event)
  let rows: BrandMessageRow[] = []
  try {
    const res = await tablesDB.listRows<BrandMessageRow>({
      databaseId,
      tableId: BRAND_MESSAGES_TABLE,
      queries: [
        Query.equal('profileId', profileId),
        ...(query.stepKey ? [Query.equal('stepKey', query.stepKey)] : []),
        // Der Session-Filter ist EXAKT — ohne die Bestands-Regel des
        // Prompt-Fensters (`sessionKeyValues`): dort geht es um Georges
        // Gedächtnis, hier um das, was der Mensch gerade angeklickt hat. Eine
        // Leseansicht, die stillschweigend fremde Züge dazulegte, wäre ein
        // Verlauf, den niemand mehr zuordnen kann.
        ...(query.session ? [Query.equal('sessionKey', query.session)] : []),
        ...(restartedAt ? [Query.greaterThan('$createdAt', restartedAt)] : []),
        Query.orderAsc('$id'),
        Query.limit(query.limit + 1),
        ...(query.cursor ? [Query.cursorAfter(query.cursor)] : []),
      ],
    })
    rows = res.rows
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand messages could not be loaded')
  }

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows

  const messages: BrandMessageView[] = page.map(row => ({
    id: row.$id,
    stepKey: row.stepKey,
    // '' = Kapitel-Verlauf von vor BW2 (brand-011) — ein Wert, keine Lücke.
    sessionKey: row.sessionKey ?? '',
    role: row.role === 'user' || row.role === 'system' ? row.role : 'george',
    /**
     * DIE LESEFASSSUNG STATT DER ROHEN ID (D9, offener Punkt aus D8).
     *
     * Ein Karten-Klick speichert den STABILEN Wert (`snappy`, `yes`, `word`) —
     * so muss es sein, die Ids sind sprachneutral und dürfen nie übersetzt in
     * der Ablage stehen. Der Berater tauscht sie vor dem Persistieren
     * (`swapBrandChoiceValueLine` in `advisorGenerator.ts`); der Zug des
     * MENSCHEN lief bisher an diesem Tausch vorbei, und nach dem Neuladen stand
     * im Verlauf wörtlich „snappy". Der Tausch gehört deshalb zusätzlich in den
     * LESE-Pfad: er ist idempotent (eine Anzeige-Fassung ist selbst ein
     * gültiger Katalog-Treffer) und lässt Prosa unangetastet.
     *
     * Die Sprache ist die INHALTSSPRACHE der Marke, nicht die des Lesers: der
     * Verlauf ist das Gespräch, das in dieser Sprache geführt wurde.
     */
    body: swapBrandChoiceValueLine(row.sessionKey ?? '', row.body, profile.contentLocale),
    // `parts` ist strukturiertes JSON (Chips, Karten, Paar-Referenzen). Kaputte
    // Zeilen geben `null` statt eine Ausnahme — eine unlesbare Beilage darf
    // nicht den ganzen Verlauf kosten.
    parts: parseParts(row.parts),
    generationId: row.generationId ?? null,
    createdAt: row.$createdAt,
  }))

  return {
    messages,
    cursor: hasMore ? page.at(-1)?.$id ?? null : null,
    hasMore,
  }
})

function parseParts(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}
