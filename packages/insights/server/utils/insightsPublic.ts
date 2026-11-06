import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import type {
  InsightsBrand,
  InsightsBrandScore,
  InsightsFormat,
  InsightsPost,
} from '../../shared/insightsPost'
import { INSIGHTS_PUBLIC_STATES, INSIGHTS_TOPIC_KEYS } from '../../shared/insightsPost'
import type {
  InsightsPublicBrandRef,
  InsightsPublicPostListItem,
  InsightsSlugResolution,
} from '../../shared/insightsPublic'
import {
  INSIGHTS_FALLBACK_GRADIENT,
  insightsBrandIsVisible,
  insightsDuelCanonical,
  insightsNewsletterEnabled,
  insightsPostIsVisible,
  insightsPublicHref,
  insightsSlugResolution,
  readInsightsPublicFormats,
  toInsightsPublicPost,
} from '../../shared/insightsPublic'
import type { InsightsBrandRow, InsightsPostRow } from '../../shared/insightsRows'
import { INSIGHTS_BRANDS_TABLE, INSIGHTS_POSTS_TABLE, toInsightsBrand, toInsightsPost } from '../../shared/insightsRows'
import {
  BRAND_CHECK_CATEGORIES,
  BRAND_PALETTES,
  brandCheckCategoryScores,
  brandGradientFor,
  findBrandCheckForUrl,
  loadBrandCheckRow,
} from '../contracts/brandContract'

/**
 * DIE LESESEITE VON BRAND INSIGHTS — die ABFRAGEN hinter den öffentlichen
 * Routen (BI1 I3, Plan docs/plans/BRAND-INSIGHTS.md §9.2/§9.5).
 *
 * ── DIE TRENNUNG ZU `shared/insightsPublic.ts` ───────────────────────────
 * Dort stehen die REGELN (was darf heraus, unter welcher Adresse, was fällt
 * weg), hier die ABFRAGEN (welche Zeile, mit welchem Filter). Die Regeln sind
 * ohne Nitro prüfbar und haben ihre Gegenprobe; die Abfragen sind das Netz.
 * Eine Abfrage, die eine Regel nachbaut, wäre eine zweite Wahrheit — deshalb
 * fragt hier JEDE Funktion die Regel und nicht ihren eigenen Zustandsvergleich.
 *
 * ── OHNE SESSION, UND DESHALB OHNE JEDE PERSONALISIERUNG ─────────────────
 * Alle Leserouten sind user-agnostisch (Microcache 60 s, §9.5). Was in einer
 * Antwort steht, steht damit sechzig Sekunden lang für JEDEN Leser bereit —
 * das ist der Grund, warum `toInsightsPublicPost` die internen Felder wirklich
 * ENTFERNT und nicht nur nicht anzeigt.
 *
 * ── KEIN `tenantDb` ──────────────────────────────────────────────────────
 * Dieselbe Lage wie im Rest des Layers (Kopf von `insightsStore.ts`): eine
 * Single-Tenant-Instanz, Tabellen ohne `communityId`. Die Grenze ist hier eine
 * andere und sie steht in diesem Modul: `state`, `translationReviewed` und der
 * Riegel `publicFormats`.
 */

// ── 1. Der Riegel ──────────────────────────────────────────────────────────

/**
 * DIE FREIGESCHALTETEN FORMATE, wie der SERVER sie sieht.
 *
 * `useAppConfig()` OHNE `event` — und das ist kein Vergessen: die Signatur
 * nimmt in Nitro gar kein Argument (TS2554, live erwischt in BI1 I4). Die
 * App-Config ist eine PROZESS-Konstante, sie kommt aus dem Build und nicht aus
 * dem Request; ein `event` wäre die Erwartung, sie könne je Host anders sein.
 */
export function insightsPublicFormats(): InsightsFormat[] {
  const config = useAppConfig() as { pukalani?: { insights?: { publicFormats?: unknown } } }
  return readInsightsPublicFormats(config.pukalani?.insights?.publicFormats)
}

/**
 * STEHT DER NEWSLETTER OFFEN? (BI1 I5a, `pukalani.insights.newsletter.enabled`.)
 *
 * Dieselbe Bauart wie eine Zeile darüber und aus demselben Grund: `useAppConfig()`
 * OHNE `event` (die Signatur nimmt in Nitro gar kein Argument), die pure Regel
 * aus `shared/` entscheidet, und fail-closed heisst hier „nur echtes `true`".
 *
 * Die drei Newsletter-Routen rufen sie als ERSTES und antworten sonst
 * `insightsPublicMissing()` — denselben neutralen 404 wie ein unbekannter Slug.
 * Ein eigener Code (`newsletter_disabled`) wäre die Auskunft „es gibt das hier,
 * es ist nur zu", und die ist auf einer öffentlichen Adresse nichts wert: der
 * Riegel hängt an unseren Rechtstexten, nicht am Fragenden.
 */
export function insightsNewsletterAllowed(): boolean {
  const config = useAppConfig() as { pukalani?: { insights?: { newsletter?: { enabled?: unknown } } } }
  return insightsNewsletterEnabled(config.pukalani?.insights?.newsletter?.enabled)
}

/**
 * „Gibt es diese Seite nicht." — EINE Antwort für alles.
 *
 * Unbekannter Slug, Entwurf, gesperrtes Format, unlesbare Zeile: derselbe
 * Status UND derselbe Code. Ein eigener Grund je Fall verriete, dass es die
 * Seite gibt und sie nur nicht heraus darf — und genau das ist bei einer
 * FREMDEN Marke die Auskunft, die §6 vermeiden will.
 */
export function insightsPublicMissing() {
  return createError({ status: 404, statusText: 'Not found', data: { code: 'post_not_found' } })
}

// ── 2. Beiträge ────────────────────────────────────────────────────────────

/** Die Zustände, die ein Leser sehen darf — als Query-Wert. */
const PUBLIC_STATES = [...INSIGHTS_PUBLIC_STATES]

/**
 * DIE ÖFFENTLICHEN BEITRÄGE, jüngste zuerst.
 *
 * `Query.limit()` ist explizit (CLAUDE.md: Appwrites Vorgabe ist 25, und eine
 * Liste, die still bei 25 endet, sieht aus wie ein leeres Ende). Gefiltert wird
 * über den INDEX `idx_state_published` (`state`, `publishedAt`) — dieselben
 * zwei Spalten, in derselben Reihenfolge.
 *
 * Der RIEGEL wird hier NICHT in die Abfrage gebaut, sondern danach gerechnet:
 * Appwrite bräuchte dafür einen weiteren Index über `format`, und der Riegel
 * ändert sich mit einer Config-Zeile — eine Abfrage, die ihn kennt, müsste bei
 * jeder Freischaltung mitwandern. Zweihundert Zeilen zu filtern kostet nichts.
 */
export async function listPublicInsightsPostRows(event: H3Event): Promise<InsightsPostRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      queries: [
        Query.equal('state', PUBLIC_STATES),
        Query.orderDesc('publishedAt'),
        Query.limit(INSIGHTS_PUBLIC_LIST_LIMIT),
      ],
    })
    return res.rows
  }
  catch (error) {
    // Fehlt die Tabelle (Migration nicht gefahren), ist das Journal LEER und
    // nicht kaputt: eine öffentliche Seite soll dann ihren leeren Zustand
    // zeigen statt 503 an jeden Crawler.
    if (isInsightsRowMissing(error)) return []
    throw insightsStorageError(error, 'listPublicInsightsPostRows')
  }
}

/**
 * EINE ÖFFENTLICHE ZEILE ZU EINER ADRESSE — samt der 301-Frage (§9.2).
 *
 * Die Reihenfolge ist die Regel `insightsSlugResolution` und steht deshalb
 * nicht hier, sondern in `shared/`: direkt schlägt alles, der Duell-Kanon
 * kommt vor der Historie, die Historie zuletzt. Diese Funktion beschafft nur
 * die drei Befunde.
 *
 * ── DIE HISTORIE WIRD NACH DEM LESEN GEGENGEPRÜFT ───────────────────────
 * `Query.contains('slugHistory', '"alt"')` sucht in einer JSON-ZEICHENKETTE
 * (die Spalte ist Text mit Index `idx_slug_history`). Ein Treffer heisst also
 * „diese Zeichenkette steht irgendwo darin" — `"nike"` fände auch `"nike-2"`
 * nicht, wohl aber ein hypothetisches Feld, das den Text sonstwo trägt. Die
 * Anführungszeichen machen den Treffer schon eng; die JSON-Gegenprobe im Code
 * macht ihn EXAKT. Ohne sie wäre eine 301 auf eine fremde Seite möglich.
 */
export interface InsightsPublicPostHit {
  row: InsightsPostRow
  post: InsightsPost
}

export type InsightsPublicPostLookup =
  | { kind: 'post', hit: InsightsPublicPostHit }
  | { kind: 'redirect', slug: string }
  | { kind: 'missing' }

async function findPostRowBySlug(
  event: H3Event,
  format: InsightsFormat,
  slug: string,
): Promise<InsightsPostRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      queries: [
        Query.equal('slug', slug),
        Query.equal('format', format),
        Query.equal('state', PUBLIC_STATES),
        Query.limit(1),
      ],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return null
    throw insightsStorageError(error, `findPostRowBySlug ${format}`)
  }
}

async function findPostRowByHistory(
  event: H3Event,
  format: InsightsFormat,
  slug: string,
): Promise<InsightsPostRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      queries: [
        Query.contains('slugHistory', `"${slug}"`),
        Query.equal('format', format),
        Query.equal('state', PUBLIC_STATES),
        Query.limit(5),
      ],
    })
    // Die Gegenprobe: nur ein Eintrag, der WIRKLICH in der Liste steht, zählt.
    return res.rows.find(row => toInsightsPost(row).slugHistory.includes(slug)) ?? null
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return null
    throw insightsStorageError(error, `findPostRowByHistory ${format}`)
  }
}

/**
 * EINE ZEILE FÜR DIE BETREIBER-VORSCHAU (`?preview=1`) — OHNE Zustands-Filter
 * und OHNE Riegel.
 *
 * Sie ist die einzige Stelle dieses Moduls, die an den Sichtbarkeits-Regeln
 * vorbeiliest, und sie darf es nur, weil ihr Aufrufer VORHER
 * `requirePermission(event, 'insights.manage')` verlangt hat. Wer freigeben
 * soll, muss den Entwurf sehen; und wer nach der Anwaltsantwort ein Format
 * freischalten soll, muss vorher sehen, was dann live ginge.
 *
 * Eine Weiterleitung gibt es hier bewusst NICHT: die Vorschau schaut auf eine
 * bestimmte Zeile, nicht auf eine öffentliche Adresse.
 */
export async function findAnyInsightsPostRow(
  event: H3Event,
  format: InsightsFormat,
  slug: string,
): Promise<InsightsPostRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      queries: [Query.equal('slug', slug), Query.equal('format', format), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return null
    throw insightsStorageError(error, `findAnyInsightsPostRow ${format}`)
  }
}

/** Dasselbe für ein Markenprofil — s. Kopf eine Funktion höher. */
export async function findAnyInsightsBrandRow(event: H3Event, slug: string): Promise<InsightsBrandRow | null> {
  return findBrandRowBySlug(event, slug)
}

/**
 * DER EINE WEG ZU EINEM ÖFFENTLICHEN BEITRAG.
 *
 * Der Riegel wird hier mitgeprüft (`insightsPostIsVisible`): eine gesperrte
 * Form antwortet damit auch dann 404, wenn ihre Zeile freigegeben ist — und
 * zwar OHNE dass jede Route daran denken muss.
 */
export async function findPublicInsightsPost(
  event: H3Event,
  format: InsightsFormat,
  slug: string,
): Promise<InsightsPublicPostLookup> {
  const allowed = insightsPublicFormats()
  const direct = await findPostRowBySlug(event, format, slug)
  if (direct && !insightsPostIsVisible(toInsightsPost(direct), allowed)) return { kind: 'missing' }

  // Nur beim DUELL gibt es eine zweite Schreibweise derselben Seite. Für die
  // drei anderen Formate ist `insightsDuelCanonical` bedeutungslos, und ein
  // Slug mit `-vs-` darin wäre dort schlicht ein Titel.
  let canonical: string | undefined
  if (!direct && format === 'duel') {
    const wanted = insightsDuelCanonical(slug)
    if (wanted && wanted !== slug) {
      const row = await findPostRowBySlug(event, format, wanted)
      if (row && insightsPostIsVisible(toInsightsPost(row), allowed)) canonical = wanted
    }
  }

  let historyHit: string | undefined
  if (!direct && !canonical) {
    const row = await findPostRowByHistory(event, format, slug)
    if (row && insightsPostIsVisible(toInsightsPost(row), allowed)) historyHit = row.slug
  }

  const resolution: InsightsSlugResolution = insightsSlugResolution(slug, {
    direct: Boolean(direct),
    ...(canonical ? { canonical } : {}),
    ...(historyHit ? { historyHit } : {}),
  })
  if (resolution.kind === 'redirect') return { kind: 'redirect', slug: resolution.slug }
  if (resolution.kind === 'missing' || !direct) return { kind: 'missing' }
  return { kind: 'post', hit: { row: direct, post: toInsightsPost(direct) } }
}

// ── 3. Marken ──────────────────────────────────────────────────────────────

export interface InsightsPublicBrandHit {
  row: InsightsBrandRow
  brand: InsightsBrand
}

export type InsightsPublicBrandLookup =
  | { kind: 'brand', hit: InsightsPublicBrandHit }
  | { kind: 'redirect', slug: string }
  | { kind: 'missing' }

async function findBrandRowBySlug(event: H3Event, slug: string): Promise<InsightsBrandRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      queries: [Query.equal('slug', slug), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return null
    throw insightsStorageError(error, 'findBrandRowBySlug')
  }
}

async function findBrandRowByHistory(event: H3Event, slug: string): Promise<InsightsBrandRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      queries: [Query.contains('slugHistory', `"${slug}"`), Query.limit(5)],
    })
    return res.rows.find(row => toInsightsBrand(row).slugHistory.includes(slug)) ?? null
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return null
    throw insightsStorageError(error, 'findBrandRowByHistory')
  }
}

/**
 * DAS MARKENPROFIL ZU EINER ADRESSE — mit derselben 301-Mechanik wie beim
 * Beitrag (ohne Duell-Kanon: eine Marke hat nur einen Namen).
 *
 * `draft` gilt hier als NICHT vorhanden, und zwar auch für die Historie: eine
 * 301 auf eine Seite, die danach 404 antwortet, wäre zwei Antworten für eine
 * Frage.
 */
export async function findPublicInsightsBrand(event: H3Event, slug: string): Promise<InsightsPublicBrandLookup> {
  const allowed = insightsPublicFormats()
  const direct = await findBrandRowBySlug(event, slug)
  if (direct && !insightsBrandIsVisibleRow(direct, allowed)) return { kind: 'missing' }

  let historyHit: string | undefined
  if (!direct) {
    const row = await findBrandRowByHistory(event, slug)
    if (row && insightsBrandIsVisibleRow(row, allowed)) historyHit = row.slug
  }

  const resolution = insightsSlugResolution(slug, {
    direct: Boolean(direct),
    ...(historyHit ? { historyHit } : {}),
  })
  if (resolution.kind === 'redirect') return { kind: 'redirect', slug: resolution.slug }
  if (resolution.kind === 'missing' || !direct) return { kind: 'missing' }
  return { kind: 'brand', hit: { row: direct, brand: toInsightsBrand(direct) } }
}

/**
 * Die Sichtbarkeits-REGEL auf einer rohen Zeile — sie fragt `shared/`, statt
 * den Zustandsvergleich hier zu wiederholen. Der Umweg über `toInsightsBrand`
 * ist Absicht: er verengt `state` vom Spalten-`string` auf die drei erlaubten
 * Werte, und eine Zeile mit einem vierten (Tippfehler in der Datenbank) fällt
 * damit auf `draft` und bleibt unsichtbar.
 */
function insightsBrandIsVisibleRow(row: InsightsBrandRow, allowed: readonly InsightsFormat[]): boolean {
  return insightsBrandIsVisible(toInsightsBrand(row), allowed)
}

/**
 * DIE MARKEN-ZEILEN ZU EINER MENGE VON IDs — EINE Abfrage statt N.
 *
 * Gebraucht an drei Stellen: die Liste (Adresse eines Markenprofils), der
 * Artikel (die erwähnten Marken), das Ranking (Namen zu Ids). Ohne Bündelung
 * wären das bei zweihundert Listenzeilen zweihundert Abfragen — und die Liste
 * ist die meistbesuchte Seite dieses Bereichs.
 */
export async function loadInsightsBrandRowsByIds(
  event: H3Event,
  ids: readonly string[],
): Promise<Map<string, InsightsBrandRow>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const found = new Map<string, InsightsBrandRow>()
  if (unique.length === 0) return found

  const { tablesDB, databaseId } = insightsDb(event)
  // Appwrite deckelt `Query.equal` mit einer Liste; hundert Ids je Runde sind
  // konservativ und decken die 200er-Liste in zwei Abfragen ab.
  const CHUNK = 100
  try {
    for (let at = 0; at < unique.length; at += CHUNK) {
      const chunk = unique.slice(at, at + CHUNK)
      const res = await tablesDB.listRows<InsightsBrandRow>({
        databaseId,
        tableId: INSIGHTS_BRANDS_TABLE,
        queries: [Query.equal('$id', chunk), Query.limit(chunk.length)],
      })
      for (const row of res.rows) found.set(row.$id, row)
    }
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return found
    throw insightsStorageError(error, 'loadInsightsBrandRowsByIds')
  }
  return found
}

/**
 * DIE ÖFFENTLICHEN BEITRÄGE, DIE EINE MARKE ERWÄHNEN.
 *
 * Gefiltert wird im CODE und nicht in der Abfrage: `brandRefs` ist eine
 * JSON-Spalte ohne Index, und `Query.contains` darauf wäre ein Scan, dessen
 * Treffer man ohnehin gegenprüfen müsste (dieselbe Falle wie bei der
 * Slug-Historie). Das Fenster ist die öffentliche Liste — mehr Beiträge gibt
 * es im Journal auch nicht zu sehen.
 */
export function postsMentioningBrand(
  posts: readonly InsightsPostRow[],
  brandId: string,
): InsightsPostRow[] {
  return posts.filter(row => toInsightsPost(row).brandRefs.some(ref => ref.brandId === brandId))
}

// ── 4. Der Score über den Vertrag ──────────────────────────────────────────

/**
 * DIE EINE ZAHL EINER FREMDEN MARKE (Entscheidung 7: „keine zweite Skala").
 *
 * Zwei Wege, in dieser Reihenfolge:
 *  1. `checkId` gesetzt ⇒ genau diese Check-Zeile. Sie ist die redaktionelle
 *     Wahl — welcher Stand gezeigt wird, entscheidet die Redaktion und nicht
 *     der Zufall des jüngsten Laufs.
 *  2. sonst der jüngste Check zur HOMEPAGE. Ohne ihn bleibt das Feld leer; ein
 *     Profil ohne Zahl ist ein Profil, ein Profil mit erfundener Zahl wäre
 *     eine Behauptung.
 *
 * FAIL-SOFT in beide Richtungen: ein 404 auf die Check-Zeile (gelöscht) und
 * jeder Lesefehler ergeben `null`. Ein AUSGEBLENDETER Check (`hidden`) ergibt
 * ebenfalls `null` — das Ausblenden ist der Entfernen-Weg des Betreibers, und
 * er darf nicht dadurch unwirksam werden, dass eine zweite Seite dieselbe Zahl
 * zeigt.
 */
export async function loadInsightsBrandScore(event: H3Event, brand: InsightsBrand): Promise<InsightsBrandScore | null> {
  if (brand.checkId) {
    try {
      const row = await loadBrandCheckRow(event, brand.checkId)
      if (row.hidden === true) return null
      return toInsightsBrandScore(row.$id, row.score, row.band, row.categories)
    }
    catch {
      return null
    }
  }
  if (!brand.homepage) return null
  try {
    const lookup = await findBrandCheckForUrl(event, brand.homepage)
    if (!lookup) return null
    const row = await loadBrandCheckRow(event, lookup.checkId)
    if (row.hidden === true) return null
    return toInsightsBrandScore(row.$id, row.score, row.band, row.categories)
  }
  catch {
    return null
  }
}

/**
 * ZEILE → ANSICHT. Die acht Kategorien in der Reihenfolge der METHODIK, nicht
 * in der der Spalte: `BRAND_CHECK_CATEGORIES` ist der Katalog, `row.categories`
 * das Ergebnis, und ein Ergebnis, das eine Kategorie auslässt, soll die
 * anderen sieben nicht verschieben.
 *
 * `label` ist der KATALOG-SCHLÜSSEL (`distinctiveness`, `visual`, …) und kein
 * Text: die Beschriftung ist ein i18n-Schlüssel der APP (`brand.check.
 * categories.<key>`), und ein Server hat keine Anzeigesprache. Die Seite
 * übersetzt ihn und fällt auf den Schlüssel zurück, wenn die App ihn nicht
 * kennt — ein Import aus dem brand-Layer in `app/` wäre die Kopplung, die
 * CONCEPT A14 verbietet.
 *
 * GESPERRTE Kategorien (`score === null`, nichts bewertbar) fallen WEG statt
 * als 0 zu erscheinen: eine 0 wäre die Aussage „hier ist nichts vorhanden",
 * wo in Wahrheit nichts gemessen wurde.
 */
function toInsightsBrandScore(
  checkId: string,
  score: number,
  band: string,
  categories: string,
): InsightsBrandScore {
  // Kaputtes JSON ⇒ keine Kategorien: die Zahl und das Band bleiben, nur die
  // Balken fehlen. Eine Nebenangabe darf die Seite nicht kosten (wörtlich die
  // Regel von `toDiscoverCategories` im brand-Layer).
  let parsed: unknown
  try {
    parsed = JSON.parse(categories || 'null')
  }
  catch {
    parsed = null
  }
  const values = new Map<string, number>()
  if (Array.isArray(parsed)) {
    for (const entry of brandCheckCategoryScores(parsed)) {
      if (typeof entry.score === 'number') values.set(entry.id, entry.score)
    }
  }
  return {
    score,
    band,
    checkId,
    dimensions: BRAND_CHECK_CATEGORIES
      .filter(category => values.has(category.key))
      .map(category => ({ key: category.key, label: category.key, value: values.get(category.key) ?? 0 })),
  }
}

/**
 * DIE FARBWELT EINER MARKE — über den Vertrag, nie über eine eigene Rechnung.
 *
 * ── ZWEI EINGÄNGE, UND SIE DÜRFEN NICHT VERWECHSELT WERDEN ──────────────
 * `insights_brands.paletteId` ist eine ID aus dem Katalog (`brass`, …) —
 * nachgeschlagen wird sie in `BRAND_PALETTES`. `brandGradientFor(seed)` ist
 * etwas ANDERES: es HASHT einen beliebigen Startwert auf eine der zwölf
 * Welten. Eine Palette-Id in `brandGradientFor` zu stecken sähe aus wie eine
 * Zuordnung und wäre eine Zufallsfarbe — dieselbe Marke bekäme unter
 * `/discover/<slug>` (dort wird nachgeschlagen) und unter `/brands/<slug>`
 * zwei verschiedene Farbwelten, und niemand könnte sagen, welche gilt.
 *
 * Die Reihenfolge ist deshalb: gesetzte Id nachschlagen · sonst den Slug
 * hashen (so hat auch eine Marke ohne Zuordnung eine stabile eigene Kachel) ·
 * sonst der neutrale Rückfall.
 *
 * ── ZWEI FARBEN AUS DREI ────────────────────────────────────────────────
 * Der Katalog gibt einen DREIKLANG (hell · mittel · tief); die Kacheln dieses
 * Layers nehmen hell + tief, weil eine Karte kein Hero ist. Welche zwei, steht
 * hier und nicht in fünf Komponenten.
 */
export function insightsGradientFor(paletteId: string, seed: string): readonly [string, string] {
  const id = paletteId.trim().toLowerCase()
  const entry = id ? BRAND_PALETTES.find(palette => palette.id === id) : undefined
  const gradient = entry ? entry.gradient : (seed ? brandGradientFor(seed) : null)
  if (!gradient) return INSIGHTS_FALLBACK_GRADIENT
  return [gradient[0], gradient[2]]
}

// ── 5. Listen-Items ────────────────────────────────────────────────────────

/**
 * ZEILE → LISTEN-ITEM, inklusive Adresse und Farbwelt.
 *
 * Beide brauchen die MARKE des Beitrags: der Pfad eines Markenprofils ist die
 * Adresse der Marke, und der Verlauf kommt aus ihrer `paletteId`. Die
 * Marken-Zeilen kommen deshalb GEBÜNDELT herein (`brands`) — eine Abfrage für
 * die ganze Liste.
 */
export function toInsightsPublicListItem(
  row: InsightsPostRow,
  brands: ReadonlyMap<string, InsightsBrandRow>,
): InsightsPublicPostListItem {
  const post = toInsightsPost(row)
  const first = post.brandRefs[0]?.brandId ?? ''
  const brand = first ? brands.get(first) : undefined
  const view = toInsightsPublicPost(row.$id, post)
  const { bodyDe: _bodyDe, bodyEn: _bodyEn, ...rest } = view
  return {
    ...rest,
    href: insightsPublicHref(post.format, post.slug, brand?.slug ?? ''),
    gradient: insightsGradientFor(brand?.paletteId ?? '', brand?.slug ?? ''),
  }
}

/** Die Marken-Ids ALLER Beiträge einer Liste — für die eine gebündelte Abfrage. */
export function insightsListBrandIds(rows: readonly InsightsPostRow[]): string[] {
  return rows.flatMap(row => toInsightsPost(row).brandRefs.map(ref => ref.brandId))
}

/**
 * DIE ERWÄHNTEN MARKEN EINES BEITRAGS — Name, Adresse, Zustand, Zahl.
 *
 * Nur `published`: eine entfernte Marke steht nicht als Chip unter einem
 * Artikel (dort wäre der Hinweis „auf Wunsch entfernt" ohne Zusammenhang), und
 * ein Entwurf schon gar nicht.
 */
export async function loadInsightsBrandRefs(
  event: H3Event,
  post: InsightsPost,
  brands: ReadonlyMap<string, InsightsBrandRow>,
): Promise<InsightsPublicBrandRef[]> {
  const refs: InsightsPublicBrandRef[] = []
  for (const ref of post.brandRefs) {
    const row = brands.get(ref.brandId)
    if (!row || row.state !== 'published') continue
    const brand = toInsightsBrand(row)
    refs.push({
      id: row.$id,
      name: brand.name,
      slug: brand.slug,
      state: brand.state,
      score: await loadInsightsBrandScore(event, brand),
    })
  }
  return refs
}

// ── 6. Der Anschluss-Stempel des Korrekturweges ────────────────────────────

/**
 * DER TAGES-STEMPEL EINES ANSCHLUSSES — sha256 aus IP und einem täglich
 * wechselnden Salz. Die ROHE IP verlässt diese Funktion nie und steht weder in
 * einer Zeile noch in einem Log.
 *
 * ── WARUM EIGEN UND NICHT ÜBER DEN VERTRAG ──────────────────────────────
 * `brandCheckIpHash` täte technisch dasselbe. Aber ein Stempel ist ein
 * NAMENSRAUM: derselbe Hash in `insights_corrections` und in
 * `brand_check_corrections` hiesse, dass sich Zeilen aus zwei Produkten
 * derselben Leitung zuordnen lassen — aus zwei Kostendeckeln würde eine
 * Besucher-Historie über Produktgrenzen. Der Vertrag zum brand-Layer trägt
 * ausserdem ZUSAGEN dieses Layers; eine Drossel ist keine.
 *
 * Das SALZ ist dasselbe server-only Geheimnis (`runtimeConfig.appwriteKey`) —
 * kein neuer Env-Eintrag, den eine Instanz vergessen kann. Der eigene
 * Namensraum steckt im Text (`|insights|`), nicht im Schlüssel.
 *
 * Es wechselt TÄGLICH, damit der Stempel genau so lange zuordenbar ist wie
 * das Fenster, das er deckelt. Preis: um Mitternacht (UTC) beginnt jeder
 * Anschluss von vorn — bekannt und gewollt.
 */
export function insightsIpHash(event: H3Event, now: Date = new Date()): string {
  const ip = trustedClientIp(event) ?? ''
  const salt = useRuntimeConfig(event).appwriteKey || 'insights'
  const day = now.toISOString().slice(0, 10)
  return createHash('sha256').update(`${salt}|insights|${day}|${ip}`).digest('hex')
}

// ── 7. Die Sitemap (App-Ebene, BI1 I3 / Discover D4) ───────────────────────

/**
 * WAS VON INSIGHTS IN DIE `sitemap.xml` GEHÖRT.
 *
 * ── WARUM HIER UND NICHT IN DER APP ─────────────────────────────────────
 * Die APP kennt die Summe ihrer Layer (CONCEPT A14) und baut die Sitemap —
 * aber WELCHE Insights-Adressen es gibt, weiss nur dieser Layer: der Riegel,
 * die Zustände, die redigierten Fassungen und die Adress-Regel je Format. Eine
 * Sitemap-Liste in der App wäre eine zweite Antwort auf „ist das öffentlich?",
 * und die erste (die Route) würde 404 sagen, während die zweite den Crawler
 * einlädt.
 *
 * ── `locales` IST DIE ZWEITE HÄLFTE VON §9.5 ────────────────────────────
 * „hreflang nur auf vorhandene Fassungen" gilt im Kopf UND in der Sitemap: ein
 * Beitrag ohne redigierte Übersetzung meldet nur seine Grundsprache. Eine
 * Sitemap, die beide anbietet, wäre dieselbe Zusage an denselben Crawler, nur
 * an einer zweiten Stelle.
 *
 * ── FAIL-SOFT ───────────────────────────────────────────────────────────
 * Jeder Ausfall ergibt eine LEERE Liste (der Aufrufer fängt zusätzlich). Eine
 * kürzere Sitemap ist besser als ein 500 auf einer Crawler-Adresse — dieselbe
 * Entscheidung wie bei den Anatomien daneben.
 */
export interface InsightsSitemapEntry {
  path: string
  lastmod: string
  locales: readonly ('en' | 'de')[]
}

export async function listInsightsSitemapEntries(event: H3Event): Promise<InsightsSitemapEntry[]> {
  const allowed = insightsPublicFormats()
  if (allowed.length === 0) return []

  const rows = await listPublicInsightsPostRows(event)
  const brands = await loadInsightsBrandRowsByIds(event, insightsListBrandIds(rows))

  const entries: InsightsSitemapEntry[] = []
  const topicsSeen = new Set<string>()

  /**
   * Die Ranking-ÜBERSICHT — nur mit Riegel. Sie antwortet zwar nie 404 (die
   * Seite zeigt bei gesperrtem Format ihren leeren Zustand, damit ein
   * Nav-Punkt nicht ins Leere zeigt), aber eine LEERE Seite bietet man einem
   * Crawler nicht an. Das Journal `/insights` steht dagegen fest in der Liste
   * der App: es ist die Adresse des Nav-Punktes und der Einstieg des ganzen
   * Bereichs.
   */
  if (allowed.includes('ranking')) {
    entries.push({ path: '/rankings', lastmod: '', locales: ['en', 'de'] })
  }

  for (const row of rows) {
    const post = toInsightsPost(row)
    if (!insightsPostIsVisible(post, allowed)) continue
    const first = post.brandRefs[0]?.brandId ?? ''
    const href = insightsPublicHref(post.format, post.slug, first ? brands.get(first)?.slug ?? '' : '')
    if (!href) continue

    const locales: ('en' | 'de')[] = post.translationReviewed
      ? ['en', 'de']
      : [post.baseLocale]
    entries.push({ path: href, lastmod: post.reviewedAt || post.publishedAt || '', locales })

    // Ein Themencluster kommt in die Sitemap, sobald EIN öffentlicher Beitrag
    // darauf zeigt: eine Themen-Seite ohne Beiträge ist ein leerer Zustand,
    // und den bietet man einem Crawler nicht an.
    for (const topic of post.topics) {
      if (!(INSIGHTS_TOPIC_KEYS as readonly string[]).includes(topic)) continue
      topicsSeen.add(topic)
    }
  }

  for (const topic of [...topicsSeen].sort()) {
    entries.push({ path: `/topics/${topic}`, lastmod: '', locales: ['en', 'de'] })
  }

  // Die Markenprofile — nur `published`, und nur mit freigeschaltetem Riegel.
  // `removed` bleibt DRAUSSEN, obwohl die Seite existiert: sie trägt `noindex`
  // und Status 410, und eine noindex-Adresse in einer Sitemap ist ein
  // Widerspruch, den Google zu Recht meldet.
  if (allowed.includes('profile')) {
    for (const row of await listPublishedInsightsBrandRows(event)) {
      entries.push({ path: `/brands/${row.slug}`, lastmod: row.$updatedAt, locales: ['en', 'de'] })
    }
  }

  return entries
}

/** Die öffentlich stehenden Markenprofile, alphabetisch nach Adresse. */
export async function listPublishedInsightsBrandRows(event: H3Event): Promise<InsightsBrandRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      queries: [
        Query.equal('state', 'published'),
        Query.orderAsc('slug'),
        Query.limit(INSIGHTS_PUBLIC_LIST_LIMIT),
      ],
    })
    return res.rows
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return []
    throw insightsStorageError(error, 'listPublishedInsightsBrandRows')
  }
}
