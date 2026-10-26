import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import type { InsightsVerdict, InsightsWatchItem } from '../../shared/insightsWatchlist'
import { INSIGHTS_WATCHLIST_MAX, INSIGHTS_WATCH_CODES } from '../../shared/insightsWatchlist'
import type { InsightsWatchRow } from '../../shared/insightsRows'
import { INSIGHTS_WATCHLIST_TABLE, fromInsightsWatchItem, toInsightsWatchItem } from '../../shared/insightsRows'
import { insightsRadarClassify } from '../../shared/insightsRadar'
import type { InsightsTopicKey } from '../../shared/insightsPost'
import {
  INSIGHTS_YOUTUBE_BASE_URL,
  InsightsYoutubeError,
  insightsYoutubeBatches,
  insightsYoutubeChannelsSchema,
  insightsYoutubeChannelsUrl,
  insightsYoutubeReason,
  insightsYoutubeSafeMessage,
  insightsYoutubeVideosSchema,
  insightsYoutubeVideosUrl,
} from '../../shared/insightsYoutube'

/**
 * DIE EIGENE VIDEO-LISTE ALS ARBEIT (BI2 K4).
 *
 * ── DREI EINSTIEGE, EINE TABELLE ────────────────────────────────────────
 *  1. Der LINK-WURF: eine Adresse wird zu einer Zeile. Holt die Zahlen
 *     sofort (2 Einheiten: `videos.list` + `channels.list`), damit die Zeile
 *     nicht als leeres Gerüst in der Liste steht.
 *  2. Das URTEIL AUS DEM RADAR: „Interessant" legt das Video hier ab — mit
 *     den Zahlen, die die Radar-Zeile ohnehin schon trägt, also OHNE einen
 *     einzigen API-Aufruf.
 *  3. Der TÄGLICHE LAUF zieht die Zahlen aller Zeilen nach.
 *
 * ── DIE TRENNLINIE WIRD HIER DURCHGESETZT ───────────────────────────────
 * `refreshInsightsWatchlist` schreibt AUSSCHLIESSLICH API-Felder. Urteil,
 * Notiz, Cluster und `addedAt` stehen in keinem seiner `data`-Objekte — nicht
 * aus Versehen, sondern weil ein Lauf, der sie überschriebe, der Liste genau
 * das nähme, wofür sie gebaut wurde.
 */

/** Wie lange ein einzelner API-Aufruf höchstens dauern darf (wie im Sweep). */
const FETCH_TIMEOUT_MS = 15_000

/** „Dieses Video steht nicht in deiner Liste." */
export function insightsWatchMissing() {
  return createError({
    status: 404,
    statusText: 'Video not on the list',
    data: { code: INSIGHTS_WATCH_CODES.notFound },
  })
}

// ── Lesen ──────────────────────────────────────────────────────────────────

/**
 * ALLE FUNDSTÜCKE, ZULETZT HINZUGEFÜGTES ZUERST.
 *
 * Sortiert wird in Appwrite (`idx_added_at`) und nicht im Speicher: anders als
 * bei der Kanalliste ist das hier EIN Feld, es hat einen Index, und die Liste
 * ist zehnmal so lang.
 */
export async function listInsightsWatchRows(event: H3Event): Promise<InsightsWatchRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsWatchRow>({
      databaseId,
      tableId: INSIGHTS_WATCHLIST_TABLE,
      queries: [Query.orderDesc('addedAt'), Query.limit(INSIGHTS_WATCHLIST_MAX)],
    })
    return res.rows
  }
  catch (error) {
    throw insightsStorageError(error, 'listInsightsWatchRows')
  }
}

export async function listInsightsWatchItems(event: H3Event): Promise<InsightsWatchItem[]> {
  return (await listInsightsWatchRows(event)).map(toInsightsWatchItem)
}

/**
 * DIE URTEILE ZU EINER MENGE VON VIDEO-IDS — was der RADAR dazuliest.
 *
 * ── WARUM NICHT EINFACH DIE GANZE LISTE ─────────────────────────────────
 * Weil der Radar bis zu 500 Zeilen zeigt und die Fundstücke bis zu 200: die
 * ganze Liste zu holen und im Speicher zu schneiden wäre dieselbe Abfrage mit
 * mehr Antwort. `Query.equal` nimmt eine Menge, und die Radar-Route kennt ihre
 * Ids ohnehin.
 *
 * Die Antwort ist eine KARTE und keine Liste: der Radar fragt je Zeile
 * „welches Urteil hat dieses Video?", und eine Liste zwänge ihn bei 500 Zeilen
 * zu 500 linearen Suchen.
 */
export async function readInsightsVerdicts(
  event: H3Event,
  videoIds: readonly string[],
): Promise<Record<string, InsightsVerdict>> {
  if (videoIds.length === 0) return {}
  const { tablesDB, databaseId } = insightsDb(event)
  const verdicts: Record<string, InsightsVerdict> = {}
  try {
    // `Query.equal` mit einer sehr langen Menge wird zu einer sehr langen
    // Adresse — in Stapeln wie bei der YouTube-API, aus demselben Grund.
    for (const batch of insightsYoutubeBatches([...videoIds], 100)) {
      const res = await tablesDB.listRows<InsightsWatchRow>({
        databaseId,
        tableId: INSIGHTS_WATCHLIST_TABLE,
        queries: [Query.equal('videoId', batch), Query.limit(batch.length)],
      })
      for (const row of res.rows) verdicts[row.videoId] = toInsightsWatchItem(row).verdict
    }
  }
  catch (error) {
    // FAIL-SOFT: ohne insights-007 gibt es die Tabelle nicht, und der Radar
    // soll dann ohne Urteile funktionieren statt gar nicht. Jeder ANDERE
    // Fehler bleibt einer.
    if (isInsightsRowMissing(error)) return {}
    throw insightsStorageError(error, 'readInsightsVerdicts')
  }
  return verdicts
}

/** Die Zeile zu einer Video-Id — oder `null`. */
export async function findInsightsWatchRow(event: H3Event, videoId: string): Promise<InsightsWatchRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsWatchRow>({
      databaseId,
      tableId: INSIGHTS_WATCHLIST_TABLE,
      queries: [Query.equal('videoId', videoId), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    throw insightsStorageError(error, 'findInsightsWatchRow')
  }
}

// ── Schreiben ──────────────────────────────────────────────────────────────

/** Eine Zeile anlegen. Der Doppelklick-Riegel ist der UNIQUE-Index. */
export async function createInsightsWatchItem(event: H3Event, item: InsightsWatchItem): Promise<InsightsWatchItem> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const row = await tablesDB.createRow<InsightsWatchRow>({
      databaseId,
      tableId: INSIGHTS_WATCHLIST_TABLE,
      rowId: ID.unique(),
      data: fromInsightsWatchItem(item),
    })
    return toInsightsWatchItem(row)
  }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      throw createError({
        status: 409,
        statusText: 'Video already on the list',
        data: { code: INSIGHTS_WATCH_CODES.duplicate },
      })
    }
    throw insightsStorageError(error, 'createInsightsWatchItem')
  }
}

export async function updateInsightsWatchRow(
  event: H3Event,
  rowId: string,
  data: Partial<ReturnType<typeof fromInsightsWatchItem>>,
): Promise<InsightsWatchItem> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const row = await tablesDB.updateRow<InsightsWatchRow>({
      databaseId, tableId: INSIGHTS_WATCHLIST_TABLE, rowId, data,
    })
    return toInsightsWatchItem(row)
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsWatchMissing()
    throw insightsStorageError(error, 'updateInsightsWatchRow')
  }
}

export async function deleteInsightsWatchRow(event: H3Event, rowId: string): Promise<void> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_WATCHLIST_TABLE, rowId })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsWatchMissing()
    throw insightsStorageError(error, 'deleteInsightsWatchRow')
  }
}

/** Steht die Liste schon am Deckel? */
export async function assertInsightsWatchlistRoom(event: H3Event): Promise<void> {
  const rows = await listInsightsWatchRows(event)
  if (rows.length >= INSIGHTS_WATCHLIST_MAX) {
    throw createError({
      status: 409,
      statusText: 'Watchlist full',
      data: { code: INSIGHTS_WATCH_CODES.tooMany },
    })
  }
}

// ── Die Zahlen eines EINZELNEN Videos holen (der Link-Wurf) ────────────────

export interface InsightsWatchFetchDeps {
  fetchJson?: (url: string) => Promise<unknown>
  apiKey?: string
  baseUrl?: string
}

/** Die Vorgabe für `fetchJson` — wörtlich dieselbe wie im Sweep. */
async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    }
    catch {
      body = undefined
    }
    throw new InsightsYoutubeError(response.status, insightsYoutubeReason(body))
  }
  return await response.json()
}

/**
 * EIN VIDEO NACHSCHLAGEN — Zahlen, Kanal und ein Cluster-VORSCHLAG.
 *
 * Der Vorschlag kommt aus derselben Schlagwortliste wie im Radar
 * (`insightsRadarClassify`) und mit demselben Grundwert: der Kanal ist hier
 * unbekannt, also startet die Einordnung beim Rückfall-Cluster und lässt sich
 * nur vom TITEL korrigieren. Ein Mensch darf ihn danach ändern — und dann
 * fasst ihn kein Lauf mehr an.
 */
export async function fetchInsightsWatchVideo(
  videoId: string,
  fallbackTopic: InsightsTopicKey,
  deps: InsightsWatchFetchDeps = {},
): Promise<Omit<InsightsWatchItem, 'verdict' | 'note' | 'addedAt'>> {
  const apiKey = deps.apiKey ?? ''
  if (!apiKey) {
    throw createError({
      status: 503,
      statusText: 'YouTube key missing',
      data: { code: INSIGHTS_WATCH_CODES.notConfigured },
    })
  }
  const baseUrl = deps.baseUrl || INSIGHTS_YOUTUBE_BASE_URL
  const fetchJson = deps.fetchJson ?? defaultFetchJson

  let video
  try {
    const parsed = insightsYoutubeVideosSchema.parse(
      await fetchJson(insightsYoutubeVideosUrl(baseUrl, apiKey, [videoId])),
    )
    video = parsed.items[0]
  }
  catch (error) {
    throw createError({
      status: 502,
      statusText: 'YouTube unavailable',
      data: { code: 'youtube_unavailable', detail: insightsYoutubeSafeMessage(error) },
    })
  }
  if (!video) {
    throw createError({
      status: 404,
      statusText: 'Video not found',
      data: { code: INSIGHTS_WATCH_CODES.notFound },
    })
  }

  // Die Abonnentenzahl ist der Nenner der Popularität. Sie zu holen ist eine
  // zweite Einheit — ohne sie wäre die Opportunity dieser Zeile dauerhaft aus
  // einem Signal weniger gerechnet als die daneben im Radar.
  let subscribers = 0
  try {
    const parsed = insightsYoutubeChannelsSchema.parse(
      await fetchJson(insightsYoutubeChannelsUrl(baseUrl, apiKey, [video.snippet.channelId])),
    )
    subscribers = parsed.items[0]?.statistics.subscriberCount ?? 0
  }
  catch {
    // Fail-soft: der nächste Lauf trägt sie nach.
  }

  return {
    videoId: video.id,
    topic: insightsRadarClassify(video.snippet.title, fallbackTopic).topic,
    available: true,
    refreshedAt: new Date().toISOString(),
    title: video.snippet.title,
    channelId: video.snippet.channelId,
    channelTitle: video.snippet.channelTitle,
    channelSubscribers: subscribers,
    views: video.statistics.viewCount,
    likes: video.statistics.likeCount,
    commentCount: video.statistics.commentCount,
    publishedAt: video.snippet.publishedAt.slice(0, 10),
  }
}

// ── Der tägliche Nachtrag (aus dem Sweep) ──────────────────────────────────

/** Nur die Methoden, die dieser Nachtrag benutzt (Muster: `TablesDbLike`). */
export interface InsightsWatchWriter {
  listRows: <T>(args: { databaseId: string, tableId: string, queries?: string[] }) => Promise<{ rows: T[], total: number }>
  updateRow: (args: { databaseId: string, tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<unknown>
}

export interface InsightsWatchRefreshResult {
  /** Wie viele Zeilen der Nachtrag gelesen hat. */
  items: number
  /** Wie viele er aktualisiert hat. */
  updated: number
  /** Wie viele Videos nicht mehr abrufbar waren (Zahlen geleert, Zeile blieb). */
  gone: number
}

/**
 * DIE ZAHLEN ALLER FUNDSTÜCKE NACHZIEHEN — ein Stapel je 50, also eine
 * Einheit je 50 Videos. Bei 200 Zeilen sind das vier Einheiten von 10.000.
 *
 * ── WAS PASSIERT, WENN EIN VIDEO WEG IST ────────────────────────────────
 * `videos.list` liefert fehlende Ids einfach nicht mit — kein Fehler, keine
 * Zeile. Genau das ist das Signal: was angefragt und nicht geliefert wurde,
 * ist privat oder gelöscht. Dann werden die ZAHLEN geleert
 * (`available: false`), und die Zeile bleibt mit deinem Urteil stehen.
 *
 * ── UND WAS NICHT PASSIERT ──────────────────────────────────────────────
 * Kein `verdict`, kein `note`, kein `topic`, kein `addedAt` in irgendeinem
 * `data`-Objekt dieser Funktion. Das ist die Trennlinie aus dem Kopf von
 * `insightsRows.ts`, und sie steht hier als Code und nicht als Vorsatz.
 */
export async function refreshInsightsWatchlist(
  tablesDB: InsightsWatchWriter,
  databaseId: string,
  apiKey: string,
  baseUrl: string,
  fetchJson: (url: string) => Promise<unknown>,
  now: Date,
): Promise<InsightsWatchRefreshResult> {
  const result: InsightsWatchRefreshResult = { items: 0, updated: 0, gone: 0 }

  const listed = await tablesDB.listRows<InsightsWatchRow>({
    databaseId,
    tableId: INSIGHTS_WATCHLIST_TABLE,
    queries: [Query.limit(INSIGHTS_WATCHLIST_MAX)],
  })
  const rows = listed.rows
  result.items = rows.length
  if (rows.length === 0) return result

  const refreshedAt = now.toISOString()
  const byId = new Map(rows.map(row => [row.videoId, row]))

  for (const batch of insightsYoutubeBatches(rows.map(row => row.videoId))) {
    const parsed = insightsYoutubeVideosSchema.parse(
      await fetchJson(insightsYoutubeVideosUrl(baseUrl, apiKey, batch)),
    )
    const seen = new Set<string>()

    for (const video of parsed.items) {
      const row = byId.get(video.id)
      if (!row) continue
      seen.add(video.id)
      await tablesDB.updateRow({
        databaseId,
        tableId: INSIGHTS_WATCHLIST_TABLE,
        rowId: row.$id,
        data: {
          available: true,
          refreshedAt,
          title: video.snippet.title.slice(0, 300),
          channelId: video.snippet.channelId.slice(0, 64),
          channelTitle: video.snippet.channelTitle.slice(0, 160),
          views: video.statistics.viewCount,
          likes: video.statistics.likeCount,
          commentCount: video.statistics.commentCount,
          publishedAt: video.snippet.publishedAt
            ? `${video.snippet.publishedAt.slice(0, 10)}T00:00:00.000Z`
            : null,
        },
      })
      result.updated += 1
    }

    // Angefragt und nicht geliefert ⇒ weg (s. Kopf).
    for (const videoId of batch) {
      if (seen.has(videoId)) continue
      const row = byId.get(videoId)
      if (!row || row.available === false) continue
      await tablesDB.updateRow({
        databaseId,
        tableId: INSIGHTS_WATCHLIST_TABLE,
        rowId: row.$id,
        data: {
          available: false,
          refreshedAt,
          title: '',
          channelTitle: '',
          channelSubscribers: 0,
          views: 0,
          likes: 0,
          commentCount: 0,
          publishedAt: null,
        },
      })
      result.gone += 1
    }
  }

  // Die Abonnenten-Zahlen der beteiligten Kanäle, gestapelt — der Nenner der
  // Popularität. Eine Einheit je 50 KANÄLE, und ein Fehler hier kostet nur
  // diese eine Zahl.
  const channelIds = [...new Set(rows.map(row => row.channelId).filter(Boolean))]
  for (const batch of insightsYoutubeBatches(channelIds)) {
    try {
      const parsed = insightsYoutubeChannelsSchema.parse(
        await fetchJson(insightsYoutubeChannelsUrl(baseUrl, apiKey, batch)),
      )
      const subs = new Map(parsed.items.map(item => [item.id, item.statistics.subscriberCount]))
      for (const row of rows) {
        const value = subs.get(row.channelId)
        if (value === undefined || value === row.channelSubscribers) continue
        await tablesDB.updateRow({
          databaseId, tableId: INSIGHTS_WATCHLIST_TABLE, rowId: row.$id,
          data: { channelSubscribers: value },
        })
      }
    }
    catch {
      // s. Kopf: eine fehlende Abonnentenzahl ist ein Signal weniger, kein
      // Grund, den Nachtrag abzubrechen.
    }
  }

  return result
}
