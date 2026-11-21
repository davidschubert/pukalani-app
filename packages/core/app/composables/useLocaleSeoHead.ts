import { ROBOTS_NOINDEX } from '../../shared/communityAudience'
import { resolveCommunitySeo } from '../../shared/communitySeo'
import { collapseSeoToLocale, filterSeoAlternates } from '../../shared/seoAlternates'
import { routeRobots, stripLocalePrefix } from '../../shared/seoRobots'
import { rebaseSeoLinks, rebaseSeoMeta, rebaseSeoUrl, resolveSeoOrigin, type SeoHeadMeta } from '../../shared/seoOrigin'

/**
 * Der SEO-Kopf jeder App: lang/dir am <html>, hreflang-Alternates, canonical,
 * og:url + og:locale — EIN Aufruf in der `app.vue` (früher stand dieselbe
 * useLocaleHead/useHead-Kopie in jeder App).
 *
 * Mehr-Host-Betrieb (Gate `pukalani.seo.originFromRequest`, Core-Default AUS):
 * nuxt-i18n kennt nur EINE Basis-URL (`NUXT_PUBLIC_I18N_BASE_URL`) — im Pool
 * bedient derselbe Prozess viele Hosts, und alle Kopf-URLs zeigten deshalb auf
 * den Betreiber-Host (Audit-Befund B1). Mit aktivem Gate liefert der
 * Request-Host die Basis, die Env nur noch das Schema (shared/seoOrigin.ts).
 *
 * Silo-Apps (comments, portfolio, control, marketing) lassen das Gate aus und
 * bekommen unverändert den Kopf, den useLocaleHead mit ihrer Env-Basis baut.
 *
 * Kein Hydration-Risiko: `useRequestURL()` liefert im SSR den Request-Host und
 * im Browser `location` — auf demselben Host also denselben Origin.
 *
 * Bewusst NICHT über `i18n.baseUrl` als Funktion gelöst: nuxt-i18n 10.4 hat
 * diese Form deprecated (Entfernung in v11) und wertet sie nur im Vue-Kontext
 * aus, während sie durch die runtimeConfig-Serialisierung des Prod-Builds
 * nicht überlebt.
 *
 * og:image (OPEN-ITEMS B2, seit 2026-07-29): das Vorschaubild kommt aus
 * `useBrandOgImage()` — ein Produkt-Layer trägt dort den PFAD ein, hier
 * entsteht die absolute URL auf dem RICHTIGEN Host plus Maße, Typ und
 * `twitter:card`. Ohne Eintrag (Core-Default) bleibt der Kopf wie zuvor.
 *
 * SICHTBARKEIT (C18, seit 2026-07-30): steht die Community auf „nur für
 * Mitglieder", stempelt dieser Kopf `noindex, nofollow` und LÄSST DAS
 * VORSCHAUBILD WEG. Beides gehört hierher und nicht in eine Seite: es ist der
 * EINE Kopf-Aufruf jeder App, und eine vergessene Seite wäre genau das Loch,
 * das C18 beschreibt — Inhalt im Google-Index, der auf der Seite nicht mehr
 * steht. Das og:image fällt mit, weil die Route `/og/<key>.png` auf solchen
 * Hosts 404 antwortet: ein Tag auf ein 404 wäre eine Lüge im Kopf.
 * Suchmaschinen sehen das SSR-HTML — deshalb kommt der Wert aus dem
 * SSR-Payload (useTenantAudience), nicht aus einem Client-Nachtrag.
 *
 * SUCHE, ZWEITER GRUND (U15 Teil 2, seit 2026-08-13): der Owner kann seine
 * Community auch OHNE sie zuzumachen aus Suchmaschinen nehmen
 * (/dashboard/community/seo). Das Signal kommt aus demselben SSR-Payload
 * (useCommunitySeoSettings) und mündet in dasselbe robots-Tag — der
 * Unterschied zu C18 und die Folge fürs Vorschaubild stehen unten bei
 * `robotsMeta`. Die zweite Einstellung dieser Seite, die eigene Beschreibung,
 * landet BEWUSST nicht hier: eine description gehört zur SEITE (useBrandTitle),
 * nicht zum Host — hier stünde sie auf jeder Unterseite gleich.
 */
export function useLocaleSeoHead(): void {
  const localeHead = useLocaleHead({ seo: true, lang: true, dir: true })
  const appConfig = useAppConfig() as { pukalani?: { seo?: { originFromRequest?: boolean, indexOnly?: string[] } } }
  const requestUrl = useRequestURL()
  const route = useRoute()
  const controlHost = useIsControlCenter()
  const publicConfig = useRuntimeConfig().public as { i18n?: { baseUrl?: unknown } }
  const configuredBaseUrl = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl : ''
  const ogImage = useBrandOgImage()
  const brand = useBrandName()
  const { t, locales } = useI18n()
  const { membersOnly } = useTenantAudience()
  const communitySeo = useCommunitySeoSettings()
  const hiddenLocales = useSeoHiddenLocalesState()
  const canonicalLocale = useSeoCanonicalLocaleState()

  // '' = kein Umschreiben (Silo-Apps + jeder Fall, in dem kein Origin steht)
  const origin = appConfig.pukalani?.seo?.originFromRequest === true
    ? resolveSeoOrigin(requestUrl.origin, configuredBaseUrl)
    : ''

  /**
   * Die Social-Tags des Vorschaubilds. Absolut MUSS die URL sein: ein
   * relativer Pfad wird von mehreren Vorschau-Diensten gar nicht aufgelöst,
   * und mit der Env-Basis allein zeigte sie auf JEDEM Mandanten-Host auf
   * platform.pukalani.app. Basis ist deshalb dieselbe wie für canonical —
   * ohne aktives Gate der Origin des Requests.
   */
  const imageMeta = computed<SeoHeadMeta[]>(() => {
    const image = ogImage.value
    // C18: geschlossene Community ⇒ kein Vorschaubild (die Route ist zu).
    if (!image?.path || membersOnly.value) return []
    const tags: SeoHeadMeta[] = [
      { property: 'og:image', content: rebaseSeoUrl(image.path, origin || requestUrl.origin) },
      { property: 'og:image:type', content: image.type },
      { property: 'og:image:width', content: String(image.width) },
      { property: 'og:image:height', content: String(image.height) },
      { property: 'og:image:alt', content: t('ui.ogImageAlt', { brand: brand.value }) },
      // Ohne diese Zeile zeigt X/Twitter eine kleine quadratische Kachel statt
      // der breiten Karte — dasselbe Bild, halbe Wirkung.
      { name: 'twitter:card', content: 'summary_large_image' },
    ]
    return tags
  })

  /**
   * Die Ansage an Suchmaschinen. Leer, solange die Community öffentlich ist und
   * gefunden werden will — ein `index, follow` zu stempeln wäre überflüssig
   * (das ist die Voreinstellung jedes Crawlers) und würde ein `noindex` einer
   * einzelnen Seite (z. B. /embed, Rechtstexte) überschreiben können.
   *
   * ZWEI GRÜNDE, EIN TAG (U15 Teil 2). Bis hierher gab es nur den ersten:
   *   (1) C18 — die Community ist „nur für Mitglieder". Das ist eine
   *       SICHTBARKEITS-Grenze: die Inhalte sind für Gäste gar nicht lesbar,
   *       das noindex ist die Ansage dazu, und das og:image fällt mit weg.
   *   (2) U15 — der Owner hat „aus Suchmaschinen raushalten" gesetzt. Das ist
   *       eine reine SUCH-Entscheidung: die Community bleibt öffentlich
   *       lesbar, jeder mit dem Link kommt hinein.
   * Deshalb schaltet nur (1) das Vorschaubild ab: wer seine Community aus
   * Google nimmt, will trotzdem, dass ein geteilter Link im Chat als Karte
   * erscheint — das ist für viele sogar der GRUND, auf die Suche zu
   * verzichten. Wer beides koppelte, nähme ihnen den verbliebenen Weg.
   *
   * Gerechnet wird mit der EINEN Regel (`resolveCommunitySeo`), nicht mit
   * einem zweiten `=== true` daneben: die Härtung gegen kaputte Zeilen (nur
   * ein echtes `true` zählt, fail-open) soll genau einmal existieren.
   */
  const robotsMeta = computed<SeoHeadMeta[]>(() => {
    const communityNoindex = resolveCommunitySeo(communitySeo.value).noindex
    if (membersOnly.value || communityNoindex) return [{ name: 'robots', content: ROBOTS_NOINDEX }]
    // DRITTER GRUND (Q10, SEO-007): die SEITE gehört nicht in eine Suche —
    // Konto-Seiten, der Kundenbereich, die Betreiber-Oberfläche bis auf das
    // Changelog. Milder als die zwei darüber (`follow`), und deshalb NACH
    // ihnen: eine geschlossene Community bleibt bei `nofollow`. Regel und
    // Begründung: shared/seoRobots.ts.
    const pageRobots = routeRobots({
      layout: route.meta.layout,
      seoNoindex: route.meta.seoNoindex,
      controlHost,
      path: stripLocalePrefix(route.path, locales.value.map(entry => entry.code)),
      indexOnly: appConfig.pukalani?.seo?.indexOnly,
    })
    return pageRobots ? [{ name: 'robots', content: pageRobots }] : []
  })

  /**
   * hreflang NUR AUF VORHANDENE FASSUNGEN (BI1 I3, Plan BRAND-INSIGHTS §9.5).
   *
   * Gefiltert wird VOR dem Rebase, und das ist keine Geschmacksfrage: die
   * Umschreibung auf den Request-Origin arbeitet je Eintrag, ein danach
   * entfernter Eintrag wäre also umsonst umgeschrieben — schlimmer, die
   * Reihenfolge lüde dazu ein, den Filter beim nächsten Umbau hinter
   * `imageMeta` zu schieben, wo er `og:image` mitnähme.
   *
   * Der Default ist LEER: jede Seite ohne Eintrag bekommt unverändert alle
   * Alternates. Eintragen tut es die Seite, die weiss, dass ihr eine Fassung
   * fehlt (`useSeoHiddenLocales(quelle)`).
   */
  useHead(() => {
    const filtered = filterSeoAlternates(localeHead.value.link, localeHead.value.meta, hiddenLocales.value)
    // EINE MASSGEBLICHE FASSUNG (Q10, SEO-004): eine Seite mit Nutzerinhalt
    // nennt die Sprache ihrer maßgeblichen Adresse (`useSeoCanonicalLocale`);
    // dann zeigt canonical von JEDER Sprach-Adresse dorthin und die
    // Sprachfassungen fallen weg. Ebenfalls VOR dem Rebase — die Adresse
    // stammt aus einem hreflang-Eintrag und wird danach mit umgeschrieben.
    const alternates = canonicalLocale.value
      ? collapseSeoToLocale(filtered.links, filtered.meta, canonicalLocale.value)
      : filtered
    return {
      htmlAttrs: localeHead.value.htmlAttrs,
      link: rebaseSeoLinks(alternates.links, origin),
      meta: [...rebaseSeoMeta(alternates.meta, origin), ...imageMeta.value, ...robotsMeta.value],
    }
  })
}

declare module '#app' {
  interface PageMeta {
    /**
     * Diese Seite gehört nicht in eine Suche (Q10, SEO-007) — für Konto-Seiten
     * OHNE das Layout `auth` (das Layout allein genügt sonst). Der Kopf
     * stempelt `noindex, follow` (shared/seoRobots.ts).
     */
    seoNoindex?: boolean
    /**
     * `false` = diese Seite wird nie fertig gehalten, auch wenn die App
     * `pukalani.pageCache` eingeschaltet hat (Q22, z. B. ein Formular).
     */
    pageCache?: boolean
  }
}
