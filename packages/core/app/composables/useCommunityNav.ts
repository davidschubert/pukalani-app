/**
 * DAS ÖFFENTLICHE MENÜ — EINE Rechnung für alle, die es brauchen
 * (U15 Teil 3, Davids Entscheidung 2026-09-08, DECISION-LOG „Navigation
 * anpassen").
 *
 * ── WARUM ES DIESES COMPOSABLE GIBT ───────────────────────────────────────
 * Bis heute stand die Kandidaten-Rechnung („was bietet diese Website im Menü
 * überhaupt an?") DREIMAL da: im blueprint-Layout, das das Menü rendert, im
 * Navigations-Editor, der es beschreibt, und ab heute hätte sie ein drittes Mal
 * in `BwSiteNav` (branding.supply) gestanden. Genau diese Drift hat U15 mit
 * `filterChromeNavEntries` schon einmal beseitigt — und sie kam über die
 * CMS-Seiten zurück, weil deren Filter (`home` raus, Rechtsseiten raus) in
 * jeder der drei Dateien eigenständig abgetippt war.
 *
 * Zwei Stellen, die dieselbe Frage beantworten, laufen auseinander, und hier
 * fällt es besonders still aus: der Editor bietet einen Eintrag an, den die
 * Seite nie zeigt — oder verschweigt einen, den sie zeigt. Niemand sieht einen
 * Fehler, alle sehen nur ein Menü, das nicht stimmt.
 *
 * ── DIE REGEL BLEIBT IN shared, DIE BESCHAFFUNG LIEGT HIER ────────────────
 * `resolveCommunityNav()` (core/shared/communityNavigation.ts) ist die pure
 * Regel und bleibt unangetastet testbar. Hier drumherum liegt nur, was ein
 * Browser/SSR-Lauf beisteuert: App-Config, Gates, zwei Abrufe, `localePath()`.
 * Vorbild derselben Aufteilung: `useTheme()` um `resolveThemeSelection()`.
 *
 * ── ZWEI FLAGS, ZWEI FRAGEN (kein String-Coupling, A14) ───────────────────
 * `pukalani.chrome.pagesNav` sagt „es gibt hier CMS-Seiten" und
 * `pukalani.chrome.navOverride` sagt „es gibt hier einen Navigations-Editor
 * samt Route". BEIDE setzt ausschliesslich der pages-Layer. Ohne ihn wird gar
 * nicht erst gefragt — ein Abruf ins Leere kostete jeden SSR-Aufbau einen 404,
 * und core darf einen Produkt-Layer nicht kennen.
 *
 * ── `useRequestFetch` IST PFLICHT ─────────────────────────────────────────
 * Im Pool entscheidet der HOST über den Mandanten; ein blankes `$fetch` trägt
 * ihn beim serverseitigen Rendern nicht mit und die Route antwortet „404
 * Unknown host". Der Fehler ist im Betrieb fast unsichtbar (er sieht aus wie
 * „keine Daten"), deshalb hat er einen Wächter:
 * `packages/core/tests/ssrTenantFetch.test.ts` — der deckt seit dem 2026-09-08
 * auch `packages/core/app/**` ab, genau dieser Datei wegen.
 *
 * ── OHNE `await` UND TROTZDEM IM SSR-HTML ─────────────────────────────────
 * `useAsyncData` hängt sich auf dem Server per `onServerPrefetch` in den Render
 * des AUFRUFENDEN Bauteils. Deshalb braucht dieses Composable kein
 * `await` — und darf keines: `BwSiteNav` ist eine gewöhnliche Komponente
 * innerhalb eines Layouts, ein `await` machte sie zu einer asynchronen und
 * verlangte eine Suspense-Grenze, die es dort nicht gibt.
 */
import type { ComputedRef, Ref } from 'vue'
import {
  CMS_PAGE_NAV_ORDER,
  type CommunityNavCandidate,
  type CommunityNavItem,
  type CommunityNavOverride,
  type PublicPageNavItem,
  cmsPageNavId,
  filterChromeNavEntries,
  isLegalPageSlug,
  resolveCommunityNav,
} from '../../shared/communityNavigation'
import type { PukalaniChromeNavEntry } from '../../shared/types/chrome'
import { isProductStateEnabled } from '../../shared/types/config'

interface ChromeNavConfig {
  nav?: Record<string, PukalaniChromeNavEntry | false>
  pagesNav?: boolean
  navOverride?: boolean
}

export interface CommunityNavState {
  /** Was diese Website ANBIETET — nach allen Gates, mit übersetztem Text. */
  candidates: ComputedRef<CommunityNavCandidate[]>
  /**
   * Die gespeicherte Wahl des Owners. SCHREIBBAR, weil der Editor den
   * gespeicherten Stand aus der PATCH-Antwort übernimmt, statt ihn sich
   * zusammenzureimen (Muster `registration.patch.ts`).
   */
  override: Ref<CommunityNavOverride | null>
  /** Das fertige Menü (Hauptpunkte, Kinder in `children`). */
  items: ComputedRef<CommunityNavItem[]>
  /**
   * Die veröffentlichten CMS-Seiten, ROH. Der Fuß braucht daraus die
   * Rechtsseiten — dieselbe Antwort, aus derselben Abfrage, statt eines
   * zweiten Abrufs daneben.
   */
  pages: Ref<PublicPageNavItem[]>
  /**
   * Erfüllt, sobald Seiten UND gespeicherte Wahl geladen sind.
   *
   * WER EIGENEN ZUSTAND DARAUS ABLEITET, MUSS DARAUF WARTEN — gemessen am
   * Klickbeweis 2026-09-08: der Editor füllt seine Zeilen in einem
   * `watch(…, { immediate: true })`, und auf dem Server läuft ein Watcher
   * genau EINMAL, beim Aufbau — die Daten kamen erst danach über
   * `onServerPrefetch`. SSR zeigte drei Zeilen ohne Gruppe, der Client vier
   * mit Gruppe: Hydration-Mismatch (ph:arrow-elbow-down-right „expected on
   * client"). Reine `computed`-Konsumenten (Layout, BwSiteNav) brauchen das
   * Warten nicht, weil sie erst beim Rendern rechnen.
   */
  ready: Promise<void>
}

export function useCommunityNav(): CommunityNavState {
  const { t, locale } = useI18n()
  const localePath = useLocalePath()
  const appConfig = useAppConfig()
  const { isLoggedIn } = useCurrentUser()
  const { planAllows } = useTenantPlan()
  const runtimeFlags = useRuntimeFlags()

  /**
   * Über `unknown`, und das ist keine Schludrigkeit: die App-Config ist tief
   * gemergt, ihr abgeleiteter Typ ist also je APP ein anderes Literal (in
   * apps/control ein anderes als in apps/platform). Die Registry ist trotzdem
   * ein Vertrag mit fester Form (core/shared/types/chrome.ts) — nur sieht der
   * Compiler sie hier als Sammlung konkreter Objekte und nicht als die
   * Record-Map, die sie ist.
   */
  const chrome = computed<ChromeNavConfig>(() =>
    (appConfig.pukalani as unknown as { chrome?: ChromeNavConfig }).chrome ?? {})

  const pagesNavEnabled = chrome.value.pagesNav === true
  const navOverrideEnabled = chrome.value.navOverride === true

  const requestFetch = useRequestFetch()

  /**
   * Die Fehler BEIDER Abrufe werden verschluckt, und beide Male ist das die
   * dokumentierte Antwort und kein Verlegenheits-`catch`: keine CMS-Seiten
   * heisst „diese Website hat keine", keine gespeicherte Wahl heisst „Menü wie
   * vor U15". Beides ist der Normalfall, nicht ein Zwischenfall.
   */
  const pagesAsync = useAsyncData(
    () => `chrome-nav-pages-${locale.value}`,
    () => pagesNavEnabled
      ? requestFetch<PublicPageNavItem[]>('/api/pages/public', { query: { locale: locale.value } })
        .catch(() => [] as PublicPageNavItem[])
      : Promise.resolve([] as PublicPageNavItem[]),
    { watch: [locale], default: () => [] as PublicPageNavItem[] },
  )

  // `default` und nicht bloss ein Typ-Cast: es ist der WERT, den ein noch
  // nicht gelaufener Abruf hat — und `null` heisst hier „keine eigene Wahl",
  // also genau das, was die Regel sowieso als Normalfall behandelt.
  const overrideAsync = useAsyncData(
    () => 'chrome-nav-override',
    () => navOverrideEnabled
      ? requestFetch<CommunityNavOverride>('/api/pages/navigation').catch(() => null)
      : Promise.resolve(null),
    { default: () => null as CommunityNavOverride | null },
  )

  /**
   * DIESE FILTER LAUFEN VOR DEM OVERRIDE, und das ist die Zusage, um die es bei
   * U15 sicherheitshalber geht: was hier herausfällt — allen voran ein Produkt,
   * das der Tarif dieser Community nicht enthält (`planAllows`, C2) — kann
   * durch kein gespeichertes Menü zurückkommen.
   */
  const { data: pages } = pagesAsync
  const { data: override } = overrideAsync
  const ready = Promise.all([pagesAsync, overrideAsync]).then(() => undefined)

  const candidates = computed<CommunityNavCandidate[]>(() => {
    const entries = filterChromeNavEntries(chrome.value.nav, {
      isLoggedIn: isLoggedIn.value,
      productOn: (key?: string) => !key || isProductStateEnabled(runtimeFlags.value.products[key]),
      planAllows,
    }).map(entry => ({
      id: entry.id,
      label: t(entry.labelKey),
      // `to: ''` heisst „Aufklapper ohne eigene Seite" (Zusage 9) — es darf
      // NICHT durch `localePath()` laufen: das machte daraus auf /de ein `/de`,
      // also einen Link auf die Startseite, und der Aufklapper wäre plötzlich
      // klickbar. Der Leerstring ist die Aussage, nicht ein fehlender Wert.
      to: entry.to ? localePath(entry.to) : '',
      path: entry.to,
      icon: entry.icon,
      // PS1: dieselbe Übersetzung wie beim Label, an derselben Stelle — ein
      // fehlender `descriptionKey` heisst „keine Beschreibung" und darf NICHT
      // durch `t()` laufen (vue-i18n gäbe sonst den leeren Schlüssel zurück).
      description: entry.descriptionKey ? t(entry.descriptionKey) : undefined,
      planProduct: entry.planProduct,
      order: entry.order ?? 50,
      parent: entry.parent,
    }))
    // `home` gehört der Startseite, die Rechtsseiten dem Fuß (Entscheidung 5
    // des Layout-Zuschnitts) — EINE Antwort für Layout, Editor und BwSiteNav.
    const cms = (pages.value ?? [])
      .filter(page => page.slug !== 'home' && !isLegalPageSlug(page.slug))
      .map(page => ({
        id: cmsPageNavId(page.slug),
        label: page.title,
        to: localePath(`/${page.slug}`),
        path: `/${page.slug}`,
        order: CMS_PAGE_NAV_ORDER,
      }))
    return [...entries, ...cms]
  })

  const items = computed(() => resolveCommunityNav(candidates.value, override.value))

  return { candidates, override, items, pages, ready }
}
