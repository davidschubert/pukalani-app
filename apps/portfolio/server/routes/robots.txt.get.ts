import { aiCrawlerPolicy, buildRobotsTxt } from '../../../../packages/core/shared/aiCrawlers'
import { siteRequestOrigin } from '../utils/siteRequestOrigin'

/**
 * robots.txt — als GENERIERTE Route statt als Datei in `public/`.
 *
 * WARUM (Muster `apps/marketing/server/routes/robots.txt.get.ts`): die
 * statische Datei verdrahtete `https://pukalani.studio/sitemap.xml`. Sobald
 * diese Site ihre zweite Domain bedient (Kundendomain, Freischaltung über den
 * `domains`-Layer), verwiese die robots.txt DORT auf eine fremde Domain — und
 * eine Sitemap unter fremder Domain ignoriert Google. Es ist derselbe Grund,
 * aus dem canonical/hreflang seit Befund B1 aus dem Request-Host kommen; die
 * Origin-Rechnung ist wörtlich dieselbe (`siteRequestOrigin`, Schema aus der
 * Env, Host aus dem Request).
 *
 * KI-Crawler (Q11, B2): die Liste stand bis 2026-11-21 HIER, als einzige
 * Site mit einer Aussage. Sie steht jetzt für alle Sites in
 * `packages/core/shared/aiCrawlers.ts`, nachgelesen bei den Anbietern und nach
 * Zweck getrennt (Suche/Antworten, Training). Für diese Site gilt die Art
 * `own`: alles erlaubt. Neu dabei: die KI-Gruppen tragen dieselben Sperren wie
 * `*` — vorher stand bei ihnen ein leeres `Disallow:`, und weil ein Crawler mit
 * eigener Gruppe nur diese liest, standen ihnen `/api/` und `/dashboard` offen.
 *
 * NEU gegenüber der Datei: `/api/` und `/dashboard` sind für alle gesperrt.
 * Die Health-/Telemetrie-Routen der Layer und der Anmeldebereich haben in
 * einem Index nichts zu suchen — sie sind keine Seiten, sondern Werkzeug.
 * Das ist keine Zugriffssperre (die machen die Routen selbst), sondern eine
 * Bitte, Crawl-Budget nicht zu verbrennen.
 */

export default defineEventHandler((event) => {
  const origin = siteRequestOrigin(event)

  const body = buildRobotsTxt({
    policy: aiCrawlerPolicy('own'),
    comments: [
      'pukalani.studio – robots.txt',
      `Kompakte Inhaltsübersicht für LLMs: ${origin}/llms.txt`,
    ],
    rules: ['Allow: /', 'Disallow: /api/', 'Disallow: /dashboard'],
    sitemap: `${origin}/sitemap.xml`,
  })

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  // Öffentlich + user-agnostisch → darf am Edge/Proxy liegen (wie sitemap.xml).
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return body
})
