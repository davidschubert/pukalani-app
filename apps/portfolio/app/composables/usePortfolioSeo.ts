import { PERSON_NAME, SITE_NAME, personId, websiteId, type JsonLdNode } from '../utils/schema'

/**
 * Der Kopf einer öffentlichen Portfolio-Seite — Titel, Beschreibung, die
 * Spiegelung nach Open Graph und Twitter, der Autor und das JSON-LD.
 *
 * WARUM ES DIESE COMPOSABLE GIBT: fünf Seiten wiederholten denselben Block
 * Zeile für Zeile — Origin-Rechnung, `personId`, `og:site_name`, die
 * Titel/Beschreibung dreifach (Seite, og, twitter) und ein `author`-Meta. Das
 * ist nicht nur Länge: `twitterTitle` ist eine SPIEGELUNG von `title`, und
 * eine Spiegelung, die man von Hand pflegt, steht irgendwann schief. Hier
 * kann sie das nicht mehr — es gibt nur noch EINE Quelle je Seite.
 *
 * Was BEWUSST NICHT hier steht:
 *  - `robots` — steht EINMAL in der app.vue, mit Begründung (jede weitere
 *    Angabe desselben Namens wäre ein zweiter Absender).
 *  - `canonical`, `hreflang`, `og:url`, `og:image` — die macht
 *    `useLocaleSeoHead()` + `useBrandOgImage()` im Kern, ebenfalls in der
 *    app.vue. Wer sie hier ergänzte, hätte zwei Rechnungen für dieselbe URL.
 *
 * Der seiten-eigene Teil des Graphen kommt als FUNKTION herein und bekommt
 * die fertigen Adressen gereicht (`PortfolioSeoContext`): so rechnet keine
 * Seite mehr selbst `${origin}${localePath(...)}`, und die `@id`-Werte aller
 * Seiten hängen garantiert an derselben Origin.
 */

export interface PortfolioSeoContext {
  /** Origin dieser Antwort — Host aus dem Request, Schema aus der Env. */
  origin: string
  /** Startseite in der AKTUELLEN Sprache (absolut). */
  homeUrl: string
  /** Diese Seite in der aktuellen Sprache (absolut). */
  pageUrl: string
  /** `@id` der Person. */
  personId: string
  /** `@id` der Website. */
  websiteId: string
}

export interface PortfolioSeoOptions {
  /**
   * Pfad dieser Seite in der EN-Default-Locale, ohne Präfix ('/', '/ux-audit').
   * Die Sprachfassung entsteht daraus über `localePath()`.
   */
  path: string
  /** Titel in der aktuellen Sprache — als Getter, damit der Sprachwechsel greift. */
  title: () => string
  /** Meta-Description in der aktuellen Sprache. */
  description: () => string
  ogType: 'website' | 'article'
  /**
   * Nur für `ogType: 'article'`: die Daten DIESES Artikels (ISO). Bewusst ein
   * Pflichtfeld-Paar statt zweier optionaler Felder — ein Artikel ohne
   * Änderungsdatum ist kein halber Artikel, sondern ein vergessenes Feld.
   */
  article?: { published: string, modified: string }
  /** Der SEITEN-EIGENE Teil des Graphen (Service/Article/WebPage/FAQ …). */
  graph: (ctx: PortfolioSeoContext) => JsonLdNode[]
}

export function usePortfolioSeo(options: PortfolioSeoOptions): void {
  const localePath = useLocalePath()
  const origin = useSiteOrigin()

  const context = computed<PortfolioSeoContext>(() => ({
    origin,
    homeUrl: `${origin}${localePath('/')}`,
    pageUrl: `${origin}${localePath(options.path)}`,
    personId: personId(origin),
    websiteId: websiteId(origin),
  }))

  useHead(() => ({
    title: options.title(),
    meta: [
      // `robots` steht EINMAL in der app.vue (ohne index,follow) — siehe dort.
      { name: 'author', content: PERSON_NAME },
    ],
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@graph': options.graph(context.value),
    })],
  }))

  useSeoMeta({
    description: () => options.description(),
    ogType: options.ogType,
    ogSiteName: SITE_NAME,
    ogTitle: () => options.title(),
    ogDescription: () => options.description(),
    twitterTitle: () => options.title(),
    twitterDescription: () => options.description(),
    // Die drei Artikel-Angaben entstehen nur, wenn es einen Artikel gibt —
    // ein leeres `article:published_time` wäre eine Behauptung über nichts.
    ...(options.article
      ? {
          articlePublishedTime: options.article.published,
          articleModifiedTime: options.article.modified,
          articleAuthor: [PERSON_NAME],
        }
      : {}),
  })
}
