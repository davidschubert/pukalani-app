/**
 * robots.txt + sitemap.xml der GEPOOLTEN App — PURE Bausteine (Audit-Befund S6).
 *
 * Warum hier und nicht in einem Layer (A14): die Route-Menge einer Kunden-Site
 * ist die KOMPOSITION dieser App (Startseite + CMS-Seiten des pages-Layers +
 * Feed des posts-Layers, gestaffelt nach Plan). Kein einzelner Produkt-Layer
 * kennt sie; die App darf alle Layer kennen. Vorbild ist
 * apps/marketing/server/utils/marketingRoutes.ts — der Unterschied: dort ist
 * die Liste handgeführt und für die ganze Site gleich, hier wird sie PRO
 * REQUEST-HOST aus echten Mandanten-Daten gebaut.
 *
 * Alles in dieser Datei ist bewusst frei von h3/Nuxt: die Routen
 * (server/routes/robots.txt.get.ts, sitemap.xml.get.ts) besorgen Origin, Daten
 * und Header, die Entscheidungen hier sind reine Zeichenketten-Arbeit.
 */

import { aiCrawlerPolicy, buildRobotsTxt, type AiCrawlerPolicy } from '../../../../packages/core/shared/aiCrawlers'
import { primaryLocalePath, resolvePrimaryLocale, type PrimaryLocale } from '../../../../packages/core/shared/primaryLocale'
import { discussionCategoryPath, discussionTopicPath, slugify, TOPIC_SLUG_FALLBACK } from '../../../../packages/posts/shared/discussionUrl'

/** Ein Sitemap-Eintrag in der EN-Default-Locale (ohne Prefix). */
export interface TenantSitemapEntry {
  /** Pfad wie ihn die Default-Locale (en) ausliefert: '/', '/feed', '/imprint'. */
  path: string
  /** Relative Priorität (0.0–1.0) — wie in der Marketing-Sitemap. */
  priority: number
  /**
   * NUTZERINHALT (Q10): der Eintrag hat EINEN Text und steht deshalb nur
   * EINMAL in der Sitemap — unter der Adresse dieser Sprache (der Hauptsprache
   * der Community), ohne Sprachfassungen. Fehlt das Feld, ist es eine Seite
   * mit eigener Fassung je Sprache (wie bisher: zwei Adressen, verknüpft).
   */
  onlyLocale?: PrimaryLocale
  /** Letzte Änderung (ISO-Datum) — nur, wo die Daten eines tragen. */
  lastmod?: string
}

/**
 * OBERGRENZEN (Q10, SEO-003). Eine Sitemap ist ein Wegweiser, kein Archiv:
 * die jüngsten Themen reichen, ältere findet ein Crawler über die Kategorien.
 * Jede Zahl ist zugleich das `limit` GENAU EINER Abfrage — es gibt keine
 * Abfrage je Eintrag und kein Blättern.
 */
export const SITEMAP_TOPIC_LIMIT = 1000
export const SITEMAP_CATEGORY_LIMIT = 100
export const SITEMAP_COURSE_LIMIT = 200
export const SITEMAP_EVENT_LIMIT = 200

/** Kennungen (Row-Ids), die in eine Adresse dürfen — dieselbe Wache wie `SAFE_SLUG`. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** Ein ISO-Zeitstempel als `lastmod` — alles andere fällt weg statt die Datei zu brechen. */
function safeLastmod(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

export interface SitemapCategory { id: string, slug: string }
export interface SitemapTopic { id: string, categoryId: string, title: string | null | undefined, lastmod?: string | null }
export interface SitemapCourse { slug: string, lastmod?: string | null }
export interface SitemapEvent { id: string, lastmod?: string | null }

/**
 * Slugs, die in eine Sitemap dürfen. Identisch zur Validierung des
 * pages-Layers (`packages/pages/schemas/page.ts`), hier bewusst als eigene
 * Fail-safe-Wache statt als Import: kommt aus der Tabelle je ein Wert, der
 * dieser Form NICHT entspricht (Altbestand, Direkt-Schreiber), wäre die
 * Alternative XML-Escaping — und ein Sitemap-Eintrag, der escaped werden muss,
 * ist ohnehin keine gültige URL. Solche Slugs fallen deshalb raus.
 */
const SAFE_SLUG = /^[a-z][a-z0-9-]*$/

/** Die Startseite eines Mandanten ist die CMS-Seite `home` — sie liegt unter '/'. */
const HOME_SLUG = 'home'

export interface TenantSitemapInput {
  /** Slugs der VERÖFFENTLICHTEN CMS-Seiten (aus /api/pages/public). */
  pageSlugs: readonly string[]
  /** Darf der Plan dieses Mandanten das Produkt `posts`? Dann gibt es /feed. */
  feed: boolean
  /**
   * Hauptsprache der Community (Q10) — roh aus dem Mandanten-Kontext; ohne
   * Wahl rechnet `resolvePrimaryLocale` die Vorgabe.
   */
  primaryLocale?: string | null
  /**
   * ÖFFENTLICHE Diskussionen (Q10): die Route liefert NUR veröffentlichte
   * Themen in aktiven Kategorien. `undefined` = das Produkt gibt es hier nicht
   * (Plan) — dann fehlt auch die Übersicht.
   */
  discussions?: { categories: readonly SitemapCategory[], topics: readonly SitemapTopic[] }
  /** Veröffentlichte Kurse; `undefined` = Produkt nicht im Plan. */
  courses?: readonly SitemapCourse[]
  /** Veröffentlichte, KOMMENDE Termine; `undefined` = Produkt nicht im Plan. */
  events?: readonly SitemapEvent[]
}

/**
 * Die öffentlichen Routen EINES Mandanten-Hosts — PURE Entscheidung.
 *
 * Bewusst NICHT dabei: /login, /register, /settings, /dashboard/** (Anmelde-
 * und Betreiberbereich) und /embed (existiert für iframes, nicht für den Index).
 * `home` erscheint als '/', nicht als '/home' — genau so rendert die App
 * (apps/platform/app/pages/index.vue liest die home-Seite).
 */
export function tenantSitemapEntries(input: TenantSitemapInput): TenantSitemapEntry[] {
  const entries: TenantSitemapEntry[] = [{ path: '/', priority: 1.0 }]
  if (input.feed) entries.push({ path: '/feed', priority: 0.8 })

  const slugs = [...new Set(input.pageSlugs)]
    .filter(slug => slug !== HOME_SLUG && SAFE_SLUG.test(slug))
    .sort()
  for (const slug of slugs) entries.push({ path: `/${slug}`, priority: 0.5 })

  // ── Inhalte der Community (Q10, SEO-003) ────────────────────────────────
  // ÜBERSICHTEN tragen übersetzte Überschriften und stehen wie bisher unter
  // beiden Sprach-Adressen. EINZELNE Beiträge haben einen Text und stehen
  // einmal, unter der Adresse der Hauptsprache — dieselbe Adresse, die ihr
  // Kopf als `canonical` nennt (core: useCommunityContentSeo).
  const onlyLocale = resolvePrimaryLocale(input.primaryLocale)

  if (input.discussions) {
    entries.push({ path: '/discussions', priority: 0.7 })
    const categories = new Map<string, string>()
    for (const category of input.discussions.categories) {
      if (!SAFE_SLUG.test(category.slug) || categories.has(category.id)) continue
      categories.set(category.id, category.slug)
      entries.push({ path: discussionCategoryPath(category.slug), priority: 0.6 })
    }
    for (const topic of input.discussions.topics.slice(0, SITEMAP_TOPIC_LIMIT)) {
      const categorySlug = categories.get(topic.categoryId)
      // Ohne bekannte Kategorie keine Adresse — und ohne TITEL auch nicht:
      // dessen Adress-Name entsteht dann aus dem Text des Beitrags, den diese
      // Liste bewusst nicht lädt (bis 10.000 Zeichen je Zeile). Eine geratene
      // Adresse antwortete mit 301 — in einer Sitemap ein Fehler.
      const title = topic.title?.trim()
      if (!categorySlug || !title || !SAFE_ID.test(topic.id)) continue
      entries.push({
        path: discussionTopicPath(categorySlug, topic.id, slugify(title) || TOPIC_SLUG_FALLBACK),
        priority: 0.6,
        onlyLocale,
        lastmod: safeLastmod(topic.lastmod),
      })
    }
  }

  if (input.courses) {
    entries.push({ path: '/courses', priority: 0.7 })
    const seen = new Set<string>()
    for (const course of input.courses.slice(0, SITEMAP_COURSE_LIMIT)) {
      if (!SAFE_SLUG.test(course.slug) || seen.has(course.slug)) continue
      seen.add(course.slug)
      entries.push({ path: `/courses/${course.slug}`, priority: 0.6, onlyLocale, lastmod: safeLastmod(course.lastmod) })
    }
  }

  if (input.events) {
    entries.push({ path: '/events', priority: 0.7 })
    for (const item of input.events.slice(0, SITEMAP_EVENT_LIMIT)) {
      if (!SAFE_ID.test(item.id)) continue
      entries.push({ path: `/events/${item.id}`, priority: 0.5, onlyLocale, lastmod: safeLastmod(item.lastmod) })
    }
  }

  return entries
}

/**
 * EN-Pfad → DE-Pfad (i18n-Strategie 'prefix_except_default': en ohne Prefix,
 * de unter /de/*). Die Startseite ist '/de', nicht '/de/'.
 */
export function dePathFor(enPath: string): string {
  return enPath === '/' ? '/de' : `/de${enPath}`
}

/**
 * sitemap.xml für EINEN Mandanten-Host.
 *
 * Jede URL trägt ihre hreflang-Alternates (Muster der Marketing-Sitemap),
 * damit Google die EN/DE-Paare erkennt. `lastmod` bleibt bewusst WEG: die
 * öffentliche Seiten-Liste liefert kein Änderungsdatum, und ein erfundenes
 * Datum ist schlechter als keins.
 */
export function tenantSitemapXml(origin: string, entries: readonly TenantSitemapEntry[]): string {
  const urls = entries.flatMap((entry) => {
    const lastmod = entry.lastmod ? [`    <lastmod>${entry.lastmod}</lastmod>`] : []
    // Nutzerinhalt (Q10): EINE Adresse, keine Sprachfassungen.
    if (entry.onlyLocale) {
      return [[
        '  <url>',
        `    <loc>${origin}${primaryLocalePath(entry.path, entry.onlyLocale)}</loc>`,
        ...lastmod,
        `    <priority>${entry.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n')]
    }
    const enUrl = `${origin}${entry.path === '/' ? '' : entry.path}`
    const deUrl = `${origin}${dePathFor(entry.path)}`
    const alternates = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>`,
      `    <xhtml:link rel="alternate" hreflang="de" href="${deUrl}"/>`,
    ].join('\n')

    return [enUrl, deUrl].map(loc => [
      '  <url>',
      `    <loc>${loc}</loc>`,
      alternates,
      ...lastmod,
      `    <priority>${entry.priority.toFixed(1)}</priority>`,
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
 * robots.txt eines Mandanten-Hosts: die Community SOLL gefunden werden.
 *
 * Die Sitemap-Zeile zeigt auf die EIGENE Origin des Mandanten — nicht auf den
 * Betreiber-Host. Eine Sitemap unter fremder Domain ignoriert Google (und sie
 * würde die Kunden-Domain gegen den Betreiber ausspielen); es ist derselbe
 * Grund, aus dem canonical/hreflang seit Befund B1 aus dem Request-Host kommen.
 */
export function tenantRobotsTxt(origin: string, policy: AiCrawlerPolicy = aiCrawlerPolicy('community')): string {
  // KI-Crawler (B2): Suche und Antworten ja, Training nach Wahl des Owners
  // (KC1, Vorgabe „nein" — die Texte gehören den Mitgliedern). Die Route
  // reicht `aiCrawlerPolicy('community', { training })`.
  return buildRobotsTxt({
    policy,
    // Kein Index-Material: API-Antworten (Health/Telemetrie/Daten) und der
    // Betreiberbereich (hinter Anmeldung, ein Crawler sieht dort nur Redirects).
    rules: ['Allow: /', 'Disallow: /api/', 'Disallow: /dashboard/'],
    sitemap: `${origin}/sitemap.xml`,
  })
}

/**
 * robots.txt eines KONTROLL-Hosts (pukalani.tenancy.controlHosts).
 *
 * Kundenbereich und Onboarding-Wizard sind kein SEO-Ziel: sie tragen keinen
 * öffentlichen Inhalt, führen hinter eine Anmeldung und würden als
 * Suchergebnis nur den Trichter verwässern (beworben wird der Kurz-Link).
 * Ohne Sitemap-Zeile, weil es dort nichts zu deklarieren gibt (sitemap.xml
 * antwortet auf diesen Hosts 404).
 *
 * NICHT MEHR `Disallow: /` (Q10, SEO-007): die Sperre hielt die Seiten nicht
 * aus der Suche — die Landing verlinkt den Host auf jeder Seite, und eine
 * gesperrte Adresse darf ohne Inhalt in der Trefferliste stehen. Aus der
 * Suche nimmt sie nur `noindex`, und das stempelt der Kopf jetzt auf JEDE
 * Seite eines Kontroll-Hosts (core/shared/seoRobots.ts). Lesen kann ein
 * Crawler es aber nur, wenn die robots.txt ihn lässt — deshalb dieselbe
 * schmale Form wie auf der Betreiber-Oberfläche (Q04).
 */
export function controlHostRobotsTxt(): string {
  // KI-Crawler: unsere eigene Seite (B2) — Regel in `aiCrawlers.ts`.
  return buildRobotsTxt({
    policy: aiCrawlerPolicy('own'),
    rules: ['Allow: /', 'Disallow: /api/', 'Disallow: /dashboard/'],
  })
}

/**
 * robots.txt einer GESCHLOSSENEN Community (C18, `audience === 'members'`).
 *
 * Dieselben zwei Zeilen wie beim Kontroll-Host, aber aus einem anderen Grund —
 * und deshalb eine eigene Funktion statt eines geteilten Aufrufs: dort gibt es
 * nichts zu indexieren, hier gibt es sehr wohl Inhalt, er ist nur nicht für
 * Gäste. Fiele die eine Entscheidung später weg, soll die andere stehen bleiben.
 *
 * OHNE Sitemap-Zeile: die sitemap.xml einer geschlossenen Community ist leer,
 * und ein Verweis auf ein leeres Dokument lädt Crawler nur ein.
 *
 * Ehrlichkeit dazu: robots.txt ist eine BITTE, keine Grenze. Die Grenze sind
 * die Row-Permissions (`read(label:<communityId>)`) — ohne sie wäre das hier
 * Kosmetik. Und was schon im Index steht, verschwindet nicht sofort: Google
 * braucht Tage bis Wochen, genau das sagt der Hinweis im Dashboard.
 */
export function membersOnlyRobotsTxt(): string {
  // KI-Crawler (B2, Art `closed`): auch ihre Gruppen sagen `Disallow: /`.
  return buildRobotsTxt({ policy: aiCrawlerPolicy('closed'), rules: ['Disallow: /'] })
}
