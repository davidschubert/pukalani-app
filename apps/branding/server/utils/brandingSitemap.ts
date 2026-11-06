import type { H3Event } from 'h3'

/**
 * DIE ÖFFENTLICHEN ADRESSEN VON branding.supply — PURE Bausteine für
 * `sitemap.xml` und `robots.txt` (Discover-Paket D4).
 *
 * ── WARUM IN DER APP UND NICHT IN EINEM LAYER (CONCEPT.md A14) ───────────
 * Die Route-Menge dieser Site ist die KOMPOSITION ihrer Layer: die Landing,
 * das Beispiel-Branding und die Über-uns-Seiten gehören der App, Brand-Check,
 * Erstgespräch und Discover dem `brand`-Layer, die Rechtstexte dem
 * `pages`-Layer. Kein einzelner Layer kennt die Summe; die App darf alle
 * kennen. Dieselbe Begründung wie in `apps/platform/server/utils/tenantSitemap.ts`.
 *
 * ── BEWUSST HANDGEFÜHRT ─────────────────────────────────────────────────
 * Vorbild ist `apps/marketing/server/utils/marketingRoutes.ts`: eine Liste,
 * die man liest, ist ehrlicher als eine Heuristik über den Router, die bei
 * einer neuen Seite still das Falsche ausliefert. Regel beim Erweitern: neue
 * ÖFFENTLICHE Seite ⇒ hier eintragen; der Test daneben nennt die Ausschlüsse
 * beim Namen, damit ein Weglassen eine Entscheidung bleibt und kein Versehen.
 *
 * Alles hier ist frei von Nuxt-Laufzeit (bis auf `brandingBaseUrl` ganz unten,
 * exakt wie im Marketing-Vorbild): die Routen besorgen Origin, Daten und
 * Header, die Entscheidungen hier sind reine Zeichenketten-Arbeit — und
 * deshalb unter `tests/brandingSitemap.test.ts` prüfbar.
 */

/** Ein Sitemap-Eintrag in der EN-Default-Locale (ohne Prefix). */
export interface BrandingSitemapEntry {
  /** Pfad wie ihn die Default-Locale (en) ausliefert: '/', '/about', … */
  path: string
  /** Relative Priorität (0.0–1.0) — wie in der Marketing-Sitemap. */
  priority: number
  /**
   * Echtes Änderungsdatum, falls es eines GIBT (ISO 8601). Die festen Seiten
   * tragen keins: ein erfundenes `lastmod` ist schlechter als keins, und ein
   * Deploy-Datum sagt über den INHALT einer Seite nichts. Die Anatomien tragen
   * eines, weil `brand_publications` es wirklich führt.
   */
  lastmod?: string
  /**
   * WELCHE SPRACHFASSUNGEN ES WIRKLICH GIBT (BI1 I3, Plan BRAND-INSIGHTS §9.5:
   * „hreflang nur auf vorhandene Fassungen").
   *
   * Ohne Angabe: BEIDE — das ist der Normalfall dieser Site, denn ihre Seiten
   * sind vollständig zweisprachig. Ein INSIGHTS-Beitrag ist es nicht
   * zwangsläufig: solange die zweite Fassung nicht redigiert ist, zeigt seine
   * Adresse in der anderen Sprache denselben Text (§3.2). Eine Sitemap, die
   * dort trotzdem beide Adressen und beide hreflang-Alternates anbietet, gibt
   * demselben Crawler dieselbe falsche Zusage, die der Seitenkopf gerade
   * vermeidet — nur an einer zweiten Stelle.
   */
  locales?: readonly ('en' | 'de')[]
}

/** Beide Sprachen — der Normalfall und der Default eines Eintrags. */
export const BRANDING_SITEMAP_LOCALES: readonly ('en' | 'de')[] = ['en', 'de']

/**
 * DIE FESTEN SEITEN — alle ohne `noindex` (nachgesehen 2026-09-08).
 *
 * NICHT DABEI, mit Grund:
 *  · `/invite` — persönlicher Einlöse-Link, kein Inhalt ohne Token.
 *  · `/waitlist/confirm` — Bestätigungsziel einer Mail, dasselbe.
 *  · `/dashboard/**` und `/brand/**` — hinter Anmeldung; ein Crawler sähe dort
 *    nur Weiterleitungen (robots.txt sperrt sie zusätzlich).
 *  · `/brand-check/<id>` und `/brand-check/vergleich` — beide tragen
 *    `robots: 'noindex, nofollow'` in der Seite (parametrisierte Ergebnisse
 *    fremder Auftritte). Eine noindex-Seite in der Sitemap ist ein
 *    Widerspruch, den Google zu Recht meldet.
 *  · Die RECHTSSEITEN (`/imprint`, `/privacy`, `/terms`) — sie kommen aus dem
 *    `pages`-Layer und stehen bis zum Anwaltsdurchlauf als ENTWURF da
 *    (`PAGE_DRAFT_ROBOTS = 'noindex, follow'`, Hinweiskasten im Text).
 *    Sobald BS1 R3 die verbindlichen Texte gesetzt hat, fällt der Entwurfs-
 *    Vermerk — DANN gehören sie hier hinein (Muster: die CMS-Zeilen von
 *    `apps/portfolio/server/routes/sitemap.xml.get.ts`).
 *
 *  · `/beispiel/kailua-coffee` — GIBT ES NICHT MEHR. Die redaktionelle
 *    Zweitfassung des Beispiel-Brandings ist gelöscht; ihre Adresse antwortet
 *    301 auf `/discover/kailua-coffee-co` (`routeRules` in `nuxt.config.ts`).
 *    Die Anatomie derselben Marke steht bereits DYNAMISCH in dieser Sitemap
 *    (`brand_publications` → `BRANDING_DISCOVER_PRIORITY`), sie gehört also
 *    nicht zusätzlich in die feste Liste — und eine Redirect-Quelle in einer
 *    Sitemap wäre ohnehin ein Widerspruch.
 */
export const BRANDING_ROUTES: readonly BrandingSitemapEntry[] = [
  { path: '/', priority: 1.0 },
  { path: '/brand-check', priority: 0.9 },
  { path: '/discover', priority: 0.9 },
  /**
   * DAS JOURNAL (BI1 I3). Es steht FEST in dieser Liste, weil es die Adresse
   * des Nav-Punktes „Brand Insights" ist und auch bei leerem Riegel keine 404
   * antwortet (dann zeigt es seinen leeren Zustand).
   *
   * `/rankings` steht NICHT hier: die Übersicht gibt es nur, wenn `ranking`
   * im Riegel steht — sie kommt deshalb DYNAMISCH aus
   * `listInsightsSitemapEntries()` (`sitemap.xml.get.ts`), zusammen mit den
   * Beiträgen, den Themen und den Markenprofilen.
   */
  { path: '/insights', priority: 0.8 },
  { path: '/erstgespraech', priority: 0.8 },
  { path: '/brand-check/ranking', priority: 0.7 },
  { path: '/brand-check/methodik', priority: 0.6 },
  { path: '/about', priority: 0.5 },
  { path: '/team', priority: 0.5 },
]

/** Priorität der Anatomien — sie sind der Zweck der Ebene „Discover" (§1). */
export const BRANDING_DISCOVER_PRIORITY = 0.6

/**
 * Priorität der Insights-Adressen (BI1 I3).
 *
 * Die Ranking-ÜBERSICHT liegt bei 0.6 wie die Anatomien; die einzelnen
 * Beiträge, Themen und Markenprofile darunter bei 0.5 — sie sind viele, und
 * eine Sitemap, in der alles gleich wichtig ist, sagt über Wichtigkeit nichts.
 */
export const BRANDING_RANKINGS_PRIORITY = 0.6
export const BRANDING_INSIGHTS_ENTRY_PRIORITY = 0.5

/**
 * EN-Pfad → DE-Pfad (i18n-Strategie 'prefix_except_default': en ohne Prefix,
 * de unter /de/*). Die Startseite ist '/de', nicht '/de/'.
 *
 * Diese Site hat KEINE locale-eigenen Pfade (kein `defineI18nRoute` in App
 * oder Layern — nachgesehen), die Umrechnung ist deshalb rein mechanisch.
 * Käme je eine dazu, gehört sie in die Tabelle oben, nicht hierher.
 */
export function dePathFor(enPath: string): string {
  return enPath === '/' ? '/de' : `/de${enPath}`
}

/**
 * XML-Textescape für Werte, die in `<loc>` oder in ein `href`-Attribut laufen.
 *
 * Verteidigung in der Tiefe (Muster `apps/portfolio`): `&` ist ein gültiges
 * URL-Zeichen und in XML ohne Entity ein Syntaxfehler, `"` beendet ein
 * Attribut. Der Origin kommt aus dem Host-Header, also aus Client-Eingabe, und
 * die Antwort wird eine Stunde öffentlich gecacht — ein Dokument, das an EINER
 * Stelle ungeprüft Fremdtext einbaut, ist nur so lange harmlos, wie die
 * Prüfung davor lückenlos bleibt. `'` bleibt weg: hier gibt es keine einfachen
 * Anführungszeichen als Begrenzer, und `&apos;` ist in XML 1.0 nicht überall
 * vordefiniert.
 */
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Ein echtes Datum als `lastmod` — oder `''`.
 *
 * `undefined`, leer, unlesbar: alles wird zu „kein lastmod". Ein Datum, das
 * `Date.parse` nicht versteht, ist keine Auskunft, sondern ein kaputtes Feld;
 * es als Zeichenkette durchzureichen ergäbe eine Sitemap, die Google als
 * Ganzes ablehnt.
 */
export function sitemapLastmod(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : ''
}

/**
 * Die sitemap.xml dieser Site.
 *
 * Jede URL trägt ihre hreflang-Alternates (`xhtml:link`), damit Google die
 * EN/DE-Paare erkennt — Muster der Marketing-Sitemap. `x-default` zeigt auf die
 * EN-Fassung, weil das die Default-Locale ohne Prefix ist.
 *
 * @param origin absoluter Origin OHNE Schrägstrich am Ende (bereits escaped
 *   oder harmlos — escaped wird hier trotzdem, s. `escapeXmlText`)
 */
export function brandingSitemapXml(origin: string, entries: readonly BrandingSitemapEntry[]): string {
  const base = escapeXmlText(origin.replace(/\/+$/, ''))

  const urls = entries.flatMap((entry) => {
    const enUrl = `${base}${entry.path === '/' ? '' : escapeXmlText(entry.path)}`
    const deUrl = `${base}${escapeXmlText(dePathFor(entry.path))}`

    /**
     * Nur die Sprachen, die es GIBT (s. `locales`). `x-default` zeigt auf EN,
     * solange EN dabei ist — sonst auf DE: es ist die Ansage „nimm diese, wenn
     * keine passt", und sie darf nicht auf eine Adresse zeigen, die diese
     * Sitemap selbst nicht anbietet.
     */
    const locales = entry.locales ?? BRANDING_SITEMAP_LOCALES
    const hasEn = locales.includes('en')
    const hasDe = locales.includes('de')
    const alternates = [
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${hasEn ? enUrl : deUrl}"/>`,
      ...(hasEn ? [`    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>`] : []),
      ...(hasDe ? [`    <xhtml:link rel="alternate" hreflang="de" href="${deUrl}"/>`] : []),
    ].join('\n')
    const lastmod = sitemapLastmod(entry.lastmod)

    return [...(hasEn ? [enUrl] : []), ...(hasDe ? [deUrl] : [])].map(loc => [
      '  <url>',
      `    <loc>${loc}</loc>`,
      alternates,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
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
 * robots.txt dieser Site — branding.supply SOLL gefunden werden.
 *
 * Zu bleiben drei Bereiche: `/api/` (Health-, Telemetrie- und Datenrouten der
 * Layer haben in einem Index nichts zu suchen), `/dashboard/` (Betreiber- und
 * Kundenbereich hinter der Anmeldung) und `/brand/` (der Wizard selbst samt
 * `/brand/share/<token>` — ein geteilter Link ist für EINEN Empfänger, nicht
 * für den Index; die Seite trägt zusätzlich ihr eigenes `noindex`).
 *
 * Ehrlichkeit dazu: robots.txt ist eine BITTE, keine Grenze. Die Grenze sind
 * die Zugriffsprüfungen der Routen — ohne sie wäre das hier Kosmetik.
 */
export function brandingRobotsTxt(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /dashboard/',
    'Disallow: /brand/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * Basis-URL ohne Schrägstrich am Ende — DIESELBE KETTE WIE IM BROWSER
 * (`useLocaleSeoHead()` in `app/app.vue`): erst die konfigurierte i18n-Basis
 * (`NUXT_PUBLIC_I18N_BASE_URL` → `runtimeConfig.public.i18n.baseUrl`), sonst
 * der Origin des laufenden Requests. Wörtlich das Vorbild
 * `apps/marketing/server/utils/marketingRoutes.ts`.
 *
 * branding.supply ist eine SINGLE-HOST-App (kein
 * `pukalani.seo.originFromRequest`) — der konfigurierte Wert gewinnt deshalb
 * vollständig und nicht nur mit seinem Schema. Genau das ist hier auch die
 * Sicherheitsentscheidung: die Antwort liegt eine Stunde öffentlich im Cache,
 * ein Zwischenspeicher könnte sonst eine Sitemap voller fremder Adressen
 * festhalten und an echte Crawler weiterreichen.
 *
 * KEIN harter Fallback auf 'https://branding.supply': eine lokale oder
 * Staging-Instanz lieferte damit eine Sitemap voller PROD-Adressen — ein
 * Crawler, der sie findet, bekommt Adressen, die mit dieser Instanz nichts zu
 * tun haben. `getRequestURL` liegt im try, weil ein Host-Header mit für URLs
 * verbotenen Zeichen `new URL()` werfen lässt; eine Crawler-Adresse soll dann
 * eine kürzere Antwort geben statt 500.
 */
export function brandingBaseUrl(event: H3Event): string {
  const publicConfig = useRuntimeConfig(event).public as { i18n?: { baseUrl?: unknown } }
  const configured = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl.trim() : ''
  let requestOrigin: string
  try {
    requestOrigin = getRequestURL(event).origin
  }
  catch {
    requestOrigin = ''
  }
  return (configured || requestOrigin).replace(/\/+$/, '')
}
