import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { brandCheckCategoryScores } from '../../shared/brandCheck'
import {
  BRAND_DISCOVER_CHECK_LOOKUP_MAX,
  BRAND_DISCOVER_SCAN_LIMIT,
  type BrandDiscoverCheckFact,
  pickDiscoverScores,
} from '../../shared/brandDiscover'
import { brandPublicationIsVisible } from '../../shared/brandPublication'
import type {
  BrandDiscoverCheck,
  BrandDiscoverItem,
  BrandCheckCategoryResult,
  BrandShareSnapshot,
} from '../../shared/types/brand'
import {
  BRAND_CHECKS_TABLE,
  type BrandCheckRow,
  brandCheckRankingFacts,
  brandDb,
  isAppwriteNotFound,
} from './brandStore'
import { BRAND_PUBLICATIONS_TABLE, type BrandPublicationRow } from './brandPublications'

/**
 * WAS DIE ÖFFENTLICHE GALERIE LIEST (docs/plans/DISCOVER-BRANDS.md §4.1/§4.2,
 * Paket D2) — die Datenbank-Hälfte der puren Regeln aus
 * `shared/brandDiscover.ts`.
 *
 * ── WARUM NICHT IN `brandPublications.ts` ────────────────────────────────
 * Jene Datei gehört dem EINREICHEN und dem Zustand: sie liest die eine Zeile
 * eines Besitzers, sucht Adressen und bucht Deckel. Hier steht das Gegenteil —
 * viele Zeilen, kein Besitzer, kein Schreiben. Zwei Fragen, zwei Dateien; und
 * D3 baut in jener weiter, während hier gelesen wird.
 *
 * ── ÖFFENTLICH HEISST GENAU EIN ZUSTAND ──────────────────────────────────
 * `status === 'published'`. Die Grenze steht in der ABFRAGE und nicht in der
 * Anzeige: die Antwort ist JSON, und wer sie abruft, sieht alles, was drin
 * ist. `pending`, `declined`, `hidden` und `withdrawn` kommen hier deshalb
 * nirgends vor — auch nicht als gefilterte Liste.
 *
 * ── EINE FEHLENDE TABELLE IST EINE LEERE GALERIE, KEIN 503 ───────────────
 * Vor brand-020 gibt es `brand_publications` nicht. „Noch keine
 * veröffentlichte Marke" ist dann die WAHRE Auskunft; eine kaputte Seite wäre
 * die schlechtere, weil sie auf einer indexierbaren Adresse steht. Jeder
 * ANDERE Fehler wird gemeldet — er ist kein leerer Zustand.
 *
 * ── LOG-REGEL §6: Slug, Zähler, Codes — nie Inhalte. ─────────────────────
 */

/**
 * DIE VERÖFFENTLICHTEN, JÜNGSTE ZUERST.
 *
 * Sortiert wird nach `publishedAt` und nicht nach `$updatedAt`: das Datum, das
 * unter der Kachel steht, muss dasselbe sein, nach dem die Wand geordnet ist —
 * sonst steht eine Marke von gestern über einer von heute, weil an ihr eine
 * Meldung gezählt wurde. Der Index `idx_status_published` trägt genau dieses
 * Paar.
 */
export async function listPublishedBrandPublications(
  event: H3Event,
  limit: number = BRAND_DISCOVER_SCAN_LIMIT,
): Promise<BrandPublicationRow[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [
        // `pending` MIT altem Stand ist weiter öffentlich (Regel
        // `brandPublicationIsVisible`) — die Abfrage holt beide Zustände, die
        // Regel entscheidet je Zeile.
        Query.equal('status', ['published', 'pending']),
        Query.orderDesc('publishedAt'),
        Query.limit(limit),
      ],
    })
    return res.rows.filter(brandPublicationIsVisible)
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    logEvent('warn', 'brand.discover_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Discover unavailable',
      data: { code: 'discover_unavailable' },
    })
  }
}

/**
 * DIE EINE MARKE ZU EINER ADRESSE — `null` heisst „gibt es hier nicht".
 *
 * Der Slug ist der GANZE Schlüssel dieser Seite, also wird er gemessen, bevor
 * er in eine Abfrage geht (dieselbe Haltung wie bei der Check-Id). Und
 * NICHT-`published` liest sich wie „unbekannt": ein zurückgezogenes oder
 * ausgeblendetes Branding darf nicht daran erkennbar sein, dass es eine
 * ANDERE Antwort bekommt als ein Tippfehler (§3.2: „Zurückziehen ⇒ Seite 404,
 * kein 410, kein Rest").
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/

export async function loadPublishedBrandPublication(
  event: H3Event,
  slug: string,
): Promise<BrandPublicationRow | null> {
  const row = await loadBrandPublicationBySlug(event, slug)
  if (!row || !brandPublicationIsVisible(row)) return null
  return row
}

/**
 * DIE ZEILE ZU EINER ADRESSE — OHNE Zustandsfilter. Nur für die Betreiber-
 * VORSCHAU (`?preview=1`, D3-Schnittstelle): wer freigeben soll, muss die
 * wartende Marke sehen können, bevor sie öffentlich ist. Der Aufrufer prüft
 * `users.manage` VOR diesem Aufruf; die öffentliche Anatomie geht weiter über
 * `loadPublishedBrandPublication`.
 */
export async function loadBrandPublicationBySlug(
  event: H3Event,
  slug: string,
): Promise<BrandPublicationRow | null> {
  if (!SLUG.test(slug)) return null
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      queries: [Query.equal('slug', slug), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return null
    logEvent('warn', 'brand.discover_entry_unavailable', {
      slug,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Discover unavailable',
      data: { code: 'discover_unavailable' },
    })
  }
}

/**
 * DIE ZAHLEN ZU VIELEN MARKEN — EINE Abfrage, nie eine je Kachel.
 *
 * ── WARUM ÜBER `profileId` UND NICHT ÜBER DEN EINGEFRORENEN `checkId` ────
 * Weil eine Kachel ZWEI Zahlen zeigen können muss (Entscheidung 5: Brand Score
 * im Ring, Fundament-Reife als Zweitzeile), `brand_publications` aber nur EINE
 * Check-Adresse trägt. Über die Profil-Id kommen beide Arten in derselben
 * Abfrage — die Zeilen-Id einer Veröffentlichung IST die Profil-Id (Kopf von
 * `brandPublications.ts`), es braucht dafür also keine zusätzliche Spalte.
 * `checkId` bleibt, was es ist: die Adresse des Markenabdrucks auf der
 * Anatomie (§5 „nur Adresse").
 *
 * ── DIESELBEN GRENZEN WIE IM RANKING ────────────────────────────────────
 * Ausgeblendete Checks (`hidden`) zählen nicht — der Betreiber hat einem
 * Entfernungswunsch stattgegeben, und eine Zahl, die dort verschwindet, darf
 * hier nicht weiterleben. Fehlläufe (`score <= 0`) fallen in
 * `pickDiscoverScores`: eine 0 heisst „nichts war bewertbar".
 *
 * FAIL-SOFT: keine Tabelle, ein Lesefehler ⇒ eine leere Karte. Eine Galerie
 * ohne Zahlen ist vollständig genug; sie an einer Nebenangabe scheitern zu
 * lassen wäre ein Vetorecht für etwas, das niemand gesucht hat.
 */
export async function loadDiscoverCheckFacts(
  event: H3Event,
  profileIds: readonly string[],
): Promise<Map<string, BrandDiscoverCheckFact[]>> {
  const out = new Map<string, BrandDiscoverCheckFact[]>()
  const ids = [...new Set(profileIds.filter(Boolean))].slice(0, BRAND_DISCOVER_CHECK_LOOKUP_MAX)
  if (!ids.length) return out

  const { tablesDB, databaseId } = brandDb(event)
  let rows: BrandCheckRow[]
  try {
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [
        Query.equal('profileId', ids),
        // Nach ZEIT, damit „je Art die jüngste" unten ein blosses „erste
        // gewinnt" ist — dieselbe Ordnung wie bei `pickLatestPerUrlKey`.
        Query.orderDesc('$createdAt'),
        Query.limit(BRAND_DISCOVER_SCAN_LIMIT),
      ],
    })
    rows = res.rows
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.discover_scores_unavailable', {
        count: ids.length,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
    return out
  }

  for (const row of rows) {
    const facts = brandCheckRankingFacts(row)
    if (facts.hidden || !facts.profileId) continue
    const kind = facts.source === 'document' ? 'document' : 'website'
    const list = out.get(facts.profileId) ?? []
    // Je Art die JÜNGSTE: die Abfrage liefert absteigend, die erste gewinnt.
    if (list.some(entry => entry.kind === kind)) continue
    list.push({ kind, value: row.score ?? 0, band: row.band ?? '' })
    out.set(facts.profileId, list)
  }
  return out
}

/**
 * EINE ZEILE IN EINE KACHEL — die EINE Stelle, an der aus `undefined` ein Wert
 * wird (dieselbe Rolle wie `brandCheckRankingFacts` für einen Check).
 *
 * `featuredSlug` kommt von aussen und nicht aus `featuredAt` der Zeile: welche
 * Marke der Aufmacher ist, entscheidet die Regel über ALLE Zeilen
 * (`pickDiscoverFeatured`, Entscheidung 6) — eine Kachel, die sich selbst zur
 * Brand of the Day erklärt, weil sie irgendwann einmal eines hatte, wäre der
 * zweite Aufmacher.
 */
export function toDiscoverItem(
  row: BrandPublicationRow,
  facts: readonly BrandDiscoverCheckFact[],
  featuredSlug: string,
): BrandDiscoverItem {
  const { score, secondary } = pickDiscoverScores(facts)
  return {
    slug: row.slug,
    title: row.title ?? '',
    pathKind: row.pathKind === 'relaunch' ? 'relaunch' : 'new',
    industry: row.industry || 'unknown',
    archetype: row.archetype ?? '',
    archetypeSecondary: row.archetypeSecondary ?? '',
    paletteId: row.paletteId ?? '',
    locale: row.locale ?? '',
    publishedAt: row.publishedAt ?? '',
    example: row.example === true,
    featured: Boolean(featuredSlug) && row.slug === featuredSlug,
    score,
    secondary,
  }
}

/**
 * DER EINGEFRORENE STAND — `null`, wenn er fehlt oder unlesbar ist.
 *
 * Eine Veröffentlichung ohne lesbaren Snapshot ist für den Leser dasselbe wie
 * „gibt es nicht": er kann nichts daran ändern, und ein 500 wäre eine
 * Einladung, es noch dreimal zu versuchen (dieselbe Regel wie bei einer
 * kaputten Check-Zeile).
 */
export function parseDiscoverSnapshot(raw: string | null | undefined): BrandShareSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const snapshot = parsed as BrandShareSnapshot
    return Array.isArray(snapshot.chapters) ? snapshot : null
  }
  catch {
    return null
  }
}

/**
 * DER MARKENABDRUCK ZU EINER CHECK-ADRESSE — `null` bei allem, was schiefgeht.
 *
 * Es reisen NUR die acht Kategorie-Werte, die Zahl und ihr Band hinaus. Kein
 * `url`, kein `host`, keine Befunde: die Anatomie zeigt den Abdruck EINER
 * Marke und verlinkt für alles Weitere auf `/brand-check/<id>` — die Seite,
 * die diese Auskunft ohnehin öffentlich gibt.
 *
 * Ein AUSGEBLENDETER Check ergibt `null`, wie überall (§3 „Recht").
 */
export async function loadDiscoverCheck(
  event: H3Event,
  checkId: string,
): Promise<BrandDiscoverCheck | null> {
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(checkId)) return null
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const row = await tablesDB.getRow<BrandCheckRow>({
      databaseId, tableId: BRAND_CHECKS_TABLE, rowId: checkId,
    })
    if (row.hidden === true) return null
    return {
      id: row.$id,
      score: row.score ?? 0,
      band: row.band ?? '',
      categories: toDiscoverCategories(row.categories),
    }
  }
  catch {
    return null
  }
}

/** Kaputtes JSON ⇒ leere Liste: eine Nebenangabe darf die Seite nicht kosten. */
function toDiscoverCategories(raw: string): { id: string, score: number | null }[] {
  try {
    const parsed = JSON.parse(raw || 'null') as unknown
    return Array.isArray(parsed)
      ? brandCheckCategoryScores(parsed as BrandCheckCategoryResult[])
      : []
  }
  catch {
    return []
  }
}
