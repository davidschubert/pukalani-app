import type { H3Event } from 'h3'
import { aiCrawlerPolicy, buildRobotsTxt } from '../../../../packages/core/shared/aiCrawlers'

/**
 * SITEMAP UND robots.txt DER HILFE (SEO-006, 2026-11-20). Bis dahin
 * antworteten beide Adressen 404 — die Hilfe hat rund zwanzig Seiten je
 * Sprache, und kein Crawler bekam eine Liste oder die Sprach-Paare gesagt.
 *
 * DIE LISTE KOMMT AUS DEN INHALTEN, nicht aus einer Datei von Hand: jede
 * Markdown-Datei unter `content/` ist eine Seite, und eine neue Datei steht
 * damit von selbst in der Sitemap. Die Regeln hier sind pur (Test:
 * `tests/helpSitemap.test.ts`); gelesen wird in der Route.
 *
 * SPRACH-PAARE NUR, WO ES BEIDE GIBT: Englisch liegt an der Wurzel, Deutsch
 * unter `/de`. Eine Seite, die nur in einer Sprache existiert, steht einmal
 * drin und nennt kein Paar — ein hreflang auf eine Adresse, die 404
 * antwortet, ist schlechter als keines.
 *
 * `lastmod` bleibt weg (dieselbe Regel wie in der Marketing-Sitemap): ein
 * erfundenes Datum ist schlechter als keins.
 */

/** Basis-URL ohne Schrägstrich am Ende — dieselbe Kette wie in `apps/marketing`. */
export function helpBaseUrl(event: H3Event): string {
  const publicConfig = useRuntimeConfig(event).public as { i18n?: { baseUrl?: unknown } }
  const configured = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl.trim() : ''
  return (configured || getRequestURL(event).origin).replace(/\/+$/, '')
}

export interface HelpSitemapPair {
  /** Englische Adresse (ohne Präfix), falls es die Seite englisch gibt. */
  en?: string
  /** Deutsche Adresse (mit `/de`), falls es die Seite deutsch gibt. */
  de?: string
  priority: number
}

/** `/de/anleitung/x` → `/anleitung/x`, `/de` → `/`. */
function withoutGermanPrefix(path: string): string {
  const rest = path.replace(/^\/de(?=\/|$)/, '')
  return rest === '' ? '/' : rest
}

function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Eine Sammlung führt auch ihre Ordner-Einstellungen (`.navigation.yml`) als
 * Eintrag mit dem Pfad `/anleitung/.navigation` — das ist keine Seite.
 */
function isPage(path: string): boolean {
  return !path.split('/').some(segment => segment.startsWith('.'))
}

/** Startseite 1.0, Einstieg eines Bereichs 0.8, jede andere Seite 0.6. */
function priorityOf(path: string): number {
  if (path === '/') return 1.0
  return path.split('/').filter(Boolean).length === 1 ? 0.8 : 0.6
}

/**
 * Aus den Pfaden beider Sprachen die Paare bilden. Die Startseiten kommen als
 * `/` und `/de` dazu (ihre Sammlungen tragen keinen Pfad-Präfix).
 */
export function helpSitemapPairs(enPaths: readonly string[], dePaths: readonly string[]): HelpSitemapPair[] {
  const en = new Set(['/', ...enPaths.filter(isPage).map(normalize)])
  const de = new Set(['/', ...dePaths.filter(isPage).map(path => withoutGermanPrefix(normalize(path)))])
  const keys = [...new Set([...en, ...de])].sort((a, b) => a.localeCompare(b))
  return keys.map(key => ({
    ...(en.has(key) ? { en: key } : {}),
    ...(de.has(key) ? { de: key === '/' ? '/de' : `/de${key}` } : {}),
    priority: priorityOf(key),
  }))
}

/** `&`, `<`, `>`, `"` — die vier Zeichen, die ein XML-Dokument brechen. */
export function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function helpSitemapXml(origin: string, pairs: readonly HelpSitemapPair[]): string {
  const base = escapeXmlText(origin.replace(/\/+$/, ''))
  const url = (path: string) => `${base}${path === '/' ? '' : escapeXmlText(path)}`

  const urls = pairs.flatMap((pair) => {
    const enUrl = pair.en === undefined ? null : url(pair.en)
    const deUrl = pair.de === undefined ? null : url(pair.de)
    const alternates = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl ?? deUrl}"/>`,
      ...(enUrl ? [`    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>`] : []),
      ...(deUrl ? [`    <xhtml:link rel="alternate" hreflang="de" href="${deUrl}"/>`] : []),
    ].join('\n')
    return [enUrl, deUrl].filter((loc): loc is string => loc !== null).map(loc => [
      '  <url>',
      `    <loc>${loc}</loc>`,
      alternates,
      `    <priority>${pair.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n'))
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * robots.txt — die Hilfe SOLL gefunden werden. Zu bleibt nur `/api/` (Health
 * und Telemetrie der Fundament-Layer); dieselbe Form wie auf pukalani.app.
 */
export function helpRobotsTxt(origin: string): string {
  // KI-Crawler: eigene Seite, alles erlaubt (B2) — Regel in `aiCrawlers.ts`.
  return buildRobotsTxt({
    policy: aiCrawlerPolicy('own'),
    rules: ['Allow: /', 'Disallow: /api/'],
    sitemap: `${origin.replace(/\/+$/, '')}/sitemap.xml`,
  })
}
