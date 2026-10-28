import { INSIGHTS_AI_DISABLED_CODE } from '../../../../../shared/insightsAiLimits'
import type { InsightsPost } from '../../../../../shared/insightsPost'
import { toInsightsPost, toInsightsWatchItem } from '../../../../../shared/insightsRows'
import {
  INSIGHTS_BRIEF_PROMPT_VERSION,
  buildInsightsVideoBriefPrompt,
  insightsBriefRequestSchema,
  insightsBriefTitle,
  insightsVideoBriefSchema,
  insightsVideoBriefSource,
  insightsVideoPublishedDate,
} from '../../../../../shared/insightsVideoBrief'
import { INSIGHTS_WATCH_CODES, insightsVideoUrl, insightsWatchVideoId } from '../../../../../shared/insightsWatchlist'
import type { InsightsBriefResponse } from '../../../../../shared/types/insightsApi'
import { BRAND_PROVIDER_ROUTING_EU } from '../../../../contracts/brandContract'

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
 *  3. STEHT SCHON EIN BRIEF? Dann führt die Antwort zum vorhandenen Beitrag,
 *     statt einen zweiten zu bezahlen. Ist der Beitrag inzwischen GELÖSCHT,
 *     wird der Verweis stillschweigend geräumt — sonst wäre ein Fundstück
 *     nach einem Aufräumen für immer blockiert.
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
 * `BRAND_PROVIDER_ROUTING_EU` statt `BRAND_PROVIDER_ROUTING`: Davids
 * Entscheidung vom 2026-10-27 („nur für Bild und Video pinnen"). `zdr: true`
 * allein sagt nichts über den ORT — in der Probe bediente Amazon Bedrock
 * unseren Textweg.
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
  const startedAt = Date.now()
  insightsLogAi('requested', 'brief', {
    postId: '',
    model: videoConfig.model,
    promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
  })

  let brief
  try {
    const answer = await aiVideoJson<unknown>(
      event,
      [{ url: insightsVideoUrl(videoId) }],
      buildInsightsVideoBriefPrompt({
        locale: body.baseLocale,
        videoTitle: item.title,
        channelTitle: item.channelTitle,
        publishedDate,
        topic: item.topic,
      }),
      {
        model: videoConfig.model,
        providerRouting: { ...BRAND_PROVIDER_ROUTING_EU },
        label: 'insights',
        maxTokens: 4000,
        // Gemessen (Probe 2026-10-27): ein 25-Minuten-Video braucht deutlich
        // länger als ein Text-Lauf. Drei Minuten ist der Default des
        // Transports; hier steht er ausgeschrieben, damit die Zahl bei einem
        // Zeitüberschreitungs-Bericht am Ort der Entscheidung steht.
        timeoutMs: 180_000,
      },
    )
    brief = insightsVideoBriefSchema.parse(answer)
  }
  catch (error) {
    insightsLogAi('failed', 'brief', {
      postId: '',
      model: videoConfig.model,
      promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      errorCode: insightsAiErrorCode(error),
    })
    throw error
  }

  const title = insightsBriefTitle(brief.title, item.title)
  const slug = await findFreeInsightsSlug(event, 'posts', title, '')
  if (!slug) {
    throw createError({ status: 409, statusText: 'Slug unavailable', data: { code: 'slug_taken' } })
  }

  // JEDE Spalte explizit (CLAUDE.md) — eine neue Spalte soll eine Entscheidung
  // an dieser Stelle sein, kein stiller Default.
  const post: InsightsPost = {
    format: body.format,
    slug,
    slugHistory: [],
    state: 'draft',
    baseLocale: body.baseLocale,
    titleDe: body.baseLocale === 'de' ? title : '',
    titleEn: body.baseLocale === 'en' ? title : '',
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
    topics: brief.topics.length ? brief.topics : [item.topic],
    sources: [source],
    brandRefs: [],
    facts: [],
    ranking: null,
    readingMinutes: 0,
    publishedAt: '',
    reviewedAt: '',
    reviewedBy: '',
    noteInternal: '',
    brief: brief.brief,
    briefModel: videoConfig.model.slice(0, 120),
    briefPromptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
    briefVideoId: videoId,
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
   * Die Zeile zeigt dann wieder den Knopf, und ein zweiter Lauf legt einen
   * zweiten Entwurf an. Lästig, aber sichtbar; ein gelöschter bezahlter Brief
   * wäre unsichtbar.
   */
  item = await updateInsightsWatchRow(event, row.$id, { briefPostId: created.$id })

  insightsLogAi('completed', 'brief', {
    postId: created.$id,
    format: post.format,
    model: videoConfig.model,
    promptVersion: INSIGHTS_BRIEF_PROMPT_VERSION,
    durationMs: Date.now() - startedAt,
  })

  return { post: toInsightsPost(created), id: created.$id, item }
})
