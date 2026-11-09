import type { H3Event } from 'h3'
import { INSIGHTS_AI_DISABLED_CODE } from '../../../../../shared/insightsAiLimits'
import type { InsightsLocale, InsightsPost, InsightsSource } from '../../../../../shared/insightsPost'
import { toInsightsWatchItem } from '../../../../../shared/insightsRows'
import {
  INSIGHTS_BRIEF_PROMPT_VERSION,
  buildInsightsVideoBriefPrompt,
  insightsBriefRequestSchema,
  insightsBriefTitle,
  insightsVideoBriefSchema,
  insightsVideoBriefSource,
  insightsVideoPublishedDate,
} from '../../../../../shared/insightsVideoBrief'
import type { InsightsBriefError, InsightsWatchItem } from '../../../../../shared/insightsWatchlist'
import {
  INSIGHTS_BRIEF_RUNNING_CODE,
  INSIGHTS_BRIEF_TIMEOUT_MS,
  INSIGHTS_WATCH_CODES,
  insightsBriefState,
  insightsBriefStartable,
  insightsVideoUrl,
  insightsWatchVideoId,
} from '../../../../../shared/insightsWatchlist'
import type { InsightsBriefResponse } from '../../../../../shared/types/insightsApi'
import { BRAND_PROVIDER_ROUTING_VERTEX_EU } from '../../../../contracts/brandContract'

/**
 * BRIEF AUS EINEM VIDEO (`insights.manage`, BI2 K5 — Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §6, Entscheidung C4 vom 2026-10-27).
 *
 * Aus einem Fundstück wird ein BEITRAG IM ZUSTAND `draft`, dessen Brief das
 * Modell geschrieben hat, nachdem es das Video gesehen hat — Bild und Ton.
 * Der Artikel entsteht daraus NICHT: dafür gibt es den bestehenden
 * Entwurfs-Lauf (`insights-d-1`), und dazwischen sitzt ein Mensch.
 *
 * ── DIE REIHENFOLGE DER PRÜFUNGEN IST DIE EIGENTLICHE ARBEIT ─────────────
 * Ein Video-Lauf ist der teuerste Weg dieses Monorepos (gemessen: rund fünf
 * Cent für 25 Minuten). Jede Ablehnung, die NACH dem Anbieter-Aufruf käme,
 * wäre bezahlt. Deshalb in genau dieser Folge, und jede Stufe begründet:
 *
 *  1. `insights.manage` — die Klinke (davor, im Framework).
 *  2. Gibt es das Fundstück überhaupt? (kostet eine Zeile)
 *  3. STEHT SCHON EIN BRIEF — ODER LÄUFT GERADE EINER? Dann führt die
 *     Antwort zum vorhandenen Beitrag bzw. auf den offenen Lauf, statt einen
 *     zweiten zu bezahlen. Ist der Beitrag inzwischen GELÖSCHT, wird der
 *     Verweis stillschweigend geräumt — sonst wäre ein Fundstück nach einem
 *     Aufräumen für immer blockiert.
 *  4. Ist das Video überhaupt noch abrufbar? `available: false` heisst: der
 *     Anbieter kann es auch nicht lesen (bewiesen in der Probe vom
 *     2026-10-27: eine unerreichbare Video-Id ⇒ 502). Das 409 hier ist der
 *     gesparte Fehlschlag.
 *  5. Lässt sich das Video als QUELLE ablegen (Kanal + Datum)? Ohne beides
 *     lehnt `insightsSourceSchema` die Quelle ab — wir würden einen Brief
 *     bezahlen und ihn danach nicht speichern können.
 *  6. Ist ein VIDEO-MODELL konfiguriert? Diese Prüfung steht VOR der Drossel,
 *     aus demselben Grund wie der Kill-Switch dort (`insightsAi.ts`): ein
 *     Betriebszustand darf keinen Tages-Eimer kosten.
 *  7. Kill-Switch und Drossel (`insightsBeginAiRun`).
 *  8. Erst jetzt der Anbieter.
 *
 * ── WAS DAS MODELL MITBEKOMMT, UND WAS NICHT ─────────────────────────────
 * Es bekommt die ADRESSE des Videos und die Metadaten, die bei uns aus der
 * YouTube-API feststehen (Titel, Kanal, Datum, Cluster) — damit es das Datum
 * nicht aus dem Gesagten schätzt. Es bekommt KEINE abgerufenen Seiten und
 * keine fremden Texte.
 *
 * ── DIE EU-ROUTE IST HIER KEINE KÜR ──────────────────────────────────────
 * `BRAND_PROVIDER_ROUTING_VERTEX_EU` statt `BRAND_PROVIDER_ROUTING`: Davids
 * Entscheidung vom 2026-10-27 („nur für Bild und Video pinnen"). `zdr: true`
 * allein sagt nichts über den ORT — in der Probe bediente Amazon Bedrock
 * unseren Textweg.
 *
 * ════════════════════════════════════════════════════════════════════════
 * BI3 (2026-11-08): DIE ANTWORT KOMMT SOFORT, DER LAUF LÄUFT WEITER.
 * ════════════════════════════════════════════════════════════════════════
 *
 * ── DER BEFUND ──────────────────────────────────────────────────────────
 * Auf Prod gemessen am 2026-11-06: ein 51-Minuten-Video brauchte 65,4 s,
 * nginx gibt nach 60 auf. Der Node-Prozess lief weiter und legte den Entwurf
 * KORREKT an — der Mensch sah trotzdem einen Fehler-Toast und bekam den Link
 * zu seinem Entwurf nie. Kein Geld verloren (Stufe 3 führte den zweiten
 * Klick auf den vorhandenen Beitrag), aber die Meldung log.
 *
 * ── WARUM NICHT `proxy_read_timeout` ────────────────────────────────────
 * Davids Richtung vom 2026-11-08: eine höhere Grenze verschiebt sie nur. Das
 * nächste längere Video reisst sie wieder, und zwar wieder erst auf Prod und
 * wieder mitten in einem bezahlten Lauf. Die Antwortzeit dieser Route hängt
 * an der Länge eines fremden Videos — eine Zahl, die wir nicht kennen und
 * nicht begrenzen.
 *
 * ── DIE TEILUNG ─────────────────────────────────────────────────────────
 * Alles, was NICHTS KOSTET, bleibt synchron: die Stufen 1 bis 7 (bis
 * einschliesslich Drossel) laufen vor der Antwort. Erst der ANBIETER-Aufruf
 * und alles danach (klemmen, Adresse suchen, Beitrag anlegen, Zeile
 * nachtragen) wandert hinter die Antwort. Die Route antwortet `202` mit der
 * FUNDSTÜCK-ZEILE, und die trägt ab jetzt den Lauf (`briefRunAt`).
 *
 * Das ist genau die Grenze, an der die Entscheidung von K5 („die Reihenfolge
 * der Prüfungen ist die eigentliche Arbeit") weiterhin zählt: WAS vor dem
 * Anbieter lag, lehnt weiterhin mit `4xx` ab und wird vom Menschen SOFORT
 * gesehen. Nur was den Lauf schon bezahlt hat, berichtet jetzt an der Zeile.
 *
 * ── WOHER DER MENSCH ERFÄHRT, DASS DER BRIEF FERTIG IST ─────────────────
 * Aus der ZEILE, und die Liste fragt nach, solange ein Lauf offen ist
 * (`insightsBriefPending`, 5-Sekunden-Takt, höchstens drei Minuten lang).
 *
 * Die naheliegende Alternative war die bestehende Realtime-Naht
 * (`pukalani.realtime.enabled` / `useRealtimeRows`), und sie ist hier nicht
 * nur „grösser", sondern VERSCHLOSSEN: alle drei insights-Tabellen sind
 * server-only (`permissions: []`, `rowSecurity: false` — begründet im Kopf
 * von `server/utils/insightsStore.ts`), es gibt also keine Session, die
 * `insights_watchlist` abonnieren KÖNNTE. Realtime hiesse: eine
 * Betreiber-Tabelle für Klient-Lesezugriff öffnen. Das ist eine
 * Grenzverschiebung für eine Seite, die EIN Mensch benutzt und auf der EIN
 * Lauf höchstens drei Minuten offen steht — und sie würde die Spalten nicht
 * einmal ersparen: Realtime trägt die ZEILE, also muss die Zeile „läuft" und
 * „schiefgegangen" sagen können. Die Spalten sind der Kern, Realtime wäre
 * nur eine andere Zustellung.
 *
 * ── DER ZWEITE KLICK ZAHLT NICHT ZWEIMAL ────────────────────────────────
 * Die Zusage, die K5 mit `brief_exists` gegeben hat, gilt jetzt auch für den
 * LAUFENDEN Lauf: Stufe 3 lehnt mit `brief_running` ab, solange
 * `insightsBriefState()` „läuft" sagt. Geprüft wird mit der SERVER-Uhr —
 * die Oberfläche rechnet denselben Zustand nur für ihre Anzeige, und bei
 * einer schiefen Browser-Uhr entscheidet weiterhin diese Route.
 *
 * ── EIN VERWAISTER LAUF LÖST SICH SELBST ────────────────────────────────
 * Stirbt der Lauf, ohne zu schreiben (Prozess-Neustart, Deploy, Container
 * weg), bleibt `briefRunAt` stehen und der Zustand wird nach
 * `INSIGHTS_BRIEF_STALL_MS` von „läuft" zu „verschollen" — wieder startbar,
 * ohne dass jemand aufräumen muss. Darum ist der Zustand gerechnet und nicht
 * gespeichert: ein Aufräumer, der „läuft" zurücksetzt, wäre genau der
 * Prozess, der in diesem Fall nicht mehr lebt.
 *
 * ── DIE DROSSEL WIRD WEITERHIN BEIM START GEBUCHT ───────────────────────
 * `insightsBeginAiRun` steht unverändert VOR der Antwort. Sie bucht, was
 * ANGESTOSSEN wurde, nicht was gelungen ist — ein Deckel, der erst beim
 * Erfolg zählt, hält einen verklemmten Knopf nicht auf.
 */
export default defineEventHandler(async (event): Promise<InsightsBriefResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const raw = getRouterParam(event, 'videoId') ?? ''
  const videoId = insightsWatchVideoId(raw)
  if (!videoId) throw insightsWatchMissing()

  // Die Form der Anfrage ist eine pure Regel (mit Test): ein POST OHNE Rumpf
  // ist erlaubt und bedeutet „Artikel, Deutsch".
  const body = await readValidatedBody(event, insightsBriefRequestSchema.parse)

  const row = await findInsightsWatchRow(event, videoId)
  if (!row) throw insightsWatchMissing()
  let item = toInsightsWatchItem(row)

  // (3) Schon ein Brief? — oder ein Verweis auf einen gelöschten Beitrag.
  if (item.briefPostId) {
    const existing = await loadInsightsPostRow(event, item.briefPostId).catch(() => null)
    if (existing) {
      throw createError({
        status: 409,
        statusText: 'Brief exists',
        data: { code: 'brief_exists' },
      })
    }
    item = await updateInsightsWatchRow(event, row.$id, { briefPostId: '' })
  }

  /**
   * (3b) LÄUFT GERADE EINER? — dieselbe Zusage wie `brief_exists`, nur für
   * einen Lauf, der sein Ergebnis noch nicht hat.
   *
   * Ohne diese Stufe wäre BI3 ein Rückschritt: vor BI3 hielt die offene
   * Verbindung den zweiten Klick auf (die Zeile lud, der Knopf war gesperrt).
   * Jetzt antwortet die Route nach einer Sekunde, der Knopf ist wieder da —
   * und drei Klicks wären drei bezahlte Läufe. Die Sperre muss deshalb an der
   * ZEILE hängen und nicht am Browser.
   *
   * Die Server-Uhr entscheidet. Ein `stalled`-Lauf (nichts geschrieben,
   * Stall-Grenze überschritten) und ein `failed`-Lauf dürfen durch — es liegt
   * nichts vor, das ein zweiter Lauf doppeln würde.
   */
  const state = insightsBriefState(item, Date.now())
  if (!insightsBriefStartable(state)) {
    throw createError({
      status: 409,
      statusText: 'Brief run in flight',
      data: { code: INSIGHTS_BRIEF_RUNNING_CODE },
    })
  }

  // (4) Ein Video, das wir nicht mehr abrufen können, kann der Anbieter auch
  // nicht lesen.
  if (!item.available) {
    throw createError({
      status: 409,
      statusText: 'Video unavailable',
      data: { code: INSIGHTS_WATCH_CODES.notFound },
    })
  }

  // (5) Die Quelle muss ablegbar sein, BEVOR der Brief etwas kostet.
  const publishedDate = insightsVideoPublishedDate(item.publishedAt)
  const source = insightsVideoBriefSource({
    videoId,
    channelTitle: item.channelTitle,
    publishedDate,
  })
  if (!source) {
    throw createError({
      status: 409,
      statusText: 'Video not citable',
      data: { code: 'video_not_citable' },
    })
  }

  // (6) Steht ein Video-Modell? Der Modell-NAME ist das Gate (Kopf von
  // `core/server/utils/aiVideo.ts`). Die Kennung ist bewusst dieselbe wie die
  // des Kill-Switches: für den Menschen davor heisst beides „die KI ist hier
  // gerade nicht zu haben", und zwei Kennungen für denselben Satz wären zwei
  // Texte, die auseinanderlaufen.
  const videoConfig = await getEffectiveAiVideoConfig(event)
  if (!videoConfig.enabled) {
    throw createError({
      status: 409,
      statusText: 'AI video not configured',
      data: { code: INSIGHTS_AI_DISABLED_CODE },
    })
  }

  /**
   * (7) Kill-Switch und Drossel — der Rückgabewert wird BEWUSST verworfen.
   *
   * `insightsBeginAiRun` liefert das TEXT-Modell und die Standard-Bedingungen.
   * Beides passt hier nicht: das Textmodell (`claude-haiku-4.5`) sieht keine
   * Videos, und die Bedingungen sind für diesen Lauf die EU-gepinnten. Was
   * gebraucht wird, ist die WIRKUNG des Aufrufs — er wirft bei abgeschalteter
   * KI und bucht den Eimer.
   */
  await insightsBeginAiRun(event, user.$id, 'brief')

  /**
   * (8) DER STEMPEL IST DIE SPERRE — und er steht VOR dem Lauf.
   *
   * Erst wenn er geschrieben ist, darf der Anbieter-Aufruf los: scheitert das
   * Schreiben, gibt es keine Sperre, und der zweite Klick zahlte ein zweites
   * Mal. Deshalb nicht parallel und nicht danach. Der Fehler reist in diesem
   * Fall als 5xx zum Menschen — der Eimer ist dann gebucht und der Lauf nicht
   * gemacht; das ist der richtige Weg herum.
   *
   * `briefError: ''` räumt den Vermerk eines früheren Fehlschlags mit: ab
   * jetzt gilt dieser Lauf.
   */
  const startedAtIso = new Date().toISOString()
  item = await updateInsightsWatchRow(event, row.$id, {
    briefRunAt: startedAtIso,
    briefError: '',
  })

  insightsLogAi('requested', 'brief', {
    postId: '',
    model: videoConfig.model,
    promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
  })

  /**
   * (9) DER BEZAHLTE TEIL — hinter der Antwort, mit einem BESITZER.
   *
   * Ein nacktes schwebendes Promise wäre Arbeit ohne Besitzer: eine
   * unbehandelte Ablehnung nimmt unter pm2 den Prozess mit (die Warnung steht
   * wörtlich im Kopf von `packages/market/server/utils/marketBrandCheck.ts`).
   * `runInsightsBrief` fängt deshalb ALLES selbst und schreibt jeden Ausgang
   * an die Zeile; das `.catch` hier ist der Gürtel zum Hosenträger und darf
   * nie feuern.
   *
   * Der `event` reist mit in den Hintergrund, und das ist geprüft, nicht
   * geraten: alles, was er dort noch hergibt, ist LESEND (Runtime-Config,
   * Header für den Admin-Client, der KI-Schlüssel aus `instance_secrets`).
   * Geschrieben wird in die ANTWORT nichts mehr — die ist zu diesem Zeitpunkt
   * längst draussen.
   */
  void runInsightsBrief(event, {
    rowId: row.$id,
    videoId,
    item,
    source,
    publishedDate,
    model: videoConfig.model,
    format: body.format,
    baseLocale: body.baseLocale,
    startedAtMs: Date.parse(startedAtIso),
  }).catch(error => console.error('[insights] Brief-Lauf ohne Besitzer gescheitert:', error))

  // 202: angenommen, nicht erledigt. Die Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return { item }
})

interface InsightsBriefRun {
  rowId: string
  videoId: string
  item: InsightsWatchItem
  source: InsightsSource
  publishedDate: string
  model: string
  format: InsightsPost['format']
  baseLocale: InsightsLocale
  startedAtMs: number
}

/**
 * DER LAUF NACH DER ANTWORT — er wirft NIE.
 *
 * Jeder Ausgang landet an der Zeile, weil sie die einzige Stelle ist, an der
 * der Mensch nachher noch hinsieht: Erfolg als `briefPostId`, Fehlschlag als
 * `briefError`. Ein Lauf, der still endet, wäre der Fehler von BI3 noch
 * einmal — nur ohne Toast.
 *
 * ── DIE KLEMMEN NACH DEM AUFRUF LEHNEN NICHT AB ─────────────────────────
 * Unverändert aus dem Nachtrag vom 2026-10-28: ab hier ist das Video gelesen
 * und der Lauf bezahlt, also wird nur noch zugeschnitten
 * (`insightsVideoBriefSchema`), nie abgewiesen.
 */
async function runInsightsBrief(event: H3Event, run: InsightsBriefRun): Promise<void> {
  let briefRawChars = 0
  try {
    const answer = await aiVideoJson<unknown>(
      event,
      [{ url: insightsVideoUrl(run.videoId) }],
      buildInsightsVideoBriefPrompt({
        locale: run.baseLocale,
        videoTitle: run.item.title,
        channelTitle: run.item.channelTitle,
        publishedDate: run.publishedDate,
        topic: run.item.topic,
      }),
      {
        model: run.model,
        providerRouting: { ...BRAND_PROVIDER_ROUTING_VERTEX_EU },
        label: 'insights',
        maxTokens: 4000,
        // Gemessen (Probe 2026-10-27): ein 25-Minuten-Video braucht deutlich
        // länger als ein Text-Lauf. Die Zahl steht seit BI3 im Vertrag
        // (`INSIGHTS_BRIEF_TIMEOUT_MS`), weil die Stall-Grenze aus ihr
        // abgeleitet wird und beide sonst auseinanderlaufen.
        timeoutMs: INSIGHTS_BRIEF_TIMEOUT_MS,
      },
    )
    // WIE LANG DIE ANTWORT WAR, bevor das Schema klemmt. Ohne diese Zahl
    // wüsste niemand, wie oft das Modell über den Deckel schreibt — und genau
    // das ist die Frage, die man an den PROMPT stellen muss, nicht an die
    // Route (Kopf von `clampInsightsBrief`).
    const answered = (answer as { brief?: unknown } | null | undefined)?.brief
    briefRawChars = typeof answered === 'string' ? answered.length : 0
    const brief = insightsVideoBriefSchema.parse(answer)

    const title = insightsBriefTitle(brief.title, run.item.title)
    const slug = await findFreeInsightsSlug(event, 'posts', title, '')
    if (!slug) {
      await failInsightsBrief(event, run, 'slug_taken', briefRawChars)
      return
    }

    // JEDE Spalte explizit (CLAUDE.md) — eine neue Spalte soll eine
    // Entscheidung an dieser Stelle sein, kein stiller Default.
    const post: InsightsPost = {
      format: run.format,
      slug,
      slugHistory: [],
      state: 'draft',
      baseLocale: run.baseLocale,
      titleDe: run.baseLocale === 'de' ? title : '',
      titleEn: run.baseLocale === 'en' ? title : '',
      dekDe: '',
      dekEn: '',
      bodyDe: '',
      bodyEn: '',
      translatedAt: '',
      translationModel: '',
      translationPromptVersion: '',
      translationReviewed: false,
      // Der Vorschlag des Modells, sonst das Cluster, unter dem der Mensch das
      // Video führt — eine leere Themenliste wäre ein Beitrag, den die
      // Navigation nirgends zeigt.
      topics: brief.topics.length ? brief.topics : [run.item.topic],
      sources: [run.source],
      brandRefs: [],
      facts: [],
      ranking: null,
      readingMinutes: 0,
      publishedAt: '',
      reviewedAt: '',
      reviewedBy: '',
      noteInternal: '',
      brief: brief.brief,
      briefModel: run.model.slice(0, 120),
      briefPromptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
      briefVideoId: run.videoId,
      draftModel: '',
      draftPromptVersion: '',
    }

    const created = await createInsightsPostRow(event, post)

    /**
     * DIE RÜCKRICHTUNG, UND WARUM SIE EINEN FEHLSCHLAG ÜBERLEBEN DARF.
     *
     * `briefPostId` ist die Antwort der Liste auf „habe ich das schon
     * verarbeitet?". Schlägt dieses eine Update fehl, ist der BEITRAG trotzdem
     * da — und ihn wegzuwerfen wäre die schlechtere Wahl: der Brief ist bezahlt.
     * Die Zeile trägt dann `brief_failed`, ein zweiter Lauf legt einen zweiten
     * Entwurf an. Lästig, aber sichtbar; ein gelöschter bezahlter Brief wäre
     * unsichtbar.
     */
    await updateInsightsWatchRow(event, run.rowId, { briefPostId: created.$id, briefError: '' })

    insightsLogAi('completed', 'brief', {
      postId: created.$id,
      format: post.format,
      model: run.model,
      promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
      durationMs: Date.now() - run.startedAtMs,
      briefChars: post.brief.length,
      briefRawChars,
    })
  }
  catch (error) {
    insightsLogAi('failed', 'brief', {
      postId: '',
      model: run.model,
      promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
      durationMs: Date.now() - run.startedAtMs,
      errorCode: insightsAiErrorCode(error),
      briefRawChars,
    })
    await failInsightsBrief(event, run, 'brief_failed', briefRawChars, false)
  }
}

/**
 * DEN FEHLSCHLAG AN DIE ZEILE SCHREIBEN — der letzte Schritt, der noch
 * scheitern darf.
 *
 * Geht AUCH DAS schief, bleibt `briefRunAt` allein stehen. Dann läuft die
 * Stall-Grenze ab und die Zeile sagt „nicht zurückgekommen" statt „gescheitert"
 * — unschärfer, aber nie „läuft für immer". Deshalb ist der verwaiste Lauf
 * der Rückfall jedes Fehlers und nicht ein eigener Pfad.
 */
async function failInsightsBrief(
  event: H3Event,
  run: InsightsBriefRun,
  code: InsightsBriefError,
  briefRawChars: number,
  log = true,
): Promise<void> {
  if (log) {
    insightsLogAi('failed', 'brief', {
      postId: '',
      model: run.model,
      promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
      durationMs: Date.now() - run.startedAtMs,
      errorCode: code,
      briefRawChars,
    })
  }
  await updateInsightsWatchRow(event, run.rowId, { briefError: code })
    .catch(error => console.error('[insights] Brief-Fehlschlag nicht an die Zeile geschrieben:', error))
}
