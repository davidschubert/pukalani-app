import { BRAND_CHECK_CATEGORIES } from './brandCheck'
import type { BrandCheckDiff, BrandCheckDiffCategory, BrandCheckHistoryItem } from './types/brand'

/**
 * DIE GEGENÜBERSTELLUNG ZWEIER CHECKS (docs/archiv/BRAND-CHECK-SEITE.md §5) —
 * pur, ohne h3, ohne Appwrite, ohne Vue.
 *
 * ── SIE VERGLEICHT NUR, WAS VERGLEICHBAR IST ──────────────────────────────
 * Zwei Checks DERSELBEN Quelle. Ein Website-Score und ein Dokument-Score sind
 * beides Zahlen zwischen 0 und 100 und messen trotzdem Verschiedenes (§5b:
 * sechzehn Kriterien gibt es am Dokument gar nicht) — ein „+12" zwischen den
 * beiden wäre die überzeugendste falsche Zahl der ganzen Seite. Die Auswahl
 * trifft der Aufrufer; diese Funktion nagelt sie fest, indem sie bei
 * verschiedenen Quellen `null` liefert.
 *
 * ── DIE ACHT ZEILEN KOMMEN AUS DEM KATALOG, NICHT AUS DEN DATEN ───────────
 * Iteriert wird über `BRAND_CHECK_CATEGORIES`, nicht über das, was in den
 * beiden Zeilen steht. Sonst hinge die Reihenfolge der Gegenüberstellung an
 * der Speicherreihenfolge einer JSON-Spalte, und eine Kategorie, die in genau
 * einem der beiden Checks fehlt (Bestandsdaten eines älteren Katalogs), fiele
 * lautlos aus der Tabelle.
 *
 * ── VIER TRENDS, UND `null` IST KEIN NULLPUNKT ────────────────────────────
 * `null` heisst im ganzen Check „nicht bewertbar" und nie „null Punkte"
 * (`brandCheckCategoryScores`). Daraus folgt:
 *  · vorher `null`, jetzt eine Zahl ⇒ `new` — es gibt keinen Vergleich, nur
 *    einen ersten Wert. Ein „+60" wäre erfunden.
 *  · jetzt `null` ⇒ `same` mit `delta: null` — wir sagen NICHTS. Ein `down`
 *    hiesse „schlechter geworden", dabei haben wir nur nichts gesehen.
 *  · beide Zahlen ⇒ `up`/`down`/`same` mit echtem Abstand.
 * `delta` ist deshalb `number | null` und nicht `0`: eine 0 bedeutet
 * „gemessen und gleich", und das ist etwas anderes als „nicht messbar".
 *
 * ── DAS GESAMT-DELTA IST IMMER EINE ZAHL ──────────────────────────────────
 * Beide Gesamtwerte sind es (`computeBrandCheck` liefert 0–100, notfalls 0).
 * Ein Gesamtwert von 0 heisst „nichts war bewertbar" — die Seite zeigt daneben
 * acht Schlösser und erklärt es; hier wird deshalb nicht zusätzlich geraten.
 */

export type BrandCheckDiffTrend = 'up' | 'down' | 'same' | 'new'

/** Der Wert EINER Kategorie in einem Verlaufs-Eintrag — oder `null`. */
export function brandCheckHistoryCategoryScore(
  item: BrandCheckHistoryItem,
  category: string,
): number | null {
  return item.categories.find(entry => entry.id === category)?.score ?? null
}

function trendOf(latest: number | null, previous: number | null): BrandCheckDiffTrend {
  if (latest === null) return 'same'
  if (previous === null) return 'new'
  if (latest > previous) return 'up'
  if (latest < previous) return 'down'
  return 'same'
}

/**
 * `null`, wenn es nichts gegenüberzustellen gibt: kein Vorgänger, oder einer
 * aus einer anderen Quelle. Die Seite zeigt den Abschnitt dann GAR NICHT —
 * eine Tabelle aus acht Strichen wäre eine Ansage, dass etwas fehlt, wo nur
 * noch nichts ist (der erste Check einer Brand ist der Normalfall).
 */
export function diffBrandChecks(
  latest: BrandCheckHistoryItem | null | undefined,
  previous: BrandCheckHistoryItem | null | undefined,
): BrandCheckDiff | null {
  if (!latest || !previous) return null
  if (latest.source !== previous.source) return null

  const categories: BrandCheckDiffCategory[] = BRAND_CHECK_CATEGORIES.map((category) => {
    const now = brandCheckHistoryCategoryScore(latest, category.key)
    const before = brandCheckHistoryCategoryScore(previous, category.key)
    const trend = trendOf(now, before)
    return {
      id: category.key,
      latest: now,
      previous: before,
      delta: now !== null && before !== null ? now - before : null,
      trend,
    }
  })

  return {
    latestId: latest.id,
    previousId: previous.id,
    latestAt: latest.createdAt,
    previousAt: previous.createdAt,
    source: latest.source,
    latestScore: latest.score,
    previousScore: previous.score,
    delta: latest.score - previous.score,
    categories,
  }
}

/**
 * DIE ZWEI JÜNGSTEN EINTRÄGE DERSELBEN QUELLE — die Auswahl, die vor
 * `diffBrandChecks` steht.
 *
 * Die Liste kommt ABSTEIGEND nach Zeit (so fragt die Route), also sind die
 * ersten beiden Treffer einer Quelle genau „der jüngste und der davor". Die
 * Quelle wird NICHT vorgegeben, sondern vom jüngsten Eintrag ÜBERHAUPT
 * genommen: wer eben „neu ermitteln" gedrückt hat, will die Gegenüberstellung
 * zu dem sehen, was er gerade angestossen hat — und nicht die einer Quelle,
 * die er vor drei Wochen zuletzt angefasst hat.
 */
export function latestBrandCheckDiff(items: readonly BrandCheckHistoryItem[]): BrandCheckDiff | null {
  const newest = items[0]
  if (!newest) return null
  const sameSource = items.filter(item => item.source === newest.source)
  return diffBrandChecks(sameSource[0], sameSource[1])
}
