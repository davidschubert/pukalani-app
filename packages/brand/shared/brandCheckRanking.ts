import { BRAND_CHECK_CATEGORIES, type BrandCheckCategoryKey } from './brandCheck'
import type { BrandCheckRankingItem } from './types/brand'

/**
 * DIE AUSWAHL-REGELN DES RANKINGS (docs/archiv/BRAND-CHECK-SEITE.md §3) — pur,
 * ohne h3, ohne Appwrite, ohne Vue.
 *
 * Die Route holt ein FENSTER aus der Ablage und wendet dann genau diese vier
 * Regeln an: je Adresse den jüngsten Check behalten, filtern, sortieren,
 * blättern. Sie stehen hier und nicht in der Route, weil sie die einzigen
 * Stellen sind, an denen ein öffentliches Ranking über FREMDE Auftritte falsch
 * werden kann — und weil man sie so ohne Appwrite nageln kann.
 *
 * ── WARUM DIE SORTIERUNG IM SERVER PASSIERT UND NICHT IN DER ABFRAGE ──────
 * „Die Besten in Konsistenz" ist eine Sortierung nach EINEM Wert INNERHALB der
 * JSON-Spalte `categories` — Appwrite kann darüber weder sortieren noch
 * filtern (es kennt kein JSON-Feld, die Spalte ist eine Zeichenkette). Und
 * „je urlKey der jüngste" ist eine Gruppierung, die TablesDB ebenfalls nicht
 * anbietet. Beides ginge nur mit denormalisierten Spalten je Kategorie (acht
 * Stück) plus einem gepflegten `latest`-Flag — das ist der Umbau, den dieses
 * Ranking rechtfertigen muss, bevor er kommt, und nicht davor.
 *
 * ── DER PREIS IST EIN FENSTER, UND ER STEHT HIER ──────────────────────────
 * Die Route liest die JÜNGSTEN `BRAND_CHECK_RANKING_SCAN_LIMIT` freigegebenen
 * Checks. Innerhalb dieses Fensters ist „je Adresse der jüngste" EXAKT — ein
 * älterer Stand kann einen neueren nie verdecken, weil er hinter ihm liegt.
 * Was das Fenster kostet, ist Vollständigkeit am unteren Rand: ein Auftritt,
 * dessen einziger Check älter ist als die 500 jüngsten, fällt aus der Liste.
 * Das ist die richtige Richtung — ein VERALTETER Wert über eine fremde Marke
 * wäre der Schaden (§3 „Recht"), ein fehlender Eintrag nur eine Lücke.
 */

/** Zeilen je Seite. Eine Tabelle, die man durchsieht — keine Datenbank-Ansicht. */
export const BRAND_CHECK_RANKING_PAGE_SIZE = 25

/** Wie viele Zeilen die Route aus der Ablage holt, bevor sie hier rechnet (s. Kopf). */
export const BRAND_CHECK_RANKING_SCAN_LIMIT = 500

/**
 * Der Deckel der Seitenzahl. Er ist kein Geschmack, sondern die Grenze des
 * Fensters: mehr als `SCAN_LIMIT / PAGE_SIZE` Seiten kann es gar nicht geben,
 * und eine Adresszeile mit `?page=99999` soll keine leere Antwort erzeugen,
 * die aussieht, als wäre etwas kaputt.
 */
export const BRAND_CHECK_RANKING_PAGE_MAX = Math.ceil(
  BRAND_CHECK_RANKING_SCAN_LIMIT / BRAND_CHECK_RANKING_PAGE_SIZE,
)

/**
 * WONACH SORTIERT WERDEN DARF: der Gesamtwert, das Datum — oder EINE der acht
 * Kategorien („die Besten in Konsistenz", §3).
 *
 * Die Kategorie-Schlüssel werden aus dem KATALOG gebaut und nicht daneben
 * aufgezählt: eine neunte Kategorie soll im Filter auftauchen, ohne dass
 * jemand eine zweite Liste findet.
 */
export type BrandCheckRankingSort = 'score' | 'date' | BrandCheckCategoryKey

export const BRAND_CHECK_RANKING_SORTS: readonly string[] = [
  'score',
  'date',
  ...BRAND_CHECK_CATEGORIES.map(category => category.key),
]

export const BRAND_CHECK_RANKING_DEFAULT_SORT: BrandCheckRankingSort = 'score'

export function isBrandCheckRankingSort(value: unknown): value is BrandCheckRankingSort {
  return typeof value === 'string' && BRAND_CHECK_RANKING_SORTS.includes(value)
}

/** Unbekanntes ⇒ der Standard. Eine Adresszeile ist Eingabe, kein Vertrag. */
export function normalizeBrandCheckRankingSort(value: unknown): BrandCheckRankingSort {
  return isBrandCheckRankingSort(value) ? value : BRAND_CHECK_RANKING_DEFAULT_SORT
}

/**
 * DIE SEITENZAHL AUS DER ADRESSZEILE. 1-basiert; alles Unlesbare, Negative,
 * Nicht-Ganze und alles jenseits des Fensters wird auf einen gültigen Wert
 * gezogen, statt einen 400 zu erzeugen: ein kaputter `?page=`-Parameter ist
 * eine Bedienspur (ein leeres Feld im Formular, ein Proxy), kein Angriff.
 */
export function normalizeBrandCheckRankingPage(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(raw)) return 1
  return Math.min(BRAND_CHECK_RANKING_PAGE_MAX, Math.max(1, Math.trunc(raw)))
}

/**
 * JE ADRESSE DER JÜNGSTE CHECK — die eine Regel aus §3 („ältere bleiben
 * Verlauf").
 *
 * Sie arbeitet auf allem, was einen `urlKey` und ein `createdAt` hat, weil sie
 * sowohl über die gelesene Appwrite-Zeile als auch über die fertige Sicht
 * laufen können muss. Verglichen werden ISO-Zeitstempel als Zeichenketten —
 * dieselbe Ordnung wie als Datum, ohne einen `Date`-Umweg je Vergleich.
 *
 * Die REIHENFOLGE der Ausgabe ist die des ersten Auftretens: die Sortierung
 * kommt danach, und eine Regel, die nebenbei umsortiert, wäre eine zweite
 * Sortier-Wahrheit. Bei GLEICHEM Zeitstempel gewinnt der zuerst gelesene —
 * die Abfrage liefert absteigend nach Zeit, das ist also der jüngere.
 */
export function pickLatestPerUrlKey<T extends { urlKey: string, createdAt: string }>(
  rows: readonly T[],
): T[] {
  const best = new Map<string, T>()
  for (const row of rows) {
    const current = best.get(row.urlKey)
    if (!current || row.createdAt > current.createdAt) best.set(row.urlKey, row)
  }
  return [...best.values()]
}

export interface BrandCheckRankingFilter {
  /** Leer = keine Einschränkung. Sonst genau eine Branchen-Id. */
  industry?: string
  /** Leer = keine Einschränkung. Sonst genau ein Band. */
  band?: string
}

/**
 * Filtern. Beide Felder sind EXAKTE Gleichheit, nicht „enthält": sie kommen
 * aus geschlossenen Listen (Branchen-Katalog, sieben Bänder), und eine
 * Teilstring-Suche über eine geschlossene Liste ist eine Einladung, mit
 * `?band=a` alles zu bekommen.
 */
export function filterBrandCheckRankingItems(
  items: readonly BrandCheckRankingItem[],
  filter: BrandCheckRankingFilter,
): BrandCheckRankingItem[] {
  const industry = filter.industry ?? ''
  const band = filter.band ?? ''
  return items.filter(item =>
    (!industry || item.industry === industry)
    && (!band || item.band === band),
  )
}

/**
 * Der Wert EINER Kategorie in einer Zeile — oder `null`.
 *
 * `null` heisst „nicht bewertbar" und NICHT „null Punkte" (dieselbe Regel wie
 * im ganzen Check: eine gesperrte Kategorie fällt aus der Rechnung, statt als
 * Null zu zählen). Eine Zeile ohne diese Kategorie — Bestandsdaten eines
 * älteren Katalogs — liest sich genauso.
 */
export function brandCheckRankingCategoryScore(
  item: BrandCheckRankingItem,
  category: string,
): number | null {
  return item.categories.find(entry => entry.id === category)?.score ?? null
}

/**
 * SORTIEREN — absteigend, mit stabilem Tiebreak.
 *
 * ── NICHT BEWERTBAR STEHT HINTEN, NICHT BEI NULL ──────────────────────────
 * Bei der Sortierung nach einer Kategorie landen Zeilen, die dort `null`
 * tragen, GESCHLOSSEN am Ende — nicht zwischen den Nullen und den Einsen. Eine
 * Kategorie, die wir nicht ansehen konnten, ist keine schwache Kategorie, und
 * „die Besten in Konsistenz" darf nicht damit enden, dass ein Auftritt ohne
 * messbare Konsistenz als schlechtester Konsistenz-Auftritt dasteht.
 *
 * ── DER TIEBREAK IST DETERMINISTISCH ──────────────────────────────────────
 * Gleicher Wert ⇒ jüngerer Check zuerst ⇒ Host alphabetisch. Ohne die dritte
 * Stufe hätte dieselbe Anfrage auf zwei Servern verschiedene Reihenfolgen
 * (die Ablage garantiert bei gleichem Zeitstempel keine), und eine Seite 2
 * zeigte Zeilen, die auf Seite 1 schon standen.
 */
export function sortBrandCheckRankingItems(
  items: readonly BrandCheckRankingItem[],
  sort: BrandCheckRankingSort,
): BrandCheckRankingItem[] {
  const copy = [...items]

  if (sort === 'date') {
    return copy.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
      || b.score - a.score
      || a.host.localeCompare(b.host))
  }

  if (sort === 'score') {
    return copy.sort((a, b) =>
      b.score - a.score
      || b.createdAt.localeCompare(a.createdAt)
      || a.host.localeCompare(b.host))
  }

  return copy.sort((a, b) => {
    const left = brandCheckRankingCategoryScore(a, sort)
    const right = brandCheckRankingCategoryScore(b, sort)
    if (left === null || right === null) {
      // Beide `null` ⇒ die üblichen Tiebreaks entscheiden; genau eines ⇒ das
      // `null` nach hinten, unabhängig von der Sortierrichtung.
      if (left !== right) return left === null ? 1 : -1
    }
    else if (left !== right) {
      return right - left
    }
    return b.score - a.score
      || b.createdAt.localeCompare(a.createdAt)
      || a.host.localeCompare(b.host)
  })
}

/**
 * BLÄTTERN. `page` ist 1-basiert (das ist die Zahl in der Adresszeile), eine
 * Seite jenseits des Endes ergibt eine LEERE Liste und keinen Fehler: das
 * passiert, wenn zwischen zwei Klicks eine Zeile ausgeblendet wurde.
 */
export function paginateBrandCheckRankingItems(
  items: readonly BrandCheckRankingItem[],
  page: number,
  pageSize: number = BRAND_CHECK_RANKING_PAGE_SIZE,
): BrandCheckRankingItem[] {
  const start = (Math.max(1, page) - 1) * pageSize
  return items.slice(start, start + pageSize)
}
