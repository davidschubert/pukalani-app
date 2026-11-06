import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import type { InsightsChannel, InsightsChannelLookup, InsightsChannelPreview } from '../../shared/insightsChannel'
import { INSIGHTS_CHANNELS_MAX, INSIGHTS_CHANNEL_CODES } from '../../shared/insightsChannel'
import type { InsightsChannelRow } from '../../shared/insightsRows'
import { INSIGHTS_CHANNELS_TABLE, fromInsightsChannel, toInsightsChannel } from '../../shared/insightsRows'
import { INSIGHTS_CHANNEL_SEED } from '../../shared/insightsChannelSeed'
import {
  INSIGHTS_YOUTUBE_BASE_URL,
  InsightsYoutubeError,
  insightsYoutubeChannelByHandleUrl,
  insightsYoutubeChannelsSchema,
  insightsYoutubeChannelsUrl,
  insightsYoutubePlaylistItemsSchema,
  insightsYoutubePlaylistItemsUrl,
  insightsYoutubeReason,
  insightsYoutubeSafeMessage,
} from '../../shared/insightsYoutube'
import { insightsUploadsPlaylistId } from '../../shared/insightsRadar'

/**
 * DIE KANALLISTE ALS ARBEIT (BI2 K3) — lesen, anlegen, ändern, prüfen.
 *
 * ── DREI AUFGABEN, DIE NICHT DASSELBE SIND ──────────────────────────────
 *  1. Die LISTE für den Radar: nur die aktiven Kanäle, als
 *     `InsightsRadarChannel`. Das ist der Weg, der `readInsightsRadarConfig`
 *     abgelöst hat, und er wird vom SWEEP und von der Radar-Route gelesen.
 *  2. Die LISTE für das Dashboard: alle Zeilen, auch die ausgeschalteten,
 *     mit Notiz und Prüfdatum.
 *  3. Die VORSCHAU gegen die YouTube-API, bevor etwas gespeichert wird.
 *
 * ── DIE VORSCHAU KOSTET ZWEI EINHEITEN, UND SIE IST ES WERT ─────────────
 * `channels.list` (1) sagt Titel, Handle und Abonnenten; `playlistItems.list`
 * auf der Uploads-Playlist (1) sagt, wann zuletzt etwas hochgeladen wurde.
 * Erst beides zusammen beantwortet die Frage, an der I4 gescheitert ist:
 * `@PentagramDesign` hatte einen echten Kanal, einen plausiblen Namen — und
 * ein einziges Video von 2012. Wer nur die Id prüft, prüft nur, dass es
 * IRGENDEINEN Kanal gibt.
 *
 * ── OHNE SCHLÜSSEL GIBT ES KEINE VORSCHAU, UND DAS IST DIE ANTWORT ──────
 * Kein Rückfall auf „dann speichern wir halt ungeprüft". Ein Kanal ohne
 * Vorschau ist genau der Zustand, aus dem die Fehlerliste von I4 entstanden
 * ist; die Route sagt `not_configured` und die Oberfläche nennt die Env-Zeile.
 */

/** Wie lange ein einzelner API-Aufruf höchstens dauern darf (wie im Sweep). */
const FETCH_TIMEOUT_MS = 15_000

/** „Diesen Kanal gibt es in unserer Liste nicht." */
export function insightsChannelMissing() {
  return createError({
    status: 404,
    statusText: 'Channel not found',
    data: { code: 'channel_not_found' },
  })
}

// ── Lesen ──────────────────────────────────────────────────────────────────

/**
 * ALLE ZEILEN — aktive zuerst, dann nach Cluster, dann nach Name.
 *
 * Die Sortierung passiert HIER im Speicher und nicht in Appwrite: drei
 * `orderAsc` über drei Spalten verlangten einen zusammengesetzten Index für
 * eine Liste mit fünfzig Zeilen. Der Deckel (`INSIGHTS_CHANNELS_MAX`) macht
 * das zu einer ehrlichen Rechnung und nicht zu einer Abkürzung.
 */
export async function listInsightsChannelRows(event: H3Event): Promise<InsightsChannelRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsChannelRow>({
      databaseId,
      tableId: INSIGHTS_CHANNELS_TABLE,
      queries: [Query.limit(INSIGHTS_CHANNELS_MAX)],
    })
    return res.rows
  }
  catch (error) {
    throw insightsStorageError(error, 'listInsightsChannelRows')
  }
}

/** Die Zeilen als Vertrag, in der Reihenfolge, in der die Ansicht sie zeigt. */
export async function listInsightsChannels(event: H3Event): Promise<InsightsChannel[]> {
  const rows = await listInsightsChannelRows(event)
  return rows.map(toInsightsChannel).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.topic !== b.topic) return a.topic.localeCompare(b.topic)
    return (a.title || a.channelId).localeCompare(b.title || b.channelId)
  })
}

/** Eine Zeile über ihre Row-Id — oder 404. */
export async function getInsightsChannelRow(event: H3Event, id: string): Promise<InsightsChannelRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.getRow<InsightsChannelRow>({
      databaseId, tableId: INSIGHTS_CHANNELS_TABLE, rowId: id,
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsChannelMissing()
    throw insightsStorageError(error, 'getInsightsChannelRow')
  }
}

// ── Schreiben ──────────────────────────────────────────────────────────────

/**
 * EINE ZEILE ANLEGEN.
 *
 * Der Doppelklick-Riegel ist der UNIQUE-Index, nicht eine Abfrage davor:
 * zwischen „gibt es den schon?" und `createRow` passt ein zweiter Request.
 * Der 409 aus Appwrite wird deshalb zu `channel_duplicate` übersetzt, statt
 * ihn durch eine Vorab-Prüfung unwahrscheinlicher zu machen.
 */
export async function createInsightsChannel(event: H3Event, channel: InsightsChannel): Promise<InsightsChannel> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const row = await tablesDB.createRow<InsightsChannelRow>({
      databaseId,
      tableId: INSIGHTS_CHANNELS_TABLE,
      rowId: ID.unique(),
      data: fromInsightsChannel(channel),
    })
    return toInsightsChannel(row)
  }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      throw createError({
        status: 409,
        statusText: 'Channel already listed',
        data: { code: INSIGHTS_CHANNEL_CODES.duplicate },
      })
    }
    throw insightsStorageError(error, 'createInsightsChannel')
  }
}

/** Die Felder einer Zeile ändern — welche, entscheidet der Aufrufer. */
export async function updateInsightsChannelRow(
  event: H3Event,
  id: string,
  data: Partial<ReturnType<typeof fromInsightsChannel>>,
): Promise<InsightsChannel> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const row = await tablesDB.updateRow<InsightsChannelRow>({
      databaseId, tableId: INSIGHTS_CHANNELS_TABLE, rowId: id, data,
    })
    return toInsightsChannel(row)
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsChannelMissing()
    throw insightsStorageError(error, 'updateInsightsChannelRow')
  }
}

/** Eine Zeile entfernen — für das, was nie hingehörte (s. Kopf von `insightsChannel.ts`). */
export async function deleteInsightsChannelRow(event: H3Event, id: string): Promise<void> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_CHANNELS_TABLE, rowId: id })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsChannelMissing()
    throw insightsStorageError(error, 'deleteInsightsChannelRow')
  }
}

/**
 * DIE SAAT ÜBERNEHMEN — nur in eine LEERE Tabelle.
 *
 * Die Bedingung ist der ganze Punkt: ein zweiter Lauf auf eine gepflegte
 * Liste brächte Kanäle zurück, die der Betreiber bewusst entfernt hat. Steht
 * schon eine Zeile, passiert nichts und die Antwort sagt es (`seeded: 0`).
 */
export async function seedInsightsChannels(event: H3Event): Promise<number> {
  const existing = await listInsightsChannelRows(event)
  if (existing.length > 0) return 0

  let seeded = 0
  for (const entry of INSIGHTS_CHANNEL_SEED) {
    await createInsightsChannel(event, {
      channelId: entry.channelId,
      topic: entry.topic,
      title: entry.title,
      handle: entry.handle,
      subscribers: 0,
      active: true,
      note: entry.note,
      // Beide leer, und das ist ehrlich: die Saat kennt diese Zahlen nicht,
      // der erste Lauf (oder die erste Vorschau) trägt sie nach.
      lastUploadAt: '',
      checkedAt: '',
    })
    seeded += 1
  }
  return seeded
}

// ── Die Vorschau gegen die YouTube-API ─────────────────────────────────────

export interface InsightsChannelLookupDeps {
  fetchJson?: (url: string) => Promise<unknown>
  apiKey?: string
  baseUrl?: string
  /** Welche Kanal-Ids die Liste schon führt — für `known`. */
  knownIds?: ReadonlySet<string>
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
 * EINEN KANAL NACHSCHLAGEN UND SEINEN JÜNGSTEN UPLOAD DAZU.
 *
 * ── WARUM `deps` ────────────────────────────────────────────────────────
 * Derselbe Grund wie beim Sweep: ohne sie wäre dieser Weg nur mit einem
 * echten Schlüssel und einem echten Kanal prüfbar — und die Fälle, auf die es
 * ankommt (Handle existiert nicht, Kanal ohne Uploads, `quotaExceeded`),
 * liessen sich gar nicht herstellen.
 *
 * ── DER ZWEITE AUFRUF DARF SCHEITERN, DER ERSTE NICHT ───────────────────
 * Ohne `channels.list` gibt es keinen Kanal und damit keine Vorschau. Ohne
 * `playlistItems.list` gibt es nur kein DATUM — und ein fehlendes Datum ist
 * eine Auskunft („wir wissen es nicht"), kein Grund, dem Betreiber das
 * Anlegen zu verweigern.
 */
export async function previewInsightsChannel(
  lookup: InsightsChannelLookup,
  deps: InsightsChannelLookupDeps = {},
): Promise<InsightsChannelPreview> {
  const apiKey = deps.apiKey ?? ''
  if (!apiKey) {
    throw createError({
      status: 503,
      statusText: 'YouTube key missing',
      data: { code: INSIGHTS_CHANNEL_CODES.notConfigured },
    })
  }
  const baseUrl = deps.baseUrl || INSIGHTS_YOUTUBE_BASE_URL
  const fetchJson = deps.fetchJson ?? defaultFetchJson

  const url = lookup.kind === 'id'
    ? insightsYoutubeChannelsUrl(baseUrl, apiKey, [lookup.channelId])
    : insightsYoutubeChannelByHandleUrl(baseUrl, apiKey, lookup.handle)

  let parsed
  try {
    parsed = insightsYoutubeChannelsSchema.parse(await fetchJson(url))
  }
  catch (error) {
    throw createError({
      status: 502,
      statusText: 'YouTube unavailable',
      data: { code: 'youtube_unavailable', detail: insightsYoutubeSafeMessage(error) },
    })
  }

  const item = parsed.items[0]
  if (!item) {
    throw createError({
      status: 404,
      statusText: 'Channel not found',
      data: { code: INSIGHTS_CHANNEL_CODES.notFound },
    })
  }

  return {
    channelId: item.id,
    title: item.snippet.title,
    // YouTube liefert das Handle MIT `@`; wir führen es ohne, damit die
    // Oberfläche eines voranstellen kann, ohne je zwei zu zeigen.
    handle: (item.snippet.customUrl ?? '').replace(/^@/, ''),
    subscribers: item.statistics.subscriberCount,
    lastUploadAt: await latestUploadDay(item.id, baseUrl, apiKey, fetchJson),
    known: deps.knownIds?.has(item.id) ?? false,
  }
}

/** Der Tag des jüngsten Uploads — leer, wenn es keinen gibt oder der Abruf scheitert. */
async function latestUploadDay(
  channelId: string,
  baseUrl: string,
  apiKey: string,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<string> {
  const playlistId = insightsUploadsPlaylistId(channelId)
  if (!playlistId) return ''
  try {
    const parsed = insightsYoutubePlaylistItemsSchema.parse(
      await fetchJson(insightsYoutubePlaylistItemsUrl(baseUrl, apiKey, playlistId, 1)),
    )
    return (parsed.items[0]?.contentDetails?.videoPublishedAt ?? '').slice(0, 10)
  }
  catch {
    // Fail-soft mit Ansage: die Vorschau sagt dann „unbekannt" statt zu lügen.
    return ''
  }
}

// ── Was der Radar von der Liste braucht ────────────────────────────────────

/**
 * NUR DIE METHODE, DIE DIESER LESER BENUTZT — wörtlich dieselbe Begründung
 * wie `TablesDbLike` im Sweep: ein voller `TablesDB`-Typ zwänge jeden Test,
 * dreissig Methoden zu erfinden, die er nie ruft.
 */
export interface InsightsChannelReader {
  listRows: <T>(args: { databaseId: string, tableId: string, queries?: string[] }) => Promise<{ rows: T[], total: number }>
}

/**
 * DIE AKTIVEN KANÄLE FÜR EINEN RADAR-LAUF.
 *
 * ── DER NACHFOLGER VON `readInsightsRadarConfig().channels` ─────────────
 * Dieselbe Form (`InsightsRadarChannel`), damit der Sweep und die Einordnung
 * unverändert bleiben — nur die QUELLE ist eine andere. Der Client kommt als
 * Argument herein statt aus `insightsDb(event)`, weil der nächtliche Lauf
 * KEINEN Request hat (s. Kopf von `insightsRadarSweep.ts`) und sich seinen
 * Admin-Client selbst baut.
 *
 * ── DIE PRÜFUNG BLEIBT, SIE STEHT NUR WOANDERS ─────────────────────────
 * `readInsightsRadarConfig` warf ungültige Zeilen weg (keine Kanal-Id, kein
 * bekanntes Cluster, doppelt). Genau das passiert hier weiter: eine Zeile, die
 * aus irgendeinem Grund keine brauchbare Id trägt, darf keinen Lauf kosten.
 * Der UNIQUE-Index deckt die Doppelung ab, der Riegel bleibt trotzdem — er
 * kostet nichts und macht die Typ-Enge her.
 */
export async function readActiveRadarChannels(
  tablesDB: InsightsChannelReader,
  databaseId: string,
): Promise<{ channelId: string, topic: InsightsChannel['topic'], title: string }[]> {
  const res = await tablesDB.listRows<InsightsChannelRow>({
    databaseId,
    tableId: INSIGHTS_CHANNELS_TABLE,
    queries: [Query.equal('active', true), Query.limit(INSIGHTS_CHANNELS_MAX)],
  })

  const seen = new Set<string>()
  const channels: { channelId: string, topic: InsightsChannel['topic'], title: string }[] = []
  for (const row of res.rows) {
    const channel = toInsightsChannel(row)
    if (!insightsUploadsPlaylistId(channel.channelId)) continue
    if (seen.has(channel.channelId)) continue
    seen.add(channel.channelId)
    channels.push({ channelId: channel.channelId, topic: channel.topic, title: channel.title })
  }
  return channels
}

/**
 * WAS EIN LAUF ÜBER EINEN KANAL GELERNT HAT, ZURÜCKSCHREIBEN.
 *
 * Nur die API-Felder (s. `insightsRows.ts`): Titel, Handle, Abonnenten,
 * Prüfzeitpunkt. Das HANDLE kam im Klick-Beweis dazu — ohne es stand ein über
 * die Vorschau aufgenommener Kanal dauerhaft mit seiner rohen Id in der Liste,
 * obwohl die Vorschau das Handle längst gesehen hatte.
 * `topic`, `active` und `note` gehören dem Betreiber und werden hier NICHT
 * angefasst — ein Lauf, der die Notiz überschriebe, nähme der Liste genau das,
 * wofür sie gebaut wurde.
 *
 * Fail-soft: ein fehlgeschlagener Nachtrag ist kein Grund, einen sonst
 * erfolgreichen Lauf scheitern zu lassen. Er fehlt dann in der Anzeige, nicht
 * in den Daten.
 */
export async function touchInsightsChannels(
  tablesDB: InsightsChannelReader & {
    updateRow: (args: { databaseId: string, tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<unknown>
  },
  databaseId: string,
  seen: ReadonlyMap<string, { title: string, subscribers: number, handle: string }>,
  checkedAt: string,
): Promise<void> {
  if (seen.size === 0) return
  const res = await tablesDB.listRows<InsightsChannelRow>({
    databaseId,
    tableId: INSIGHTS_CHANNELS_TABLE,
    queries: [Query.limit(INSIGHTS_CHANNELS_MAX)],
  })
  for (const row of res.rows) {
    const meta = seen.get(row.channelId)
    if (!meta) continue
    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: INSIGHTS_CHANNELS_TABLE,
        rowId: row.$id,
        data: {
          title: meta.title.slice(0, 160),
          subscribers: meta.subscribers,
          // Das Handle NUR setzen, wenn die API eines nennt: ein Kanal ohne
          // `customUrl` soll nicht das verlieren, was die Saat mitgebracht hat.
          ...(meta.handle ? { handle: meta.handle.slice(0, 64) } : {}),
          checkedAt,
        },
      })
    }
    catch {
      // s. Kopf: ein Nachtrag scheitert leise.
    }
  }
}

/**
 * DIE ZEILE ZU EINER KANAL-ID — oder 404.
 *
 * ── WARUM DIE ROUTEN ÜBER DIE KANAL-ID GEHEN UND NICHT ÜBER DIE ROW-ID ──
 * Weil der Vertrag `InsightsChannel` die Row-Id bewusst NICHT trägt: er
 * beschreibt einen Kanal, nicht eine Appwrite-Zeile. Die Oberfläche hätte sie
 * sonst nur, wenn wir sie extra durchreichten — und dann stünde in der Liste
 * ein Feld, das niemand liest und das bei jeder Abbildung mitgeschleppt wird.
 * Die Kanal-Id leistet dasselbe: sie ist eindeutig (UNIQUE-Index), sie steht
 * ohnehin in der Antwort, und sie ist die Identität, über die auch die
 * Radar-Zeilen sprechen.
 *
 * Der Preis ist diese eine zusätzliche Abfrage je Änderung. Bei einer Liste
 * mit höchstens fünfzig Zeilen und einer Änderung alle paar Wochen ist das
 * keine Rechnung, über die man nachdenken muss.
 */
export async function findInsightsChannelRow(event: H3Event, channelId: string): Promise<InsightsChannelRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  let rows: InsightsChannelRow[]
  try {
    const res = await tablesDB.listRows<InsightsChannelRow>({
      databaseId,
      tableId: INSIGHTS_CHANNELS_TABLE,
      queries: [Query.equal('channelId', channelId), Query.limit(1)],
    })
    rows = res.rows
  }
  catch (error) {
    throw insightsStorageError(error, 'findInsightsChannelRow')
  }
  const row = rows[0]
  if (!row) throw insightsChannelMissing()
  return row
}
