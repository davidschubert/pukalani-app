import { Query } from 'node-appwrite'

/**
 * Öffentliche Eckdaten für die Landingpage: Anzahl aktiver Kommentare + Mitglieder.
 * Bewusst ohne Auth (Showcase) — nur aggregierte Zahlen, keine Inhalte/PII. Nutzt
 * den Runtime-Key serverseitig (rows.read + users.read). Degradiert auf 0.
 * Microcache 10s (Idee 3 / Audit L11; 60→10s nach UX-Befund 2026-07-19 —
 * die Box hing sichtbar hinter dem Live-Kommentarzähler her): öffentlich +
 * ungedrosselt — ohne Cache wären 2 Appwrite-Count-Queries pro
 * Landingpage-Hit ein billiger Last-Hebel. Live-Anmutung zwischen den
 * Refreshes macht die Startseite selbst (Delta aus dem Kommentar-Store).
 *
 * NUR OHNE MANDANT (BE-023, dasselbe Muster wie der Changelog, N7): gezählt
 * wird das GANZE Appwrite-Projekt — in einem Pool wären das die Kommentare
 * und Konten ALLER Communities, ausgeliefert an jeden Besucher einer
 * einzelnen. Ist für die Anfrage ein Mandant aufgelöst (`useTenant(event)`,
 * Pool wie Silo), gibt es die Route nicht: 404 wie ein unbekannter Pfad. Die
 * Startseite lebt damit (Statistik-Box ohne die zwei Zahlen).
 */
const statsCache = createMicrocache<{ comments: number, members: number }>(10_000)

export default defineEventHandler(async (event) => {
  if (useTenant(event)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  // Cross-Tenant-Cache-Regel (H3): der Schlüssel trägt den Bereich, auch wenn
  // hier heute nur 'single' ankommt — fällt die Sperre oben je weg, teilt der
  // Zwischenspeicher trotzdem nie eine Antwort über Mandanten hinweg.
  const cacheKey = `stats:${tenantCacheScope(event)}`
  const cached = statsCache.get(cacheKey)
  if (cached) return cached

  const config = useRuntimeConfig(event)
  const { tablesDB, users } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [comments, members] = await Promise.all([
    tablesDB.listRows({
      databaseId,
      tableId: 'comments',
      queries: [Query.equal('status', ['active']), Query.limit(1)],
    }).then(r => r.total).catch(() => 0),
    users.list([Query.limit(1)]).then(r => r.total).catch(() => 0),
  ])

  const response = { comments, members }
  statsCache.set(cacheKey, response)
  return response
})
