import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import type { InsightsRadarChannel, InsightsRadarStoredVideo } from '../../shared/insightsRadar'
import {
  insightsRadarClassify,
  insightsUploadsPlaylistId,
  readInsightsRadarConfig,
} from '../../shared/insightsRadar'
import { INSIGHTS_RADAR_RETENTION_DAYS, insightsOpportunity, insightsPopularity } from '../../shared/insightsPost'
import type { InsightsTopicRow } from '../../shared/insightsRows'
import { INSIGHTS_TOPICS_TABLE, fromInsightsRadarVideo } from '../../shared/insightsRows'
import {
  INSIGHTS_RADAR_QUOTA_CEILING,
  INSIGHTS_YOUTUBE_BASE_URL,
  InsightsYoutubeError,
  insightsRadarQuotaEstimate,
  insightsYoutubeBatches,
  insightsYoutubeChannelsSchema,
  insightsYoutubeChannelsUrl,
  insightsYoutubeIsFatal,
  insightsYoutubePlaylistItemsSchema,
  insightsYoutubePlaylistItemsUrl,
  insightsYoutubeReason,
  insightsYoutubeSafeMessage,
  insightsYoutubeVideoIds,
  insightsYoutubeVideosSchema,
  insightsYoutubeVideosUrl,
} from '../../shared/insightsYoutube'

/**
 * DER TÄGLICHE LAUF DES THEMENRADARS (BI1 I4, Plan §9.6).
 *
 * Er holt für jeden kuratierten Kanal die jüngsten Uploads, liest zu jedem
 * Video die drei öffentlichen Zahlen, ordnet es einem unserer acht Cluster zu,
 * rechnet UNSERE Opportunity-Zahl und schreibt eine Zeile je Video. Danach
 * räumt er weg, was der Lauf nicht mehr erreicht hat.
 *
 * ── VIER LEITPLANKEN, DIE HIER NICHT VERHANDELBAR SIND (§9.6) ───────────
 *  (a) Je Video NUR die öffentlichen Zahlen der API — kein Verdichten über
 *      Kanäle hinweg (Policies III.E.2).
 *  (b) KEINE Kommentar-Texte, KEINE Nutzernamen. Es gibt in dieser Datei
 *      keinen `commentThreads`-Aufruf, und in `insightsYoutube.ts` keinen
 *      Adress-Bauer dafür.
 *  (c) Kuratierte Kanalliste statt `search.list` — drei Endpunkte, je eine
 *      Einheit.
 *  (d) Der Radar blockiert nichts. Jeder Fehlerpfad hier endet in einer Zahl
 *      im Ergebnis, nie in einem Wurf nach draussen.
 *
 * ── OHNE `H3Event`, WIE JEDER SWEEP DIESES PROJEKTS ─────────────────────
 * Dieselbe dokumentierte Ausnahme wie bei `insightsCorrectionsSweep.ts`,
 * `brandEventsSweep.ts` und `marketRawSweep.ts`: ein Sweep bedient keinen
 * Request, er liegt deshalb in `server/utils` statt in `server/plugins`, und
 * `createAdminClient()`/`useRuntimeConfig()` werden ohne Event gebaut
 * (CLAUDE.md nennt Sweeps ausdrücklich als erlaubt ausserhalb der Datentür).
 * Der Betreiber-KNOPF ruft denselben Lauf und reicht sein Event durch — dann
 * werden dieselben Helfer damit gebaut.
 *
 * ── WARUM ES `deps` GIBT ────────────────────────────────────────────────
 * Nicht aus Architektur-Liebe, sondern weil dieser Lauf sonst NICHT PRÜFBAR
 * wäre: er spricht über das Netz mit einem fremden Dienst, dessen Antworten
 * man mit einem echten Schlüssel gar nicht herstellen könnte (ein Video, das
 * zwischen zwei Aufrufen privat wird; ein `quotaExceeded`). `fetchJson` und
 * die vier Nitro-Auto-Imports sind deshalb überschreibbar; die Vorgaben sind
 * genau das, was ohne Test läuft. Beweis: `tests/insightsRadarSweep.test.ts`.
 *
 * ── DIE KANALLISTE KOMMT AUS `useAppConfig()` ───────────────────────────
 * Und zwar HIER, nicht als Argument aus dem Plugin oder aus der Route.
 * `useAppConfig()` ist im Nitro-Kontext verfügbar und nimmt dort KEIN Event
 * (dasselbe tun `tickets/server/utils/ticketTriage.ts` und
 * `core/server/utils/aiComplete.ts`) — die App-Config wird zur Bauzeit
 * eingebacken und ist eine Konstante des Prozesses, keine Eigenschaft eines
 * Requests. Sie durch zwei Aufrufer zu reichen hiesse, dass Sweep und Knopf
 * zwei Wege zu derselben Wahrheit hätten, und einer davon irgendwann der
 * falsche wäre.
 *
 * ── LOGZEILEN OHNE SCHLÜSSEL UND OHNE INHALT ────────────────────────────
 * `insights.radar_swept` trägt ZAHLEN. Kein Videotitel, kein Kanalname, keine
 * Adresse — und ganz sicher nichts, was den API-Schlüssel enthalten könnte
 * (der steht bei dieser API in der Query, s. `insightsYoutubeSafeMessage`).
 */

/** Wie lange ein einzelner API-Aufruf höchstens dauern darf. */
const FETCH_TIMEOUT_MS = 15_000

/** Wie viele Zeilen das 30-Tage-Netz je Runde löscht. */
const DELETE_BATCH = 200

/**
 * Wie viele Lösch-Runden ein Lauf höchstens dreht.
 *
 * 5 × 200 = 1.000 Zeilen. Mehr wäre in einer Tabelle, die täglich überschrieben
 * wird, kein Aufräumen mehr, sondern ein Umzug — und was übrig bleibt, nimmt
 * der Lauf am nächsten Tag. Der Deckel steht gegen den einen Fall, in dem eine
 * Abfrage immer wieder dieselben Zeilen liefert (Filter greift nicht): ohne ihn
 * liefe die Schleife ewig.
 */
const DELETE_ROUNDS_MAX = 5

/**
 * DIE VORGABEN FÜR DIE ZWEI KANAL-SCHRITTE — als lokale Funktionen und nicht
 * direkt als `deps.x ?? autoImport`.
 *
 * Der Unterschied ist nicht kosmetisch: ein Nitro-Auto-Import ist im
 * Vitest-Lauf gar nicht vorhanden, und `a ?? autoImport` schlägt ihn schon
 * beim Auswerten nach — also auch dann, wenn der Test eine eigene Fassung
 * mitbringt. In einer lokalen Funktion wird er erst beim AUFRUF berührt.
 */
async function defaultReadChannels(tablesDB: TablesDbLike, databaseId: string): Promise<InsightsRadarChannel[]> {
  return await readActiveRadarChannels(tablesDB, databaseId)
}
async function defaultRefreshWatchlist(
  tablesDB: TablesDbLike,
  databaseId: string,
  apiKey: string,
  baseUrl: string,
  fetchJson: (url: string) => Promise<unknown>,
  now: Date,
): Promise<{ items: number, updated: number, gone: number }> {
  return await refreshInsightsWatchlist(
    tablesDB as unknown as Parameters<typeof refreshInsightsWatchlist>[0],
    databaseId, apiKey, baseUrl, fetchJson, now,
  )
}
async function defaultTouchChannels(
  tablesDB: TablesDbLike,
  databaseId: string,
  seen: ReadonlyMap<string, { title: string, subscribers: number, handle: string }>,
  checkedAt: string,
): Promise<void> {
  await touchInsightsChannels(
    tablesDB as unknown as Parameters<typeof touchInsightsChannels>[0],
    databaseId,
    seen,
    checkedAt,
  )
}

/** Läuft gerade einer? Ein zweiter würde dieselben Zeilen doppelt schreiben. */
let sweepRunning = false

/**
 * Die „kein Schlüssel"-Zeile steht EINMAL je Prozess.
 *
 * Sie ist ein Betriebszustand, kein Ereignis: der Schlüssel fehlt bis zu
 * Davids Eintrag, und eine tägliche Zeile darüber würde genau in dem Moment
 * überlesen, in dem sie etwas bedeutet. Der Env-Wächter ist die laute Stelle,
 * das Log nur die leise.
 */
let unconfiguredLogged = false

export interface InsightsRadarSweepResult {
  /** Wie viele Kanäle der Lauf gelesen hat. */
  channels: number
  /** Wie viele Videos die API dazu geliefert hat. */
  videos: number
  /** Wie viele Zeilen angelegt oder aktualisiert wurden. */
  upserted: number
  /** Wie viele Zeilen die zwei Netze entfernt haben (30 Tage Abruf, Alters-Deckel). */
  deleted: number
  /**
   * Wie viele gelieferte Videos der Alters-Deckel NICHT gespeichert hat
   * (`maxVideoAgeDays`). Gezählt, nicht verschwiegen: ein Kanal, der nur
   * noch Altes liefert, soll in der Zahl auffallen — er gehört aus der Liste.
   */
  tooOld: number
  /** Fehlgeschlagene Kanäle und Schreibvorgänge — fail-soft, aber gezählt. */
  errors: number
  /** Was der Lauf nach der Formel aus §9.6 gekostet hat (Schätzung). */
  quotaUnits: number
  /**
   * Wie viele FUNDSTÜCKE (BI2 K4) derselbe Lauf nachgezogen hat, und wie
   * viele davon nicht mehr abrufbar waren. `undefined`, wenn es die Tabelle
   * nicht gibt — der Layer kann ohne insights-007 im Bau sein.
   */
  watchlist?: { items: number, updated: number, gone: number }
  /** Gesetzt, wenn der Lauf gar nicht stattgefunden hat — mit dem Grund. */
  skipped?: 'not_configured' | 'no_channels' | 'quota_estimate' | 'running'
}

export interface InsightsRadarSweepDeps {
  /** Der Request, falls es einen gibt (Betreiber-Knopf) — sonst nichts. */
  event?: H3Event
  /** Eine Adresse holen und als JSON auspacken. Vorgabe: globales `fetch`. */
  fetchJson?: (url: string) => Promise<unknown>
  /** Vorgabe: `useAppConfig()` (nimmt in Nitro kein Event). */
  readAppConfig?: () => unknown
  /**
   * Die kuratierten Kanäle. Vorgabe seit BI2 K3: die TABELLE
   * `insights_channels` (`readActiveRadarChannels`) — vorher stand die Liste
   * in der App-Config, und ein Deploy war der einzige Weg, sie zu ändern.
   */
  readChannels?: (tablesDB: TablesDbLike, databaseId: string) => Promise<InsightsRadarChannel[]>
  /**
   * Was der Lauf über die Kanäle gelernt hat, an die Liste zurückschreiben.
   * Vorgabe: `touchInsightsChannels`. Überschreibbar aus demselben Grund wie
   * alles andere hier — ein Nitro-Auto-Import existiert im Vitest-Lauf nicht.
   */
  touchChannels?: (
    tablesDB: TablesDbLike,
    databaseId: string,
    seen: ReadonlyMap<string, { title: string, subscribers: number, handle: string }>,
    checkedAt: string,
  ) => Promise<void>
  /**
   * Die Zahlen der FUNDSTÜCKE nachziehen (BI2 K4). Vorgabe:
   * `refreshInsightsWatchlist`. Überschreibbar aus demselben Grund wie alles
   * andere hier — ein Nitro-Auto-Import existiert im Vitest-Lauf nicht.
   */
  refreshWatchlist?: (
    tablesDB: TablesDbLike,
    databaseId: string,
    apiKey: string,
    baseUrl: string,
    fetchJson: (url: string) => Promise<unknown>,
    now: Date,
  ) => Promise<{ items: number, updated: number, gone: number }>
  /** Vorgabe: `useRuntimeConfig(event)`. */
  readRuntimeConfig?: () => { insightsYoutubeKey?: string, insightsYoutubeBaseUrl?: string, public: { appwriteDatabaseId: string } }
  /** Vorgabe: `createAdminClient(event).tablesDB`. */
  tablesDB?: TablesDbLike
  /** Vorgabe: `logEvent`. */
  log?: (level: 'info' | 'warn', name: string, data: Record<string, unknown>) => void
}

/**
 * NUR DIE VIER METHODEN, DIE DIESER LAUF BENUTZT.
 *
 * Ein voller `TablesDB`-Typ zwänge jeden Test, dreissig Methoden zu erfinden,
 * die er nie ruft — und ein Fake, der nur durch ein `as unknown as` passt, ist
 * kein Netz mehr, sondern ein Loch mit Typ.
 */
interface TablesDbLike {
  listRows: <T>(args: { databaseId: string, tableId: string, queries?: string[] }) => Promise<{ rows: T[], total: number }>
  createRow: (args: { databaseId: string, tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<unknown>
  updateRow: (args: { databaseId: string, tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<unknown>
  deleteRow: (args: { databaseId: string, tableId: string, rowId: string }) => Promise<unknown>
}

/**
 * DIE VORGABE FÜR `fetchJson` — mit Zeitgrenze, ohne Nachrichtenschleppe.
 *
 * Ein nicht-200 wird zu einem `InsightsYoutubeError` mit Status UND Googles
 * eigenem `reason` (`quotaExceeded`, `playlistNotFound`, …). Der ist die
 * Entscheidungsgrundlage weiter unten: ein fehlender Kanal ist ein Fehler von
 * EINEM Kanal, ein leeres Budget das Ende des Laufs.
 */
async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new InsightsYoutubeError(response.status, insightsYoutubeReason(body))
  return body
}

/** „Die Tabelle gibt es hier nicht" — dann ist der Layer ohne Migration im Bau. */
function isTableMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 404
}

/** Der Kalendertag eines Zeitpunkts (UTC) — die Ablage-Form des Vertrags. */
function toDay(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/**
 * EINEN DURCHGANG FAHREN.
 *
 * `now` ist ein Argument, damit der Takt keine zweite Zeitquelle hat und ein
 * Test die Uhr stellen kann (dieselbe Regel wie beim Fristen-Sweep).
 */
export async function runInsightsRadarSweep(
  deps: InsightsRadarSweepDeps = {},
  now: Date = new Date(),
): Promise<InsightsRadarSweepResult> {
  const result: InsightsRadarSweepResult = {
    channels: 0, videos: 0, upserted: 0, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 0,
  }

  if (sweepRunning) return { ...result, skipped: 'running' }
  sweepRunning = true

  const log = deps.log ?? ((level, name, data) => logEvent(level, name, data))

  try {
    const runtime = deps.readRuntimeConfig?.() ?? useRuntimeConfig(deps.event)
    const apiKey = runtime.insightsYoutubeKey ?? ''
    // Der Rückfall ist die Konstante und keine zweite getippte Adresse: der
    // Vorgabewert steht in `nuxt.config.ts`, und eine leere Env-Zeile darf hier
    // nicht zu einem Aufruf gegen `/playlistItems` ohne Host werden.
    const baseUrl = runtime.insightsYoutubeBaseUrl || INSIGHTS_YOUTUBE_BASE_URL

    // GATE 1: ohne Schlüssel passiert NICHTS — kein halber Lauf, keine
    // Bruchstücke in der Tabelle (s. Kopf von `nuxt.config.ts`).
    if (!apiKey) {
      if (!unconfiguredLogged) {
        unconfiguredLogged = true
        log('info', 'insights.radar_unconfigured', { reason: 'NUXT_INSIGHTS_YOUTUBE_KEY' })
      }
      return { ...result, skipped: 'not_configured' }
    }

    // Die zwei DECKEL kommen weiter aus der App-Config: sie sind
    // Betriebsgrössen („wie tief lesen wir", „wie alt darf ein Video sein")
    // und keine redaktionelle Entscheidung.
    // OHNE Event, auch im Request: `useAppConfig()` nimmt in Nitro kein
    // Argument — die App-Config wird zur Bauzeit eingebacken und ist eine
    // Konstante des Prozesses, keine Eigenschaft eines Requests.
    const { maxVideos, maxVideoAgeDays } = readInsightsRadarConfig(
      deps.readAppConfig?.() ?? useAppConfig(),
    )

    const fetchJson = deps.fetchJson ?? defaultFetchJson
    const tablesDB = deps.tablesDB ?? (createAdminClient(deps.event).tablesDB as unknown as TablesDbLike)
    const databaseId = runtime.public.appwriteDatabaseId
    const fetchedDay = toDay(now)

    // GATE 2: die kuratierte Liste — seit BI2 K3 aus der TABELLE. Leer heisst
    // „diese Instanz hat noch keine Kanäle" und ist kein Fehler: die
    // Dashboard-Seite bietet dann die Übernahme der Saat an.
    let channels: InsightsRadarChannel[]
    try {
      channels = await (deps.readChannels ?? defaultReadChannels)(tablesDB, databaseId)
    }
    catch (error) {
      result.errors += 1
      log('warn', 'insights.radar_channels_unreadable', { message: String((error as Error)?.name ?? 'error') })
      return { ...result, skipped: 'no_channels' }
    }
    if (channels.length === 0) return { ...result, skipped: 'no_channels' }

    // GATE 3: die Quota-Schätzung VOR dem ersten Aufruf (§9.6 Leitplanke c).
    // Der Lauf, der zu teuer wäre, findet nicht statt — sonst nimmt er dem
    // nächsten sein Budget und der meldet den falschen Fehler.
    result.quotaUnits = insightsRadarQuotaEstimate(channels.length, maxVideos)
    if (result.quotaUnits > INSIGHTS_RADAR_QUOTA_CEILING) {
      log('warn', 'insights.radar_quota_estimate_exceeded', {
        channels: channels.length,
        maxVideos,
        quotaUnits: result.quotaUnits,
        ceiling: INSIGHTS_RADAR_QUOTA_CEILING,
      })
      return { ...result, skipped: 'quota_estimate' }
    }

    // ── 1. Die Kanäle: Name und Abonnentenzahl, gestapelt zu je 50 ────────
    const meta = new Map<string, { title: string, subscribers: number, handle: string }>()
    for (const batch of insightsYoutubeBatches(channels.map(channel => channel.channelId))) {
      try {
        const parsed = insightsYoutubeChannelsSchema.parse(
          await fetchJson(insightsYoutubeChannelsUrl(baseUrl, apiKey, batch)),
        )
        for (const item of parsed.items) {
          meta.set(item.id, {
            title: item.snippet.title,
            subscribers: item.statistics.subscriberCount,
            // YouTube führt das Handle MIT `@`; die Liste führt es ohne.
            handle: (item.snippet.customUrl ?? '').replace(/^@/, ''),
          })
        }
      }
      catch (error) {
        if (insightsYoutubeIsFatal(error)) return abort(error, result, log)
        result.errors += 1
        log('warn', 'insights.radar_channels_failed', { message: insightsYoutubeSafeMessage(error) })
      }
    }

    // Was der Lauf gerade über die Kanäle gelernt hat, zurück an die Liste —
    // damit die Dashboard-Seite den aktuellen Namen und die Abonnentenzahl
    // zeigt, ohne dafür noch einmal Quota auszugeben. Nur die API-Felder;
    // Cluster, Zustand und Notiz gehören dem Betreiber. Fail-soft.
    await (deps.touchChannels ?? defaultTouchChannels)(tablesDB, databaseId, meta, now.toISOString())

    // ── 2. Je Kanal die jüngsten Uploads ─────────────────────────────────
    // Ein Kanal, der fehlschlägt, kostet EINEN Kanal. Der Lauf macht weiter:
    // ein aus der Liste genommener oder umgezogener Kanal darf nicht den Rest
    // der Redaktion um ihr Tagesbild bringen.
    const videoIds: string[] = []
    const topicOf = new Map<string, InsightsRadarChannel>()
    for (const channel of channels) {
      const playlistId = insightsUploadsPlaylistId(channel.channelId)
      // `readInsightsRadarConfig` hat das schon geprüft — der Riegel steht
      // trotzdem, weil er hier die Typ-Enge herstellt und nichts kostet.
      if (!playlistId) continue
      try {
        const parsed = insightsYoutubePlaylistItemsSchema.parse(
          await fetchJson(insightsYoutubePlaylistItemsUrl(baseUrl, apiKey, playlistId, maxVideos)),
        )
        result.channels += 1
        for (const id of insightsYoutubeVideoIds(parsed).slice(0, maxVideos)) {
          if (topicOf.has(id)) continue
          topicOf.set(id, channel)
          videoIds.push(id)
        }
      }
      catch (error) {
        if (insightsYoutubeIsFatal(error)) return abort(error, result, log)
        result.errors += 1
        log('warn', 'insights.radar_channel_failed', {
          channelId: channel.channelId,
          message: insightsYoutubeSafeMessage(error),
        })
      }
    }

    // ── 3. Die Zahlen je Video, gestapelt zu je 50 ───────────────────────
    const videos: InsightsRadarStoredVideo[] = []
    for (const batch of insightsYoutubeBatches(videoIds)) {
      try {
        const parsed = insightsYoutubeVideosSchema.parse(
          await fetchJson(insightsYoutubeVideosUrl(baseUrl, apiKey, batch)),
        )
        // WAS HIER FEHLT, FEHLT MIT ABSICHT: `videos.list` liefert privat
        // gestellte und gelöschte Videos NICHT zurück. Wir laufen deshalb über
        // die ANTWORT und nicht über den Stapel — ein Video ohne Zahlen bekäme
        // sonst eine Zeile voller Nullen, und die sähe aus wie ein Flop.
        for (const item of parsed.items) {
          const channel = topicOf.get(item.id)
          if (!channel) continue
          const info = meta.get(item.snippet.channelId || channel.channelId)
          const { topic, relevance } = insightsRadarClassify(item.snippet.title, channel.topic)
          const publishedDay = toDay(item.snippet.publishedAt)
          // DER ALTERS-DECKEL (Schärfung 2026-09-10): die Uploads-Playlist
          // liefert die JÜNGSTEN Videos eines Kanals — bei einem Kanal, der
          // seit Jahren nichts hochlädt, sind das Videos von 2020 oder 2012,
          // und das 30-Tage-Netz sieht nur, dass wir sie HEUTE geholt haben.
          // Ein Video ohne lesbares Datum bleibt drin: der Deckel schliesst
          // aus, was nachweislich alt ist, nicht, was er nicht kennt.
          if (publishedDay && daysBetween(publishedDay, fetchedDay) > maxVideoAgeDays) {
            result.tooOld += 1
            continue
          }
          const subscribers = info?.subscribers ?? 0
          const opportunity = insightsOpportunity({
            // OHNE ABONNENTENZAHL GIBT ES KEIN PERFORMANCE-SIGNAL, nicht das
            // Signal 0: ein Kanal, der seine Zahl verbirgt, ist nicht ein
            // Kanal mit null Abonnenten. Die Zahl rechnet dann aus zwei
            // Signalen und sagt es in ihrer Fussnote — genau dafür gibt es sie.
            ...(subscribers > 0 ? { popularity: insightsPopularity(item.statistics.viewCount, subscribers) } : {}),
            ...(publishedDay ? { ageDays: daysBetween(publishedDay, fetchedDay) } : {}),
            relevance,
          })
          videos.push({
            videoId: item.id,
            channelId: channel.channelId,
            // Der Name aus der API schlägt den aus unserer Konfiguration —
            // letzterer ist nur ein Lesehinweis und kann veraltet sein.
            channelTitle: info?.title || item.snippet.channelTitle || channel.title || channel.channelId,
            channelSubscribers: subscribers,
            title: item.snippet.title,
            views: item.statistics.viewCount,
            likes: item.statistics.likeCount,
            commentCount: item.statistics.commentCount,
            publishedAt: publishedDay,
            fetchedAt: fetchedDay,
            topic,
            relevance,
            opportunity: opportunity.score,
            opportunitySignals: opportunity.signals,
          })
        }
      }
      catch (error) {
        if (insightsYoutubeIsFatal(error)) return abort(error, result, log)
        result.errors += 1
        log('warn', 'insights.radar_videos_failed', { message: insightsYoutubeSafeMessage(error) })
      }
    }
    result.videos = videos.length

    // ── 4. Upsert je Video ───────────────────────────────────────────────
    const upsert = await upsertRadarRows(tablesDB, databaseId, videos, log)
    if (upsert === null) {
      // FAIL-SOFT UND STILL: auf einer Instanz OHNE insights-004 gibt es die
      // Tabelle nicht, und der Layer kann trotzdem einkompiliert sein (der
      // Playground ist genau so). Dieselbe Wahl wie beim Fristen-Sweep.
      return result
    }
    result.upserted = upsert.upserted
    result.errors += upsert.errors

    // ── 5. Die zwei Netze ────────────────────────────────────────────────
    // (a) 30 Tage nach dem ABRUF (III.E.4): was der Lauf nicht mehr erreicht.
    const cutoff = new Date(now.getTime() - INSIGHTS_RADAR_RETENTION_DAYS * 86_400_000)
    const swept = await deleteExpiredRadarRows(tablesDB, databaseId, 'fetchedAt', cutoff, log)
    // (b) der Alters-Deckel nach der VERÖFFENTLICHUNG: Zeilen, die ein
    // früherer Lauf (oder eine grosszügigere Grenze) noch gespeichert hat.
    // Ohne dieses Netz stünden sie bis zu 30 Tage weiter in der Liste — der
    // Deckel oben verhindert nur, dass sie ERNEUT geschrieben werden.
    // `publishedAt` trägt keinen Index (Migration insights-004); der Filter
    // läuft auf Appwrite 2.0 ohne (lesend gegen Prod geprüft 2026-09-10,
    // 32 Zeilen), sortiert wird über den indizierten `fetchedAt`.
    const ageCutoff = new Date(now.getTime() - maxVideoAgeDays * 86_400_000)
    const aged = await deleteExpiredRadarRows(tablesDB, databaseId, 'publishedAt', ageCutoff, log)
    result.deleted = swept.deleted + aged.deleted
    result.errors += swept.errors + aged.errors

    // ── 6. Die FUNDSTÜCKE nachziehen (BI2 K4) ────────────────────────────
    // Derselbe Lauf, weil es dieselbe Frage an dieselbe API ist: „was sagen
    // die Zahlen heute?". Ein zweiter Sweep dafür hätte einen zweiten Takt,
    // einen zweiten Kill-Switch und eine zweite Stelle, an der jemand den
    // Schlüssel sucht. Kostet vier Einheiten je 200 Zeilen.
    //
    // FAIL-SOFT und AM ENDE: ein Fehler hier darf das Tagesbild des Radars
    // nicht in Frage stellen, das oben schon geschrieben ist.
    try {
      const refreshed = await (deps.refreshWatchlist ?? defaultRefreshWatchlist)(
        tablesDB, databaseId, apiKey, baseUrl, fetchJson, now,
      )
      result.watchlist = refreshed
      result.quotaUnits += Math.ceil(refreshed.items / 50)
    }
    catch (error) {
      // 404 = keine Tabelle: der Layer kann ohne insights-007 im Bau sein —
      // dieselbe stille Wahl wie beim Radar ohne insights-004. `isTableMissing`
      // ist die HAUSEIGENE Prüfung dieser Datei und nicht der Auto-Import
      // `isInsightsRowMissing`: den gibt es im Vitest-Lauf nicht.
      if (!isTableMissing(error)) {
        result.errors += 1
        log('warn', 'insights.watchlist_refresh_failed', { message: insightsYoutubeSafeMessage(error) })
      }
    }

    log('info', 'insights.radar_swept', {
      channels: result.channels,
      videos: result.videos,
      upserted: result.upserted,
      deleted: result.deleted,
      tooOld: result.tooOld,
      errors: result.errors,
      quotaUnits: result.quotaUnits,
      watchlist: result.watchlist?.items ?? 0,
      watchlistGone: result.watchlist?.gone ?? 0,
    })
    return result
  }
  finally {
    sweepRunning = false
  }
}

/**
 * DER ABBRUCH BEI EINEM FATALEN GRUND (`quotaExceeded`, 401, 403).
 *
 * Weitermachen wäre hier keine Robustheit, sondern Trotz: jeder weitere
 * Aufruf antwortet mit demselben Fehler, verbraucht aber trotzdem eine
 * Anfrage — und am Ende stünde eine Tabelle, die zur Hälfte von heute und zur
 * Hälfte von gestern ist. Die schon geschriebenen Zeilen bleiben; sie sind
 * nicht falsch, nur unvollständig, und das 30-Tage-Netz räumt den Rest.
 */
function abort(
  error: unknown,
  result: InsightsRadarSweepResult,
  log: (level: 'info' | 'warn', name: string, data: Record<string, unknown>) => void,
): InsightsRadarSweepResult {
  result.errors += 1
  log('warn', 'insights.radar_quota_exceeded', {
    reason: error instanceof InsightsYoutubeError ? error.reason : '',
    status: error instanceof InsightsYoutubeError ? error.status : 0,
    videos: result.videos,
    upserted: result.upserted,
  })
  return result
}

/** Tage zwischen zwei Kalendertagen — dieselbe Rechnung wie in der Ansicht. */
function daysBetween(fromDay: string, toDayValue: string): number {
  const from = new Date(`${fromDay}T00:00:00.000Z`).getTime()
  const to = new Date(`${toDayValue}T00:00:00.000Z`).getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

/**
 * ZEILEN SCHREIBEN — vorhandene aktualisieren, fehlende anlegen.
 *
 * ── ERST LESEN, DANN SCHREIBEN, UND ZWAR GESTAPELT ─────────────────────
 * `Query.equal('videoId', [...])` fragt bis zu 50 Ids auf einmal. Die
 * Alternative — je Video ein `getRow` — wäre bei zwölf Kanälen à 20 Videos
 * 240 Einzelabfragen für eine Information, die in fünf passt.
 *
 * ── DER 409 IST TEIL DES VERFAHRENS, KEIN FEHLER ───────────────────────
 * Zwischen dem Lesen und dem Anlegen kann ein zweiter Lauf (oder ein zweiter
 * Prozess hinter demselben pm2-Cluster) dieselbe Zeile angelegt haben. Der
 * `uq_video_id`-Index fängt das ab, und die Antwort darauf ist ein Update —
 * nicht ein gezählter Fehler und schon gar kein Abbruch.
 *
 * `null` heisst: die Tabelle gibt es nicht (s. Aufrufstelle).
 */
async function upsertRadarRows(
  tablesDB: TablesDbLike,
  databaseId: string,
  videos: readonly InsightsRadarStoredVideo[],
  log: (level: 'info' | 'warn', name: string, data: Record<string, unknown>) => void,
): Promise<{ upserted: number, errors: number } | null> {
  if (videos.length === 0) return { upserted: 0, errors: 0 }

  const existing = new Map<string, string>()
  for (const batch of insightsYoutubeBatches(videos.map(video => video.videoId))) {
    try {
      const listed = await tablesDB.listRows<InsightsTopicRow>({
        databaseId,
        tableId: INSIGHTS_TOPICS_TABLE,
        queries: [Query.equal('videoId', [...batch]), Query.limit(batch.length)],
      })
      for (const row of listed.rows) existing.set(row.videoId, row.$id)
    }
    catch (error) {
      // 404 = keine Tabelle (der Aufrufer liest daraus „Layer ohne
      // Migration"). Alles andere ist ein echter Ausfall der Datenbank —
      // gezählt und beendet, aber NIE geworfen: Leitplanke (d) sagt, der
      // Radar blockiert nichts, und ein Wurf hier wäre ein 500 auf dem
      // Betreiber-Knopf.
      if (isTableMissing(error)) return null
      log('warn', 'insights.radar_lookup_failed', { message: insightsYoutubeSafeMessage(error) })
      return { upserted: 0, errors: 1 }
    }
  }

  let upserted = 0
  let errors = 0
  for (const video of videos) {
    const data = fromInsightsRadarVideo(video) as unknown as Record<string, unknown>
    const rowId = existing.get(video.videoId)
    try {
      if (rowId) {
        await tablesDB.updateRow({ databaseId, tableId: INSIGHTS_TOPICS_TABLE, rowId, data })
      }
      else {
        try {
          await tablesDB.createRow({ databaseId, tableId: INSIGHTS_TOPICS_TABLE, rowId: ID.unique(), data })
        }
        catch (error) {
          // 409 = die Zeile ist zwischen Lesen und Anlegen entstanden (s. Kopf).
          if (!hasCode(error, 409)) throw error
          const found = await tablesDB.listRows<InsightsTopicRow>({
            databaseId,
            tableId: INSIGHTS_TOPICS_TABLE,
            queries: [Query.equal('videoId', [video.videoId]), Query.limit(1)],
          })
          const target = found.rows[0]
          if (!target) throw error
          await tablesDB.updateRow({ databaseId, tableId: INSIGHTS_TOPICS_TABLE, rowId: target.$id, data })
        }
      }
      upserted += 1
    }
    catch (error) {
      errors += 1
      // Die VIDEO-Id ist hier erlaubt und nötig: sie ist die einzige Angabe,
      // mit der ein Betreiber eine hängende Zeile wiederfindet. Ein Titel wäre
      // Inhalt und stünde damit in einem Log, das ihn überlebt.
      log('warn', 'insights.radar_upsert_failed', {
        videoId: video.videoId,
        message: insightsYoutubeSafeMessage(error),
      })
    }
  }
  return { upserted, errors }
}

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

/**
 * DAS 30-TAGE-NETZ (Policies III.E.4, Entscheidung I4).
 *
 * Es löscht, was der tägliche Lauf NICHT mehr erreicht hat: ein Kanal ist aus
 * der Liste geflogen, ein Video wurde privat gestellt, der Lauf ist tagelang
 * ausgefallen. Alles, was der Lauf erreicht, trägt ein heutiges `fetchedAt`
 * und fällt gar nicht erst in diese Abfrage — das Netz ist der Ausnahmefall
 * und nicht der Normalbetrieb.
 *
 * ÄLTESTE ZUERST, weil sich der Lauf sonst bei mehr Fälligem als einem Stapel
 * immer denselben Ausschnitt ansähe (dieselbe Begründung wie beim
 * Fristen-Sweep). Die Rundenzahl ist gedeckelt (s. `DELETE_ROUNDS_MAX`).
 */
async function deleteExpiredRadarRows(
  tablesDB: TablesDbLike,
  databaseId: string,
  /** Welches Datum abläuft: der Abruf (30-Tage-Netz) oder die Veröffentlichung (Alters-Deckel). */
  attribute: 'fetchedAt' | 'publishedAt',
  cutoff: Date,
  log: (level: 'info' | 'warn', name: string, data: Record<string, unknown>) => void,
): Promise<{ deleted: number, errors: number }> {
  let deleted = 0
  let errors = 0

  for (let round = 0; round < DELETE_ROUNDS_MAX; round++) {
    let rows: InsightsTopicRow[]
    try {
      const listed = await tablesDB.listRows<InsightsTopicRow>({
        databaseId,
        tableId: INSIGHTS_TOPICS_TABLE,
        queries: [
          Query.lessThan(attribute, cutoff.toISOString()),
          Query.orderAsc('fetchedAt'),
          Query.limit(DELETE_BATCH),
        ],
      })
      rows = listed.rows
    }
    catch (error) {
      if (isTableMissing(error)) return { deleted, errors }
      errors += 1
      log('warn', 'insights.radar_retention_failed', { attribute, message: insightsYoutubeSafeMessage(error) })
      return { deleted, errors }
    }

    if (rows.length === 0) break

    for (const row of rows) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_TOPICS_TABLE, rowId: row.$id })
        deleted += 1
      }
      catch (error) {
        errors += 1
        log('warn', 'insights.radar_delete_failed', {
          rowId: row.$id,
          message: insightsYoutubeSafeMessage(error),
        })
      }
    }

    // Eine Runde, die nicht voll war, war die letzte — die nächste Abfrage
    // käme leer zurück und kostete nur einen Aufruf.
    if (rows.length < DELETE_BATCH) break
  }

  return { deleted, errors }
}
