import { z } from 'zod'
import type { MarketCompetitorResponse } from '../../../../../../shared/types/marketApi'
import { MARKET_COMPETITORS_MAX, marketFieldCandidates } from '../../../../../../shared/marketProfile'
import {
  MARKET_COMPETITOR_DUPLICATE_CODE,
  MARKET_COMPETITOR_LIMIT_CODE,
  MARKET_INVALID_URL_CODE,
  MARKET_SELF_LIMIT_CODE,
  MARKET_SHARED_UNAVAILABLE_CODE,
} from '../../../../../../shared/marketLimits'
import { normalizeMarketUrl } from '../../../../../../shared/marketCrawlRules'
import { marketLibraryEntry } from '../../../../../../shared/marketLibrary'
import { isBrandProfileSharedForMarket } from '../../../../../contracts/brandContract'
import { MARKET_UNLOCK_STEP, requireMarketProfile } from '../../../../../utils/marketAccess'
import { createMarketCompetitor, listMarketCompetitors } from '../../../../../utils/marketStore'
import { toMarketCompetitor } from '../../../../../utils/marketViews'

/**
 * EINEN KANDIDATEN ANLEGEN (Plan §2.3 Schritt 1, §2.9 Nr. 8).
 *
 * ── VIER QUELLEN SEIT M4 ──────────────────────────────────────────────────
 * `website` (der Normalfall: der Kunde trägt die Adresse ein — sie wird NIE
 * geraten, Davids Entscheidung 4), `foundation` (die eigene Marke aus dem
 * Konto, §7.2 Nr. 2 — der Relaunch-Fall, kein Abruf), `library` (ein
 * handgeprüfter Eintrag aus `shared/library/`, ebenfalls ohne Abruf) und seit
 * MV1 M4 `shared`: die Marke eines FREMDEN Kontos, die ihre Eigentümerin
 * ausdrücklich freigegeben hat (`brand_profiles.marketVisibility`, Migration
 * brand-019).
 *
 * Die Bibliothek ist seit M3 bedienbar, weil ihre MECHANIK steht; ihr INHALT
 * sind bis M6 ausschliesslich erfundene Testeinträge, und genau deshalb wird
 * der Schlüssel hier gegen die geladene Datei geprüft statt geglaubt.
 *
 * ── DIE ROLLE IST DIE ZWEITE FRAGE (§7.2 Nr. 2, MV1 M4) ──────────────────
 * `role: 'self'` ist die EIGENE alte Website (oder ein zweites eigenes
 * Branding) — derselbe Motor, aber kein Mitbewerber: sie zählt nicht gegen
 * den Fünfer-Deckel und erscheint nicht im „Feld". Mehr als EINE davon gibt
 * es nicht: „unsere alte Website" ist im Singular gemeint, und zwei Spalten
 * mit demselben Anspruch wären in der Relaunch-Gegenüberstellung nicht mehr
 * auflösbar.
 *
 * ── DIE ZUGEHÖRIGKEIT KOMMT NIE AUS DEM RUMPF ─────────────────────────────
 * `profileId` steht im PFAD und wird vom Store gestempelt — dieselbe Regel wie
 * an der Datentür der gepoolten Layer (`stripTenantKey`): eine durchgereichte
 * Id schriebe in ein fremdes Branding.
 */

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().max(512).optional().default(''),
  sourceKind: z.enum(['website', 'foundation', 'library', 'shared']).optional().default('website'),
  /** Wettbewerber (Default) oder die eigene alte Website (§7.2 Nr. 2). */
  role: z.enum(['competitor', 'self']).optional().default('competitor'),
  /**
   * Bei `foundation` das eigene Branding, dessen bestätigte Felder gelten; bei
   * `library` der Schlüssel des Eintrags.
   */
  sourceRef: z.string().trim().max(128).optional().default(''),
})

export default defineEventHandler(async (event): Promise<MarketCompetitorResponse> => {
  const { userId, profileId } = await requireMarketProfile(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ status: 400, statusText: 'Invalid competitor' })
  const body = parsed.data

  const existing = await listMarketCompetitors(event, profileId)

  // ZWEI DECKEL, ZWEI FRAGEN: der Fünfer gilt dem FELD (§2.9 Nr. 8), die
  // eigene alte Website hat ihren eigenen — sie ist keine Stimme darin.
  if (body.role === 'self') {
    if (existing.some(row => row.role === 'self')) {
      throw createError({
        status: 409,
        statusText: 'Only one own site',
        data: { code: MARKET_SELF_LIMIT_CODE },
      })
    }
  }
  else if (marketFieldCandidates(existing.map(row => ({ role: row.role }))).length >= MARKET_COMPETITORS_MAX) {
    throw createError({
      status: 409,
      statusText: 'Too many competitors',
      data: { code: MARKET_COMPETITOR_LIMIT_CODE },
    })
  }

  let url = ''
  let sourceRef = ''

  if (body.sourceKind === 'website') {
    const normalized = normalizeMarketUrl(body.url)
    if (!normalized) {
      throw createError({
        status: 400,
        statusText: 'Invalid competitor URL',
        data: { code: MARKET_INVALID_URL_CODE },
      })
    }
    // DUBLETTEN JE HOST, nicht je Adresse: `example.com` und
    // `www.example.com/de` sind derselbe Wettbewerber, und zweimal dieselbe
    // Marke im Vergleich verzerrt jede Häufigkeit.
    const duplicate = existing.some((row) => {
      const other = normalizeMarketUrl(row.url ?? '')
      return other?.hostKey === normalized.hostKey
    })
    if (duplicate) {
      throw createError({
        status: 409,
        statusText: 'Competitor already exists',
        data: { code: MARKET_COMPETITOR_DUPLICATE_CODE },
      })
    }
    url = normalized.url
  }
  else if (body.sourceKind === 'library') {
    // DER SCHLÜSSEL MUSS ES GEBEN. Ein erfundener Schlüssel ergäbe einen
    // Kandidaten, den jeder Lauf als `failed` vermerkt — eine Zeile, die nie
    // etwas werden kann. 404 statt 400 wäre hier falsch: die Bibliothek ist
    // öffentlich (sie liegt im Repo), es gibt nichts zu verbergen.
    const entry = marketLibraryEntry(body.sourceRef.trim())
    if (!entry) throw createError({ status: 400, statusText: 'Unknown library entry' })
    if (existing.some(row => row.sourceKind === 'library' && row.sourceRef === entry.key)) {
      throw createError({
        status: 409,
        statusText: 'Competitor already exists',
        data: { code: MARKET_COMPETITOR_DUPLICATE_CODE },
      })
    }
    sourceRef = entry.key
    // Die HOMEPAGE wird mitgeschrieben, aber NICHT abgerufen: sie ist die
    // Herkunft der handgeprüften Belege und der Link, den die Oberfläche
    // anbietet. Der Lauf rührt sie nicht an (s. `runStoredCandidate`).
    url = entry.homepage
  }
  else if (body.sourceKind === 'shared') {
    // EINE FREMDE MARKE — UND ZWAR NUR MIT GÜLTIGER FREIGABE (§7.2 Nr. 4).
    //
    // Geprüft wird HIER und noch einmal bei JEDEM Lauf. Beides ist richtig:
    // hier ist es die schnelle Rückmeldung („diese Marke steht nicht zur
    // Verfügung"), dort die Grenze — eine Zustimmung ist jederzeit
    // widerrufbar, und ein Lauf, der den Ja-Stand von heute benutzte, machte
    // den Widerruf von morgen wirkungslos.
    //
    // 400 und nicht 404: der Kunde hat den Eintrag aus UNSERER Liste gewählt
    // (`GET …/candidates?source=shared`), es gibt hier nichts zu verbergen —
    // die Marke ist ihm gegenüber ohnehin schon mit Namen erschienen.
    const reference = body.sourceRef.trim()
    if (!reference) throw createError({ status: 400, statusText: 'Missing source reference' })
    if (!await isBrandProfileSharedForMarket(event, reference, MARKET_UNLOCK_STEP)) {
      throw createError({
        status: 400,
        statusText: 'Brand is not shared for market comparison',
        data: { code: MARKET_SHARED_UNAVAILABLE_CODE },
      })
    }
    if (existing.some(row => row.sourceKind === 'shared' && row.sourceRef === reference)) {
      throw createError({
        status: 409,
        statusText: 'Competitor already exists',
        data: { code: MARKET_COMPETITOR_DUPLICATE_CODE },
      })
    }
    sourceRef = reference
  }
  else {
    // DIE EIGENE MARKE — und zwar EINE, DIE DEM AUFRUFER GEHÖRT. Ohne diese
    // Prüfung wäre `sourceRef` ein Leseweg in ein fremdes Branding: der Lauf
    // liest daraus die bestätigten Felder. `requireOwnedMarketProfile` wirft
    // 404 (nicht 403) — ein 403 bestätigte die Existenz.
    const reference = body.sourceRef.trim()
    if (!reference) throw createError({ status: 400, statusText: 'Missing source reference' })
    await requireOwnedMarketProfile(event, userId, reference)
    if (existing.some(row => row.sourceKind === 'foundation' && row.sourceRef === reference)) {
      throw createError({
        status: 409,
        statusText: 'Competitor already exists',
        data: { code: MARKET_COMPETITOR_DUPLICATE_CODE },
      })
    }
    sourceRef = reference
  }

  const row = await createMarketCompetitor(event, profileId, {
    name: body.name,
    url,
    sourceKind: body.sourceKind,
    sourceRef,
    role: body.role,
    brandCheckId: '',
    pagesFetched: '',
    excludedReason: '',
    status: 'pending',
  })

  logEvent('info', 'market.competitor_added', {
    // KEIN Name, KEINE Adresse — das ist Kundeninhalt (Log-Regel).
    sourceKind: body.sourceKind,
    role: body.role,
    total: existing.length + 1,
  })

  return { competitor: toMarketCompetitor(row) }
})
