// Ausdrücklich die Server-Fassung: sie nimmt das Ereignis als erstes Argument.
// Der Auto-Import ist für den Typecheck die Browser-Fassung (ein Argument).
import { queryCollection } from '@nuxt/content/server'
import { helpBaseUrl, helpSitemapPairs, helpSitemapXml } from '../utils/helpSitemap'

/**
 * sitemap.xml der Hilfe — die Seiten kommen aus den Inhalts-Sammlungen
 * (`content.config.ts`), je Sprache zwei: Anleitung und Entwickler. Regeln und
 * Begründung bei `helpSitemapPairs()`.
 */
export default defineEventHandler(async (event) => {
  const paths = async (collection: 'anleitung' | 'entwickler' | 'anleitungDe' | 'entwicklerDe') =>
    (await queryCollection(event, collection).select('path').all()).map(page => page.path)

  const [anleitung, entwickler, anleitungDe, entwicklerDe] = await Promise.all([
    paths('anleitung'),
    paths('entwickler'),
    paths('anleitungDe'),
    paths('entwicklerDe'),
  ])

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return helpSitemapXml(helpBaseUrl(event), helpSitemapPairs(
    [...anleitung, ...entwickler],
    [...anleitungDe, ...entwicklerDe],
  ))
})
