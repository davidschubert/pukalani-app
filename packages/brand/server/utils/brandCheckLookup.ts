import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { BRAND_CHECK_CACHE_MS, brandCheckUrlKey } from '../../shared/brandCheck'
import { BRAND_CHECKS_TABLE, type BrandCheckRow, brandDb, isAppwriteNotFound } from './brandStore'

/**
 * DEN BESTEHENDEN BRAND-CHECK EINER ADRESSE NACHSCHLAGEN — nur LESEN, nie
 * rechnen (Plan §7.3, Davids Entscheidung: „der BESTEHENDE Score, kein
 * zweiter").
 *
 * ── WARUM ES DIESE DATEI ÜBERHAUPT GIBT ───────────────────────────────────
 * Der Marktvergleich zeigt je Kandidat den Brand-Check-Score. Er darf ihn
 * nicht selbst rechnen (das wäre die zweite Zahl, die §7.3 ausdrücklich
 * streicht) und er darf `brand_checks` auch nicht selbst lesen: der
 * market-Layer greift ausschliesslich über seinen Vertrag
 * (`packages/market/server/contracts/brandContract.ts`) über die Paketgrenze,
 * und ein Vertrag kann nur re-exportieren, was es hier GIBT. Bis heute gab es
 * keine host-basierte Lesefunktion — der Check hat sein Ergebnis immer nur
 * über seine eigene Zeilen-Id oder im Ablauf seiner eigenen Route gelesen.
 *
 * ── EINE NEUE DATEI, KEINE ZEILE IN EINER BESTEHENDEN ─────────────────────
 * Der Brand-Check wird von einer PARALLELEN Sitzung weitergebaut. Eine neue
 * Datei kann mit deren Arbeit nicht kollidieren; eine eingeschobene Funktion
 * in `brandStore.ts` oder `brandCheckAdmin.ts` könnte es.
 *
 * ── WAS SIE BEWUSST NICHT TUT: ANSTOSSEN ──────────────────────────────────
 * Plan §7.3 sieht vor, dass ein Lauf einen fehlenden Check ANSTÖSST. Das geht
 * heute nicht sauber: die ganze Check-Mechanik (Zwischenspeicher, Deckel,
 * Abruf, Messung, Urteil, Ablage) liegt IM Handler von
 * `server/api/brand/check.post.ts` und ist nirgends als Funktion
 * herausgezogen. Sie von aussen zu rufen hiesse, sie zu kopieren — und dann
 * hätte der Marktvergleich seinen eigenen, langsam auseinanderlaufenden
 * Brand-Check, also genau die zweite Zahl. Solange kein Check vorliegt, bleibt
 * das Feld deshalb LEER; die Oberfläche sagt dazu „Brand-Check läuft mit".
 * Der Weg dorthin ist eine herausgezogene `runBrandCheck()`-Funktion in der
 * Brand-Check-Sitzung — dann genügt hier ein zweiter Aufruf.
 *
 * ── DER SCHLÜSSEL IST `urlKey`, NICHT `host` ──────────────────────────────
 * `brand_checks` hat einen Index auf `urlKey` (brand-016) und KEINEN auf
 * `host`; Appwrite verlangt für jede Filter-Spalte einen. `brandCheckUrlKey`
 * ist zudem die EINE Normalisierung, mit der der Check selbst seinen
 * Zwischenspeicher findet — eine zweite Regel hier wäre eine zweite Antwort
 * auf „dieselbe Adresse".
 */

export interface BrandCheckLookupResult {
  readonly checkId: string
  readonly score: number
  readonly band: string
  /** Wann er ermittelt wurde — der Aufrufer entscheidet, ob ihm das reicht. */
  readonly createdAt: string
  /** Ist er jünger als die Sieben-Tage-Frist des Checks? */
  readonly fresh: boolean
}

/**
 * DER JÜNGSTE CHECK ZU EINER ADRESSE — oder `null`.
 *
 * FAIL-SOFT: eine fehlende Tabelle (Migration nicht gelaufen) und jeder
 * Lesefehler ergeben `null`. Der Score ist eine ZUGABE am Kandidaten; ein
 * Marktvergleich, der daran scheitert, hätte für eine Randangabe seinen
 * ganzen Bericht verloren.
 */
export async function findBrandCheckForUrl(
  event: H3Event,
  rawUrl: string,
): Promise<BrandCheckLookupResult | null> {
  const urlKey = brandCheckUrlKey(rawUrl)
  if (!urlKey) return null

  try {
    const { tablesDB, databaseId } = brandDb(event)
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [Query.equal('urlKey', urlKey), Query.orderDesc('$createdAt'), Query.limit(1)],
    })
    const row = res.rows[0]
    if (!row) return null
    // Ein AUSGEBLENDETER Check (Betreiber-Weg, brand-017) ist keine Auskunft
    // mehr — auch nicht als Zahl neben einem fremden Namen.
    if (row.hidden === true) return null
    return {
      checkId: row.$id,
      score: row.score,
      band: row.band,
      createdAt: row.$createdAt,
      fresh: Date.parse(row.$createdAt) > Date.now() - BRAND_CHECK_CACHE_MS,
    }
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.check_lookup_failed', {
        // Die MELDUNG, nie die Adresse (Log-Regel).
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}
