import {
  type AudienceKey,
  audienceSlugForLocale,
  MARKETING_PAGE_PATHS,
  type MarketingPageName,
  marketingLocale,
  type ProductKey,
  slugForLocale,
  type VsSlug,
} from '../../shared/marketing'

/**
 * DIE LINK-AUFLÖSUNG DES CHROME — die eine Stelle, an der sich entscheidet, ob
 * ein Menüpunkt INNERHALB dieser App navigiert oder auf pukalani.app springt.
 *
 * ── DAS PROBLEM ───────────────────────────────────────────────────────────
 * Kopf und Fuß lösen ihre Ziele seit jeher über Route-NAMEN auf
 * (`localePath({ name: 'faq' })`), und das ist auf pukalani.app die einzig
 * richtige Rechnung: fast jede Seite trägt je Sprache einen eigenen Pfad
 * (/agb ↔ /terms, /produkte/* ↔ /products/*), ein roher Pfad-String bekäme nur
 * den Locale-Präfix davor und wäre auf EN ein 404.
 *
 * Auf JEDER ANDEREN App gibt es diese Routen nicht. `localePath({ name:
 * 'faq' })` liefert dort nichts Brauchbares — der Menüpunkt zeigte ins Leere,
 * und zwar STILL: vue-router meldet einen unbekannten Namen nur in der
 * Entwicklung.
 *
 * ── DIE LÖSUNG ────────────────────────────────────────────────────────────
 * Zwei Betriebsarten hinter EINER Schnittstelle, geschaltet über
 * `pukalani.marketing.home` (app.config.ts):
 *
 *  - `home: true`  (nur apps/marketing) — EXAKT die bisherige Logik. Alles,
 *    was hier zurückkommt, ist byte-identisch mit dem, was Kopf und Fuß vorher
 *    selbst gerechnet haben.
 *  - `home: false` (Vorgabe, z. B. apps/help) — absolute URLs auf
 *    `pukalani.marketing.siteUrl`, gebaut aus den festen Pfaden in
 *    `shared/marketing.ts` (MARKETING_PAGE_PATHS) und denselben
 *    Slug-Tabellen, die auch der interne Modus benutzt.
 *
 * DER SLUG KOMMT IN BEIDEN MODI AUS DERSELBEN TABELLE. Das ist der Grund, warum
 * hier nicht zwei Listen stehen: `slugForLocale`/`audienceSlugForLocale` sind
 * die Wahrheit, die auch Sitemap und [slug]-Seiten lesen. Nur das SEGMENT
 * (`/produkte` ↔ `/products`) muss der externe Modus selbst kennen — es steckt
 * im internen Modus in `defineI18nRoute` und ist von außen nicht abfragbar.
 *
 * `locale: false` an den Link-Einträgen (LINK_DEFAULTS in Kopf und Fuß) gilt
 * unverändert für BEIDE Modi: was hier zurückkommt, ist ein fertig aufgelöster
 * Pfad bzw. eine absolute URL — ein zweiter Durchlauf durch `localePath()`
 * wäre bestenfalls wirkungslos.
 */

/** Was ein Menü-Eintrag als `to` bekommt: fertiger Pfad/URL oder Pfad+Anker. */
export type MarketingLinkTarget = string | { path: string, hash: string }

export function useMarketingSite() {
  const { locale } = useI18n()
  const localePath = useLocalePath()
  const site = useAppConfig().pukalani.marketing

  /** Ist DIESE App pukalani.app? Dann wird intern aufgelöst. */
  const isHome = site.home === true

  /** Der Sprach-Präfix im externen Modus — EN ist Default und trägt keinen. */
  const prefix = computed(() => (marketingLocale(locale.value) === 'de' ? '/de' : ''))

  /** Absolute URL auf pukalani.app aus einem schon lokalisierten Pfad. */
  function absolute(path: string): string {
    return `${site.siteUrl}${path}`
  }

  /**
   * Die Startseite, wahlweise mit Anker.
   *
   * INTERN als `{ path, hash }` und nicht als String mit `#`: der Kopf hängt
   * über das Layout an JEDER Seite, ein rohes `href="#preise"` zeigte auf
   * /faq ins Leere. Als Objekt navigiert der Link erst nach Hause und springt
   * dort zum Abschnitt.
   *
   * EXTERN reicht der String — der Sprung findet im Zielbrowser ohnehin nach
   * einem vollen Seitenwechsel statt.
   *
   * ZWEI SIGNATUREN, weil das Ergebnis von der Frage abhängt: OHNE Anker ist
   * es immer eine Zeichenkette (`UHeader :to` nimmt nichts anderes — dessen
   * Typ ist `string | undefined`), MIT Anker kann es das Objekt sein.
   */
  function home(): string
  function home(hash: string): MarketingLinkTarget
  function home(hash?: string): MarketingLinkTarget {
    if (isHome) return hash ? { path: localePath('/'), hash } : localePath('/')
    return absolute(`${prefix.value}${hash ?? ''}`)
  }

  /** Eine der festen Seiten (faq, glossar, wechseln, dsgvo, Rechtstexte). */
  function page(name: MarketingPageName): string {
    if (isHome) return localePath({ name })
    return absolute(MARKETING_PAGE_PATHS[name][marketingLocale(locale.value)])
  }

  /**
   * Produkt-Seite am KANONISCHEN Schlüssel. ZWEI Übersetzungen stecken darin,
   * und beide sind Pflicht: das SEGMENT (`/produkte` ↔ `/products`) und der
   * SLUG (`kurse` ↔ `courses`). Ohne die zweite stünde auf der englischen
   * Seite `/products/kurse` — seit 2026-07-31 eine 301.
   */
  function product(key: ProductKey): string {
    const slug = slugForLocale(key, locale.value)
    if (isHome) return localePath({ name: 'produkte-slug', params: { slug } })
    return absolute(marketingLocale(locale.value) === 'de' ? `/de/produkte/${slug}` : `/products/${slug}`)
  }

  /**
   * Anwendungsfall-Seite. Anders als bei den Produkten ist NUR der Slug
   * locale-eigen — das Segment `/use-cases` gilt für beide Sprachen
   * (Entscheidung 2026-07-30).
   */
  function audience(key: AudienceKey): string {
    const slug = audienceSlugForLocale(key, locale.value)
    if (isHome) return localePath({ name: 'use-cases-slug', params: { slug } })
    return absolute(`${prefix.value}/use-cases/${slug}`)
  }

  /** Vergleichsseite. Ihr Slug ist ein Eigenname und in beiden Sprachen gleich. */
  function vs(slug: VsSlug): string {
    if (isHome) return localePath({ name: 'vs-slug', params: { slug } })
    return absolute(`${prefix.value}/vs/${slug}`)
  }

  /**
   * DIE HILFE-SITE IST LOCALE-BEWUSST, die beiden anderen sind es nicht.
   *
   * help.pukalani.app fährt dieselbe i18n-Strategie wie diese Seite
   * (`prefix_except_default`, EN als Vorgabe): die deutsche Fassung liegt
   * unter `/de`. Wer auf der deutschen Marketing-Seite auf „Hilfe" klickt,
   * soll nicht in der englischen Doku landen.
   *
   * Changelog und Status bleiben einfache Zeichenketten: die Statusseite hat
   * keine Sprachpfade, und die Changelog-Seite (admin.pukalani.app) leitet
   * selbst nach Browser-Sprache auf `/de/changelog` weiter (gemessen
   * 2026-11-06: `Accept-Language: de` ⇒ 302).
   *
   * `computed`, weil der Sprachwechsler die Seite nicht neu lädt: ein im Setup
   * berechneter String bliebe danach auf der alten Sprache stehen.
   */
  const helpUrl = computed(() => (marketingLocale(locale.value) === 'de' ? `${site.helpUrl}/de` : site.helpUrl))

  return {
    isHome,
    home,
    page,
    product,
    audience,
    vs,
    helpUrl,
    changelogUrl: site.changelogUrl,
    statusUrl: site.statusUrl,
  }
}
