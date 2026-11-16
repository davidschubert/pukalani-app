import type { H3Event } from 'h3'
import type { MarketProfileField, MarketRunStep } from '../../shared/marketProfile'
import type { MarketCompetitorRow } from '../../shared/types/market'
import { MARKET_RUNS_TABLE } from '../../shared/types/market'
import { MARKET_MAX_CHARS_PER_RUN, serializeMarketPagesFetched } from '../../shared/marketCrawlRules'
import { marketRawExpiresAt } from '../../shared/marketRetention'
import { marketLibraryEntry, marketLibraryFields } from '../../shared/marketLibrary'
import type { MarketRunDetail } from '../../shared/marketRun'
import {
  MARKET_RUN_OUTCOMES,
  fitMarketRunDetail,
  toMarketRunDetailStep,
} from '../../shared/marketRun'
import { MARKET_UNLOCK_STEP } from './marketAccess'
import {
  createMarketProfile,
  listMarketProfiles,
  marketDb,
  updateMarketCompetitor,
} from './marketStore'
import { fetchMarketCompetitor } from './marketFetch'
import { extractMarketProfile, marketInputHash } from './marketExtract'
import { collectMarketAiView } from './marketAiView'
import { latestProfilesByCompetitor } from './marketViews'
import { loadMarketFoundationCandidate, loadMarketSharedCandidate } from './marketOwnProfile'
import { triggerMarketBrandChecks } from './marketBrandCheck'
import { loadMarketReportState, produceMarketReport } from './marketReportService'

/**
 * DER LAUF HINTER DER ANTWORT (GA1 P18, BE-008) — die Arbeit, die bis P18 in
 * `POST /run` selbst stand.
 *
 * ── WARUM ER HIER STEHT ─────────────────────────────────────────────────
 * Ein Marktvergleich liest bis zu fünf fremde Websites mit je acht Seiten,
 * fragt je Wettbewerber ein Modell, stösst Brand-Checks an und schreibt den
 * Bericht — im schlechtesten Fall Minuten. nginx gibt nach 60 s auf. Der
 * Mensch sah dann einen Fehler, obwohl der Lauf weiterlief und gelang, und
 * ein zweiter Klick verbrauchte einen zweiten seiner drei Tagesläufe. Die
 * Route antwortet deshalb jetzt sofort (202), und dieser Lauf rechnet mit
 * einem BESITZER (`runDetached`) weiter. Was er tut, steht an der
 * Lauf-Zeile (`market_runs`), die Seite fragt sie über die Übersicht ab.
 *
 * ── ER WIRFT NIE ─────────────────────────────────────────────────────────
 * Jeder Ausgang landet an der Lauf-Zeile: `done`, oder ein kurzer Code. Ein
 * Lauf, der still endet, wäre der Fehler von BE-008 noch einmal — nur ohne
 * Toast. Schreibt auch das Ende nicht mehr, bleibt der Herzschlag stehen und
 * die Zeile wird nach der Stall-Frist `stalled`: unschärfer, aber nie
 * „läuft für immer".
 *
 * ── DAS VERHALTEN JE KANDIDAT IST UNVERÄNDERT ────────────────────────────
 * Sequentiell, fail-soft je Kandidat, ein Zeichen-Budget, Idempotenz über den
 * Rohtext — die Begründungen stehen weiter im Kopf von `run.post.ts`. Neu
 * sind nur: die Sperre lebt (Herzschlag), der Fortschritt steht im Detail,
 * `paid` wird VOR jedem bezahlten Schritt geschrieben, und überlange
 * Adressen kippen keinen Kandidaten mehr (BE-011).
 */

/** Der Store der Lauf-Sperre dieses Layers. */
export function marketRunStore(event: H3Event) {
  const { tablesDB, databaseId } = marketDb(event)
  return appwriteRunLeaseStore({ tablesDB, databaseId, tableId: MARKET_RUNS_TABLE })
}

type MarketRunStore = ReturnType<typeof marketRunStore>
type MarketRunLease = Awaited<ReturnType<typeof acquireRunLease>>['lease']

/** Was ein Kandidat nach seinem Durchgang zu berichten hat. */
interface CandidateOutcome {
  step: MarketRunStep
  extracted: boolean
  reused: boolean
  charsUsed: number
  skippedUrls: number
}

export interface MarketRunInput {
  store: MarketRunStore
  lease: MarketRunLease
  userId: string
  profileId: string
  contentLocale: string
  competitors: readonly MarketCompetitorRow[]
  withReport: boolean
  aiEnabled: boolean
  /** Hat dieser Lauf ein Kontingent belegt (gebucht oder geerbt)? */
  booked: boolean
}

/**
 * Der Vermerk „ab hier kostet es" — geschrieben, BEVOR der Aufruf beginnt.
 * Scheitert das Schreiben, darf der bezahlte Schritt NICHT beginnen: ein Lauf
 * ohne Vermerk, der danach stirbt, gälte als unbezahlt, und sein Nachfolger
 * erbte die Buchung — ein Gratis-Lauf durch einen Absturz.
 */
class MarketRunLeaseUnwritable extends Error {}

export async function runMarketComparison(event: H3Event, input: MarketRunInput): Promise<void> {
  const startedAtMs = Date.now()
  const alive = keepRunLeaseAlive(input.store, input.lease)
  const detail: MarketRunDetail = {
    total: input.competitors.length,
    done: 0,
    phase: 'fetch',
    paid: false,
    booked: input.booked,
    withReport: input.withReport,
    aiEnabled: input.aiEnabled,
    extracted: 0,
    reused: 0,
    skippedUrls: 0,
    steps: [],
  }
  let outcome: string = MARKET_RUN_OUTCOMES.done

  /** Fortschritt schreiben — fail-soft: der Herzschlag-Timer hält die Sperre. */
  const progress = async (): Promise<void> => {
    try {
      await touchRunLease(input.store, input.lease, { detail: fitMarketRunDetail(detail) })
    }
    catch {
      // Ein verpasster Zwischenstand ist kein Abbruch; das Ende schreibt alles.
    }
  }

  /** `paid` setzen — strikt: ohne Vermerk kein bezahlter Schritt (s. o.). */
  const markPaid = async (): Promise<void> => {
    if (detail.paid) return
    detail.paid = true
    try {
      await touchRunLease(input.store, input.lease, { detail: fitMarketRunDetail(detail) })
    }
    catch {
      throw new MarketRunLeaseUnwritable()
    }
  }

  try {
    // `booked` zuerst an die Zeile: erst damit kann ein Nachfolger nach einem
    // Absturz die Buchung erben (`marketRunInheritsBooking`).
    await progress()

    const previousProfiles = latestProfilesByCompetitor(await listMarketProfiles(event, input.profileId))
    const steps: MarketRunStep[] = []
    let budget = MARKET_MAX_CHARS_PER_RUN

    for (const competitor of input.competitors) {
      // Ohne Herzschlag darf ein anderer Prozess übernehmen — zwei Läufe auf
      // demselben Branding wären genau das, was die Sperre verhindern soll.
      if (alive.lost()) {
        outcome = MARKET_RUN_OUTCOMES.leaseLost
        break
      }

      const candidate = competitor.sourceKind === 'foundation'
        || competitor.sourceKind === 'library'
        || competitor.sourceKind === 'shared'
        ? await runStoredCandidate(event, input.userId, input.profileId, competitor, previousProfiles.get(competitor.$id)?.inputHash ?? '')
        : await runWebsiteCandidate(event, input.profileId, competitor, {
            aiEnabled: input.aiEnabled,
            budget,
            contentLocale: input.contentLocale,
            previousHash: previousProfiles.get(competitor.$id)?.inputHash ?? '',
            markPaid,
          })

      steps.push(candidate.step)
      if (candidate.extracted) detail.extracted++
      if (candidate.reused) detail.reused++
      detail.skippedUrls += candidate.skippedUrls
      budget = Math.max(0, budget - candidate.charsUsed)
      detail.done++
      detail.steps.push(toMarketRunDetailStep(candidate.step))
      await progress()
    }

    logEvent('info', 'market.run', {
      // ZAHLEN, kein Inhalt — keine Adresse, kein Name, kein Zitat.
      competitors: input.competitors.length,
      extracted: detail.extracted,
      reused: detail.reused,
      excluded: steps.filter(step => step.status === 'excluded').length,
      failed: steps.filter(step => step.status === 'failed').length,
      skippedUrls: detail.skippedUrls,
      aiEnabled: input.aiEnabled,
    })

    if (outcome === MARKET_RUN_OUTCOMES.done) {
      // ── Fehlende Brand-Checks anstossen (§7.3, BC1) ──────────────────────
      // NACH der Schleife, VOR dem Bericht; nur was wir lesen DURFTEN;
      // fail-soft im Ganzen (Begründung unverändert im Kopf von `run.post.ts`
      // bis P18, jetzt hier). Ein Anstoss kann einen Check kosten — deshalb
      // `paid` davor, sobald es überhaupt einen Kandidaten dafür gibt.
      const eligible = new Set(
        steps.filter(step => step.status === 'fetched').map(step => step.competitorId),
      )
      detail.phase = 'checks'
      if (eligible.size) await markPaid()
      else await progress()
      try {
        await triggerMarketBrandChecks(event, {
          profileId: input.profileId,
          userId: input.userId,
          locale: input.contentLocale,
          competitors: input.competitors,
          eligible,
        })
      }
      catch (error) {
        logEvent('warn', 'market.brand_checks_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
      }

      // ── Der Vergleich, nur auf Ansage ────────────────────────────────────
      if (input.withReport) {
        detail.phase = 'report'
        try {
          const state = await loadMarketReportState(event, input.profileId)
          if (state.withProfile > 0) {
            await markPaid()
            await produceMarketReport(event, input.profileId, state, {
              locale: input.contentLocale,
              aiEnabled: input.aiEnabled,
            })
          }
          else {
            await progress()
          }
        }
        catch (error) {
          if (error instanceof MarketRunLeaseUnwritable) throw error
          // FAIL-SOFT: der Bericht ist hier eine Zugabe. Ein Deckel oder ein
          // ausgefallener Anbieter verwandelt einen gelungenen Abruf nicht in
          // einen gescheiterten Lauf — der Kunde holt den Vergleich über
          // `POST /report` nach und erfährt DORT den Grund.
          logEvent('warn', 'market.run_report_failed', {
            status: typeof (error as { statusCode?: unknown })?.statusCode === 'number'
              ? (error as { statusCode: number }).statusCode
              : 0,
          })
        }
      }
    }
  }
  catch (error) {
    outcome = error instanceof MarketRunLeaseUnwritable
      ? MARKET_RUN_OUTCOMES.leaseUnwritable
      : MARKET_RUN_OUTCOMES.failed
    // Nur die Art, nie Inhalt: eine Appwrite- oder Anbieter-Meldung kann
    // Adressen und fremden Text tragen.
    logEvent('warn', 'market.run_failed', {
      code: outcome,
      status: typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 0,
      done: detail.done,
      total: detail.total,
    })
  }
  finally {
    alive.stop()
  }

  detail.phase = 'end'
  try {
    await finishRunLease(input.store, input.lease, { outcome, detail: fitMarketRunDetail(detail) })
  }
  catch (error) {
    // Dann bleibt der Herzschlag stehen, und die Zeile wird `stalled` (Kopf).
    logEvent('warn', 'market.run_finish_unwritten', {
      code: outcome,
      message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    })
  }
  logEvent('info', 'market.run_finished', {
    code: outcome,
    ms: Date.now() - startedAtMs,
    done: detail.done,
    total: detail.total,
    paid: detail.paid,
  })
}

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
        skippedUrls: 0,
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
        skippedUrls: 0,
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
    skippedUrls: 0,
  }
}

interface WebsiteRunOptions {
  aiEnabled: boolean
  budget: number
  contentLocale: string
  previousHash: string
  /** Vermerkt `paid` an der Lauf-Zeile — VOR dem ersten bezahlten Aufruf. */
  markPaid: () => Promise<void>
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
      skippedUrls: 0,
    }
  }

  const outcome = await fetchMarketCompetitor(url, { budgetChars: options.budget })
  const now = new Date()
  const pageUrls = outcome.pages.map(page => page.url)

  // DER ABRUFSTAND WIRD IMMER GESCHRIEBEN — auch bei Ausschluss und Fehlschlag.
  // „Wir haben nachgesehen und durften nicht" ist eine Auskunft, die der Kunde
  // bekommen soll (§2.3: „ausgeschlossen, weil die Website die Auswertung
  // untersagt"), und ohne Stempel liefe der nächste Lauf blind wieder los.
  try {
    await updateMarketCompetitor(event, profileId, competitor.$id, {
      status: outcome.status,
      excludedReason: outcome.reason ?? '',
      // In die Spalte passend (BE-011): passt das Protokoll nicht, fallen
      // Einträge von hinten weg — nie das ganze Update.
      pagesFetched: serializeMarketPagesFetched(outcome.pages),
      fetchedAt: now.toISOString(),
      rawText: outcome.rawText || null,
      // DIE 24-STUNDEN-FRIST (§2.9 Nr. 6) — gesetzt hier, eingelöst im Sweep;
      // die Zahl kommt aus `shared/marketRetention.ts`.
      rawExpiresAt: marketRawExpiresAt(Boolean(outcome.rawText), now),
    })
  }
  catch {
    return await failWebsiteCandidate(event, profileId, competitor, outcome.skippedUrls, now)
  }

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
  const skippedUrls = outcome.skippedUrls

  if (outcome.status !== 'fetched') {
    return { step, extracted: false, reused: false, charsUsed: 0, skippedUrls }
  }

  const charsUsed = outcome.rawText.length

  // ── Idempotenz (§2.3 Nr. 5) ──────────────────────────────────────────────
  const inputHash = marketInputHash(outcome.rawText)
  if (inputHash && inputHash === options.previousHash) {
    return { step, extracted: false, reused: true, charsUsed, skippedUrls }
  }

  // ── Kill-Switch (§2.8) ───────────────────────────────────────────────────
  // Der Abruf ist gelaufen und steht in der Zeile; die AUSWERTUNG unterbleibt.
  // Genau so ist es zugesagt: „die Seite zeigt Kandidaten und Abrufstand, der
  // Vergleich meldet: KI ist aus".
  if (!options.aiEnabled) {
    return { step, extracted: false, reused: false, charsUsed, skippedUrls }
  }

  // AB HIER KOSTET ES — der Vermerk steht VOR dem Aufruf (Kopf von
  // `shared/marketRun.ts`).
  await options.markPaid()

  const extraction = await extractMarketProfile(event, {
    competitorName: competitor.name,
    pageUrls,
    rawText: outcome.rawText,
  })
  if (extraction.failure) {
    return { step, extracted: false, reused: false, charsUsed, skippedUrls }
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

  return { step, extracted: true, reused: false, charsUsed, skippedUrls }
}

/**
 * DER ABRUFSTAND LIESS SICH NICHT SCHREIBEN (BE-011) — dieser Kandidat ist
 * `failed`, der Lauf geht weiter.
 *
 * Zweiter Versuch, minimal: Status, Zeitpunkt, KEIN Protokoll und KEIN
 * Rohtext — die zwei Spalten, die wachsen können und damit die
 * wahrscheinliche Ursache sind. Als Grund steht `unreachable` da: es ist der
 * bestehende Wert, der dem Kunden das Richtige sagt („diese Website konnten
 * wir diesmal nicht lesen") — ein neuer Wert bräuchte eine Übersetzung und
 * an der Spalte nichts, aber `noText` wäre falsch (es gab Text, wir haben ihn
 * nur nicht abgelegt). Scheitert auch dieser Versuch, steht der Ausgang nur
 * im Lauf-Schritt; die Zeile behält ihren alten Stand.
 */
async function failWebsiteCandidate(
  event: H3Event,
  profileId: string,
  competitor: MarketCompetitorRow,
  skippedUrls: number,
  now: Date,
): Promise<CandidateOutcome> {
  logEvent('warn', 'market.run_candidate_unwritten', { skippedUrls })
  try {
    await updateMarketCompetitor(event, profileId, competitor.$id, {
      status: 'failed',
      excludedReason: 'unreachable',
      fetchedAt: now.toISOString(),
    })
  }
  catch {
    // Nur der Schritt im Lauf trägt den Ausgang (s. Kopf).
  }
  return {
    step: {
      competitorId: competitor.$id,
      name: competitor.name,
      status: 'failed',
      robotsChecked: true,
      pagesRead: 0,
      excludedReason: 'unreachable',
    },
    extracted: false,
    reused: false,
    charsUsed: 0,
    skippedUrls,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return ''
  }
}
