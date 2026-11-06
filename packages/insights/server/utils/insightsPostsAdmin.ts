import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import type { InsightsBrand, InsightsPost } from '../../shared/insightsPost'
import { insightsSlugHistoryPush } from '../../shared/insightsPost'
import type { InsightsBrandRow, InsightsPostRow } from '../../shared/insightsRows'
import {
  INSIGHTS_BRANDS_TABLE,
  INSIGHTS_POSTS_TABLE,
  fromInsightsBrand,
  fromInsightsPost,
  toInsightsBrand,
  toInsightsPost,
} from '../../shared/insightsRows'
import type { InsightsBrandListItem, InsightsPostListItem } from '../../shared/types/insightsApi'
import { brandPublicationSlug, brandPublicationSlugCandidate } from '../contracts/brandContract'

/**
 * DER ABLAGE-ZUGRIFF DER REDAKTION (BI1 I2) — alles, was mehr als eine Route
 * braucht, an EINER Stelle.
 *
 * ── WARUM NEBEN `insightsStore.ts` UND NICHT DARIN ───────────────────────
 * `insightsStore.ts` ist der GRUNDZUGRIFF: Client, Database-Id, „gibt es das
 * nicht?", die Deckel. Diese Datei ist die ARBEIT damit — Zeilen holen,
 * Adressen finden, Zeilen schreiben, Zeilen für die Liste zuschneiden. Dieselbe
 * Trennung wie `brandStore.ts` ↔ `brandWaitlistAdmin.ts`. Wer nur wissen will,
 * WIE der Layer an seine Daten kommt, muss dafür nicht durch zehn Abfragen.
 *
 * ── KEIN `tenantDb`, UND DAS IST BEGRÜNDET ───────────────────────────────
 * Wörtlich der Kopf von `insightsStore.ts`: `branding` ist ein Silo, die drei
 * Tabellen tragen kein `communityId`, der ESLint-Backstop gilt den GEPOOLTEN
 * Layern. Die Grenze dieses Layers ist `insights.manage` — jede Route hier
 * beginnt mit `requirePermission(event, 'insights.manage')`, und darunter gibt
 * es nichts zu scopen.
 *
 * ── FEHLER VERLASSEN DIESE DATEI OHNE APPWRITE-DETAILS ───────────────────
 * `insightsStorageError` macht aus jedem Ablage-Fehler ein 503 mit einem
 * Satz — ein durchgereichter `AppwriteException` verriete Tabellennamen und
 * Spalten (CLAUDE.md: „keine Appwrite-Fehlerdetails an Clients leaken").
 * Geloggt wird er trotzdem, sonst sucht der Betreiber im Dunkeln.
 */

/** „Diese Zeile gibt es nicht." — 404, und zwar ehrlich: wer hier ankommt,
 *  hat `insights.manage` und darf wissen, dass die Zeile fehlt. */
export function insightsPostMissing() {
  return createError({ status: 404, statusText: 'Post not found', data: { code: 'post_not_found' } })
}

/** „Diese Marken-Zeile gibt es nicht." — dasselbe Argument wie eine Zeile
 *  darüber, nur für die andere Tabelle. Ein eigener Code, weil die Oberfläche
 *  daraus einen anderen Satz macht (und ein anderer Ort gemeint ist). */
export function insightsBrandMissing() {
  return createError({ status: 404, statusText: 'Brand not found', data: { code: 'brand_not_found' } })
}

/** Ein Ablage-Ausfall — 503 mit Grund im Log, nie im Körper. */
export function insightsStorageError(error: unknown, message: string) {
  console.error('[insights] Ablage nicht erreichbar:', message, error)
  return createError({ status: 503, statusText: 'Insights storage unavailable', data: { code: 'storage_unavailable' } })
}

// ── Beiträge ───────────────────────────────────────────────────────────────

export async function listInsightsPostRows(event: H3Event, limit: number): Promise<InsightsPostRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      // `$updatedAt` und nicht `publishedAt`: die Redaktionsliste ist eine
      // ARBEITSLISTE — oben steht, woran zuletzt gearbeitet wurde, nicht was
      // zuletzt erschienen ist (die meisten Zeilen haben gar kein `publishedAt`).
      queries: [Query.orderDesc('$updatedAt'), Query.limit(limit)],
    })
    return res.rows
  }
  catch (error) {
    throw insightsStorageError(error, 'listInsightsPostRows')
  }
}

export async function loadInsightsPostRow(event: H3Event, id: string): Promise<InsightsPostRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.getRow<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsPostMissing()
    throw insightsStorageError(error, `loadInsightsPostRow ${id}`)
  }
}

export async function createInsightsPostRow(event: H3Event, post: InsightsPost): Promise<InsightsPostRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.createRow<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      rowId: ID.unique(),
      data: fromInsightsPost(post),
    })
  }
  catch (error) {
    throw insightsStorageError(error, 'createInsightsPostRow')
  }
}

export async function saveInsightsPostRow(event: H3Event, id: string, post: InsightsPost): Promise<InsightsPostRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.updateRow<InsightsPostRow>({
      databaseId,
      tableId: INSIGHTS_POSTS_TABLE,
      rowId: id,
      data: fromInsightsPost(post),
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsPostMissing()
    throw insightsStorageError(error, `saveInsightsPostRow ${id}`)
  }
}

/**
 * EINE BEITRAGS-ZEILE LÖSCHEN (BI1 I2-Rest).
 *
 * OB gelöscht werden darf, entscheidet `insightsPostDeletable` in der Route —
 * nicht diese Funktion. Sie ist der Ablage-Zugriff und kennt keinen Zustand;
 * eine Sicherung hier UND dort wären zwei Wahrheiten, und die hier wäre die
 * ohne Fehlermeldung für den Menschen.
 *
 * Das 404 ist ein ehrliches: wer hier ankommt, hat `insights.manage` und darf
 * wissen, dass die Zeile schon weg ist (etwa weil ein zweiter Reiter offen
 * war).
 */
export async function deleteInsightsPostRow(event: H3Event, id: string): Promise<void> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_POSTS_TABLE, rowId: id })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsPostMissing()
    throw insightsStorageError(error, `deleteInsightsPostRow ${id}`)
  }
}

/** Die Zeile, wie die Redaktionsliste sie zeigt — OHNE Fliesstext (s. Typ). */
export function toInsightsPostListItem(row: InsightsPostRow): InsightsPostListItem {
  const post = toInsightsPost(row)
  return {
    id: row.$id,
    format: post.format,
    state: post.state,
    baseLocale: post.baseLocale,
    titleDe: post.titleDe,
    titleEn: post.titleEn,
    slug: post.slug,
    translationReviewed: post.translationReviewed,
    translatedAt: post.translatedAt,
    publishedAt: post.publishedAt,
    readingMinutes: post.readingMinutes,
    updatedAt: row.$updatedAt,
  }
}

// ── Marken ─────────────────────────────────────────────────────────────────

export async function listInsightsBrandRows(event: H3Event, limit: number): Promise<InsightsBrandRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      queries: [Query.orderAsc('name'), Query.limit(limit)],
    })
    return res.rows
  }
  catch (error) {
    throw insightsStorageError(error, 'listInsightsBrandRows')
  }
}

export async function createInsightsBrandRow(event: H3Event, brand: InsightsBrand): Promise<InsightsBrandRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.createRow<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      rowId: ID.unique(),
      data: fromInsightsBrand(brand),
    })
  }
  catch (error) {
    throw insightsStorageError(error, 'createInsightsBrandRow')
  }
}

export async function loadInsightsBrandRow(event: H3Event, id: string): Promise<InsightsBrandRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.getRow<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsBrandMissing()
    throw insightsStorageError(error, `loadInsightsBrandRow ${id}`)
  }
}

export async function saveInsightsBrandRow(event: H3Event, id: string, brand: InsightsBrand): Promise<InsightsBrandRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.updateRow<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      rowId: id,
      data: fromInsightsBrand(brand),
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsBrandMissing()
    throw insightsStorageError(error, `saveInsightsBrandRow ${id}`)
  }
}

export function toInsightsBrandListItem(row: InsightsBrandRow): InsightsBrandListItem {
  const brand = toInsightsBrand(row)
  return {
    id: row.$id,
    name: brand.name,
    slug: brand.slug,
    homepage: brand.homepage,
    industry: brand.industry,
    country: brand.country,
    state: brand.state,
    updatedAt: row.$updatedAt,
  }
}

/**
 * DIE MARKEN, DIE ES GIBT (Prüfregel 6) — `removed` zählt NICHT.
 *
 * Eine auf Wunsch entfernte Marke ist kein Ort mehr, an dem ein
 * Korrekturvorschlag ankommen könnte (§9.3: „ihre Zeile geht auf `removed` und
 * wird nirgends mehr gelesen"). Ein Beitrag, der sie weiter verweist, ist
 * genau der Fall, den Regel 6 zeigen soll.
 */
export function insightsKnownBrandIds(rows: readonly InsightsBrandRow[]): string[] {
  return rows.filter(row => row.state !== 'removed').map(row => row.$id)
}

// ── Adressen ───────────────────────────────────────────────────────────────

/**
 * WIE VIELE ADRESSEN PROBIERT WERDEN — wörtlich das Muster von
 * `findFreeBrandPublicationSlug`: alle Kandidaten in EINER Abfrage, danach der
 * erste freie. Der UNIQUE-Index `uq_slug` bleibt die eigentliche Sicherung;
 * diese Funktion sucht nur den Kandidaten, das 409 beim Schreiben ist die
 * Wahrheit.
 */
const SLUG_ATTEMPTS = 10

async function takenSlugs(event: H3Event, tableId: string, candidates: readonly string[], ownRowId: string): Promise<Set<string>> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsPostRow | InsightsBrandRow>({
      databaseId,
      tableId,
      queries: [Query.equal('slug', [...candidates]), Query.limit(candidates.length)],
    })
    return new Set(res.rows.filter(row => row.$id !== ownRowId).map(row => row.slug))
  }
  catch (error) {
    // Fehlt die Tabelle, ist keine Adresse belegt. Jeder andere Fehler gehört
    // dem Aufrufer: eine Adresse zu vergeben, ohne nachgesehen zu haben, wäre
    // ein 409 im Gesicht des Menschen statt eines sauberen Fehlers.
    if (isInsightsRowMissing(error)) return new Set()
    throw insightsStorageError(error, `takenSlugs ${tableId}`)
  }
}

/**
 * DIE FREIE ADRESSE ZU EINEM TITEL — `titel`, sonst `titel-2`, `titel-3`, …
 *
 * Die Slug-REGEL kommt über den Vertrag aus dem brand-Layer
 * (`brandPublicationSlug`): „Zwei Slug-Funktionen wären zwei Wahrheiten über
 * dieselbe Adresse." Die eigene Zeile zählt nicht als Kollision — wer seinen
 * Beitrag speichert, behält seine Adresse.
 */
export async function findFreeInsightsSlug(
  event: H3Event,
  table: 'posts' | 'brands',
  wanted: string,
  ownRowId: string,
): Promise<string | null> {
  const base = brandPublicationSlug(wanted)
  if (!base) return null
  const candidates = Array.from({ length: SLUG_ATTEMPTS }, (_, index) => brandPublicationSlugCandidate(base, index + 1))
  const tableId = table === 'posts' ? INSIGHTS_POSTS_TABLE : INSIGHTS_BRANDS_TABLE
  const taken = await takenSlugs(event, tableId, candidates, ownRowId)
  return candidates.find(candidate => !taken.has(candidate)) ?? null
}

/**
 * DIE UMBENENNUNG (§9.2) — die alte Adresse reiht sich in die Historie ein,
 * damit die 301 sie später findet.
 *
 * Sie steht hier und nicht in der Route, weil zwei Dinge zusammengehören, die
 * man einzeln vergessen kann: prüfen, ob die neue Adresse frei ist, UND die
 * alte aufheben. Eine Route, die nur das erste tut, bricht jeden Link — still.
 *
 * SIE GILT FÜR BEIDE TABELLEN (seit der Marken-Seite, BI1 I2-Rest): `table`
 * sagt, wo gesucht wird, und `current` nimmt nur die zwei Felder entgegen, um
 * die es geht. Eine zweite, abgeschriebene Fassung für Marken hätte genau
 * einen Unterschied — den Tabellennamen — und irgendwann einen zweiten, den
 * niemand wollte.
 */
export async function applyInsightsSlugChange(
  event: H3Event,
  table: 'posts' | 'brands',
  id: string,
  current: { slug: string, slugHistory: string[] },
  wanted: string,
): Promise<{ slug: string, slugHistory: string[] }> {
  const trimmed = wanted.trim()
  if (!trimmed || trimmed === current.slug) {
    return { slug: current.slug, slugHistory: current.slugHistory }
  }
  const free = await findFreeInsightsSlug(event, table, trimmed, id)
  if (!free) {
    throw createError({ status: 409, statusText: 'Slug unavailable', data: { code: 'slug_taken' } })
  }
  return { slug: free, slugHistory: insightsSlugHistoryPush(current.slugHistory, current.slug) }
}
