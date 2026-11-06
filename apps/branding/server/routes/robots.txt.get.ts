import { brandingBaseUrl, brandingRobotsTxt } from '../utils/brandingSitemap'

/**
 * robots.txt — die Site SOLL gefunden werden (Discover D4). Was zu bleibt und
 * warum, steht bei `brandingRobotsTxt()`; hier stehen nur Origin und Header.
 *
 * Bis heute hatte branding.supply gar keine robots.txt: Nitro antwortete 404,
 * und ein Crawler nimmt das als „alles erlaubt" — die Wirkung war also nicht
 * falsch, nur unausgesprochen, und die Sitemap-Zeile fehlte.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return brandingRobotsTxt(brandingBaseUrl(event))
})
