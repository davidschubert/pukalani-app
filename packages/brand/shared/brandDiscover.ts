import { BRAND_ARCHETYPES } from './brandChoiceOptions'
import type { BrandFoundationView } from './brandFoundation'
import { BRAND_INDUSTRY_VALUES } from './brandIndustries'
import { BRAND_PALETTES } from './brandPalette'
import type {
  BrandDiscoverItem,
  BrandDiscoverScore,
  BrandDiscoverScoreKind,
  BrandDiscoverSecondary,
  BrandDiscoverSimilar,
} from './types/brand'

/**
 * DIE AUSWAHL-REGELN DER ÖFFENTLICHEN GALERIE (docs/plans/DISCOVER-BRANDS.md
 * §4.1/§4.2, Davids Entscheidungen 5 und 6 vom 2026-09-08) — pur, ohne h3,
 * ohne Appwrite, ohne Vue.
 *
 * Dieselbe Arbeitsteilung wie `shared/brandCheckRanking.ts` neben
 * `ranking.get.ts`: die Route holt ein FENSTER aus der Ablage, hier stehen die
 * vier Rechnungen, die daraus eine Galerie machen — Zahl wählen, filtern,
 * sortieren, blättern — plus die zwei, die eine Anatomie braucht (Brand of the
 * Day, „Ähnliche Marken").
 *
 * ── WARUM DIE SORTIERUNG IM SERVER PASSIERT UND NICHT IN DER ABFRAGE ──────
 * Nach „Brand Score" sortieren heisst: nach einer Zahl sortieren, die gar
 * nicht in `brand_publications` steht — sie liegt in `brand_checks`, einer
 * ANDEREN Tabelle, und TablesDB kennt keinen Join. Die Route liest deshalb ein
 * Fenster von Veröffentlichungen, holt die Zahlen dazu GEBÜNDELT (eine
 * Abfrage, nie eine je Kachel) und rechnet hier. Der Preis ist derselbe wie
 * beim Ranking und wird genauso bezahlt: `total` zählt die Einträge im
 * Fenster, nicht die der ganzen Tabelle.
 *
 * ── ZWEI ZAHLEN, ZWEI NAMEN (Entscheidung 5) ─────────────────────────────
 * „Brand Score" ist die Prüfung des AUFTRITTS (`source: 'website'`),
 * „Fundament-Reife" die des DOKUMENTS (`source: 'document'`). Der Ring zeigt
 * den Brand Score, wo es ihn gibt, und die Reife als Zweitzeile; ohne
 * Auftritts-Prüfung wandert die Reife in den Ring. Eine unbeschriftete Zahl
 * behauptete sonst, zwei verschiedene Messungen seien dieselbe.
 */

// ── Fenster, Seiten, Deckel ────────────────────────────────────────────────

/** Kacheln je Seite (Konzept §4.1: 25). */
export const BRAND_DISCOVER_PAGE_SIZE = 25

/** Wie viele Veröffentlichungen die Route liest, bevor sie hier rechnet. */
export const BRAND_DISCOVER_SCAN_LIMIT = 500

/**
 * Wie viele Brandings je Lauf ihre Zahlen bekommen.
 *
 * Die Zahlen kommen aus EINER gebündelten Abfrage über `brand_checks`, und
 * deren Filter ist eine Liste von Profil-Ids — die kann nicht beliebig lang
 * sein. Gedeckt sind damit die 100 JÜNGSTEN Veröffentlichungen; wer dahinter
 * liegt, zeigt keine Zahl und sortiert in „Brand Score" ans Ende. Das ist die
 * richtige Richtung: eine fehlende Nebenangabe ist eine Lücke, eine erfundene
 * wäre ein Urteil.
 */
export const BRAND_DISCOVER_CHECK_LOOKUP_MAX = 100

/**
 * Der Deckel der Seitenzahl — er ist die Grenze des Fensters, kein Geschmack:
 * mehr Seiten kann es gar nicht geben, und `?page=99999` soll keine leere
 * Antwort erzeugen, die wie ein Fehler aussieht.
 */
export const BRAND_DISCOVER_PAGE_MAX = Math.ceil(
  BRAND_DISCOVER_SCAN_LIMIT / BRAND_DISCOVER_PAGE_SIZE,
)

/** Wie viele „Ähnliche Marken" eine Anatomie zeigt (§4.2: max. 4). */
export const BRAND_DISCOVER_SIMILAR_MAX = 4

/**
 * Wie viele Kacheln der Aufmacher blättert, wenn NIEMAND kuratiert hat
 * (Entscheidung 6: „die Galerie blättert bei Bedarf die drei neuesten").
 */
export const BRAND_DISCOVER_SPOTLIGHT_MAX = 3

// ── Die Facetten ───────────────────────────────────────────────────────────

/** Die Weiche (§4.1). Leer heisst „alle" — es ist kein dritter Wert. */
export const BRAND_DISCOVER_PATH_KINDS: readonly string[] = ['new', 'relaunch']

export const BRAND_DISCOVER_SORTS = ['newest', 'score', 'maturity'] as const
export type BrandDiscoverSort = typeof BRAND_DISCOVER_SORTS[number]
export const BRAND_DISCOVER_DEFAULT_SORT: BrandDiscoverSort = 'newest'

export function isBrandDiscoverSort(value: unknown): value is BrandDiscoverSort {
  return typeof value === 'string' && (BRAND_DISCOVER_SORTS as readonly string[]).includes(value)
}

/** Unbekanntes ⇒ der Standard. Eine Adresszeile ist Eingabe, kein Vertrag. */
export function normalizeBrandDiscoverSort(value: unknown): BrandDiscoverSort {
  return isBrandDiscoverSort(value) ? value : BRAND_DISCOVER_DEFAULT_SORT
}

/**
 * Die Seitenzahl aus der Adresszeile — 1-basiert, alles Unlesbare wird auf
 * einen gültigen Wert gezogen statt zu einem 400 (dieselbe Nachsicht wie im
 * Ranking: ein kaputtes `?page=` ist eine Bedienspur, kein Angriff).
 */
export function normalizeBrandDiscoverPage(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(raw)) return 1
  return Math.min(BRAND_DISCOVER_PAGE_MAX, Math.max(1, Math.trunc(raw)))
}

/**
 * DIE VIER FACETTEN-WERTE — jeder gegen seinen KATALOG gemessen, nicht bloss
 * gedeckelt.
 *
 * Ein unbekannter Wert wird zu '' („keine Einschränkung") und nicht zu einem
 * Filter, der nichts findet: die Facetten stehen in teilbaren Adressen, und
 * ein Tippfehler in einem weitergeschickten Link soll die Galerie zeigen und
 * keine leere Wand.
 */
export function normalizeBrandDiscoverPathKind(value: unknown): string {
  const trimmed = String(value ?? '').trim().toLowerCase()
  return BRAND_DISCOVER_PATH_KINDS.includes(trimmed) ? trimmed : ''
}

export function normalizeBrandDiscoverArchetype(value: unknown): string {
  const trimmed = String(value ?? '').trim().toLowerCase()
  return BRAND_ARCHETYPES.some(option => option.id === trimmed) ? trimmed : ''
}

export function normalizeBrandDiscoverPalette(value: unknown): string {
  const trimmed = String(value ?? '').trim().toLowerCase()
  return BRAND_PALETTES.some(palette => palette.id === trimmed) ? trimmed : ''
}

export function normalizeBrandDiscoverIndustry(value: unknown): string {
  const trimmed = String(value ?? '').trim().toLowerCase()
  return BRAND_INDUSTRY_VALUES.includes(trimmed) ? trimmed : ''
}

export interface BrandDiscoverFilter {
  path?: string
  archetype?: string
  palette?: string
  industry?: string
}

/**
 * Filtern. Alle vier sind EXAKTE Gleichheit und nicht „enthält": sie kommen
 * aus geschlossenen Katalogen, und eine Teilstring-Suche über eine
 * geschlossene Liste ist eine Einladung, mit `?palette=o` alles zu bekommen.
 *
 * Der ARCHETYP zählt nur als HAUPT-Archetyp: wer „Der Weise" wählt, sucht
 * Marken, die das SIND — nicht solche, die ihn als Rest tragen. Der Steckbrief
 * nennt den zweiten weiterhin, er ist nur keine Facette.
 */
export function filterDiscoverItems(
  items: readonly BrandDiscoverItem[],
  filter: BrandDiscoverFilter,
): BrandDiscoverItem[] {
  const path = filter.path ?? ''
  const archetype = filter.archetype ?? ''
  const palette = filter.palette ?? ''
  const industry = filter.industry ?? ''
  return items.filter(item =>
    (!path || item.pathKind === path)
    && (!archetype || item.archetype === archetype)
    && (!palette || item.paletteId === palette)
    && (!industry || item.industry === industry),
  )
}

// ── Die Zahl auf der Kachel ────────────────────────────────────────────────

/** Ein gelesener Check, auf das reduziert, was eine Kachel braucht. */
export interface BrandDiscoverCheckFact {
  kind: BrandDiscoverScoreKind
  value: number
  band: string
}

export interface BrandDiscoverScoreChoice {
  score: BrandDiscoverScore | null
  secondary: BrandDiscoverSecondary | null
}

/**
 * WELCHE ZAHL IN DEN RING KOMMT (Entscheidung 5).
 *
 * Website schlägt Dokument — die Galerie heisst „Brand Score", und das ist die
 * Zahl über den AUFTRITT. Gibt es beide, steht die Fundament-Reife als
 * Zweitzeile darunter; gibt es nur die Reife, wandert SIE in den Ring und
 * nimmt ihre Beschriftung mit. Gibt es nichts, bleibt der Ring weg — eine 0
 * läse sich wie ein sehr schlechtes Urteil, und „nicht geprüft" ist kein
 * Urteil.
 *
 * Werte ausserhalb 0–100 und Fehlläufe (`value <= 0`) zählen NICHT: ein
 * Fehllauf heisst „nichts war bewertbar", nicht „null Punkte" (dieselbe Regel
 * wie im Ranking).
 */
export function pickDiscoverScores(
  facts: readonly BrandDiscoverCheckFact[],
): BrandDiscoverScoreChoice {
  const usable = facts.filter(fact => Number.isFinite(fact.value) && fact.value > 0 && fact.value <= 100)
  const website = usable.find(fact => fact.kind === 'website') ?? null
  const document = usable.find(fact => fact.kind === 'document') ?? null

  if (website) {
    return {
      score: { kind: 'website', value: website.value, band: website.band },
      secondary: document ? { kind: 'document', value: document.value } : null,
    }
  }
  if (document) {
    return {
      score: { kind: 'document', value: document.value, band: document.band },
      secondary: null,
    }
  }
  return { score: null, secondary: null }
}

/**
 * Die Zahl EINER Art an einer fertigen Kachel — `null` heisst „diese Marke hat
 * dafür keine Messung".
 *
 * Sie sieht in BEIDEN Feldern nach, weil dieselbe Art einmal im Ring und
 * einmal in der Zweitzeile stehen kann (s. `pickDiscoverScores`). Eine
 * Sortierung, die nur `score` läse, sortierte „Fundament-Reife" für alle
 * Marken mit Auftritt auf `null` — also genau die, die beide Zahlen haben.
 */
export function discoverScoreOf(
  item: BrandDiscoverItem,
  kind: BrandDiscoverScoreKind,
): number | null {
  if (item.score?.kind === kind) return item.score.value
  if (item.secondary?.kind === kind) return item.secondary.value
  return null
}

/**
 * SORTIEREN — absteigend, mit deterministischem Tiebreak.
 *
 * ── OHNE MESSUNG STEHT HINTEN, NICHT BEI NULL ────────────────────────────
 * „Nicht geprüft" ist keine schwache Marke. Kacheln ohne die gefragte Zahl
 * landen GESCHLOSSEN am Ende — dieselbe Regel wie bei den Kategorien des
 * Rankings.
 *
 * ── DER TIEBREAK IST DETERMINISTISCH ─────────────────────────────────────
 * Gleicher Wert ⇒ jüngere Veröffentlichung zuerst ⇒ Slug alphabetisch. Ohne
 * die dritte Stufe hätte dieselbe Anfrage auf zwei Servern verschiedene
 * Reihenfolgen, und Seite 2 zeigte Kacheln, die auf Seite 1 schon standen.
 */
export function sortDiscoverItems(
  items: readonly BrandDiscoverItem[],
  sort: BrandDiscoverSort,
): BrandDiscoverItem[] {
  const copy = [...items]
  if (sort === 'newest') {
    return copy.sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt)
      || a.slug.localeCompare(b.slug))
  }

  const kind: BrandDiscoverScoreKind = sort === 'score' ? 'website' : 'document'
  return copy.sort((a, b) => {
    const left = discoverScoreOf(a, kind)
    const right = discoverScoreOf(b, kind)
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1
    }
    else if (left !== right) {
      return right - left
    }
    return b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug)
  })
}

/**
 * BLÄTTERN. `page` ist 1-basiert (die Zahl in der Adresszeile); eine Seite
 * jenseits des Endes ergibt eine LEERE Liste und keinen Fehler — das passiert,
 * wenn zwischen zwei Klicks eine Marke ausgeblendet wurde.
 */
export function paginateDiscoverItems(
  items: readonly BrandDiscoverItem[],
  page: number,
  pageSize: number = BRAND_DISCOVER_PAGE_SIZE,
): BrandDiscoverItem[] {
  const start = (Math.max(1, page) - 1) * pageSize
  return items.slice(start, start + pageSize)
}

// ── Brand of the Day ───────────────────────────────────────────────────────

/**
 * GENAU EINE, DIE LETZTE GEWINNT (Entscheidung 6).
 *
 * Die Regel steht hier und nicht nur im Setzen: die Betreiber-Seite (D3)
 * LÖSCHT beim Setzen das vorige `featuredAt`, aber ein Datenstand, in dem aus
 * irgendeinem Grund zwei Zeilen eines tragen, darf die Galerie nicht zwei
 * Aufmacher zeigen lassen — sie zeigt den JÜNGSTEN. Ein leeres oder unlesbares
 * `featuredAt` zählt nicht: „hervorgehoben" ist eine positive Tatsache mit
 * einem Datum, kein Flag mit einem Fragezeichen.
 */
export function pickDiscoverFeatured<T extends { featuredAt?: string | null }>(
  rows: readonly T[],
): T | null {
  let best: T | null = null
  let bestAt = ''
  for (const row of rows) {
    const at = (row.featuredAt ?? '').trim()
    if (!at || !Number.isFinite(Date.parse(at))) continue
    if (!best || at > bestAt) {
      best = row
      bestAt = at
    }
  }
  return best
}

// ── Ähnliche Marken ────────────────────────────────────────────────────────

/**
 * Die Branche, die keine ist (`brandIndustries.ts`): „ging aus dem Auftritt
 * nicht hervor". Sie steht IN der Facetten-Liste (man kann danach filtern) und
 * ist trotzdem kein gemeinsamer Nenner für „Ähnliche Marken" — deshalb hier
 * als benannte Konstante statt als Zeichenkette mitten in der Regel.
 */
const BRAND_DISCOVER_INDUSTRY_UNKNOWN = 'unknown'

/**
 * „ÄHNLICHE MARKEN" — gleicher Archetyp zuerst, dann gleiche Farbwelt, dann
 * gleiche Branche (§4.2, Entscheidung 8: „mit fester Regel-Beschriftung";
 * Branche ergänzt in D4).
 *
 * Das sind die drei Facetten, die nur wir haben. Der GRUND reist als Id mit
 * (`archetype` / `palette` / `industry`) und nicht als Satz: die Kachel
 * schreibt ihn in der Sprache des Lesers hin, und ein Server, der fertige
 * Sätze schickt, kann sie weder übersetzen noch umformulieren.
 *
 * ── WARUM DIE BRANCHE ZULETZT KOMMT ──────────────────────────────────────
 * Sie ist der SCHWÄCHSTE der drei Gründe und trotzdem der, den ein Besucher
 * am ehesten sucht („zeig mir noch ein Café"). Zwei Marken teilen einen
 * Archetyp, weil sie dieselbe Haltung gewählt haben, und eine Farbwelt, weil
 * sie gleich aussehen — eine Branche teilen sie, weil sie im selben Gewerbe
 * arbeiten. Das sagt über das FUNDAMENT am wenigsten, füllt die vier Plätze
 * aber genau dann, wenn die Galerie noch klein ist und die beiden starken
 * Töpfe leer bleiben.
 *
 * ── SICH SELBST NIE, JEDE MARKE HÖCHSTENS EINMAL ─────────────────────────
 * Eine Marke mit gleichem Archetyp UND gleicher Farbwelt steht in beiden
 * Töpfen; sie erscheint einmal, mit dem STÄRKSTEN Grund (Archetyp). Ohne die
 * Entdopplung stünde dieselbe Kachel zweimal nebeneinander — und die zweite
 * mit der schwächeren Begründung.
 *
 * Ein LEERER Archetyp (Bestandszeile ohne bestätigten `d.primary`) ist kein
 * gemeinsamer Nenner: '' === '' wäre sonst der Grund, aus dem alle Marken ohne
 * Archetyp einander ähnlich sind. Bei der Branche gilt dasselbe für `unknown`
 * — der Wert heisst „ging aus dem Auftritt nicht hervor" (Kopf von
 * `brandIndustries.ts`) und ist damit ausdrücklich KEINE Auskunft, aus der
 * eine Ähnlichkeit folgen dürfte. `toDiscoverItem` setzt ihn als Vorgabe,
 * eine ganze Galerie junger Marken wäre sonst untereinander „ähnlich".
 */
export function similarDiscoverEntries(
  current: Pick<BrandDiscoverItem, 'slug' | 'archetype' | 'paletteId' | 'industry'>,
  candidates: readonly BrandDiscoverItem[],
  max: number = BRAND_DISCOVER_SIMILAR_MAX,
): BrandDiscoverSimilar[] {
  const out: BrandDiscoverSimilar[] = []
  const seen = new Set<string>([current.slug])

  const take = (item: BrandDiscoverItem, reason: BrandDiscoverSimilar['reason']): void => {
    if (out.length >= max || seen.has(item.slug)) return
    seen.add(item.slug)
    out.push({ slug: item.slug, title: item.title, paletteId: item.paletteId, reason })
  }

  if (current.archetype) {
    for (const item of candidates) {
      if (item.archetype === current.archetype) take(item, 'archetype')
    }
  }
  if (current.paletteId) {
    for (const item of candidates) {
      if (item.paletteId === current.paletteId) take(item, 'palette')
    }
  }
  if (current.industry && current.industry !== BRAND_DISCOVER_INDUSTRY_UNKNOWN) {
    for (const item of candidates) {
      if (item.industry === current.industry) take(item, 'industry')
    }
  }
  return out
}

// ── Das Vorschaubild einer Anatomie ────────────────────────────────────────

/**
 * Die Form eines Slugs in einer ADRESSE — dieselbe wie in
 * `server/utils/brandDiscover.ts`. Bewusst zweimal aufgeschrieben und nicht
 * geteilt: dort ist sie die Wache VOR einer Datenbank-Abfrage, hier die Wache
 * VOR einem Dateinamen. Fiele die eine Entscheidung, soll die andere stehen
 * bleiben.
 */
const DISCOVER_OG_SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/

/**
 * DER PFAD DES VORSCHAUBILDS EINER ANATOMIE — `/og/discover/<slug>.png`.
 *
 * EINE Wahrheit für ZWEI Aufrufer: die Seite trägt den Pfad über
 * `useBrandOgImage()` in den Kopf ein (`useLocaleSeoHead()` macht die absolute
 * URL), die Route liefert das Bild darunter aus. Stünde die Zeichenkette an
 * beiden Stellen, wäre ein Umzug des Pfades ein stilles og:image-404 — und ein
 * kaputtes Vorschaubild sieht niemand, der die Seite selbst aufruft.
 *
 * AUSGELIEFERT WIRD ES VON DER APP, NICHT VOM LAYER: die Route lebt in
 * `apps/branding/server/routes/og/discover/[slug].get.ts` (Kompositions-
 * Ebene — sie darf `packages/themes` für den Rasterizer kennen, dieser Layer
 * nicht, CONCEPT.md A14; die Endung `.png` schneidet die Route selbst ab, ein
 * Nitro-Parameter deckt immer das ganze Segment). Der Playground des Layers hat sie deshalb NICHT; dort
 * bleibt der Kopf ohne og:image, was der ehrliche Zustand ist.
 *
 * '' heisst „kein Bild": ein Slug, der nicht wie ein Slug aussieht, bekommt
 * keinen Pfad statt eines escapten Sonderfalls.
 */
export function brandDiscoverOgPath(slug: string): string {
  const value = String(slug ?? '').trim().toLowerCase()
  return DISCOVER_OG_SLUG.test(value) ? `/og/discover/${value}.png` : ''
}

// ── Zwei Zeilen aus dem Fundament ──────────────────────────────────────────

/**
 * DER PURPOSE-SATZ FÜR DEN AUFMACHER — der erste Leitsatz des Kapitels
 * „Purpose", sonst der erste Leitsatz überhaupt.
 *
 * Er wird GELESEN und nicht erzeugt: steht keiner da, bleibt die Zeile leer.
 * Ein erfundener Satz unter einer fremden Wortmarke wäre eine Behauptung über
 * eine Marke, die uns nicht gehört.
 */
export function discoverPurposeLine(foundation: BrandFoundationView | null): string {
  if (!foundation) return ''
  const chapters = foundation.chapters ?? []
  const purpose = chapters.find(chapter => chapter.id === 'purpose')
  return firstLead(purpose ? [purpose] : chapters) || firstLead(chapters)
}

function firstLead(chapters: BrandFoundationView['chapters']): string {
  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      if (block.kind === 'lead' && typeof block.text === 'string' && block.text.trim()) {
        return block.text.trim()
      }
    }
  }
  return ''
}

/** Wie viele Ton-Wörter der Steckbrief nennt — mehr wären eine Liste, keine Zeile. */
export const BRAND_DISCOVER_VOICE_WORDS = 4

/**
 * DIE STIMME FÜR DEN STECKBRIEF — die Ton-Wörter des Kapitels „Stimme", durch
 * Komma getrennt.
 *
 * Sie stehen im Fundament als Chips (`kind: 'chips'`, je Wort eine Stimmprobe);
 * der Steckbrief zeigt nur die WÖRTER, weil er eine Zeile ist und kein Kapitel.
 * Gibt es keine, fällt die Zeile weg — „Stimme: —" wäre eine Auskunft über
 * etwas, das nicht gefragt wurde.
 */
export function discoverVoiceLine(foundation: BrandFoundationView | null): string {
  const chapter = (foundation?.chapters ?? []).find(entry => entry.id === 'stimme')
  if (!chapter) return ''
  for (const block of chapter.blocks) {
    if (block.kind !== 'chips' || !Array.isArray(block.items)) continue
    const words = block.items
      .map(item => (typeof item.word === 'string' ? item.word.trim() : ''))
      .filter(Boolean)
      .slice(0, BRAND_DISCOVER_VOICE_WORDS)
    if (words.length) return words.join(', ')
  }
  return ''
}
