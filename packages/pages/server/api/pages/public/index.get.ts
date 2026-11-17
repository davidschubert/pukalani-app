import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { requestedPageLocale } from '../../../../shared/pageLocales'
import { groupPublicPageVersions, publicNavItems, type PublicPagesSnapshot } from '../../../../shared/publicPagesNav'
// PublicPageNavItem liegt seit dem 2026-08-02 in shared/types/page.ts: der
// Konsument ist App-Code (blueprint-Layout), und der darf keine Nitro-Route
// importieren. Begründung dort.
import { GUIDELINES_SLUG, PAGES_TABLE, type PageRow, type PublicPageNavItem } from '../../../../shared/types/page'

/**
 * Öffentlich: Liste der VERÖFFENTLICHTEN Seiten für die Hauptnavigation
 * (P3, Tenant-Header). Locale-Auswahl wie [slug].get: gewünschte Locale,
 * Fallback en, sonst erste. `home` wird mitgeliefert — der Konsument
 * entscheidet, ob er sie zeigt (der Header verlinkt home über das Logo).
 * Gleiches Lese-Muster wie [slug].get: operator-Tür + published-Filter,
 * Entwürfe verlassen den Server nie — und dieselbe C18-Wache: `pages`-Rows
 * tragen keine Row-Permissions, also hält hier nur diese Zeile Gäste von den
 * Seiten einer geschlossenen Community fern. Leere Liste statt 404 wäre die
 * falsche Antwort: die Navigation eines Mandanten ohne Seiten sieht genauso
 * aus, und ein Fehler soll ein Fehler bleiben.
 */
export default defineEventHandler(async (event): Promise<PublicPageNavItem[]> => {
  // VOR dem Cache: gecacht wird das Ergebnis, nie die Erlaubnis.
  assertCommunityContentReadable(event, 'Pages not found')

  // Geprüft gegen das Muster des Seiten-Schemas (BE-019): alles andere —
  // auch ein Array aus `?locale=a&locale=b` — zählt wie „nicht angegeben".
  const requested = requestedPageLocale(getQuery(event).locale)

  // Microcache (30 s, mandantengenau, SPRACHUNABHÄNGIG): diese Route läuft bei
  // JEDEM SSR-Seitenaufbau — Navigation und Fußzeile lesen sie. Gespeichert
  // ist der Stand des Mandanten, die Sprache wird je Anfrage daraus gewählt.
  // Die Schreibrouten verwerfen den Eintrag sofort, ein Veröffentlichen
  // wartet also nicht auf die Ablaufzeit. Begründung:
  // server/utils/publicPagesCache.ts.
  let snapshot = cachedPublicPages(event)
  if (!snapshot) {
    snapshot = await loadPublicPagesSnapshot(event)
    rememberPublicPages(event, snapshot)
  }
  return publicNavItems(snapshot, requested)
})

/**
 * ALLE VERÖFFENTLICHTEN ZEILEN, GEBLÄTTERT (BE-019).
 *
 * Bis dahin las die Route `Query.limit(50)` ohne Blättern — eine Zeile je
 * Seite UND Sprache. Mit drei Sprachen fehlten ab der 17. Seite Einträge in
 * Navigation und Fußzeile, ohne Hinweis.
 *
 * Geblättert wird nach Kennung (Appwrites Standard-Reihenfolge, der Cursor
 * zeigt auf eine eindeutige Zeile), sortiert erst im Speicher: ein Cursor auf
 * `sortOrder` liefe bei Gleichstand über viele Zeilen derselben Reihenfolge
 * (die Rechtstexte stehen alle bei 90/91, neue Seiten bei 0). Das Ergebnis ist
 * dasselbe wie vorher mit `orderAsc('sortOrder')`.
 *
 * Die Obergrenze ist ein NETZ, kein Alltag: 1.000 Zeilen sind mehr als jede
 * Navigation trägt. Greift sie, steht das als EINE Log-Zeile im Protokoll —
 * nur Zahlen und die Mandanten-Kennung, kein Titel. Die Antwort enthält dann
 * die ersten 1.000 gelesenen Zeilen.
 */
const PAGE_SIZE = 100
const MAX_ROWS = 1_000

async function loadPublicPagesSnapshot(event: H3Event): Promise<PublicPagesSnapshot> {
  const db = tenantDb(event, { as: 'operator' })
  const rows: PageRow[] = []
  let cursor: string | undefined

  for (;;) {
    const res = await db.list<PageRow>(PAGES_TABLE, [
      Query.equal('status', 'published'),
      Query.limit(PAGE_SIZE),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]).catch((error) => {
      throw toH3Error(error, 'Could not load pages')
    })
    rows.push(...res.rows)
    if (res.rows.length < PAGE_SIZE) break
    if (rows.length >= MAX_ROWS) {
      if (res.total > rows.length) {
        logEvent('warn', 'pages.public_list_capped', {
          scope: tenantCacheScope(event),
          read: rows.length,
          total: res.total,
        })
      }
      break
    }
    cursor = res.rows.at(-1)!.$id
  }

  const groups = groupPublicPageVersions(rows.map(row => ({
    slug: row.slug, locale: row.locale, title: row.title, sortOrder: row.sortOrder,
  })))

  // Die Regeln erscheinen in der Navigation auch dann, wenn es sie als Zeile
  // noch nicht gibt (F1, Davids Entscheidung 2 — Begründung in
  // shared/guidelinesFallback.ts). Der Punkt und die Seite dahinter müssen
  // dieselbe Antwort geben, deshalb steht hier dieselbe zweite Frage wie in
  // public/[slug].get.ts: ein zurückgezogener Entwurf bleibt zurückgezogen.
  // Die Frage hängt nicht an der Sprache und wird deshalb mitgespeichert.
  const hasGuidelines = groups.some(group => group.values().next().value?.slug === GUIDELINES_SLUG)
  const guidelinesFallback = !hasGuidelines && await guidelinesFallbackApplies(event)

  return { groups, guidelinesFallback }
}
