import type { InsightsTopicKey } from './insightsPost'
import { INSIGHTS_TOPIC_KEYS } from './insightsPost'
import type { InsightsRadarVerdictFilter, InsightsVerdict } from './insightsWatchlist'
import { INSIGHTS_RADAR_VERDICT_DEFAULT, insightsVerdictPasses } from './insightsWatchlist'

/**
 * DIE REINEN REGELN DER RADAR-ANSICHT (BI2 K2, Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §3).
 *
 * Filtern und Sortieren einer Liste sieht nach Oberfläche aus. Hier ist es
 * keine: die Radar-Tabelle war bis heute FEST nach Opportunity sortiert, weil
 * `InRadar.vue` die Reihenfolge entschied, bevor `UTable` die Zeilen überhaupt
 * sah. Wer das ändert, ändert damit, WELCHES Video oben steht — und das ist
 * die einzige Auskunft, die die Seite gibt. Also gehört die Regel dorthin, wo
 * ein Test sie lesen kann.
 *
 * ── WARUM NICHT DIE SORTIERUNG VON `UTable` ─────────────────────────────
 * `UTable` bringt TanStack mit, und TanStack kann sortieren. Es kann nur eines
 * nicht ohne Zutun: `null` als „keine Messung" behandeln statt als kleine
 * Zahl. Genau das ist hier aber die tragende Regel (s. u.), und sie hinge dann
 * an einer Option einer fremden Bibliothek, deren Bedeutung sich mit deren
 * Fassung ändern darf. Die Tabelle bleibt `UTable` (Davids B6-Regel) — die
 * REIHENFOLGE ist unsere.
 *
 * ── `null` IST KEIN KLEINER WERT, SONDERN KEINER ────────────────────────
 * Eine Zeile ohne Opportunity heisst „kein Signal lag vor", nicht „schlechtes
 * Video" (dieselbe Regel wie in `insightsOpportunity` und in der Route). Sie
 * steht deshalb **in BEIDEN Richtungen am Ende**. Aufsteigend sortiert sie
 * nach vorn zu ziehen wäre formal richtig und fachlich eine Lüge: sie stünde
 * dann dort, wo „am wenigsten aussichtsreich" steht.
 *
 * ── GLEICHSTAND ENTSCHEIDET DIE VIDEO-ID ────────────────────────────────
 * Derselbe Determinismus-Riegel wie in `insightsRadarClassify`: ohne ihn
 * entscheidet die Reihenfolge, in der die Zeilen aus der Datenbank kamen, und
 * zwei Aufrufe derselben Ansicht zeigen dieselben Videos in zwei
 * Reihenfolgen. Bei 205 Zeilen mit vielen gleichen Werten (Likes 0, Alter 3)
 * ist das kein Randfall.
 */

// ── Sortieren ──────────────────────────────────────────────────────────────

/**
 * WONACH SORTIERT WERDEN DARF. Alles Zahlen — nach Kanal oder Titel zu
 * sortieren ist in einer Liste, die nach Signalstärke gelesen wird, keine
 * Frage, die jemand stellt; die Filter daneben beantworten sie besser.
 */
export const INSIGHTS_RADAR_SORT_KEYS = ['opportunity', 'views', 'likes', 'commentCount', 'age'] as const
export type InsightsRadarSortKey = (typeof INSIGHTS_RADAR_SORT_KEYS)[number]

/** Womit die Seite aufgeht — unverändert das Bild von vor BI2. */
export const INSIGHTS_RADAR_SORT_DEFAULT: InsightsRadarSortKey = 'opportunity'

/** Was eine Zeile mitbringen muss, damit diese Regeln sie sortieren können. */
export interface InsightsRadarSortable {
  videoId: string
  views: number
  likes: number
  commentCount: number
  ageDays: number
  /** 0–100 oder `null` — `null` heisst „kein Signal", nicht „null Punkte". */
  score: number | null
}

/**
 * DIE ERSTE RICHTUNG EINES KLICKS.
 *
 * Bei jeder Zahlenspalte ist „das Grösste zuerst" gemeint: wer auf „Aufrufe"
 * klickt, sucht das meistgesehene Video. Beim ALTER ist es genau umgekehrt —
 * „das älteste zuerst" hat noch nie jemand gewollt, und der Radar ist die
 * Ansicht für das, was JETZT läuft. Die Ausnahme steht hier als Regel und
 * nicht als Sonderfall im Klick-Handler, damit sie einen Test hat.
 */
export function insightsRadarFirstDesc(key: InsightsRadarSortKey): boolean {
  return key !== 'age'
}

/** Der Wert, nach dem eine Spalte sortiert — `null` nur bei der Opportunity. */
export function insightsRadarSortValue(row: InsightsRadarSortable, key: InsightsRadarSortKey): number | null {
  switch (key) {
    case 'views': return row.views
    case 'likes': return row.likes
    case 'commentCount': return row.commentCount
    case 'age': return row.ageDays
    case 'opportunity': return row.score
  }
}

/** Der Vergleich zweier Ids — der Riegel gegen zwei Reihenfolgen bei Gleichstand. */
function byVideoId(a: InsightsRadarSortable, b: InsightsRadarSortable): number {
  return a.videoId < b.videoId ? -1 : (a.videoId > b.videoId ? 1 : 0)
}

/**
 * SORTIEREN — ohne die Vorlage anzufassen (es kommt ein `readonly T[]` herein).
 */
export function insightsRadarSort<T extends InsightsRadarSortable>(
  rows: readonly T[],
  key: InsightsRadarSortKey,
  desc: boolean,
): T[] {
  return [...rows].sort((a, b) => {
    const left = insightsRadarSortValue(a, key)
    const right = insightsRadarSortValue(b, key)

    // Ohne Zahl immer ans Ende — in BEIDEN Richtungen (s. Kopf).
    if (left === null && right === null) return byVideoId(a, b)
    if (left === null) return 1
    if (right === null) return -1

    if (left !== right) return desc ? right - left : left - right
    return byVideoId(a, b)
  })
}

// ── Filtern ────────────────────────────────────────────────────────────────

/**
 * DIE ZEITRÄUME DER ANSICHT, in Tagen. Die `0` heisst „alle" und ist bewusst
 * eine ZAHL und keine leere Zeichenkette: Nuxt UI verbietet `''` als Wert
 * eines Auswahl-Eintrags (im Projekt schon einmal live erwischt), und ein
 * `null` als Wert machte aus dem Typ der Auswahl eine Union ohne Not.
 *
 * Der Alters-Deckel des LAUFS (heute 180 Tage) bleibt darüber: dieser Filter
 * kann nur enger stellen, nie weiter. Deshalb steht der Deckel auch weiterhin
 * als Satz über der Tabelle — sonst hielte jemand „alle" für „alles, was es
 * gibt".
 */
export const INSIGHTS_RADAR_RANGES = [0, 7, 30, 90] as const
export type InsightsRadarRange = (typeof INSIGHTS_RADAR_RANGES)[number]

/** Was eine Zeile mitbringen muss, damit diese Regeln sie filtern können. */
export interface InsightsRadarFilterable {
  topic: string
  channelTitle: string
  ageDays: number
  /** Das dazugelesene Urteil (BI2 K4) — ohne Eintrag `unrated`. */
  verdict: InsightsVerdict
}

/** Was zum LESEN reicht — die Filter-Regeln fassen nichts an. */
export interface InsightsRadarFilter {
  /** Leer heisst ALLE — nie „keines" (s. u.). */
  topics: readonly string[]
  /** Leer heisst ALLE. */
  channels: readonly string[]
  /** `0` heisst alle. */
  range: InsightsRadarRange
  /**
   * Das Urteil (BI2 K4). Anders als die drei darüber ist die VORGABE hier
   * nicht „alles": `without-uninteresting` blendet aus, was ein Mensch
   * abgehakt hat. Ein Urteil, das die Liste nicht ändert, ist eine Geste.
   */
  verdict: InsightsRadarVerdictFilter
}

/**
 * DERSELBE FILTER ALS ZUSTAND EINER OBERFLÄCHE — mit VERÄNDERLICHEN Arrays.
 *
 * Zwei Typen für eine Sache, und beide verdienen ihren Platz: die Regeln oben
 * lesen nur und sagen das (`readonly`), ein `v-model` an einer
 * Mehrfach-Auswahl SCHREIBT und kann mit `readonly` nicht gebunden werden.
 */
export interface InsightsRadarFilterState {
  topics: string[]
  channels: string[]
  range: InsightsRadarRange
  verdict: InsightsRadarVerdictFilter
}

/**
 * DER LEERE FILTER — eine FUNKTION und keine Konstante, und das ist kein
 * Geschmack.
 *
 * Eine geteilte Konstante wäre hier eine Falle mit Ansage: `{ ...KONSTANTE }`
 * kopiert das Objekt, aber NICHT die Arrays darin — beide Kopien zeigten auf
 * dieselben zwei Listen. Eine Mehrfach-Auswahl, die ihre Liste an Ort und
 * Stelle ändert (und Nuxt UI darf das), schriebe damit in den Modul-Zustand,
 * und „Filter zurücksetzen" gäbe beim zweiten Mal die Auswahl von eben zurück.
 * Jeder Aufruf liefert deshalb frische Listen.
 */
export function insightsRadarFilterNone(): InsightsRadarFilterState {
  return { topics: [], channels: [], range: 0, verdict: INSIGHTS_RADAR_VERDICT_DEFAULT }
}

/**
 * LEER HEISST ALLE, NICHT KEINES.
 *
 * Die naheliegende Lesart einer leeren Auswahl („nichts ausgewählt ⇒ nichts
 * zeigen") ist die, bei der die Seite beim ersten Öffnen leer ist. Sie ist
 * ausserdem die, bei der ein Mensch, der alle Häkchen wieder abwählt, die
 * Tabelle verliert statt sie zurückzubekommen. Die Regel steht hier, damit
 * niemand sie beim nächsten Umbau „aufräumt".
 */
export function insightsRadarFilterRows<T extends InsightsRadarFilterable>(
  rows: readonly T[],
  filter: InsightsRadarFilter,
): T[] {
  const topics = new Set(filter.topics)
  const channels = new Set(filter.channels)
  return rows.filter((row) => {
    if (topics.size > 0 && !topics.has(row.topic)) return false
    if (channels.size > 0 && !channels.has(row.channelTitle)) return false
    if (filter.range > 0 && row.ageDays > filter.range) return false
    if (!insightsVerdictPasses(row.verdict, filter.verdict)) return false
    return true
  })
}

/** Ob überhaupt etwas eingeschränkt ist — für den „Zurücksetzen"-Knopf. */
export function insightsRadarFilterActive(filter: InsightsRadarFilter): boolean {
  return filter.topics.length > 0
    || filter.channels.length > 0
    || filter.range > 0
    // Die VORGABE zählt nicht als Einschränkung: sonst stünde „Filter
    // zurücksetzen" beim ersten Öffnen da, ohne dass jemand etwas gewählt hat.
    || filter.verdict !== INSIGHTS_RADAR_VERDICT_DEFAULT
}

/**
 * DIE AUSWAHLLISTEN — aus DEN DATEN, nicht aus dem Katalog.
 *
 * Ein Themen-Filter, der alle acht Cluster anbietet, während nur fünf in der
 * Tabelle vorkommen, hat drei Einträge, die garantiert nichts finden. Der
 * Radar zeigt ohnehin nur, was ein Lauf geholt hat — die Auswahl folgt ihm.
 *
 * Die Themen kommen in der Reihenfolge des KATALOGS (`INSIGHTS_TOPIC_KEYS`),
 * nicht in der ihres ersten Vorkommens: der Katalog hat eine gewollte
 * Ordnung, und eine Liste, die sich mit jedem Lauf umsortiert, ist nicht
 * bedienbar. Kanäle stehen alphabetisch, weil sie keine Ordnung mitbringen.
 */
export function insightsRadarFacets<T extends InsightsRadarFilterable>(
  rows: readonly T[],
): { topics: string[], channels: string[] } {
  const seenTopics = new Set<string>()
  const seenChannels = new Set<string>()
  for (const row of rows) {
    if (row.topic) seenTopics.add(row.topic)
    if (row.channelTitle) seenChannels.add(row.channelTitle)
  }

  const catalog: readonly string[] = INSIGHTS_TOPIC_KEYS
  const known: InsightsTopicKey[] = INSIGHTS_TOPIC_KEYS.filter(key => seenTopics.has(key))
  // Zeilen mit einem Cluster, das der Katalog nicht (mehr) kennt, verschwinden
  // nicht aus der Auswahl — sonst wäre genau das Video unfilterbar, das
  // auffällt, weil es aus der Reihe fällt.
  const unknown = [...seenTopics].filter(key => !catalog.includes(key)).sort()

  return {
    topics: [...known, ...unknown],
    channels: [...seenChannels].sort((a, b) => a.localeCompare(b)),
  }
}
