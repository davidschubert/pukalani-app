import type { H3Event } from 'h3'
import type { MarketRunResponse } from '../../../../../shared/types/marketApi'
import type { MarketProfileField, MarketRunStep } from '../../../../../shared/marketProfile'
import { MARKET_MAX_CHARS_PER_RUN } from '../../../../../shared/marketCrawlRules'
import { marketRawExpiresAt } from '../../../../../shared/marketRetention'
import { readBrandAiEnabled } from '../../../../contracts/brandContract'
import { MARKET_UNLOCK_STEP, type MarketRouteContext, requireMarketProfile, requireMarketUnlocked } from '../../../../utils/marketAccess'
import { bookMarketRun } from '../../../../utils/marketQuota'
import {
  createMarketProfile,
  listMarketCompetitors,
  listMarketProfiles,
  updateMarketCompetitor,
} from '../../../../utils/marketStore'
import { fetchMarketCompetitor } from '../../../../utils/marketFetch'
import { extractMarketProfile, marketInputHash } from '../../../../utils/marketExtract'
import { collectMarketAiView } from '../../../../utils/marketAiView'
import { latestProfilesByCompetitor } from '../../../../utils/marketViews'
import { loadMarketFoundationCandidate, loadMarketSharedCandidate } from '../../../../utils/marketOwnProfile'
import { triggerMarketBrandChecks } from '../../../../utils/marketBrandCheck'
import { marketLibraryEntry, marketLibraryFields } from '../../../../../shared/marketLibrary'
import { loadMarketReportState, produceMarketReport } from '../../../../utils/marketReportService'
import type { MarketCompetitorRow } from '../../../../../shared/types/market'

/**
 * DER LAUF (Plan §2.3 Schritte 2–3, §7.5; MV1 M2).
 *
 * ── WAS ER TUT UND WAS NICHT ──────────────────────────────────────────────
 * Er holt (Schritt 2), wertet aus (Schritt 3) und fragt die KI-Aussensicht
 * (§7.5). Den VERGLEICH macht er NUR AUF ANSAGE (`withReport`, MV1 M3).
 *
 * ── WARUM EIN FLAG UND KEIN AUTOMATISMUS ──────────────────────────────────
 * Aus Kundensicht gibt es EINEN Knopf („Markt vergleichen"), technisch sind es
 * zwei Schritte. Drei Wege wären denkbar gewesen, und zwei sind falsch:
 * (a) der Lauf hängt den Bericht IMMER an — dann kostet jeder Abruf-Lauf
 * einen Modell-Aufruf, auch wenn niemand einen Vergleich sehen will, und der
 * Beweis von M2 misst plötzlich eine andere Antwortform; (b) die Oberfläche
 * ruft immer beide Routen — dann muss sie den Fall „Lauf gut, Bericht kaputt"
 * selbst zusammensetzen, und zwei Knöpfe wären nur noch eine Frage der Zeit.
 * Gewählt ist (c): `withReport` ist ein FLAG mit Default `false`. Der Lauf
 * bleibt, was er war (M2s Beweis läuft unverändert weiter), und M4 setzt das
 * Flag für den einen Knopf. Fällt der Bericht aus, steht der Abruf trotzdem —
 * `report` ist dann schlicht `null`.
 *
 * ── SEQUENTIELL, NICHT PARALLEL ───────────────────────────────────────────
 * Fünf Wettbewerber nacheinander. Parallel wäre schneller und wäre falsch:
 * jeder Kandidat holt bis zu acht Seiten von EINEM fremden Server, und
 * gleichzeitige Läufe machten aus einem Lesevorgang eine kleine Last. Ausserdem
 * teilt sich der Lauf EIN Zeichen-Budget (§2.8) — das lässt sich nur der Reihe
 * nach herunterrechnen.
 *
 * ── FAIL-SOFT JE KANDIDAT ─────────────────────────────────────────────────
 * Ein nicht erreichbarer Wettbewerber wird als `failed` vermerkt und der Lauf
 * geht weiter. Vier von fünf sind ein Vergleich; ein Abbruch wäre keiner.
 *
 * ── IDEMPOTENZ ÜBER DEN ROHTEXT ───────────────────────────────────────────
 * Gleiches `inputHash` ⇒ kein zweiter Modell-Aufruf. Der Abruf läuft trotzdem
 * (die Website könnte sich geändert haben — das FESTZUSTELLEN ist ja gerade
 * der Zweck); die teure Hälfte spart der Hash.
 */

/** Was ein Kandidat nach seinem Durchgang zu berichten hat. */
interface CandidateOutcome {
  step: MarketRunStep
  extracted: boolean
  reused: boolean
  charsUsed: number
}

export default defineEventHandler(async (event): Promise<MarketRunResponse> => {
  // JEDER Ausgang vor dem Lauf hinterlässt eine Zeile (2026-09-07): ein Lauf,
  // der an einer Vorprüfung scheitert, antwortet 4xx — und 4xx protokolliert
  // der zentrale Handler nicht. Davids erste Live-Läufe endeten so ohne jede
  // Spur, und die Frage „ist der Klick überhaupt angekommen?" war aus dem Log
  // nicht zu beantworten. Deshalb ZUERST die Ankunft (noch vor Gate und
  // Session — nur die Tatsache, ob eine Session dranhängt), dann jeder
  // Ablehnungsgrund als CODE. Nie ein Inhalt, nie eine Id.
  logEvent('info', 'market.run_requested', { session: typeof event.context.user?.$id === 'string' })

  let userId: string, profileId: string, profile: MarketRouteContext['profile']
  try {
    ({ userId, profileId, profile } = await requireMarketProfile(event))
    await requireMarketUnlocked(event, profileId)
  }
  catch (error) {
    logEvent('info', 'market.run_rejected', { code: rejectionCodeOf(error) })
    throw error
  }

  // Das Flag darf aus der Adresszeile ODER dem Rumpf kommen: M4 ruft die Route
  // per `$fetch` mit Rumpf, ein Beweis bequemer mit `?report=1`. Beides meint
  // dasselbe, und eine zweite Route dafür wäre eine zweite Freischaltung.
  const query = getQuery(event)
  const body = await readBody(event).catch(() => null) as { withReport?: unknown } | null
  const withReport = query.report === '1' || query.report === 'true' || body?.withReport === true

  const competitors = await listMarketCompetitors(event, profileId)
  if (!competitors.length) {
    logEvent('info', 'market.run_rejected', { code: 'no_competitors' })
    return { ran: false, steps: [], aiEnabled: await readBrandAiEnabled(event), extracted: 0, reused: 0 }
  }

  const aiEnabled = await readBrandAiEnabled(event)

  // DIE DROSSEL ERST HIER: bis hierher wurde nichts geholt und nichts gerufen.
  // Ein Lauf ohne Kandidaten hat nichts gekostet und kostet kein Kontingent.
  const rejection = await bookMarketRun(event, profileId)
  if (rejection) {
    logEvent('info', 'market.run_rejected', { code: rejection.code })
    setResponseHeader(event, 'Retry-After', rejection.retryAfterSec)
    throw createError({
      status: 429,
      statusText: 'Too many market runs',
      data: { code: rejection.code },
    })
  }

  // Der Lauf BEGINNT — mit dieser Zeile ist im Log sichtbar, dass ab jetzt
  // Abrufe und Modell-Aufrufe laufen, auch wenn der Prozess mittendrin stirbt.
  logEvent('info', 'market.run_started', { competitors: competitors.length, withReport, aiEnabled })

  const previousProfiles = latestProfilesByCompetitor(await listMarketProfiles(event, profileId))
  const steps: MarketRunStep[] = []
  let extracted = 0
  let reused = 0
  let budget = MARKET_MAX_CHARS_PER_RUN

  for (const competitor of competitors) {
    const outcome = competitor.sourceKind === 'foundation'
      || competitor.sourceKind === 'library'
      || competitor.sourceKind === 'shared'
      ? await runStoredCandidate(event, userId, profileId, competitor, previousProfiles.get(competitor.$id)?.inputHash ?? '')
      : await runWebsiteCandidate(event, profileId, competitor, {
          aiEnabled,
          budget,
          contentLocale: profile.contentLocale,
          previousHash: previousProfiles.get(competitor.$id)?.inputHash ?? '',
        })

    steps.push(outcome.step)
    if (outcome.extracted) extracted++
    if (outcome.reused) reused++
    budget = Math.max(0, budget - outcome.charsUsed)
  }

  logEvent('info', 'market.run', {
    // ZAHLEN, kein Inhalt — keine Adresse, kein Name, kein Zitat.
    competitors: competitors.length,
    extracted,
    reused,
    excluded: steps.filter(step => step.status === 'excluded').length,
    failed: steps.filter(step => step.status === 'failed').length,
    aiEnabled,
  })

  // ── Fehlende Brand-Checks anstossen (§7.3, BC1) ──────────────────────────
  //
  // NACH der Schleife, weil erst hier feststeht, welche Kandidaten überhaupt
  // eine erreichbare Adresse haben — und VOR dem Bericht, damit der Stand, den
  // `loadMarketReportState` gleich liest, die frischen Scores schon trägt.
  //
  // ANGESTOSSEN WIRD NUR, WAS WIR LESEN DURFTEN (`eligible`). Ein Kandidat,
  // dessen `robots.txt` uns ausgeschlossen hat, bekommt keinen Check über die
  // Hintertür — sonst hiesse „ausgeschlossen, weil die Website die Auswertung
  // untersagt" (§2.3) nur noch „ausgeschlossen aus der Tabelle". Ein
  // unerreichbarer bekommt auch keinen: sein Check liefe in denselben Fehler
  // und kostete dafür ein Kontingent.
  //
  // FAIL-SOFT im GANZEN, nicht nur je Kandidat: der Score ist eine ZUGABE am
  // Kandidaten (der Bericht rechnet nicht damit). Ein Anstoss, der scheitert,
  // darf einen gelungenen Abruf nicht in eine Fehlermeldung verwandeln —
  // dieselbe Regel wie beim Bericht ein paar Zeilen weiter unten. Deckel,
  // Budget und die Log-Zeilen sitzen in `triggerMarketBrandChecks`.
  try {
    await triggerMarketBrandChecks(event, {
      profileId,
      userId,
      locale: profile.contentLocale,
      competitors,
      eligible: new Set(
        steps.filter(step => step.status === 'fetched').map(step => step.competitorId),
      ),
    })
  }
  catch (error) {
    logEvent('warn', 'market.brand_checks_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  // ── Der Vergleich, nur auf Ansage (s. Kopf) ──────────────────────────────
  let report: MarketRunResponse['report'] = null
  if (withReport) {
    try {
      const state = await loadMarketReportState(event, profileId)
      if (state.withProfile > 0) {
        report = (await produceMarketReport(event, profileId, state, {
          locale: profile.contentLocale,
          aiEnabled,
        })).view
      }
    }
    catch (error) {
      // FAIL-SOFT — und zwar bewusst anders als in der eigenen Bericht-Route:
      // dort ist der Bericht der ZWECK des Aufrufs, hier ist er eine Zugabe.
      // Ein Deckel oder ein ausgefallener Anbieter darf einen gelungenen Abruf
      // nicht in eine Fehlermeldung verwandeln — der Kunde holt den Vergleich
      // dann über `POST /report` nach und erfährt DORT den Grund.
      logEvent('warn', 'market.run_report_failed', {
        status: typeof (error as { statusCode?: unknown })?.statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 0,
      })
    }
  }

  return { ran: true, steps, aiEnabled, extracted, reused, report }
})

/**
 * DIE ZWEI QUELLEN OHNE ABRUF (§7.2 Nr. 2 und 3) — kein Netz, kein Modell,
 * keine Kosten.
 *
 * ── `foundation`: DIE EIGENE MARKE ────────────────────────────────────────
 * Sie wird bei JEDEM Lauf neu geschrieben, und das ist Absicht: die Foundation
 * ändert sich, während der Kunde arbeitet, und ein eingefrorenes eigenes
 * Profil wäre im Relaunch-Vergleich genau die Hälfte, die veraltet. Der
 * BESITZ wird dabei erneut geprüft (`loadMarketFoundationCandidate`) — er kann
 * sich zwischen Anlegen und Lauf geändert haben.
 *
 * ── `shared`: DIE FREIGEGEBENE MARKE EINES FREMDEN KONTOS (§7.2 Nr. 4) ───
 * Ebenfalls ohne Abruf — ihr Marktprofil entsteht aus IHREN bestätigten
 * Feldern, eingeschränkt auf die öffentlichen (`loadMarketSharedCandidate`).
 * Die Freigabe wird bei JEDEM Lauf neu geprüft: sie ist jederzeit
 * widerrufbar, und ein Lauf, der den Ja-Stand vom Anlegen benutzte, machte
 * den Widerruf wirkungslos. Ist sie weg, wird der Kandidat AUSGESCHLOSSEN
 * (`withdrawn`) statt still übersprungen — der Kunde soll erfahren, warum
 * eine Spalte fehlt, und ein bereits geschriebener Bericht bleibt, was er
 * war: ein Schnappschuss.
 *
 * ── `library`: EIN HANDGEPRÜFTER EINTRAG ──────────────────────────────────
 * Er wird NICHT abgerufen (Plan §7.2 Nr. 3: „von uns mit demselben Motor
 * gerechnet und VON HAND GEPRÜFT, versioniert im Repo"). Ein Abruf wäre hier
 * sogar schädlich: die Bibliothek ist eine redaktionelle Aussage mit Datum und
 * Namenszeichen, und ein Lauf, der sie stillschweigend durch frischen
 * Maschinentext ersetzte, nähme ihr genau das, wofür es sie gibt.
 *
 * Ein Eintrag, den es NICHT MEHR GIBT (die Datei ist versioniert, Einträge
 * dürfen verschwinden), wird `failed` — nicht still übersprungen: der Kandidat
 * steht in der Liste des Kunden, und „da war mal was" ist eine Auskunft.
 */
async function runStoredCandidate(
  event: H3Event,
  userId: string,
  profileId: string,
  competitor: MarketCompetitorRow,
  previousHash: string,
): Promise<CandidateOutcome> {
  let fields: MarketProfileField[]

  if (competitor.sourceKind === 'shared') {
    const shared = await loadMarketSharedCandidate(
      event,
      competitor.sourceRef ?? '',
      MARKET_UNLOCK_STEP,
    )
    if (!shared) {
      await updateMarketCompetitor(event, profileId, competitor.$id, {
        status: 'excluded',
        excludedReason: 'withdrawn',
      })
      return {
        step: {
          competitorId: competitor.$id,
          name: competitor.name,
          status: 'excluded',
          robotsChecked: false,
          pagesRead: 0,
          excludedReason: 'withdrawn',
        },
        extracted: false,
        reused: false,
        charsUsed: 0,
      }
    }
    fields = [...shared.fields]
  }
  else if (competitor.sourceKind === 'library') {
    const entry = marketLibraryEntry(competitor.sourceRef ?? '')
    if (!entry) {
      await updateMarketCompetitor(event, profileId, competitor.$id, {
        status: 'failed',
        excludedReason: 'noText',
      })
      return {
        step: {
          competitorId: competitor.$id,
          name: competitor.name,
          status: 'failed',
          robotsChecked: false,
          pagesRead: 0,
          excludedReason: 'noText',
        },
        extracted: false,
        reused: false,
        charsUsed: 0,
      }
    }
    fields = marketLibraryFields(entry)
  }
  else {
    fields = [...(await loadMarketFoundationCandidate(
      event,
      userId,
      competitor.sourceRef ?? '',
      profileId,
    )).fields]
  }

  // DIESELBE IDEMPOTENZ WIE BEIM WEBSITE-KANDIDATEN, nur über die WERTE statt
  // über einen Rohtext — es gibt hier keinen. Unveränderte Foundation,
  // unveränderte Bibliothek ⇒ keine zweite Zeile. Ohne das wüchse die
  // Verlaufs-Tabelle bei jedem Lauf um Kopien, und `market_profiles` ist ein
  // VERLAUF und keine Protokolldatei.
  const inputHash = marketInputHash(JSON.stringify(fields))
  const unchanged = Boolean(inputHash) && inputHash === previousHash

  if (!unchanged) {
    await createMarketProfile(event, profileId, competitor.$id, {
      fields: JSON.stringify(fields),
      aiOutsideView: '',
      extractedAt: new Date().toISOString(),
      model: '',
      promptVersion: '',
      inputHash,
    })
  }
  await updateMarketCompetitor(event, profileId, competitor.$id, {
    status: 'fetched',
    excludedReason: '',
    fetchedAt: new Date().toISOString(),
  })

  return {
    step: {
      competitorId: competitor.$id,
      name: competitor.name,
      status: 'fetched',
      // Es wurde keine `robots.txt` gefragt, weil nichts geholt wurde — die
      // Zeile erscheint erst, wenn sie wahr ist (Kopf von `MarketRunStep`).
      robotsChecked: false,
      pagesRead: 0,
    },
    extracted: !unchanged,
    reused: unchanged,
    charsUsed: 0,
  }
}

interface WebsiteRunOptions {
  aiEnabled: boolean
  budget: number
  contentLocale: string
  previousHash: string
}

/** Der Normalfall: Abruf, Auswertung, Aussensicht. */
async function runWebsiteCandidate(
  event: H3Event,
  profileId: string,
  competitor: MarketCompetitorRow,
  options: WebsiteRunOptions,
): Promise<CandidateOutcome> {
  const url = competitor.url ?? ''
  if (!url) {
    return {
      step: {
        competitorId: competitor.$id,
        name: competitor.name,
        status: 'failed',
        robotsChecked: false,
        pagesRead: 0,
        excludedReason: 'unreachable',
      },
      extracted: false,
      reused: false,
      charsUsed: 0,
    }
  }

  const outcome = await fetchMarketCompetitor(url, { budgetChars: options.budget })
  const now = new Date()
  const pageUrls = outcome.pages.map(page => page.url)

  // DER ABRUFSTAND WIRD IMMER GESCHRIEBEN — auch bei Ausschluss und Fehlschlag.
  // „Wir haben nachgesehen und durften nicht" ist eine Auskunft, die der Kunde
  // bekommen soll (§2.3: „ausgeschlossen, weil die Website die Auswertung
  // untersagt"), und ohne Stempel liefe der nächste Lauf blind wieder los.
  await updateMarketCompetitor(event, profileId, competitor.$id, {
    status: outcome.status,
    excludedReason: outcome.reason ?? '',
    pagesFetched: JSON.stringify(outcome.pages),
    fetchedAt: now.toISOString(),
    rawText: outcome.rawText || null,
    // DIE 24-STUNDEN-FRIST (§2.9 Nr. 6). Der Stempel steht seit M2, den Sweep,
    // der ihn einlöst, gibt es seit M5 — und seither kommt die Zahl aus
    // `shared/marketRetention.ts` statt als Rechnung an dieser Stelle: die
    // Frist wird HIER gesetzt und DORT eingelöst, und zwei Stellen mit
    // derselben 24 sind beim ersten Ändern zwei verschiedene Fristen.
    rawExpiresAt: marketRawExpiresAt(Boolean(outcome.rawText), now),
  })

  const step: MarketRunStep = {
    competitorId: competitor.$id,
    name: competitor.name,
    status: outcome.status,
    robotsChecked: true,
    pagesRead: outcome.pages.length,
    ...(outcome.reason ? { excludedReason: outcome.reason } : {}),
    ...(outcome.sitemapUrls ? { sitemapUrls: outcome.sitemapUrls } : {}),
    llmsTxt: outcome.llmsTxt,
    jsonLd: outcome.jsonLd,
  }

  if (outcome.status !== 'fetched') {
    return { step, extracted: false, reused: false, charsUsed: 0 }
  }

  const charsUsed = outcome.rawText.length

  // ── Idempotenz (§2.3 Nr. 5) ──────────────────────────────────────────────
  const inputHash = marketInputHash(outcome.rawText)
  if (inputHash && inputHash === options.previousHash) {
    return { step, extracted: false, reused: true, charsUsed }
  }

  // ── Kill-Switch (§2.8) ───────────────────────────────────────────────────
  // Der Abruf ist gelaufen und steht in der Zeile; die AUSWERTUNG unterbleibt.
  // Genau so ist es zugesagt: „die Seite zeigt Kandidaten und Abrufstand, der
  // Vergleich meldet: KI ist aus".
  if (!options.aiEnabled) {
    return { step, extracted: false, reused: false, charsUsed }
  }

  const extraction = await extractMarketProfile(event, {
    competitorName: competitor.name,
    pageUrls,
    rawText: outcome.rawText,
  })
  if (extraction.failure) {
    return { step, extracted: false, reused: false, charsUsed }
  }

  const host = hostOf(url)
  const aiView = await collectMarketAiView(event, {
    brandName: competitor.name,
    host,
    locale: options.contentLocale || 'en',
  })

  await createMarketProfile(event, profileId, competitor.$id, {
    fields: JSON.stringify(extraction.fields),
    // Die Aussensicht in ihre EIGENE Spalte (§7.5 a) — nie in `fields`.
    aiOutsideView: aiView.statements.length ? JSON.stringify(aiView.statements) : '',
    extractedAt: new Date().toISOString(),
    model: extraction.model,
    promptVersion: extraction.promptVersion,
    inputHash,
  })

  return { step, extracted: true, reused: false, charsUsed }
}

/** Der fachliche Grund einer Ablehnung (`data.code`) — sonst der HTTP-Status. */
function rejectionCodeOf(error: unknown): string {
  const data = (error as { data?: { code?: unknown } } | null)?.data
  if (data && typeof data.code === 'string') return data.code
  const status = (error as { status?: unknown, statusCode?: unknown } | null)
  const code = status?.status ?? status?.statusCode
  return typeof code === 'number' ? `http_${code}` : 'unknown'
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return ''
  }
}
