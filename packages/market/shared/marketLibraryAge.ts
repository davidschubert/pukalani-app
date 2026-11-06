/**
 * DIE 90-TAGE-REGEL DER KURATIERTEN BIBLIOTHEK — seit 2026-09-06 im CODE.
 *
 * ── WARUM SIE EXISTIERT ───────────────────────────────────────────────────
 * Ein Bibliotheks-Eintrag ist eine Aussage darüber, was eine fremde Marke HEUTE
 * über sich sagt. Websites ändern sich; ein Zitat, das vor einem halben Jahr
 * wörtlich auf der Startseite stand, kann längst weg sein. Die Handprüfung
 * (`docs/runbooks/MARKTVERGLEICH-BIBLIOTHEK.md`, Schritt 4) sagt deshalb
 * „Nichts älter als 90 Tage" — und stand bis hierher AUSSCHLIESSLICH dort:
 * „Keine Auffrischungs-Automatik. Ein Eintrag altert, und die 90-Tage-Regel
 * steht heute im Runbook, nicht im Code" (docs/archiv/BRAND-MARKTVERGLEICH.md).
 * Solange die Bibliothek erfundene Platzhalter enthielt, war das folgerichtig.
 * Seit echte Einträge ausgeliefert werden, altern sie — und eine Regel, an die
 * sich niemand erinnern kann, weil nichts sie zeigt, ist keine Regel.
 *
 * ── WARUM SIE EINE EIGENE DATEI IST UND NICHT IN `marketLibrary.ts` STEHT ──
 * Sie IST Teil der Bibliotheks-Mechanik, und `marketLibrary.ts` reicht sie
 * unverändert weiter — App und Routen importieren sie wie alles andere von
 * dort. Getrennt liegt sie aus EINEM Grund: `scripts/market-library-compute.mjs`
 * lädt Produkt-Regeln direkt als `.ts` (Node 22 entfernt die Typen beim Laden),
 * und diesen Weg gehen nur Module OHNE eigene Importe — Nodes ESM-Auflösung
 * kennt die erweiterungslosen Pfade nicht, mit denen der Nuxt-Baum arbeitet.
 * `marketLibrary.ts` zieht zod, `marketProfile` und die Datei selbst herein und
 * ist damit für das Werkzeug unerreichbar. Eine JS-Kopie der Rechnung im Skript
 * wäre die Alternative gewesen — und damit eine zweite Wahrheit über die Frage,
 * ob ein Eintrag noch gilt (dieselbe Begründung wie beim robots-Parser im Kopf
 * des Werkzeugs).
 *
 * ── `now` IST EIN PARAMETER, IMMER ────────────────────────────────────────
 * Keine dieser Funktionen liest die Uhr. Sonst hinge das Ergebnis eines Tests
 * am Kalender des Rechners, der ihn fährt — und ein Test, der im Dezember rot
 * wird, weil ein Eintrag inzwischen alt ist, misst nicht den Code, sondern das
 * Datum. Die Uhr liest genau, wer handelt: die Route, das Werkzeug, ein Sweep.
 *
 * ── EIN UNLESBARES PRÜFDATUM IST NICHT „FRISCH" ───────────────────────────
 * `marketLibraryEntryAge` gibt `null` zurück, wenn `verifiedAt` kein
 * bürgerliches Datum ist (das Schema verbietet das zwar — aber das Schema ist
 * die eine Sicherung, nicht die einzige). `marketLibraryEntryIsStale` nennt
 * genau diesen Fall ÜBERFÄLLIG: „kein lesbares Prüfdatum" heisst, dass niemand
 * sagen kann, wann zuletzt jemand hingesehen hat, und das ist der Zustand, vor
 * dem die Regel warnt — nicht sein Gegenteil.
 */

export const MARKET_LIBRARY_MAX_AGE_DAYS = 90

const DAY_MS = 86_400_000

/** Der Teil eines Eintrags, um den es hier geht — mehr braucht die Regel nicht. */
export interface MarketLibraryVerified {
  readonly verifiedAt: string
}

/**
 * EIN TAG ALS UTC-MITTERNACHT. Gerechnet wird in ganzen KALENDERTAGEN, nicht in
 * Stunden: `verifiedAt` ist ein Datum ohne Uhrzeit, und wer es mit dem
 * Zeitpunkt „jetzt" verrechnet, bekommt je nach Tageszeit 90 oder 91 Tage für
 * dasselbe Paar. UTC auf beiden Seiten, damit keine Sommerzeit eine Stunde
 * verschiebt.
 */
function utcDayFromIsoDate(date: string): number | null {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  if (!found) return null
  const year = Number(found[1])
  const month = Number(found[2])
  const day = Number(found[3])
  const stamp = Date.UTC(year, month - 1, day)
  const back = new Date(stamp)
  // `Date.UTC` rechnet einen 31. Februar still in den 3. März um. Ein Datum,
  // das es nicht gibt, ist hier aber kein Datum, sondern ein Tippfehler.
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null
  return stamp
}

/**
 * WIE VIELE TAGE SEIT DER HANDPRÜFUNG VERGANGEN SIND — `null`, wenn das
 * Prüfdatum nicht lesbar ist.
 *
 * Ein NEGATIVER Wert ist möglich (Prüfdatum in der Zukunft) und wird bewusst
 * nicht auf 0 geklemmt: `tests/marketLibrary.test.ts` verbietet solche Einträge
 * ohnehin, und eine Klemme hier versteckte genau den Fall, den jener Test sucht.
 */
export function marketLibraryEntryAge(entry: MarketLibraryVerified, now: Date): number | null {
  const verified = utcDayFromIsoDate(entry.verifiedAt)
  if (verified === null) return null
  if (!Number.isFinite(now.getTime())) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((today - verified) / DAY_MS)
}

/** ÜBERFÄLLIG: älter als 90 Tage — oder ohne lesbares Prüfdatum. */
export function marketLibraryEntryIsStale(entry: MarketLibraryVerified, now: Date): boolean {
  const age = marketLibraryEntryAge(entry, now)
  return age === null || age > MARKET_LIBRARY_MAX_AGE_DAYS
}
