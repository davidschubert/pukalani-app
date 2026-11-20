/**
 * robots.txt der Betreiber-Oberfläche (SEO-001, 2026-11-20).
 *
 * Bis dahin gab es hier keine Route: der Webserver beantwortete `/robots.txt`
 * mit einem eigenen leeren Block (404), die Anfrage erreichte die App nie.
 * Seit der Block aus der Webserver-Datei entfernt ist, antwortet die App —
 * und sagt ausdrücklich, was vorher nur zufällig galt.
 *
 * BEWUSST SCHMAL: `/api/` und `/dashboard/` bleiben zu, alles andere offen —
 * das ist die Wirkung von vorher (eine 404 liest ein Crawler als „alles
 * erlaubt"), nur ausgesprochen. Ob der Host bis auf das Changelog ganz aus
 * der Suche soll, entscheidet ein eigenes Vorhaben über `noindex` an den
 * Seiten; ein `Disallow: /` hier würde genau das verhindern, weil ein Crawler
 * eine gesperrte Seite nicht liest und ihr `noindex` nie sieht.
 *
 * KEINE Sitemap-Zeile: dieser Host hat keine Sitemap.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /dashboard/',
    '',
  ].join('\n')
})
