import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import { brandCheckUrlKey } from '../../shared/brandCheck'
import {
  BRAND_PUBLICATION_ARCHETYPE_SLOT,
  BRAND_PUBLICATION_DAY_WINDOW_MS,
  BRAND_PUBLICATION_REPORT_WINDOW_MS,
  BRAND_PUBLICATION_STATUSES,
  type BrandPublicationFilter,
  type BrandPublicationReportFilter,
  type BrandPublicationStatus,
  type BrandPublicationSubmitDecision,
  brandPublicationCanSubmit,
  brandPublicationDayKey,
  brandPublicationFeatureLosers,
  brandPublicationPath,
  brandPublicationPendingDeclined,
  brandPublicationReportHourKey,
  brandPublicationReportStatusValues,
  brandPublicationSlugCandidate,
  brandPublicationStatusValues,
  decideBrandPublicationQuota,
  decideBrandPublicationReportQuota,
  normalizeBrandPublicationReportStatus,
  normalizeBrandPublicationStatus,
} from '../../shared/brandPublication'
import type {
  BrandPublicationAdminItem,
  BrandPublicationReport,
  BrandPublicationState,
} from '../../shared/types/brand'
import {
  BRAND_CHECKS_TABLE,
  BRAND_PROFILES_TABLE,
  type BrandCheckRow,
  type BrandProfileRow,
  type BrandStepRow,
  brandCheckRankingFacts,
  brandDb,
  confirmedSlotValues,
  isAppwriteNotFound,
  loadStepRows,
} from './brandStore'

/**
 * DIE VERÖFFENTLICHUNG EINER MARKE — Lesen, Adresse vergeben, Zustand
 * hinausgeben (docs/plans/DISCOVER-BRANDS.md §5, Paket D1).
 *
 * Die REGELN (Zustände, Slug-Form, Voraussetzungen) stehen pur in
 * `shared/brandPublication.ts`; hier steht, was eine Datenbank dazu braucht.
 * Dieselbe Arbeitsteilung wie `brandMarketVisibility.ts` neben
 * `shared/brandCheckRanking.ts`.
 *
 * ── DIE ZEILEN-ID IST DIE PROFIL-ID ───────────────────────────────────────
 * Eine Marke hat genau eine Veröffentlichung (Kopf von Migration brand-020).
 * Das macht aus jedem Lesen ein `getRow` und aus dem erneuten Einreichen eine
 * idempotente Handlung. Es heisst zugleich: es gibt KEINE `profileId`-Spalte,
 * und wer aufräumt, räumt über die Id.
 */

export const BRAND_PUBLICATIONS_TABLE = 'brand_publications'
export const BRAND_PUBLICATION_REPORTS_TABLE = 'brand_publication_reports'

export type BrandPublicationRow = Models.Row & {
  slug: string
  title?: string
  /** Der ÖFFENTLICHE Stand. MEDIUMTEXT ⇒ auf alten Zeilen `undefined`. */
  snapshot?: string | null
  /** Der EINGEREICHTE Stand, solange die Freigabe aussteht. */
  pendingSnapshot?: string | null
  submittedAt?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  decidedAt?: string | null
  pathKind?: string
  industry?: string
  archetype?: string
  archetypeSecondary?: string
  paletteId?: string
  locale?: string
  checkId?: string
  status?: string
  decisionNote?: string
  featuredAt?: string | null
  reportCount?: number
  example?: boolean
}

/**
 * Die Zeile zu einem Branding — `null` heisst „nie eingereicht".
 *
 * FEHLT DIE TABELLE (Deploy vor brand-020), ist die Antwort ebenfalls `null`:
 * „es gibt keine Veröffentlichung" ist dann die wahre Auskunft, und die
 * Leseansicht soll deswegen nicht mit 500 antworten. Das gilt fürs LESEN;
 * beim SCHREIBEN ist eine fehlende Tabelle ein echter Fehler (s. Route).
 */
export async function loadBrandPublication(
  event: H3Event,
  profileId: string,
): Promise<BrandPublicationRow | null> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandPublicationRow>({
      databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: profileId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return null
    throw toH3Error(error, 'Brand publication could not be loaded')
  }
}

/**
 * DER ZUSTAND, WIE IHN LESEANSICHT UND KARTE BRAUCHEN.
 *
 * ── WAS HIER NICHT HINAUSGEHT ────────────────────────────────────────────
 * Kein Snapshot (das ist Sache der öffentlichen Anatomie, D2), kein `ipHash`,
 * keine Meldungen, kein `featuredAt` — die Kuration des Betreibers geht den
 * Kunden nichts an, und „ich bin Brand of the Day" wäre eine Auskunft, die
 * Erwartungen weckt. `decisionNote` geht sehr wohl hinaus: sie IST für ihn
 * geschrieben (§3.4 „der Kunde sieht sie").
 */
export function toBrandPublicationState(row: BrandPublicationRow | null): BrandPublicationState {
  if (!row) {
    return {
      status: 'none',
      slug: '',
      path: '',
      submittedAt: '',
      publishedAt: '',
      decidedAt: '',
      decisionNote: '',
      pendingUpdate: false,
      pendingDecision: null,
    }
  }
  const status = normalizeBrandPublicationStatus(row.status)
  const decisionNote = row.decisionNote ?? ''
  return {
    status,
    slug: row.slug,
    path: brandPublicationPath(row.slug),
    submittedAt: row.submittedAt ?? '',
    publishedAt: row.publishedAt ?? '',
    decidedAt: row.decidedAt ?? '',
    decisionNote,
    /**
     * „Aktualisierung abgelehnt" — öffentlich UND eine Begründung, die zu
     * keiner Ablehnung der MARKE gehört (die Regel steht in
     * `brandPublicationPendingDeclined`, ihre Voraussetzung ist, dass
     * `approve` und `unhide` die Notiz leeren).
     */
    pendingDecision: brandPublicationPendingDeclined(status, decisionNote)
      ? { note: decisionNote, at: row.decidedAt ?? '' }
      : null,
    /**
     * „Öffentlich, und ein neuer Stand wartet" — die Marke ist erreichbar
     * (`publishedAt` steht, der alte Snapshot ist da) UND es liegt etwas zur
     * Freigabe (`status: 'pending'`). Berechnet statt gespeichert: es ist
     * dieselbe Tatsache aus zwei Feldern, und ein drittes Feld daneben wäre
     * das, das eines Tages nicht mitgeführt wird.
     */
    pendingUpdate: status === 'pending' && Boolean(row.publishedAt) && Boolean(row.snapshot),
  }
}

/**
 * DIE TATSACHEN, AUS DENEN „darf eingereicht werden?" FOLGT (§3.3) — an EINER
 * Stelle gelesen, von allen drei Routen benutzt.
 *
 * ── WARUM DIE ANTWORT AUCH IM GET STEHT ──────────────────────────────────
 * Der Dialog muss VOR dem Klick sagen können, was fehlt. Er könnte die Regel
 * selbst rechnen (sie ist pur und liegt in `shared/`), aber die EINGABEN hätte
 * er nur halb: „ist `d.primary` bestätigt?" beantwortet auf der Seite nur ein
 * Umweg über den gerenderten Kapitel-Block, und ein Umweg ist genau die Sorte
 * Ableitung, die still falsch wird, wenn sich der Renderer ändert. Der Server
 * liest die Zeilen ohnehin — er sagt es also selbst. Der 409 der POST-Route
 * bleibt die Durchsetzung (und muss es bleiben: der Envelope trägt nur den
 * `reason`, nie die Liste).
 */
export interface BrandPublicationFacts {
  stepRows: BrandStepRow[]
  /** Der bestätigte Wert von `d.primary` — '' heisst „nicht gesetzt". */
  archetype: string
  archetypeSecondary: string
  readiness: BrandPublicationSubmitDecision
}

export async function readBrandPublicationFacts(
  event: H3Event,
  profile: BrandProfileRow,
): Promise<BrandPublicationFacts> {
  const stepRows = await loadStepRows(event, profile.$id)
  const archetypeRow = stepRows.find(row => row.stepKey === 'archetype')
  const archetypeSlots = archetypeRow ? confirmedSlotValues(archetypeRow) : []
  const archetype = archetypeSlots.find(slot => slot.slotId === BRAND_PUBLICATION_ARCHETYPE_SLOT)?.value ?? ''
  const archetypeSecondary = archetypeSlots.find(slot => slot.slotId === 'd.secondary')?.value ?? ''

  return {
    stepRows,
    archetype,
    archetypeSecondary,
    readiness: brandPublicationCanSubmit({
      title: profile.title ?? '',
      // `state === 'done'` IST die Abnahme eines Kapitels — dieselbe Tatsache,
      // die der Marktvergleich für seine Quellen liest.
      acceptedStepKeys: stepRows.filter(row => row.state === 'done').map(row => row.stepKey),
      archetypeConfirmed: archetype.trim().length > 0,
    }),
  }
}

/**
 * WIE VIELE ADRESSEN PROBIERT WERDEN, bevor aufgegeben wird.
 *
 * Zehn gleichnamige Marken auf einer Instanz sind schon sehr viel; wer die
 * elfte einreicht, bekommt eine ehrliche Ablehnung statt einer Adresse wie
 * `kaffee-47`. Alle Kandidaten werden in EINER Abfrage geprüft — eine Schleife
 * mit zehn `listRows` wäre zehn Rundreisen für eine Frage.
 */
const SLUG_ATTEMPTS = 10

/**
 * DIE FREIE ADRESSE ZU EINEM VORSCHLAG — `name`, sonst `name-2`, `name-3`, …
 *
 * Die EIGENE Zeile zählt nicht als Kollision: wer seinen Stand aktualisiert,
 * behält seine Adresse (§4.2 „Slug bleibt stabil"). Der UNIQUE-Index bleibt
 * die eigentliche Sicherung — diese Funktion sucht den Kandidaten, das 409
 * beim Schreiben ist die Wahrheit.
 */
export async function findFreeBrandPublicationSlug(
  event: H3Event,
  base: string,
  ownRowId: string,
): Promise<string | null> {
  const candidates = Array.from(
    { length: SLUG_ATTEMPTS },
    (_, index) => brandPublicationSlugCandidate(base, index + 1),
  )

  const { tablesDB, databaseId } = brandDb(event)
  let taken = new Set<string>()
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [Query.equal('slug', candidates), Query.limit(candidates.length)],
    })
    taken = new Set(res.rows.filter(row => row.$id !== ownRowId).map(row => row.slug))
  }
  catch (error) {
    // Fehlt die Tabelle, ist keine Adresse belegt. Jeder andere Fehler gehört
    // dem Aufrufer: eine Adresse zu vergeben, ohne nachgesehen zu haben, wäre
    // ein 409 im Gesicht des Menschen statt eines sauberen Fehlers.
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand publication slug could not be resolved')
  }

  return candidates.find(candidate => !taken.has(candidate)) ?? null
}

/**
 * DER JÜNGSTE CHECK EINER MARKE — nur seine ADRESSE (§5: „checkId … nur
 * Adresse").
 *
 * Zwei Zugehörigkeiten wie im Verlauf (`checks.get.ts`): die eigene
 * `profileId` und der `urlKey` der hinterlegten Website (der Check, den
 * derselbe Mensch auf `/brand-check` eingetippt hat, bevor es die Brand gab).
 * Website schlägt Dokument — die Galerie sortiert nach dem Brand Score, und
 * das ist die Zahl über den Auftritt (Entscheidung 3).
 *
 * FAIL-SOFT: kein Check, keine Tabelle, ein Lesefehler ⇒ ''. Ein Steckbrief
 * ohne Score ist vollständig genug; eine Veröffentlichung daran scheitern zu
 * lassen wäre eine Nebenangabe mit Vetorecht.
 */
export async function latestBrandCheckId(
  event: H3Event,
  profileId: string,
  websiteUrl: string,
): Promise<string> {
  const { tablesDB, databaseId } = brandDb(event)
  const websiteKey = brandCheckUrlKey(websiteUrl)

  const rows = new Map<string, BrandCheckRow>()
  for (const queries of [
    [Query.equal('profileId', profileId)],
    ...(websiteKey ? [[Query.equal('urlKey', websiteKey)]] : []),
  ]) {
    try {
      const res = await tablesDB.listRows<BrandCheckRow>({
        databaseId,
        tableId: BRAND_CHECKS_TABLE,
        queries: [...queries, Query.orderDesc('$createdAt'), Query.limit(25)],
      })
      for (const row of res.rows) rows.set(row.$id, row)
    }
    catch (error) {
      if (!isAppwriteNotFound(error)) {
        logEvent('warn', 'brand.publication_check_lookup_failed', {
          profileId,
          message: error instanceof Error ? error.message : 'unknown',
        })
      }
    }
  }

  const visible = [...rows.values()]
    .filter(row => !brandCheckRankingFacts(row).hidden)
    .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))

  const website = visible.find(row => brandCheckRankingFacts(row).source === 'website')
  return (website ?? visible[0])?.$id ?? ''
}

/**
 * DER TAGES-DECKEL JE KONTO (§6: 10/Tag).
 *
 * Er steht NEBEN dem Minuten-Eimer `brand:publish` aus `05.rate-limit.ts` und
 * meint etwas anderes: die Minute schützt den Server vor dem Sekundentakt, der
 * Tag die Warteschlange des Betreibers. Gebucht wird VOR dem Bauen des
 * Snapshots — ein Deckel, der erst nach der Arbeit greift, ist keiner.
 */
export async function bookBrandPublicationQuota(
  event: H3Event,
  userId: string,
): Promise<{ code: string, retryAfterSec: number } | null> {
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(
    `${prefix}${brandPublicationDayKey(userId)}`,
    BRAND_PUBLICATION_DAY_WINDOW_MS,
  )
  const code = decideBrandPublicationQuota(state.count)
  return code
    ? { code, retryAfterSec: Math.max(1, Math.ceil(state.resetInMs / 1000)) }
    : null
}

/** Der gelesene Zustand einer Zeile — die EINE Stelle für `undefined`. */
export function brandPublicationStatusOf(row: BrandPublicationRow | null): BrandPublicationStatus | null {
  return row ? normalizeBrandPublicationStatus(row.status) : null
}

export const BRAND_PUBLICATION_VISIBILITIES = ['private', 'public'] as const
export type BrandPublicationVisibility = (typeof BRAND_PUBLICATION_VISIBILITIES)[number]

/**
 * Der gelesene Wert am Profil — FAIL-CLOSED, wie bei `marketVisibility`.
 *
 * Eine Zeile von vor brand-020 liest `undefined`, ein unbekannter Wert ist ein
 * Datenfehler: beides heisst `private`. Eine Zustimmung, die niemand gegeben
 * hat, darf nicht durch einen fehlenden Wert entstehen.
 */
export function brandPublicationVisibilityOf(
  row: Pick<BrandProfileRow, 'publicationVisibility'>,
): BrandPublicationVisibility {
  return row.publicationVisibility === 'public' ? 'public' : 'private'
}

/**
 * DAS OPT-IN SETZEN. Der Aufrufer hat den Besitz VORHER belegt
 * (`loadOwnedProfile`) — diese Funktion prüft ihn nicht noch einmal.
 *
 * NICHT über `touchProfile`: das stempelt `lastActivityAt` mit, und danach
 * stünde die Marke in „zuletzt bearbeitet" ganz oben, obwohl an ihr nichts
 * bearbeitet wurde. NICHT fail-soft: wer ein Häkchen setzt, muss erfahren, ob
 * es gilt.
 */
export async function setBrandProfilePublicationVisibility(
  event: H3Event,
  profileId: string,
  visibility: BrandPublicationVisibility,
): Promise<void> {
  const { tablesDB, databaseId } = brandDb(event)
  await tablesDB.updateRow({
    databaseId,
    tableId: BRAND_PROFILES_TABLE,
    rowId: profileId,
    data: { publicationVisibility: visibility },
  })
}

/* ════════════════════════════════════════════════════════════════════════════
 * DIE BETREIBER-SEITE (docs/plans/DISCOVER-BRANDS.md §4.4, Paket D3)
 *
 * Alles ab hier hängt an `users.manage` und läuft über den Admin-Client. Es
 * steht in DERSELBEN Datei wie das Lesen des Kunden, weil es dieselbe Tabelle
 * ist und dieselben zwei Snapshot-Spalten: eine zweite Datei „…Admin.ts" hätte
 * die Regel „`snapshot` ist der freigegebene, `pendingSnapshot` der
 * eingereichte Stand" ein zweites Mal erklären müssen, und das ist genau die
 * Sorte Wissen, die beim zweiten Erklären auseinanderläuft.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * DAS GATE: `users.manage` — dasselbe wie Warteliste und Korrekturen.
 *
 * Begründung ausgeschrieben im Kopf von `brandCheckAdmin.ts`: `sites.manage`
 * verspräche etwas, das es auf einer Single-Tenant-Instanz nicht gibt. Wer
 * über den Beta-Zugang entscheidet, entscheidet auch, welche Marke öffentlich
 * unter unserer Adresse steht — es ist derselbe Kreis.
 *
 * KEIN `requireBrandAccess`: das Beta-Gate der Kunden-Fläche wäre hier falsch
 * (der Betreiber baut die Beta, er nimmt nicht an ihr teil).
 */
export function requireBrandPublicationOperator(event: H3Event) {
  return requirePermission(event, 'users.manage')
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die öffentlichen Routen. */
export function brandPublicationAdminUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.publication_admin_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Publication administration unavailable',
    data: { code: 'publication_admin_unavailable' },
  })
}

/** Die Zeilen-Id aus dem Pfad — fehlt sie, ist die Route falsch aufgerufen. */
export function requireBrandPublicationRouteId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id || id.length > 64) throw createError({ status: 400, statusText: 'Missing id' })
  return id
}

/**
 * EINE VERÖFFENTLICHUNG ÜBER IHRE ID — oder ein 404.
 *
 * Der 404 ist hier keine Tarnung: wer bis hierher kommt, hat `users.manage`
 * und darf wissen, dass es diese Zeile nicht (mehr) gibt. AUSGEBLENDETES kommt
 * zurück — sonst wäre `hidden` eine Einbahnstrasse und `unhide` unerreichbar.
 */
export async function loadBrandPublicationRow(
  event: H3Event,
  id: string,
): Promise<BrandPublicationRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandPublicationRow>({
      databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({
        status: 404,
        statusText: 'Publication not found',
        data: { code: 'publication_not_found' },
      })
    }
    throw brandPublicationAdminUnavailable(error, { rowId: id })
  }
}

/**
 * EINE SEITE DER BETREIBER-LISTE. Neueste zuerst — eine Arbeitsliste liest man
 * von oben, und `$createdAt` ist der einzige Zeitpunkt, den JEDE Zeile trägt
 * (`publishedAt` ist bei `pending` leer, `decidedAt` bei einer Erst-Einreichung
 * ebenso).
 */
export async function listBrandPublicationRows(
  event: H3Event,
  input: { filter: BrandPublicationFilter, limit: number, cursor?: string },
): Promise<{ rows: BrandPublicationRow[], total: number }> {
  const { tablesDB, databaseId } = brandDb(event)
  const values = brandPublicationStatusValues(input.filter)

  const res = await tablesDB.listRows<BrandPublicationRow>({
    databaseId,
    tableId: BRAND_PUBLICATIONS_TABLE,
    queries: [
      ...(values ? [Query.equal('status', values)] : []),
      Query.orderDesc('$createdAt'),
      Query.limit(input.limit),
      ...(input.cursor ? [Query.cursorAfter(input.cursor)] : []),
    ],
  })
  return { rows: res.rows, total: res.total }
}

/**
 * DIE ZÄHLER DER REITER — unabhängig vom gewählten Filter, sonst wären sie
 * eine Funktion der gerade gewählten Ansicht („0 wartend", weil man die
 * abgelehnten anschaut) statt eine Aussage über die Liste.
 *
 * FAIL-SOFT: schlägt eine Zählung fehl, steht dort `0`. Die Reiter sind eine
 * Auskunft, keine Arbeitsgrundlage — die Liste darunter würde für eine kaputte
 * Zahl nicht ausfallen (dieselbe Entscheidung wie bei Warteliste und
 * Korrekturen).
 */
export async function countBrandPublications(
  event: H3Event,
): Promise<Record<BrandPublicationStatus, number>> {
  const { tablesDB, databaseId } = brandDb(event)

  const entries = await Promise.all(BRAND_PUBLICATION_STATUSES.map(async (status) => {
    try {
      const res = await tablesDB.listRows<BrandPublicationRow>({
        databaseId,
        tableId: BRAND_PUBLICATIONS_TABLE,
        queries: [Query.equal('status', status), Query.limit(1)],
      })
      return [status, res.total] as const
    }
    catch {
      return [status, 0] as const
    }
  }))

  return Object.fromEntries(entries) as Record<BrandPublicationStatus, number>
}

/**
 * DIE EIGENTÜMER VIELER MARKEN IN EINER ABFRAGE.
 *
 * Ohne sie stellte die Liste je Zeile eine Frage (N+1 über eine Fläche, die
 * fünfzig Zeilen zeigt). Zurück kommt die KONTO-ID, nicht die Mailadresse —
 * Begründung am Typ `BrandPublicationAdminItem`.
 *
 * FAIL-SOFT: was sich nicht lesen lässt, bleibt leer. Ein gelöschtes Profil
 * darf die Arbeitsliste nicht kosten; der Betreiber sieht dann eine Zeile ohne
 * Eigentümer und kann sie trotzdem entscheiden.
 */
export async function loadBrandPublicationOwners(
  event: H3Event,
  profileIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(profileIds.filter(Boolean))]
  if (!unique.length) return new Map()

  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      // Der Deckel ist die Seitengrösse der Liste (100) — mehr Ids kann sie
      // gar nicht mitbringen. Explizit, weil `Query.limit()` hier Pflicht ist.
      queries: [Query.equal('$id', unique), Query.limit(100)],
    })
    return new Map(res.rows.map(row => [row.$id, row.ownerId ?? '']))
  }
  catch (error) {
    logEvent('warn', 'brand.publication_admin_owners_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return new Map()
  }
}

/**
 * DIE ZAHLEN DER BETROFFENEN CHECKS, gebündelt (Entscheidung 3/5).
 *
 * Dieselbe Bauform wie `loadBrandCheckSummaries` und aus demselben Grund: eine
 * Liste mit fünfzig Zeilen darf nicht fünfzig Fragen stellen. FAIL-SOFT, weil
 * eine fehlende Zahl eine Nebenangabe ist — eine Veröffentlichung daran
 * scheitern zu lassen wäre eine Randspalte mit Vetorecht.
 */
export async function loadBrandPublicationScores(
  event: H3Event,
  checkIds: readonly string[],
): Promise<Map<string, BrandCheckRow>> {
  const unique = [...new Set(checkIds.filter(Boolean))]
  if (!unique.length) return new Map()

  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [Query.equal('$id', unique), Query.limit(100)],
    })
    return new Map(res.rows.map(row => [row.$id, row]))
  }
  catch (error) {
    logEvent('warn', 'brand.publication_admin_scores_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return new Map()
  }
}

/**
 * Die Zeile, wie sie in die Betreiber-Liste geht. Jede Route muss durch diese
 * Funktion — so kann keine einzelne vergessen, den Snapshot draussen zu
 * lassen.
 */
export function toBrandPublicationAdminItem(
  row: BrandPublicationRow,
  ownerId: string,
  check: BrandCheckRow | undefined,
): BrandPublicationAdminItem {
  const status = normalizeBrandPublicationStatus(row.status)
  const source = check ? brandCheckRankingFacts(check).source : ''
  return {
    id: row.$id,
    title: row.title ?? '',
    slug: row.slug,
    path: brandPublicationPath(row.slug),
    status,
    submittedAt: row.submittedAt ?? '',
    publishedAt: row.publishedAt ?? '',
    decidedAt: row.decidedAt ?? '',
    decisionNote: row.decisionNote ?? '',
    ownerId,
    score: check ? check.score : null,
    // Ein Check ohne `source` ist ein Website-Check (die Spalte kam additiv
    // dazu) — dieselbe Vorgabe, die `brandCheckRankingFacts` setzt.
    scoreSource: source === 'document' ? 'document' : source ? 'website' : '',
    checkId: row.checkId ?? '',
    reportCount: row.reportCount ?? 0,
    featured: Boolean(row.featuredAt),
    example: row.example === true,
    industry: row.industry ?? '',
    archetype: row.archetype ?? '',
    locale: row.locale ?? '',
  }
}

/**
 * GENAU EINE BRAND OF THE DAY — die vorige verliert ihren Stempel
 * (Davids Entscheidung 6).
 *
 * Welche Zeilen es trifft, entscheidet die pure Regel
 * (`brandPublicationFeatureLosers`); hier steht nur, wie man sie findet und
 * abräumt. Der Deckel ist bewusst klein: mehr als eine featured Zeile ist ein
 * Datenfehler, und wenn es je zwanzig gäbe, wäre das Aufräumen der zwanzig
 * immer noch die richtige Antwort.
 *
 * FEHLSCHLAG IST HIER KEIN 503: die neue Zeile trägt ihren Stempel bereits,
 * und zwei Featured sind schlimmer als eine — aber nicht so schlimm, dass die
 * Handlung des Betreibers deswegen scheitern soll. Der nächste Klick heilt es.
 */
export async function clearOtherFeaturedBrandPublications(
  event: H3Event,
  keepId: string,
): Promise<string> {
  const { tablesDB, databaseId } = brandDb(event)
  let losers: string[]
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [Query.isNotNull('featuredAt'), Query.limit(20)],
    })
    losers = brandPublicationFeatureLosers(res.rows.map(row => row.$id), keepId, true)
  }
  catch (error) {
    logEvent('warn', 'brand.publication_feature_sweep_failed', {
      keepId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return ''
  }

  for (const id of losers) {
    try {
      await tablesDB.updateRow({
        databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: id, data: { featuredAt: null },
      })
    }
    catch (error) {
      logEvent('warn', 'brand.publication_feature_clear_failed', {
        rowId: id,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }
  // Die Seite sagt „X hat Y abgelöst" — bei mehreren die erste; mehr als eine
  // gab es ohnehin nur als Datenfehler.
  return losers[0] ?? ''
}

/**
 * DIE VERÖFFENTLICHUNG ZU EINER ADRESSE — für die öffentliche Melde-Route.
 *
 * Sie steht hier und nicht in der Galerie-Lesehilfe (D2), weil sie eine ANDERE
 * Frage beantwortet: die Galerie will den Snapshot rendern, das Melden will
 * nur wissen, ob es diese Adresse öffentlich gibt. `null` heisst 404 — und
 * zwar auch bei `hidden`, `pending` und einer fehlenden Tabelle: was nicht
 * öffentlich steht, kann niemand beanstanden.
 */
export async function findPublishedBrandPublicationBySlug(
  event: H3Event,
  slug: string,
): Promise<BrandPublicationRow | null> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [Query.equal('slug', slug), Query.limit(1)],
    })
    const row = res.rows[0]
    return row && normalizeBrandPublicationStatus(row.status) === 'published' ? row : null
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return null
    throw brandPublicationAdminUnavailable(error, { stage: 'slug' })
  }
}

// ── Meldungen ───────────────────────────────────────────────────────────────

export type BrandPublicationReportRow = Models.Row & {
  publicationId: string
  reason?: string
  reporterEmail?: string
  status?: string
  ipHash?: string
  decidedAt?: string | null
}

/**
 * DER STUNDEN-DECKEL JE ANSCHLUSS (§6: 3/Std).
 *
 * Er steht NEBEN dem Minuten-Eimer `brand:report` aus `05.rate-limit.ts`: die
 * Minute schützt den Server, die Stunde die Arbeitsliste des Betreibers.
 * Gebucht wird VOR dem ersten Appwrite-Ruf — ein Deckel, der erst nach der
 * Arbeit greift, ist keiner.
 */
export async function bookBrandPublicationReportQuota(
  event: H3Event,
  ipHash: string,
): Promise<{ code: string, retryAfterSec: number } | null> {
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(
    `${prefix}${brandPublicationReportHourKey(ipHash)}`,
    BRAND_PUBLICATION_REPORT_WINDOW_MS,
  )
  const code = decideBrandPublicationReportQuota(state.count)
  return code
    ? { code, retryAfterSec: Math.max(1, Math.ceil(state.resetInMs / 1000)) }
    : null
}

/**
 * HAT DIESER ANSCHLUSS ZU DIESER MARKE SCHON ETWAS OFFENES GEMELDET?
 *
 * Die Frage, die den 409 trägt. Sie fragt ausdrücklich nach OFFEN und nicht
 * nach „irgendetwas": eine erledigte Meldung darf eine neue nicht auf ewig
 * sperren — vielleicht ist der Verstoss zurückgekehrt.
 *
 * FAIL-SOFT ist hier FALSCH: könnte die Frage nicht beantwortet werden und
 * schriebe die Route trotzdem, entstünden bei jedem Klick neue Dubletten in
 * der Arbeitsliste. Ein Lesefehler wirft deshalb — mit EINER Ausnahme, der
 * fehlenden Tabelle: dort gibt es sicher keine offene Meldung.
 */
export async function hasOpenBrandPublicationReport(
  event: H3Event,
  publicationId: string,
  ipHash: string,
): Promise<boolean> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandPublicationReportRow>({
      databaseId,
      tableId: BRAND_PUBLICATION_REPORTS_TABLE,
      queries: [
        Query.equal('publicationId', publicationId),
        Query.equal('ipHash', ipHash),
        Query.equal('status', 'open'),
        Query.limit(1),
      ],
    })
    return res.rows.length > 0
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return false
    throw brandPublicationAdminUnavailable(error, { publicationId, stage: 'duplicate' })
  }
}

/**
 * DER ZÄHLER AN DER MARKE — FAIL-SOFT, und das ist eine Entscheidung.
 *
 * `reportCount` ist eine Anzeige in der Betreiber-Liste, die WAHRHEIT sind die
 * Zeilen in `brand_publication_reports`. Scheitert das Hochzählen, ist die
 * Meldung trotzdem angekommen und erscheint im Reiter „Meldungen" — eine
 * Meldung wegen einer Randspalte zu verwerfen wäre der teurere Fehler.
 */
export async function bumpBrandPublicationReportCount(
  event: H3Event,
  row: BrandPublicationRow,
): Promise<void> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      rowId: row.$id,
      data: { reportCount: (row.reportCount ?? 0) + 1 },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.publication_report_count_failed', {
      rowId: row.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

export async function loadBrandPublicationReportRow(
  event: H3Event,
  id: string,
): Promise<BrandPublicationReportRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandPublicationReportRow>({
      databaseId, tableId: BRAND_PUBLICATION_REPORTS_TABLE, rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({ status: 404, statusText: 'Report not found', data: { code: 'not_found' } })
    }
    throw brandPublicationAdminUnavailable(error, { rowId: id })
  }
}

export async function listBrandPublicationReportRows(
  event: H3Event,
  input: { filter: BrandPublicationReportFilter, limit: number, cursor?: string },
): Promise<{ rows: BrandPublicationReportRow[], total: number }> {
  const { tablesDB, databaseId } = brandDb(event)
  const values = brandPublicationReportStatusValues(input.filter)

  const res = await tablesDB.listRows<BrandPublicationReportRow>({
    databaseId,
    tableId: BRAND_PUBLICATION_REPORTS_TABLE,
    queries: [
      ...(values ? [Query.equal('status', values)] : []),
      Query.orderDesc('$createdAt'),
      Query.limit(input.limit),
      ...(input.cursor ? [Query.cursorAfter(input.cursor)] : []),
    ],
  })
  return { rows: res.rows, total: res.total }
}

/** Zwei Zähler, unabhängig vom Filter — dieselbe Begründung wie oben. */
export async function countBrandPublicationReports(
  event: H3Event,
): Promise<Record<'open' | 'done', number>> {
  const { tablesDB, databaseId } = brandDb(event)

  const entries = await Promise.all((['open', 'done'] as const).map(async (status) => {
    try {
      const res = await tablesDB.listRows<BrandPublicationReportRow>({
        databaseId,
        tableId: BRAND_PUBLICATION_REPORTS_TABLE,
        queries: [Query.equal('status', status), Query.limit(1)],
      })
      return [status, res.total] as const
    }
    catch {
      return [status, 0] as const
    }
  }))

  return Object.fromEntries(entries) as Record<'open' | 'done', number>
}

/**
 * DIE GEMELDETEN MARKEN ZU EINER SEITE MELDUNGEN, gebündelt.
 *
 * Ohne sie stünde in der Liste eine Row-Id statt eines Markennamens — und eine
 * Meldung, deren Ziel man erst nachschlagen muss, ist keine Arbeitsliste.
 */
export async function loadBrandPublicationTitles(
  event: H3Event,
  ids: readonly string[],
): Promise<Map<string, BrandPublicationRow>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()

  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [Query.equal('$id', unique), Query.limit(100)],
    })
    return new Map(res.rows.map(row => [row.$id, row]))
  }
  catch (error) {
    logEvent('warn', 'brand.publication_report_titles_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return new Map()
  }
}

/**
 * Die Meldung, wie sie nach draussen geht. `ipHash` wird NICHT durchgereicht —
 * die Auslassung ist der halbe Zweck dieser Funktion, und weil jede Route
 * durch sie hindurch muss, kann sie keine einzelne vergessen.
 */
export function toBrandPublicationReport(
  row: BrandPublicationReportRow,
  publication: BrandPublicationRow | undefined,
): BrandPublicationReport {
  return {
    id: row.$id,
    publicationId: row.publicationId,
    title: publication?.title ?? '',
    slug: publication?.slug ?? '',
    path: publication?.slug ? brandPublicationPath(publication.slug) : '',
    reason: row.reason ?? '',
    reporterEmail: row.reporterEmail ?? '',
    status: normalizeBrandPublicationReportStatus(row.status),
    decidedAt: row.decidedAt ?? '',
    createdAt: row.$createdAt,
  }
}
