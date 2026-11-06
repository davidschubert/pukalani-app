import type { H3Event } from 'h3'
import {
  listBrandFindings,
  purgeOpenBrandFindingsOfKind,
  slotById,
  toBrandFindingView,
  writeBrandFindings,
} from '../contracts/brandContract'
import type { BrandStepKey } from '../contracts/brandContract'
import type {
  MarketAiView,
  MarketBrandCheck,
  MarketClaimList,
  MarketCompetitor,
  MarketFinding,
  MarketProfile,
  MarketProfileField,
} from '../../shared/marketProfile'
import { MARKET_OWN_ID, marketFieldCandidates, marketIsSelfCandidate } from '../../shared/marketProfile'
import type { MarketRevisionCandidate } from '../../shared/marketReportRules'
import { marketMatrixRows } from '../../shared/marketReportRules'
import { marketLibraryVersion } from '../../shared/marketLibrary'
import type { MarketReportView } from '../../shared/types/marketApi'
import type { MarketCompetitorRow, MarketProfileRow } from '../../shared/types/market'
import { marketFieldsSchema, parseMarketJson } from '../../shared/types/market'
import { MARKET_AI_DISABLED_CODE } from '../../shared/marketLimits'
import type { MarketReportFinding } from './marketReport'
import { buildMarketReport, marketRevisionKey } from './marketReport'
import { bookMarketReport } from './marketQuota'
import type { MarketOwnProfile } from './marketOwnProfile'
import { loadMarketOwnProfile, marketOwnSlotId } from './marketOwnProfile'
import {
  loadMarketBrandChecks,
  marketBrandCheckIds,
  stampMarketBrandCheckIds,
} from './marketBrandCheck'
import {
  createMarketReport,
  findMarketReport,
  listMarketCompetitors,
  listMarketProfiles,
  listMarketReports,
} from './marketStore'
import { latestProfilesByCompetitor, toMarketAiView, toMarketCompetitor } from './marketViews'

/**
 * DER STAND, AUS DEM EIN BERICHT ENTSTEHT — und der Vergleich mit dem, der
 * gespeichert ist (MV1 M3).
 *
 * ── WARUM DAS EINE EIGENE DATEI IST ───────────────────────────────────────
 * BEIDE Bericht-Routen brauchen exakt dieselbe Rechnung: die POST-Route, um zu
 * wissen, ob sie überhaupt ein Modell rufen muss, und die GET-Route, um zu
 * sagen, ob der gespeicherte Bericht noch zum heutigen Stand passt (`stale`).
 * Zwei Fassungen davon wären zwei Antworten auf „ist das noch aktuell" — und
 * die eine Antwort, bei der ein Fehler NIEMAND auffiele, weil beide Seiten
 * denselben falschen Schlüssel rechneten.
 *
 * `stale` ist deshalb keine zweite Regel, sondern dieselbe: der Schlüssel des
 * JETZIGEN Standes gegen den, der in der Zeile steht.
 */

/** Was in einen Bericht eingeht — einmal geladen, mehrfach gebraucht. */
export interface MarketReportState {
  readonly own: MarketOwnProfile
  readonly competitorRows: readonly MarketCompetitorRow[]
  readonly competitors: readonly MarketCompetitor[]
  readonly profiles: readonly MarketProfile[]
  readonly aiViews: readonly MarketAiView[]
  readonly brandChecks: ReadonlyMap<string, MarketBrandCheck>
  readonly revisionKey: string
  /**
   * Wie viele Kandidaten DES FELDES ein Marktprofil tragen — die eigene alte
   * Website (`role: 'self'`) zählt NICHT mit (§2.3: „Feld = Wettbewerber",
   * MV1 M4). Sonst liefe ein Relaunch-Branding ohne einen einzigen
   * Wettbewerber in einen Modell-Aufruf, dessen Material aus genau einer
   * eigenen Quelle bestünde.
   */
  readonly withProfile: number
}

/**
 * DEN GANZEN STAND LADEN.
 *
 * ── DIE EIGENEN FELDER WERDEN JEDES MAL NEU GELESEN ───────────────────────
 * Und zwar aus der laufenden Foundation, nicht aus dem letzten Bericht. Genau
 * daran hängt `stale`: korrigiert der Kunde ein bestätigtes Feld, bewegt sich
 * der Schlüssel, und der gespeicherte Bericht ist überholt — ohne dass
 * irgendjemand ein Ereignis abonnieren müsste (Plan §2.4).
 */
export async function loadMarketReportState(
  event: H3Event,
  profileId: string,
): Promise<MarketReportState> {
  const [own, competitorRows, profileRows] = await Promise.all([
    loadMarketOwnProfile(event, profileId),
    listMarketCompetitors(event, profileId),
    listMarketProfiles(event, profileId),
  ])

  const brandChecks = await loadMarketBrandChecks(event, competitorRows)
  const latest = latestProfilesByCompetitor(profileRows)

  const competitors: MarketCompetitor[] = []
  const profiles: MarketProfile[] = []
  const aiViews: MarketAiView[] = []
  const revisionCandidates: MarketRevisionCandidate[] = []
  let withProfile = 0

  for (const row of competitorRows) {
    competitors.push(toMarketCompetitor(row, brandChecks.get(row.$id) ?? null))

    const profileRow = latest.get(row.$id)
    if (profileRow) {
      const fields = parseMarketJson<MarketProfileField[]>(profileRow.fields, marketFieldsSchema) ?? []
      profiles.push({ competitorId: row.$id, fields })
      if (!marketIsSelfCandidate(row) && fields.some(field => field.value.trim())) {
        withProfile++
      }
      const view = toMarketAiView(profileRow)
      if (view) aiViews.push(view)
    }

    revisionCandidates.push(revisionCandidateOf(row, profileRow))
  }

  const revisionKey = marketRevisionKey({
    own: own.fields,
    candidates: revisionCandidates,
    libraryVersion: marketLibraryVersion(),
  })

  return { own, competitorRows, competitors, profiles, aiViews, brandChecks, revisionKey, withProfile }
}

/**
 * EIN KANDIDAT ALS ZUTAT DES SCHLÜSSELS.
 *
 * `inputHash` ist der Stand SEINER Auswertung. Er ist die zweite Hälfte der
 * Idempotenz: ein neuer Abruf, der denselben Rohtext findet, legt kein neues
 * Marktprofil an — und bewegt damit auch den Bericht-Schlüssel nicht. Genau so
 * ist „ein erneuter Lauf bei unverändertem Stand kostet nichts" (§2.8) durch
 * die ganze Kette hindurch wahr.
 */
function revisionCandidateOf(
  row: MarketCompetitorRow,
  profileRow: MarketProfileRow | undefined,
): MarketRevisionCandidate {
  return {
    id: row.$id,
    sourceKind: row.sourceKind ?? 'website',
    sourceRef: row.sourceRef ?? '',
    url: row.url ?? '',
    inputHash: profileRow?.inputHash ?? '',
  }
}

// ── Der gespeicherte Bericht ───────────────────────────────────────────────

/** Die Form, in der ein Bericht in den vier JSON-Spalten liegt. */
interface StoredReport {
  own: MarketProfileField[]
  competitors: MarketCompetitor[]
  profiles: MarketProfile[]
  aiViews: MarketAiView[]
  claims: MarketClaimList[]
  missingOwnFields: string[]
}

/**
 * DEN BERICHT ALS EINGEFRORENEN STAND SCHREIBEN.
 *
 * ── WARUM DAS EIGENE PROFIL UND DIE MARKTPROFILE MITKOMMEN ────────────────
 * Ein Bericht ist ein STAND, kein Fenster auf die Gegenwart (Anhang B:
 * `ownProfile` = „das eingefrorene eigene Profil, wie `brand_shares.snapshot`").
 * Läse die GET-Route die Profile frisch, stünden die Sätze eines alten
 * Berichts neben den Zitaten von heute — und niemand könnte sagen, worauf sich
 * eine Konvention eigentlich bezog. `stale` sagt dann, dass sich seither etwas
 * bewegt hat; der Bericht selbst bleibt, was er war.
 *
 * Die MATRIX wird NICHT gespeichert: sie ist reine Umformung aus `ownProfile`
 * und den eingefrorenen Marktprofilen (`marketMatrixRows`) und würde als Kopie
 * daneben beim ersten neuen Feld auseinanderlaufen. Die Spalte `matrix` trägt
 * deshalb genau ihre ZUTATEN.
 */
export async function saveMarketReport(
  event: H3Event,
  profileId: string,
  state: MarketReportState,
  claims: readonly MarketClaimList[],
  findingIds: readonly string[],
  meta: { model: string, promptVersion: string },
): Promise<void> {
  const byKind = (kind: string) => claims.find(list => list.kind === kind)?.entries ?? []
  await createMarketReport(event, profileId, state.revisionKey, {
    ownProfile: JSON.stringify(state.own.fields),
    matrix: JSON.stringify({
      competitors: state.competitors,
      profiles: state.profiles,
      aiViews: state.aiViews,
      missingOwnFields: state.own.missingFieldIds,
    }),
    conventions: JSON.stringify(byKind('convention')),
    overlaps: JSON.stringify(byKind('overlap')),
    whitespace: JSON.stringify(byKind('whitespace')),
    findingIds: JSON.stringify([...findingIds]).slice(0, 2000),
    model: meta.model,
    promptVersion: meta.promptVersion,
  })
}

function parseStored(row: {
  ownProfile?: string | null
  matrix?: string | null
  conventions?: string | null
  overlaps?: string | null
  whitespace?: string | null
}): StoredReport {
  // JEDE Spalte einzeln und tolerant: ein kaputter Teil kostet seinen Abschnitt,
  // nie den ganzen Bericht (dieselbe Regel wie in `marketViews.ts` — die ZEILE
  // ist der Verdächtige, nicht der Vertrag).
  const own = parseMarketJson<MarketProfileField[]>(row.ownProfile, marketFieldsSchema) ?? []
  let competitors: MarketCompetitor[] = []
  let profiles: MarketProfile[] = []
  let aiViews: MarketAiView[] = []
  let missingOwnFields: string[] = []
  try {
    const parsed = JSON.parse(row.matrix ?? '{}') as Record<string, unknown>
    competitors = Array.isArray(parsed.competitors) ? parsed.competitors as MarketCompetitor[] : []
    profiles = Array.isArray(parsed.profiles) ? parsed.profiles as MarketProfile[] : []
    aiViews = Array.isArray(parsed.aiViews) ? parsed.aiViews as MarketAiView[] : []
    missingOwnFields = Array.isArray(parsed.missingOwnFields) ? parsed.missingOwnFields as string[] : []
  }
  catch {
    // leerer Stand
  }
  const list = (raw: string | null | undefined, kind: MarketClaimList['kind']): MarketClaimList => {
    try {
      const parsed: unknown = JSON.parse(raw ?? '[]')
      return { kind, entries: Array.isArray(parsed) ? parsed as MarketClaimList['entries'] : [] }
    }
    catch {
      return { kind, entries: [] }
    }
  }
  return {
    own,
    competitors,
    profiles,
    aiViews,
    missingOwnFields,
    claims: [
      list(row.conventions, 'convention'),
      list(row.overlaps, 'overlap'),
      list(row.whitespace, 'whitespace'),
    ],
  }
}

/**
 * DIE MARKT-BEFUNDE EINES BRANDINGS — gelesen, nicht mitgespeichert.
 *
 * `market_reports.findingIds` hält die Ids; der ZUSTAND (offen, angenommen,
 * abgelehnt) lebt in `brand_findings` und ändert sich nach dem Bericht. Wer
 * ihn mitgespeichert hätte, zeigte einen Chip, den der Mensch längst
 * entschieden hat.
 */
export async function loadMarketFindings(
  event: H3Event,
  profileId: string,
): Promise<MarketFinding[]> {
  const rows = await listBrandFindings(event, profileId)
  return rows
    .map(toBrandFindingView)
    .filter(view => view.kind === 'market')
    .map(view => ({
      id: view.id,
      slotId: view.slots[0] ?? '',
      why: view.why,
      suggestion: view.suggestion,
      status: view.status,
    }))
}

/**
 * DEN GESPEICHERTEN BERICHT IN SEINE ANSICHT UMFORMEN — mit der Matrix, die
 * aus seinen EIGENEN eingefrorenen Zutaten gerechnet wird.
 */
export function toMarketReportView(
  row: {
    $createdAt: string
    revisionKey: string
    ownProfile?: string | null
    matrix?: string | null
    conventions?: string | null
    overlaps?: string | null
    whitespace?: string | null
  },
  findings: readonly MarketFinding[],
): MarketReportView {
  const stored = parseStored(row)
  return {
    createdAt: row.$createdAt,
    revisionKey: row.revisionKey,
    own: stored.own,
    // Die LISTEN bleiben vollständig — die eigene alte Website steht darin,
    // weil die Relaunch-Gegenüberstellung sie braucht. Die MATRIX ist „das
    // Feld" und lässt sie weg (§2.3, MV1 M4).
    competitors: stored.competitors,
    profiles: stored.profiles,
    matrix: marketMatrixRows(stored.own, marketFieldCandidates(stored.competitors), stored.profiles),
    claims: stored.claims,
    findings: [...findings],
    aiViews: stored.aiViews,
    missingOwnFields: stored.missingOwnFields,
  }
}

/** Der jüngste Bericht eines Brandings — oder keiner. */
export async function latestMarketReport(event: H3Event, profileId: string) {
  const rows = await listMarketReports(event, profileId)
  return rows[0]
}

/** Der Bericht zu GENAU diesem Stand — die Idempotenz-Abfrage. */
export async function marketReportForRevision(
  event: H3Event,
  profileId: string,
  revisionKey: string,
) {
  return await findMarketReport(event, profileId, revisionKey)
}

// ── Die Befunde eines neuen Berichts ───────────────────────────────────────

/**
 * DIE BEFUNDE SCHREIBEN — und die OFFENEN des Vorgängers wegräumen.
 *
 * ── DIE REGEL UND IHR GRUND ───────────────────────────────────────────────
 * Ein Markt-Befund ist die Aussage EINES Berichtsstandes. Kommt ein neuer
 * Bericht, ist die alte Aussage überholt, nicht falsch — und zwei Chips am
 * selben Feld, die dasselbe mit anderen Zahlen sagen, kann der Mensch davor
 * nicht auflösen. ENTSCHIEDENE bleiben: sie sind das Protokoll seiner Arbeit,
 * und „schon abgelehnt" ist eine andere Auskunft als „nie gesehen".
 *
 * ── DER STEMPEL `stepKey` ─────────────────────────────────────────────────
 * Er sagt, aus welchem KAPITEL ein Befund stammt. Ein Markt-Befund stammt aus
 * keinem — er stammt aus einem Bericht. Gestempelt wird deshalb das Kapitel
 * des betroffenen FELDES: dort ist er in der Abnahme sichtbar, und dorthin
 * würde ihn ein „Nochmal von vorn" dieses Kapitels auch mitnehmen. (Sperren
 * tut er nichts — das tut nur `conflict`.)
 */
export async function writeMarketFindings(
  event: H3Event,
  profileId: string,
  findings: readonly MarketReportFinding[],
): Promise<string[]> {
  await purgeOpenBrandFindingsOfKind(event, profileId, 'market')
  if (!findings.length) return []

  const rows = await writeBrandFindings(event, {
    profileId,
    stepKey: (finding) => {
      const slotId = finding.slots[0] ?? ''
      return (slotById(slotId)?.stepId ?? 'context') as BrandStepKey
    },
    // Ein Markt-Befund hat keine Quell-SESSION. Der Marker sagt, woher er
    // kommt, statt eine Session zu behaupten, die es nicht gibt — die
    // Ablehnungs-Notiz sucht danach eine Session und findet keine, und das ist
    // richtig: sie gehört zu einem Gespräch, das hier nie stattfand.
    sourceSession: `market:${MARKET_OWN_ID}`,
    findings: findings.map(finding => ({
      kind: 'market' as const,
      slots: [finding.slotId],
      why: finding.why,
      suggestion: finding.suggestion,
    })),
  })
  return rows.map(row => row.$id)
}

/**
 * DEN ABRUFSTAND EINES KANDIDATEN UM DIE CHECK-ID ERGÄNZEN
 * (`market_competitors.brandCheckId`, Anhang B).
 *
 * Die REGEL (fail-soft, nur schreiben was sich geändert hat) liegt seit BC1 in
 * `marketBrandCheck.ts` — der Lauf stempelt jetzt auch, und zwei Fassungen
 * derselben Regel wären beim ersten Ändern zwei verschiedene Regeln. Hier
 * bleibt nur die Übersetzung „Bericht-Stand ⇒ Id-Karte".
 */
export async function stampMarketBrandCheckIdsOfState(
  event: H3Event,
  profileId: string,
  state: MarketReportState,
): Promise<void> {
  await stampMarketBrandCheckIds(
    event,
    profileId,
    state.competitorRows,
    marketBrandCheckIds(state.brandChecks),
  )
}

// ── Der ganze Vorgang, einmal ─────────────────────────────────────────────

export interface ProduceMarketReportResult {
  view: MarketReportView
  reused: boolean
}

/**
 * EINEN BERICHT HERSTELLEN — die Rechnung, die BEIDE Einstiege teilen
 * (`POST /report` und der Lauf mit `withReport`).
 *
 * Die Reihenfolge IST die Kostenkontrolle, wie beim Lauf und beim Brand-Check:
 *
 *  1. Stand laden (kostet nichts).
 *  2. GIBT ES ZU DIESEM STAND SCHON EINEN BERICHT? ⇒ ihn zurückgeben, ohne
 *     Buchung und ohne Modell (§2.3 Nr. 5). Was nichts kostet, kostet kein
 *     Kontingent — andersherum sperrte sich jemand mit drei Klicks auf
 *     dasselbe Ergebnis selbst aus.
 *  3. Erst dann buchen und rufen.
 *
 * WIRFT bei Deckel und bei abgeschalteter KI; alles andere ist fail-soft.
 */
export async function produceMarketReport(
  event: H3Event,
  profileId: string,
  state: MarketReportState,
  options: { locale: string, aiEnabled: boolean },
): Promise<ProduceMarketReportResult> {
  const existing = await marketReportForRevision(event, profileId, state.revisionKey)
  if (existing) {
    return {
      view: toMarketReportView(existing, await loadMarketFindings(event, profileId)),
      reused: true,
    }
  }

  if (!options.aiEnabled) {
    throw createError({
      status: 409,
      statusText: 'AI is switched off',
      data: { code: MARKET_AI_DISABLED_CODE },
    })
  }

  const rejection = await bookMarketReport(event, profileId)
  if (rejection) {
    setResponseHeader(event, 'Retry-After', rejection.retryAfterSec)
    throw createError({
      status: 429,
      statusText: 'Too many market reports',
      data: { code: rejection.code },
    })
  }

  const startedAt = Date.now()
  const report = await buildMarketReport(event, {
    own: state.own.fields,
    // DIE EIGENE ALTE WEBSITE GEHT DEM MODELL GAR NICHT ERST ZU (§2.3,
    // MV1 M4): sie ist keine Stimme im Feld, und jede Quote („3 von 4 sagen
    // das") zählte uns sonst selbst mit. Der Riegel bekommt sie aus demselben
    // Grund nicht — ihr Name ist unser eigener.
    candidates: marketFieldCandidates(state.competitors)
      .filter(competitor => competitor.status !== 'excluded')
      .map(competitor => ({
        competitor,
        fields: state.profiles.find(profile => profile.competitorId === competitor.id)?.fields ?? [],
      }))
      .filter(candidate => candidate.fields.some(field => field.value.trim())),
    locale: options.locale,
    slotFor: fieldId => marketOwnSlotId(state.own, fieldId),
  })

  // DER RIEGEL ZÄHLT, ER SCHREIBT NICHT MIT (Plan §2.10). Was verworfen wurde,
  // ist ein Text über einen Dritten — er hat in keinem Log etwas verloren.
  const filteredTotal = report.filtered.competitor_name
    + report.filtered.competitor_domain
    + report.filtered.disparagement
  if (filteredTotal > 0) {
    logEvent('info', 'market.report_filtered', {
      total: filteredTotal,
      competitorName: report.filtered.competitor_name,
      competitorDomain: report.filtered.competitor_domain,
      disparagement: report.filtered.disparagement,
    })
  }

  const findingIds = report.failure ? [] : await writeMarketFindings(event, profileId, report.findings)

  // FAIL-SOFT: ein Bericht, dessen Modell ausgefallen ist, wird NICHT
  // gespeichert. Sonst läge ein leerer Bericht unter dem Schlüssel dieses
  // Standes, und der nächste Versuch bekäme ihn als „schon gerechnet" zurück —
  // ein Zwischenspeicher voller Nichts.
  if (!report.failure) {
    await saveMarketReport(event, profileId, state, report.claims, findingIds, {
      model: report.model,
      promptVersion: report.promptVersion,
    })
    await stampMarketBrandCheckIdsOfState(event, profileId, state)
  }

  logEvent('info', 'market.report', {
    // ZAHLEN, kein Inhalt (Log-Regel).
    ms: Date.now() - startedAt,
    candidates: state.withProfile,
    conventions: report.claims.find(list => list.kind === 'convention')?.entries.length ?? 0,
    overlaps: report.claims.find(list => list.kind === 'overlap')?.entries.length ?? 0,
    whitespace: report.claims.find(list => list.kind === 'whitespace')?.entries.length ?? 0,
    findings: findingIds.length,
    filtered: filteredTotal,
    reused: false,
    model: report.model,
    promptVersion: report.promptVersion,
    failure: report.failure,
  })

  const findings = await loadMarketFindings(event, profileId)
  return {
    view: {
      createdAt: new Date().toISOString(),
      revisionKey: state.revisionKey,
      own: [...state.own.fields],
      competitors: [...state.competitors],
      profiles: [...state.profiles],
      matrix: marketMatrixRows(state.own.fields, marketFieldCandidates(state.competitors), state.profiles),
      claims: report.claims,
      findings,
      aiViews: [...state.aiViews],
      missingOwnFields: [...state.own.missingFieldIds],
    },
    reused: false,
  }
}
