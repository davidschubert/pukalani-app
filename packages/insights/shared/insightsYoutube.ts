import { z } from 'zod'

/**
 * DER YOUTUBE-DATA-API-TEIL DES RADARS — rein, ohne Netz (BI1 I4, §9.6).
 *
 * Adressen bauen, Antworten prüfen, Einheiten rechnen. WER ruft, steht in
 * `server/utils/insightsRadarSweep.ts`; dass hier keine einzige Zeile selbst
 * ruft, ist der Grund, warum die drei Antwortformen in einem Vitest-Lauf
 * geprüft werden können — inklusive der Fälle, die man mit einem echten
 * Schlüssel nie herstellen könnte (ein Video, das zwischen zwei Aufrufen
 * privat wird).
 *
 * ── DREI ENDPUNKTE, KEIN VIERTER (Leitplanke c) ─────────────────────────
 * `channels.list`, `playlistItems.list`, `videos.list` — je EINE Einheit.
 * `search.list` kostet 100 Einheiten und hat einen eigenen Tages-Eimer von
 * rund 100 Aufrufen; er ist in §9.6 ausdrücklich NICHT Teil des Laufs. Es gibt
 * hier deshalb auch keinen Adress-Bauer dafür: was man nicht bauen kann,
 * benutzt man nicht versehentlich.
 *
 * `commentThreads.list` fehlt aus dem härteren Grund (Leitplanke b): KEINE
 * Kommentar-Texte, KEINE Nutzernamen, bis die Anwaltsantwort da ist. Die
 * Kommentar-ZAHL kommt aus `videos.list?part=statistics` und ist eine
 * öffentliche Kennzahl des Videos, keine Kommentar-Auswertung.
 *
 * ── DER SCHLÜSSEL STEHT IN DER ADRESSE, ALSO NIE IN EINEM FEHLER ────────
 * Die Data-API nimmt den Schlüssel als Query-Parameter. Jede Fehlermeldung,
 * die eine dieser Adressen wörtlich zitiert, wäre damit eine Log-Zeile mit
 * unserem Schlüssel darin — und Logs überleben Schlüssel. `insightsYoutubeSafeMessage`
 * ist die eine Stelle, die das abschneidet, und der Sweep gibt NIE etwas
 * anderes weiter.
 */

// ── Adressen ───────────────────────────────────────────────────────────────

/**
 * Die Basis-Adresse der Data-API v3.
 *
 * Sie ist überhaupt nur deshalb konfigurierbar (`NUXT_INSIGHTS_YOUTUBE_BASE_URL`),
 * weil der LOKALE Beweis sonst einen echten Schlüssel und echte Quota kostete:
 * ein kleiner Stub-Server antwortet mit denselben drei Formen, und der ganze
 * Lauf lässt sich am Stück klicken (dasselbe Muster wie der George-Dev-Stub im
 * brand-Layer). In PROD wird sie nicht gesetzt.
 */
export const INSIGHTS_YOUTUBE_BASE_URL = 'https://www.googleapis.com/youtube/v3'

/** Wie viele Ids ein `videos.list`/`channels.list` höchstens trägt (API-Grenze). */
export const INSIGHTS_YOUTUBE_ID_BATCH = 50

/** Das Tagesbudget eines Google-Cloud-Projekts für die Data-API. */
export const INSIGHTS_RADAR_DAILY_QUOTA = 10_000

/**
 * DIE HÄLFTE DAVON IST UNSERE OBERGRENZE FÜR EINEN LAUF.
 *
 * Ein Lauf, dessen Schätzung darüber liegt, findet NICHT statt — er wird
 * abgelehnt, bevor die erste Adresse gebaut ist. Die Hälfte und nicht das
 * Ganze, weil der tägliche Lauf und der Betreiber-Knopf sich dasselbe Budget
 * teilen: wer den Eimer mit EINEM Lauf leeren darf, nimmt dem Nachtlauf seine
 * Grundlage, und der meldet sich dann mit „quotaExceeded" statt mit dem
 * eigentlichen Fehler („die Liste ist zu lang geworden").
 *
 * Zur Grössenordnung: zwölf Kanäle à 20 Videos sind 1 + 12 + 5 = 18 Einheiten.
 * Die Schranke greift also erst bei einer Liste, die um zwei Grössenordnungen
 * gewachsen ist — genau dann, wenn jemand sie versehentlich generiert hat.
 */
export const INSIGHTS_RADAR_QUOTA_CEILING = 5_000

function buildUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  const base = baseUrl.replace(/\/+$/, '')
  const query = new URLSearchParams(params).toString()
  return `${base}/${path}?${query}`
}

/**
 * DIE UPLOADS-PLAYLIST EINES KANALS — 1 Einheit.
 *
 * `part=contentDetails` ist der kleinste Teil, der die `videoId` trägt.
 * `part=snippet` läge nahe (Titel!), ist hier aber falsch: die Titel kommen
 * aus `videos.list`, und ein Titel aus dem Playlist-Eintrag kann veraltet
 * sein — er wird beim Umbenennen eines Videos nicht überall nachgezogen.
 */
export function insightsYoutubePlaylistItemsUrl(
  baseUrl: string,
  apiKey: string,
  playlistId: string,
  maxResults: number,
): string {
  return buildUrl(baseUrl, 'playlistItems', {
    part: 'contentDetails',
    playlistId,
    maxResults: String(Math.max(1, Math.min(INSIGHTS_YOUTUBE_ID_BATCH, Math.floor(maxResults)))),
    key: apiKey,
  })
}

/**
 * DIE ZAHLEN ZU BIS ZU 50 VIDEOS — 1 Einheit für den ganzen Stapel.
 *
 * `snippet` liefert Titel, Kanal und Veröffentlichungsdatum, `statistics` die
 * drei Zahlen. Mehr `part` heisst mehr Antwort, nicht mehr Quota — es ist
 * trotzdem nur das hier, weil jedes zusätzliche Feld eines wäre, das wir
 * speichern KÖNNTEN und nach Leitplanke (a) nicht dürfen.
 */
export function insightsYoutubeVideosUrl(
  baseUrl: string,
  apiKey: string,
  videoIds: readonly string[],
): string {
  return buildUrl(baseUrl, 'videos', {
    part: 'snippet,statistics',
    id: videoIds.slice(0, INSIGHTS_YOUTUBE_ID_BATCH).join(','),
    maxResults: String(INSIGHTS_YOUTUBE_ID_BATCH),
    key: apiKey,
  })
}

/**
 * EIN KANAL ÜBER SEIN HANDLE (BI2 K3) — 1 Einheit, wie jede `channels.list`.
 *
 * Getrennt von `insightsYoutubeChannelsUrl`, weil es eine ANDERE Frage ist:
 * dort „die Zahlen zu diesen Ids", hier „welcher Kanal ist `@thefutur`?".
 * `forHandle` nimmt das Handle MIT oder OHNE `@`; wir schicken es mit, weil
 * Googles eigene Beispiele es so zeigen und ein nacktes Handle in einem
 * Parameter schwerer zu lesen ist.
 *
 * Es gibt bewusst KEINEN Bauer für `forUsername`: der trifft nur Konten von
 * vor 2012, und ein Weg, der bei jedem zweiten Versuch unerklärlich nichts
 * findet, ist schlechter als eine klare Absage (s. `insightsChannelLookup`).
 */
export function insightsYoutubeChannelByHandleUrl(
  baseUrl: string,
  apiKey: string,
  handle: string,
): string {
  return buildUrl(baseUrl, 'channels', {
    part: 'snippet,statistics',
    forHandle: handle.startsWith('@') ? handle : `@${handle}`,
    key: apiKey,
  })
}

/** Name und Abonnentenzahl zu bis zu 50 Kanälen — 1 Einheit für den Stapel. */
export function insightsYoutubeChannelsUrl(
  baseUrl: string,
  apiKey: string,
  channelIds: readonly string[],
): string {
  return buildUrl(baseUrl, 'channels', {
    part: 'snippet,statistics',
    id: channelIds.slice(0, INSIGHTS_YOUTUBE_ID_BATCH).join(','),
    maxResults: String(INSIGHTS_YOUTUBE_ID_BATCH),
    key: apiKey,
  })
}

/** Eine Liste in Stapel zerlegen — die API-Grenze ist 50 Ids je Aufruf. */
export function insightsYoutubeBatches<T>(items: readonly T[], size = INSIGHTS_YOUTUBE_ID_BATCH): T[][] {
  const batches: T[][] = []
  for (let at = 0; at < items.length; at += size) batches.push(items.slice(at, at + size))
  return batches
}

/**
 * WAS EIN LAUF KOSTET, BEVOR ER STATTFINDET (§9.6 Leitplanke c).
 *
 *   ceil(Kanäle ÷ 50)              — `channels.list`, gestapelt
 * + Kanäle                         — `playlistItems.list`, EINER je Kanal
 * + ceil(Kanäle × Videos ÷ 50)     — `videos.list`, gestapelt
 *
 * Die mittlere Zeile ist der Grund, warum die Rechnung überhaupt nötig ist:
 * sie wächst LINEAR mit der Liste, und eine Liste wächst leise. Der zweite
 * Summand ist zugleich die ehrliche Antwort auf „reichen 10.000 für 50
 * Kanäle?" — ja, mit grossem Abstand (50 + 1 + 20 = 71).
 */
export function insightsRadarQuotaEstimate(channels: number, maxVideos: number): number {
  const safeChannels = Math.max(0, Math.floor(channels))
  const safeVideos = Math.max(0, Math.floor(maxVideos))
  if (safeChannels === 0) return 0
  return Math.ceil(safeChannels / INSIGHTS_YOUTUBE_ID_BATCH)
    + safeChannels
    + Math.ceil((safeChannels * safeVideos) / INSIGHTS_YOUTUBE_ID_BATCH)
}

// ── Antworten ──────────────────────────────────────────────────────────────

/**
 * ZAHLEN DER API SIND ZEICHENKETTEN — `"viewCount": "12345"`.
 *
 * Und manchmal fehlen sie ganz: ein Kanal kann seine Abonnentenzahl
 * verbergen, ein Video Likes oder Kommentare abschalten. Beides ist KEIN
 * Fehler, sondern eine Aussage — und die richtige Ablage dafür ist 0, weil
 * die Spalte eine Zahl ist und die Alternative („unbekannt") nirgends
 * ausgewertet würde. Wo es einen Unterschied MACHT, fängt ihn die Formel ab:
 * `insightsPopularity` gibt bei 0 Abonnenten 0 zurück, statt durch null zu
 * teilen.
 */
function toCount(raw: string | undefined): number {
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const countSchema = z.string().optional().transform(toCount)

/**
 * `playlistItems.list` — ein Eintrag OHNE `contentDetails` ist möglich
 * (gelöschte oder privat gestellte Videos hinterlassen ihn), und er ist kein
 * Grund, den ganzen Kanal fallen zu lassen. Er wird deshalb optional gelesen
 * und beim Auspacken herausgefiltert.
 */
export const insightsYoutubePlaylistItemsSchema = z.object({
  items: z.array(z.object({
    contentDetails: z.object({
      videoId: z.string().min(1).max(32),
      /**
       * Wann dieses Video veröffentlicht wurde — kommt in DERSELBEN Antwort
       * mit, ohne eine zusätzliche Einheit zu kosten (BI2 K3). Der Sweep liest
       * es nicht (er holt `publishedAt` ohnehin aus `videos.list`), die
       * KANAL-VORSCHAU dagegen braucht genau das und sonst nichts: „wann hat
       * der zuletzt etwas hochgeladen?" ist die Frage, an der ein toter Kanal
       * auffällt. Optional, weil ältere Einträge das Feld nicht tragen.
       */
      videoPublishedAt: z.string().optional(),
    }).optional(),
  })).default([]),
})

export const insightsYoutubeVideosSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(32),
    snippet: z.object({
      title: z.string().default(''),
      channelId: z.string().default(''),
      channelTitle: z.string().default(''),
      publishedAt: z.string().default(''),
    }),
    // `.default(() => …)` mit dem AUSGABE-Wert, nicht `.default({})`: die drei
    // Felder gehen durch ein `transform`, ihr Eingabe- und ihr Ausgabetyp sind
    // verschieden, und `.default()` will in zod 4 den AUSGABE-Typ. Ein `{}`
    // wäre hier kein „leeres Objekt", sondern ein Typfehler.
    statistics: z.object({
      viewCount: countSchema,
      likeCount: countSchema,
      commentCount: countSchema,
    }).default(() => ({ viewCount: 0, likeCount: 0, commentCount: 0 })),
  })).default([]),
})

export const insightsYoutubeChannelsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(64),
    snippet: z.object({
      title: z.string().default(''),
      /**
       * Das Handle MIT `@`, wie YouTube es führt (BI2 K3). Optional: Kanäle
       * ohne Handle gibt es noch, und ein fehlendes Handle ist kein Grund,
       * einen Kanal abzulehnen — die Id ist die Identität.
       */
      customUrl: z.string().optional(),
    }).default(() => ({ title: '' })),
    statistics: z.object({ subscriberCount: countSchema }).default(() => ({ subscriberCount: 0 })),
  })).default([]),
})

/** Die Video-Ids einer Uploads-Playlist — ohne die Einträge ohne Video. */
export function insightsYoutubeVideoIds(parsed: z.infer<typeof insightsYoutubePlaylistItemsSchema>): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of parsed.items) {
    const id = item.contentDetails?.videoId
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

// ── Fehler ─────────────────────────────────────────────────────────────────

/**
 * DER FEHLER EINES API-AUFRUFS — mit Status und Grund, OHNE Adresse.
 *
 * Der `reason` ist Googles eigener Schlüssel (`quotaExceeded`,
 * `keyInvalid`, `playlistNotFound`, …). Er entscheidet, ob der Lauf
 * weitermacht (ein Kanal fehlt) oder aufhört (das Budget ist alle) — und
 * genau deshalb reist er als FELD und nicht als Textbaustein in einer
 * Meldung, aus der ihn später jemand mit einer Zeichenketten-Suche
 * herausklauben müsste.
 */
export class InsightsYoutubeError extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super(`youtube ${status}${reason ? ` ${reason}` : ''}`)
    this.name = 'InsightsYoutubeError'
  }
}

/** Der Grund aus einer Fehlerantwort der Data-API — leer, wenn keiner drinsteht. */
export function insightsYoutubeReason(body: unknown): string {
  const parsed = z.object({
    error: z.object({
      errors: z.array(z.object({ reason: z.string() })).default([]),
      status: z.string().optional(),
    }).optional(),
  }).safeParse(body)
  if (!parsed.success) return ''
  return parsed.data.error?.errors[0]?.reason ?? parsed.data.error?.status ?? ''
}

/** Ein Grund, bei dem der ganze Lauf endet statt einen Kanal zu überspringen. */
export function insightsYoutubeIsFatal(error: unknown): boolean {
  if (!(error instanceof InsightsYoutubeError)) return false
  if (error.status === 401 || error.status === 403) return true
  return error.reason === 'quotaExceeded' || error.reason === 'dailyLimitExceeded'
}

/**
 * EINE FEHLERMELDUNG OHNE UNSEREN SCHLÜSSEL.
 *
 * `fetch` und `undici` setzen die aufgerufene Adresse in ihre Meldungen
 * („request to https://…?key=AIza… failed"), und der Schlüssel steht in der
 * Adresse. Alles ab dem ersten `?` einer `http`-Adresse fällt deshalb weg —
 * lieber eine Meldung, die den Endpunkt nur noch grob nennt, als eine, die man
 * aus dem Log nachträglich wieder entfernen muss.
 *
 * Der zweite Riegel ist eine Sicherung gegen den Fall, dass der Schlüssel
 * anders als in einer Adresse auftaucht: `key=…` und `AIza…` werden ebenfalls
 * unkenntlich gemacht.
 */
export function insightsYoutubeSafeMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return raw
    .replace(/(https?:\/\/[^\s?]*)\?[^\s]*/g, '$1')
    .replace(/key=[^\s&]+/gi, 'key=***')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '***')
    .slice(0, 200)
}
