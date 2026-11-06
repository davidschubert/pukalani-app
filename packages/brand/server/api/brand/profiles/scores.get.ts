import { Query } from 'node-appwrite'
import { brandCheckUrlKey } from '../../../../shared/brandCheck'
import {
  type BrandPublicationViewStatus,
  normalizeBrandPublicationStatus,
} from '../../../../shared/brandPublication'
import type {
  BrandProfileScoreEntry,
  BrandProfileScores,
  BrandProfileScoresResponse,
} from '../../../../shared/types/brand'
import {
  BRAND_PUBLICATIONS_TABLE,
  type BrandPublicationRow,
} from '../../../utils/brandPublications'
import {
  BRAND_CHECKS_TABLE,
  BRAND_PROFILES_TABLE,
  type BrandCheckRow,
  type BrandProfileRow,
  brandCheckRankingFacts,
  brandDb,
  isAppwriteNotFound,
  profileStartCard,
} from '../../../utils/brandStore'

/**
 * DIE SCORES ALLER EIGENEN BRANDS — GEBÜNDELT (BRAND-CHECK-SEITE §5).
 *
 * Die Übersicht `/dashboard/brands` zeigt je Karte eine Zeile „Brand-Score".
 * Eine Abfrage JE KARTE wäre das N+1, das `activeShareProfileIds` für die
 * geteilten Brandings schon einmal verhindert hat — also dieselbe Antwort:
 * eine Route, drei Abfragen, egal wie viele Brands.
 *
 * ── WARUM NICHT ÜBER `userId` ─────────────────────────────────────────────
 * Naheliegend wäre `Query.equal('userId', …)` — die Spalte gibt es (brand-017).
 * Sie hat aber KEINEN Index; indiziert sind `profileId` (idx_profile) und
 * `urlKey` (idx_url_key). Eine Abfrage über eine unindizierte Spalte ist auf
 * einer wachsenden Tabelle genau die Sorte Langsamkeit, die man erst merkt,
 * wenn es zu spät ist. Gefragt wird deshalb über die zwei Wege, die ohnehin
 * die Zugehörigkeit ausmachen (dieselben wie im Verlauf, `checks.get.ts`):
 *  · `profileId` IN <eigene Brands> — jeder Dokument-Check, jedes „neu
 *    ermitteln" aus dem Dashboard.
 *  · `urlKey` IN <hinterlegte Websites> — der Check, den derselbe Mensch auf
 *    `/brand-check` eingetippt hat, bevor es die Brand gab.
 * Der zweite Weg findet auch einen Check, den jemand ANDERES für dieselbe
 * Adresse gestartet hat. Das ist gewollt und harmlos: es ist derselbe Aussen-
 * Check derselben öffentlichen Startseite, seine Ergebnis-Seite ist ohnehin
 * für jeden mit der Adresse offen, und er trägt nichts Persönliches.
 *
 * ── JE BRAND ZWEI ZAHLEN, NIE EINE ────────────────────────────────────────
 * Website und Fundament stehen getrennt (§5b): sie messen nicht dasselbe, und
 * ein Mittelwert wäre eine Zahl, die niemand erklären kann. `null` heisst
 * „dafür gibt es noch keinen Check" — die Karte zeigt dort einen Strich.
 *
 * ── AUSGEBLENDETES ZÄHLT NICHT ────────────────────────────────────────────
 * `hidden` ist der Entfernen-Weg des Betreibers (§3 „Recht"); seine
 * Ergebnis-Seite antwortet 404. Eine Karte, die auf eine 404 verlinkt, wäre
 * eine Sackgasse mit Zahl.
 *
 * ── DREI STAMMFELDER REISEN MIT (P6c, 2026-09-06) ─────────────────────────
 * Die Liste `/dashboard/brand-scores` („kann ich die auch im Dashboard sehen
 * als Liste?") braucht je Zeile Titel, Adresse und Branche NEBEN den Zahlen.
 * Sie stehen seither in der Antwort, und das ist keine Bequemlichkeit: die
 * `brand_profiles`-Zeilen liegen hier ohnehin schon vor (ohne sie wüsste diese
 * Route gar nicht, welche Brands zu fragen sind). Ein zweiter Abruf von
 * `GET /api/brand/profiles` wäre also eine Rundreise für Daten, die diese
 * Antwort in der Hand hält — und dazwischen ein Zwischenzustand, in dem eine
 * Zeile ihre Zahl schon zeigt und ihren Namen noch nicht.
 */

/**
 * Wie viele Brands eine Karte-Übersicht zeigt (dasselbe Limit wie
 * `profiles/index.get.ts`) und wie viele Check-Zeilen dafür gelesen werden.
 * 200 trägt 50 Brands mit je vier Ständen; gebraucht wird je Brand und Quelle
 * nur der jüngste, und die Abfrage liefert absteigend nach Zeit — was hinten
 * abgeschnitten wird, ist damit immer der ältere Stand.
 */
const PROFILE_LIMIT = 50
const CHECK_SCAN_LIMIT = 200

export default defineEventHandler(async (event): Promise<BrandProfileScoresResponse> => {
  const { userId } = await requireBrandAccess(event)
  const { tablesDB, databaseId } = brandDb(event)

  let profiles: BrandProfileRow[] = []
  try {
    const res = await tablesDB.listRows<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      queries: [
        Query.equal('ownerType', 'user'),
        Query.equal('ownerId', userId),
        Query.orderDesc('lastActivityAt'),
        Query.limit(PROFILE_LIMIT),
      ],
    })
    profiles = res.rows
  }
  catch (error) {
    // Vor der brand-Migration gibt es die Tabelle nicht — dieses Konto hat
    // dann keine Brandings, und das ist die wahre Antwort.
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profiles could not be loaded')
  }

  if (!profiles.length) return { items: [] }

  // Die Zuordnung Website-Schlüssel → Brand. Mehrere Brands DÜRFEN dieselbe
  // Adresse tragen (ein Relaunch neben dem Bestand) — deshalb eine Liste je
  // Schlüssel und keine 1:1-Karte.
  const byUrlKey = new Map<string, string[]>()
  for (const profile of profiles) {
    const key = brandCheckUrlKey(profile.websiteUrl ?? '')
    if (!key) continue
    byUrlKey.set(key, [...(byUrlKey.get(key) ?? []), profile.$id])
  }

  const ids = profiles.map(profile => profile.$id)
  const urlKeys = [...byUrlKey.keys()]

  const rows = new Map<string, BrandCheckRow>()
  for (const queries of [
    [Query.equal('profileId', ids)],
    ...(urlKeys.length ? [[Query.equal('urlKey', urlKeys)]] : []),
  ]) {
    try {
      const res = await tablesDB.listRows<BrandCheckRow>({
        databaseId,
        tableId: BRAND_CHECKS_TABLE,
        queries: [...queries, Query.orderDesc('$createdAt'), Query.limit(CHECK_SCAN_LIMIT)],
      })
      for (const row of res.rows) rows.set(row.$id, row)
    }
    catch (error) {
      // Vor brand-016/017 fehlt die Tabelle bzw. die Spalte: keine Scores ist
      // dann die wahre Antwort, und die Übersicht zeigt Striche statt eines
      // Fehlers.
      if (!isAppwriteNotFound(error)) {
        logEvent('warn', 'brand.check_scores_unavailable', {
          message: error instanceof Error ? error.message : 'unknown',
        })
        throw createError({
          status: 503,
          statusText: 'Scores unavailable',
          data: { code: 'scores_unavailable' },
        })
      }
    }
  }

  // Die Stammfelder kommen aus derselben Zeile, die oben schon gelesen wurde;
  // `profileStartCard()` ist die EINE Stelle, an der aus `undefined` ein ''
  // wird (Bestands-Zeilen von vor brand-009).
  /**
   * DER VERÖFFENTLICHUNGS-ZUSTAND, EBENFALLS GEBÜNDELT (Discover D1).
   *
   * EINE Abfrage über die Zeilen-Ids: `brand_publications` trägt die Profil-Id
   * ALS Zeilen-Id (Kopf von brand-020), `Query.equal('$id', ids)` ist damit der
   * direkte Weg — dasselbe Muster wie beim Kapitel-Filter des Marktvergleichs.
   *
   * FAIL-SOFT: fehlende Tabelle (Deploy vor brand-020) oder Lesefehler ⇒ keine
   * Zustände. Die Karte zeigt dann keine Zeile — sie ist eine ANGABE, kein
   * Recht, und die Übersicht darf daran nicht scheitern (dieselbe Haltung wie
   * bei „geteilt" und beim Score).
   */
  const publications = new Map<
    string,
    { status: BrandPublicationViewStatus, slug: string, publishedAt: string }
  >()
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [Query.equal('$id', ids), Query.limit(ids.length)],
    })
    for (const row of res.rows) {
      publications.set(row.$id, {
        status: normalizeBrandPublicationStatus(row.status),
        slug: row.slug,
        publishedAt: row.publishedAt ?? '',
      })
    }
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.publication_states_unavailable', {
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  const items = new Map<string, BrandProfileScores>(
    profiles.map((profile) => {
      const startCard = profileStartCard(profile)
      return [profile.$id, {
        profileId: profile.$id,
        title: profile.title ?? '',
        websiteUrl: startCard.websiteUrl,
        industry: startCard.industry,
        website: null,
        document: null,
        publication: publications.get(profile.$id) ?? null,
      }]
    }),
  )

  // Absteigend nach Zeit durchgehen und je Brand+Quelle den ERSTEN Treffer
  // behalten — das ist der jüngste, ohne zweiten Vergleich.
  const sorted = [...rows.values()].sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
  for (const row of sorted) {
    const facts = brandCheckRankingFacts(row)
    if (facts.hidden) continue

    const targets = facts.profileId && items.has(facts.profileId)
      ? [facts.profileId]
      : (byUrlKey.get(row.urlKey) ?? [])

    for (const target of targets) {
      const entry = items.get(target)
      if (!entry) continue
      const slot = facts.source === 'document' ? 'document' : 'website'
      if (entry[slot]) continue
      entry[slot] = toScoreEntry(row)
    }
  }

  return { items: ids.map(id => items.get(id)!) }
})

function toScoreEntry(row: BrandCheckRow): BrandProfileScoreEntry {
  return {
    checkId: row.$id,
    score: row.score ?? 0,
    band: row.band ?? '',
    createdAt: row.$createdAt,
  }
}
