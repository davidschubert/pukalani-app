import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import type { BrandProfileRow, BrandStepRow } from './brandStore'
import {
  BRAND_PROFILES_TABLE,
  BRAND_STEPS_TABLE,
  brandDb,
  brandStepRowId,
  isAppwriteNotFound,
} from './brandStore'

/**
 * DAS OPT-IN „MEINE MARKE DARF IM MARKTVERGLEICH ANDERER ERSCHEINEN"
 * (Migration brand-019, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §7.2 Nr. 4).
 *
 * ── WARUM DAS IM brand-LAYER WOHNT UND NICHT IN `market` ──────────────────
 * Die Spalte hängt an `brand_profiles`, und die Tabelle gehört diesem Layer.
 * Der Marktvergleich fragt sie über den Vertrag
 * (`packages/market/server/contracts/brandContract.ts`) an — dieselbe Regel
 * wie bei `loadOwnedProfile`, `findBrandCheckForUrl` und der Slot-Registry.
 * Läse `market` die Tabelle selbst, gäbe es eine zweite Wahrheit über die
 * Frage „wem gehört ein Branding" — genau die Kopplung, die CONCEPT A14
 * ausschliesst.
 *
 * ── DIE SEMANTIK IST DIE DES RANKING-OPT-INS, NICHT EINE ZWEITE ───────────
 * `brand_checks.rankingOptIn` (BRAND-CHECK-SEITE.md §5b/§8) sagt: ohne
 * Häkchen bleibt das Ergebnis privat, jederzeit widerrufbar, und der Widerruf
 * wirkt nach vorn — was schon geteilt wurde, bleibt geteilt. Genau das gilt
 * hier: der Widerruf nimmt die Marke aus jedem KÜNFTIGEN Lauf; ein bereits
 * geschriebener Bericht ist ein Schnappschuss und bleibt lesbar. Davids
 * Leitplanke lautet ausdrücklich „keine zweite Schalter-Semantik".
 *
 * ── WAS EIN FREMDER SEHEN DARF, ENTSCHEIDET NICHT DIESE DATEI ────────────
 * Sie liefert Zeilen. WELCHE FELDER daraus in ein Marktprofil dürfen (nur die
 * zehn Aussen-Felder, nur Slots mit `sensitivity: 'public'`), entscheidet der
 * market-Layer an der Stelle, an der er das Profil baut. Hier steht nur, dass
 * die `ownerId` NIEMALS herausgereicht wird — die Suche gibt Id, Titel und
 * Branche zurück und sonst nichts.
 */

export const BRAND_MARKET_VISIBILITIES = ['private', 'shared'] as const
export type BrandMarketVisibility = (typeof BRAND_MARKET_VISIBILITIES)[number]

/**
 * Der gelesene Wert einer Zeile — FAIL-CLOSED.
 *
 * Eine Zeile von vor brand-019 liest `undefined`, ein unbekannter Wert ist ein
 * Datenfehler: beides heisst `private`. Eine Zustimmung, die niemand gegeben
 * hat, darf nicht durch einen fehlenden Wert entstehen.
 */
export function brandMarketVisibilityOf(row: Pick<BrandProfileRow, 'marketVisibility'>): BrandMarketVisibility {
  return row.marketVisibility === 'shared' ? 'shared' : 'private'
}

/**
 * DAS OPT-IN SETZEN. Der Aufrufer hat den Besitz VORHER belegt
 * (`loadOwnedProfile`) — diese Funktion prüft ihn nicht noch einmal, sie
 * schreibt.
 *
 * NICHT fail-soft: wer ein Häkchen setzt, muss erfahren, ob es gilt. Ein still
 * verworfener Schreibvorgang wäre hier die schlimmste Fehlerart — die
 * Oberfläche zeigte danach eine Freigabe, die es nicht gibt (oder umgekehrt
 * einen Widerruf, der nie ankam).
 */
export async function setBrandProfileMarketVisibility(
  event: H3Event,
  profileId: string,
  visibility: BrandMarketVisibility,
): Promise<BrandProfileRow> {
  const { tablesDB, databaseId } = brandDb(event)
  return await tablesDB.updateRow<BrandProfileRow>({
    databaseId,
    tableId: BRAND_PROFILES_TABLE,
    rowId: profileId,
    data: { marketVisibility: visibility },
  })
}

/**
 * GILT DIE FREIGABE FÜR DIESES EINE BRANDING NOCH? (MV1 M4)
 *
 * ── WARUM DAS EINE FRAGE MIT JA/NEIN IST UND KEINE MIT EINER ZEILE ───────
 * Der Aufrufer ist ein FREMDES Konto — es hat auf diese Zeile keinen
 * Anspruch. Gäbe diese Funktion die Zeile zurück, läge die Entscheidung
 * darüber, was daraus sichtbar wird, beim Aufrufer; so liegt sie hier. Der
 * market-Layer bekommt „ja" oder „nein" und baut das Marktprofil danach über
 * denselben Weg wie für eine eigene Marke — nur eingeschränkt auf öffentliche
 * Felder.
 *
 * FAIL-CLOSED an jeder Kante: unbekanntes Branding, fehlende Tabelle,
 * widerrufene Freigabe, nicht abgenommenes Kapitel ⇒ `false`. Ein `true` darf
 * nur aus zwei ausdrücklichen Tatsachen entstehen.
 */
export async function isBrandProfileSharedForMarket(
  event: H3Event,
  profileId: string,
  requiredStepKey: string,
): Promise<boolean> {
  const { tablesDB, databaseId } = brandDb(event)

  let row: BrandProfileRow
  try {
    row = await tablesDB.getRow<BrandProfileRow>({
      databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId,
    })
  }
  catch {
    return false
  }
  if (brandMarketVisibilityOf(row) !== 'shared') return false

  try {
    const step = await tablesDB.getRow<BrandStepRow>({
      databaseId, tableId: BRAND_STEPS_TABLE, rowId: brandStepRowId(profileId, requiredStepKey),
    })
    return step.state === 'done'
  }
  catch {
    return false
  }
}

/** Ein Treffer der Suche — Id, Titel, Branche. NIE die `ownerId` (s. Kopf). */
export interface BrandSharedProfileHit {
  id: string
  title: string
  /** Die Branche aus der Startkarte — als Zweitzeile im Wähler, sonst leer. */
  industry: string
}

export interface BrandSharedProfileQuery {
  /**
   * Das Kapitel, dessen ABNAHME eine Marke überhaupt vergleichbar macht. Der
   * market-Layer reicht es herein (`pvm`), damit `brand` nicht wissen muss,
   * wovon ein fremdes Produkt seine Freischaltung abhängig macht.
   */
  requiredStepKey: string
  /** Namens-PRÄFIX; leer heisst „die zuletzt bearbeiteten". */
  prefix?: string
  /** Höchstzahl der Treffer. */
  limit: number
  /** Das eigene Konto — seine Brandings gehören in die Quelle „eigene Marke". */
  excludeOwnerId: string
}

/**
 * Wie viele freigegebene Zeilen überhaupt gelesen werden, bevor im Code
 * gefiltert wird.
 *
 * ── WARUM IM CODE GEFILTERT WIRD UND NICHT IN DER ABFRAGE ────────────────
 * Der Namens-Präfix wäre ein zweiter Index auf `title` — und damit das
 * Versprechen einer Volltextsuche, die es hier nicht gibt (Kopf von
 * brand-019). Die Menge der FREIGEGEBENEN Brandings ist die kleine Menge:
 * jede Zeile darin ist eine ausdrückliche Zustimmung eines Menschen. 200 ist
 * reichlich und bleibt EINE Abfrage; wird sie eines Tages zu klein, ist das
 * die Stelle, an der eine echte Suche gebaut gehört — nicht ein stilles
 * Abschneiden.
 */
const SHARED_SCAN_LIMIT = 200

function normalizePrefix(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * DIE FREIGEGEBENEN MARKEN ANDERER KONTEN.
 *
 * Drei Bedingungen, und jede hat ihren Grund:
 *  1. `marketVisibility === 'shared'` — die Zustimmung selbst.
 *  2. NICHT das eigene Konto — eigene Marken gehören in die Quelle
 *     „eigene Marke" (§7.2 Nr. 2); zweimal derselbe Eintrag in zwei Quellen
 *     wäre eine Frage, die niemand beantworten kann.
 *  3. Das genannte Kapitel ist ABGENOMMEN — eine Marke ohne eigene Behauptung
 *     hat nichts, was man vergleichen könnte (§2.4). Ohne diese Bedingung
 *     stünden halb fertige fremde Brandings im Wähler und lieferten leere
 *     Profile.
 *
 * FAIL-SOFT nur bei fehlender TABELLE (Instanz ohne brand-Migration): dann
 * gibt es nichts. Alles andere gehört dem Aufrufer.
 */
export async function listSharedMarketProfiles(
  event: H3Event,
  query: BrandSharedProfileQuery,
): Promise<BrandSharedProfileHit[]> {
  const { tablesDB, databaseId } = brandDb(event)

  let rows: BrandProfileRow[]
  try {
    const result = await tablesDB.listRows<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      queries: [
        Query.equal('marketVisibility', 'shared'),
        Query.orderDesc('lastActivityAt'),
        Query.limit(SHARED_SCAN_LIMIT),
      ],
    })
    rows = result.rows
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw error
  }

  const prefix = normalizePrefix(query.prefix ?? '')
  const candidates = rows.filter((row) => {
    if (row.ownerId === query.excludeOwnerId) return false
    if (!row.title?.trim()) return false
    return !prefix || row.title.toLowerCase().startsWith(prefix)
  })
  if (!candidates.length) return []

  // Die Kapitel-Abnahme in EINER Abfrage: die Zeilen-Id einer `brand_steps`-
  // Zeile ist deterministisch (`<profileId>_<stepKey>`), also lässt sich nach
  // ihnen direkt filtern. Ein `loadStepRow` je Treffer wären zehn Abfragen für
  // eine Auswahlliste.
  const wantedIds = candidates.slice(0, SHARED_SCAN_LIMIT)
    .map(row => brandStepRowId(row.$id, query.requiredStepKey))
  let accepted = new Set<string>()
  try {
    const steps = await tablesDB.listRows<BrandStepRow>({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      queries: [
        Query.equal('$id', wantedIds),
        Query.equal('state', 'done'),
        Query.limit(wantedIds.length),
      ],
    })
    accepted = new Set(steps.rows.map(row => row.profileId))
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw error
  }

  return candidates
    .filter(row => accepted.has(row.$id))
    .slice(0, Math.max(0, query.limit))
    .map(row => ({
      id: row.$id,
      title: row.title ?? '',
      industry: row.industry ?? '',
    }))
}
