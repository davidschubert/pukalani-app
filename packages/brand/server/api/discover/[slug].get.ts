import { buildBrandFoundation } from '../../../shared/brandFoundation'
import { pickDiscoverFeatured, similarDiscoverEntries } from '../../../shared/brandDiscover'
import type { BrandDiscoverEntryResponse } from '../../../shared/types/brand'
import {
  listPublishedBrandPublications,
  loadBrandPublicationBySlug,
  loadDiscoverCheck,
  loadDiscoverCheckFacts,
  loadPublishedBrandPublication,
  parseDiscoverSnapshot,
  toDiscoverItem,
} from '../../utils/brandDiscover'
import { requireBrandPublicationOperator } from '../../utils/brandPublications'

/**
 * DIE ANATOMIE EINER MARKE (docs/plans/DISCOVER-BRANDS.md §4.2, §6, Paket D2)
 * — öffentlich, indexierbar, unter genau der Adresse, die beim Einreichen
 * vergeben wurde.
 *
 * ── ALLES, WAS NICHT `published` IST, IST EIN 404 ────────────────────────
 * Unbekannt, zurückgezogen, abgelehnt, ausgeblendet, noch in der
 * Warteschlange: EINE Antwort für alle fünf. Die Unterscheidung wäre die
 * Auskunft „hier stand mal etwas" — und genau die nimmt einem Zurückziehen
 * seine Wirkung (§3.2: „kein 410, kein Rest").
 *
 * ── DER RENDERER LÄUFT HIER, NICHT IM BROWSER ────────────────────────────
 * `buildBrandFoundation` bekommt den eingefrorenen Snapshot — wörtlich die
 * Eingabeform der Regel, also ohne Umformung und ohne zweiten Weg (dieselbe
 * Stelle wie in `/brand/share/:token`). Anders als dort rechnet ihn der SERVER:
 * so verlässt der rohe Snapshot die Maschine nie. Er trägt Slot-Ids und
 * Kapitelnamen, die niemand ausserhalb braucht, und was einmal in einer
 * Antwort steht, steht in jedem Cache und in jeder Browser-Konsole.
 *
 * ── EIN UNLESBARER STAND IST EIN 404, KEIN 500 ───────────────────────────
 * Für den Leser ist beides dasselbe; ein 500 wäre nur die Einladung, es noch
 * dreimal zu versuchen.
 *
 * ── „ÄHNLICHE MARKEN" KOSTET EINE ZWEITE ABFRAGE, UND SIE IST DIESELBE ───
 * Es ist das Fenster der Galerie (`listPublishedBrandPublications`) — die
 * Regel `similarDiscoverEntries` rechnet darauf. Die Kacheln dort tragen
 * KEINE Zahlen, deshalb werden für sie auch keine Checks geholt: vier
 * Vorschläge sind eine Einladung zum Weiterlesen, kein Vergleich.
 *
 * ── MICROCACHE 60 s, user-agnostisch wie die Galerie. ────────────────────
 */
const ENTRY_TTL_MS = 60_000
const entryCache = createMicrocache<BrandDiscoverEntryResponse>(ENTRY_TTL_MS)

export default defineEventHandler(async (event): Promise<BrandDiscoverEntryResponse> => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()

  // ── BETREIBER-VORSCHAU (`?preview=1`, Schnittstelle aus D3) ──────────────
  // Wer freigeben soll, muss die WARTENDE Marke sehen — also den eingereichten
  // Stand (`pendingSnapshot`), unabhängig vom Zustand. Das Gate ist dasselbe
  // wie auf der Betreiber-Seite (`users.manage`), und die Vorschau geht NIE
  // durch den Microcache: sie ist personengebunden, und ein zwischengespeicherter
  // Entwurf läge sonst sechzig Sekunden lang für jeden Leser bereit.
  const preview = getQuery(event).preview === '1'
  if (preview) requireBrandPublicationOperator(event)

  const hit = preview ? undefined : entryCache.get(slug)
  if (hit) return hit

  const row = preview
    ? await loadBrandPublicationBySlug(event, slug)
    : await loadPublishedBrandPublication(event, slug)
  if (!row) throw notFound()

  const snapshot = parseDiscoverSnapshot(preview ? (row.pendingSnapshot || row.snapshot) : row.snapshot)
  if (!snapshot) {
    logEvent('warn', 'brand.discover_snapshot_corrupt', { slug })
    throw notFound()
  }

  // Das Fenster der Galerie: es beantwortet ZWEI Fragen auf einmal — wer der
  // Aufmacher ist (dieselbe Regel wie dort, nie die eigene Zeile für sich
  // allein gelesen) und welche Marken ähnlich sind.
  const published = await listPublishedBrandPublications(event)
  const featuredSlug = pickDiscoverFeatured(published)?.slug ?? ''

  const checks = await loadDiscoverCheckFacts(event, [row.$id])
  const publication = toDiscoverItem(row, checks.get(row.$id) ?? [], featuredSlug)

  const foundation = buildBrandFoundation({
    title: snapshot.title,
    contentLocale: snapshot.contentLocale,
    story: snapshot.story,
    chapters: snapshot.chapters,
    // Die eingefrorene Richtung — wie in der Share-Ansicht: kennt der Katalog
    // die Id nicht mehr, rendert das Kapitel ohne sie (weniger, nie Falsches).
    ...(snapshot.presetId
      ? { direction: { id: snapshot.presetId, version: snapshot.presetVersion } }
      : {}),
  })

  const candidates = published.map(entry => toDiscoverItem(entry, [], featuredSlug))

  const response: BrandDiscoverEntryResponse = {
    publication,
    foundation,
    check: row.checkId ? await loadDiscoverCheck(event, row.checkId) : null,
    similar: similarDiscoverEntries(publication, candidates),
    ...(preview ? { preview: true } : {}),
  }

  if (!preview) entryCache.set(slug, response)
  logEvent('info', 'brand.discover_entry', {
    slug,
    chapters: foundation.chapters.length,
    similar: response.similar.length,
    check: Boolean(response.check),
  })
  return response
})

/** Unbekannt, zurückgezogen, ausgeblendet, unlesbar — EINE Antwort (s. Kopf). */
function notFound() {
  return createError({
    status: 404,
    statusText: 'Brand not found',
    data: { code: 'discover_not_found' },
  })
}
