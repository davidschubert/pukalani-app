<script setup lang="ts">
/**
 * Kopfbereich der Marketing-Seite — `UHeader` + `UNavigationMenu` (Paket 5).
 *
 * DAVIDS ENTSCHEIDUNG 2026-07-31: die GANZE Landingpage läuft auf Nuxt UI, und
 * das schlägt „kein JS". Bis Paket 4 waren der Produkte-Ausklapper (`:hover` /
 * `:focus-within`) und das Mobil-Menü (`<details>`) bewusst ohne JavaScript
 * gebaut, damit sie schon VOR der Hydration funktionieren. Beide sind jetzt
 * Reka-Bausteine und brauchen den hydrierten Client. Was die Seite dafür
 * bekommt: echte Menü-Semantik (role/aria-expanded, Pfeiltasten, Escape,
 * Fokus-Rückgabe) statt eines Ausklappers, den ein Screenreader als
 * Verschachtelung von Links liest — und EIN Vokabular für die ganze Seite.
 */
import type { ProductKey } from '../../shared/marketing'

const { t } = useI18n()
const { start, signIn, request } = useProductLinks()
const { trackFunnel } = useFunnelEvent()

/**
 * ALLE INTERNEN ZIELE LAUFEN ÜBER DIESES COMPOSABLE (siehe
 * composables/useMarketingSite.ts). Auf pukalani.app rechnet es wie bisher
 * über Route-Namen; auf jeder anderen App, die diesen Layer einbindet
 * (help.pukalani.app), liefert es absolute URLs auf pukalani.app. Ein
 * `localePath({ name: … })` hier im Bauteil wäre dort ein stiller Blindgänger.
 */
const site = useMarketingSite()

/**
 * Die Kopfleiste folgt dem Hero (U2): bei geschlossenem Tor heißt der
 * Haupt-Knopf „Zugang anfragen", und daneben steht — im Ton der übrigen
 * Menü-Links, nicht als dritter Knopf — der Weg für Eingeladene. Der Zustand
 * kommt aus dem SSR-Payload; siehe composables/useOnboardingGate.ts.
 */
const gate = useOnboardingGate()

// Die Produkte der Hauptnavigation, am KANONISCHEN Schlüssel. Reihenfolge
// = Reihenfolge im Bausteine-Abschnitt; Texte kommen aus i18n
// (marketing.nav.products.items.<key>), nur Icon und Early-Access-Flagge stehen
// im Code. Der Slug in der Adresse ist übersetzt und kommt aus
// shared/marketing.ts — NIE aus dem Schlüssel hier.
const PRODUCTS = [
  { key: 'diskussionen', icon: 'i-ph-chats-circle-bold', ea: false },
  { key: 'moderation', icon: 'i-ph-shield-check-bold', ea: false },
  { key: 'branding', icon: 'i-ph-note-bold', ea: false },
  { key: 'beitraege', icon: 'i-ph-broadcast-bold', ea: true },
  { key: 'kurse', icon: 'i-ph-graduation-cap-bold', ea: true },
  { key: 'events', icon: 'i-ph-calendar-check-bold', ea: true },
  // Analytics ist GEBAUT und im Angebot (ab Personal) — also keine
  // Early-Access-Pille: die kennzeichnet nur, was noch nicht käuflich ist
  // (§2.4). Dass es einen Plan voraussetzt, sagt die Preistabelle.
  { key: 'analytics', icon: 'i-ph-chart-line-up-bold', ea: false },
] as const satisfies readonly { key: ProductKey, icon: string, ea: boolean }[]

/**
 * Alle Anker-Ziele der Navigation liegen auf der STARTSEITE — der Header hängt
 * über das Layout aber an jeder Seite. Ein rohes href="#preise" zeigt auf
 * /faq oder /produkte/* deshalb ins Leere; im internen Modus navigiert der Link
 * als { path, hash } erst nach Hause und springt dort zum Abschnitt. Die
 * Rechnung (inkl. Locale-Präfix bzw. absoluter URL) macht `site.home()`.
 */
function homeSection(hash: string) {
  return computed(() => site.home(hash))
}
const blocksTarget = homeSection('#bausteine')
const pricingTarget = homeSection('#preise')
const storyTarget = homeSection('#geschichte')

/**
 * Ziel einer Produkt-Seite — Segment UND Slug sind übersetzt; die Rechnung
 * steht in useMarketingSite(). Bewusst nicht memoisiert: der Aufruf steht in
 * `computed`s, die ohnehin an `locale` hängen.
 */
function productTo(key: ProductKey) {
  return site.product(key)
}

/**
 * ZWEI EIGENSCHAFTEN AN JEDEM NAVIGATIONS-EINTRAG, beide bewusst:
 *
 * `active: false` — `ULink` färbt einen Eintrag ein, sobald der PFAD zutrifft.
 * Die drei Anker-Ziele zeigen alle auf `/de`, also wären auf der Startseite
 * ALLE DREI gleichzeitig „aktiv" (orange). Das ist keine Auszeichnung mehr,
 * sondern Rauschen — der Bestand hat nie einen aktiven Zustand gezeigt.
 * `isLinkActive()` liest die Eigenschaft VOR jeder eigenen Rechnung.
 *
 * `locale: false` — `ULink` schiebt einen String-Pfad noch einmal durch
 * `localePath()`. Diese App löst ihre Links grundsätzlich über den Route-NAMEN
 * auf (Regel in MarketingFooter.vue), das Ergebnis ist also schon der fertige
 * Pfad. Ein zweiter Durchlauf wäre bestenfalls wirkungslos und schlimmstenfalls
 * eine zweite Auflösung derselben URL auf einer Sprache, die andere Segmente
 * benutzt (/produkte ↔ /products).
 */
const LINK_DEFAULTS = { active: false, locale: false } as const

const desktopItems = computed(() => [
  // Kein `children`: der Ausklapper wird über den `#products-content`-Slot
  // gefüllt (siehe Begründung dort). `UNavigationMenu` macht aus dem Eintrag
  // auch so einen Auslöser — die Bedingung im Bauteil ist „children ODER
  // Content-Slot". `to` fehlt deshalb bewusst: ein Auslöser mit Untermenü ist
  // kein Link mehr, den Weg zur Übersicht übernimmt der Fuß des Ausklappers.
  // `marketing.nav.products.label`, NICHT `marketing.nav.products`: der flache
  // Schlüssel stand in de.json/en.json ein zweites Mal ALS OBJEKT (mit
  // `overview` + `items`), und JSON.parse behält bei doppelten Schlüsseln den
  // LETZTEN. Der Auslöser der Hauptnavigation zeigte deshalb live die
  // Zeichenkette „marketing.nav.products" statt „Produkte"/„Products" (nur eine
  // intlify-WARNUNG in der Konsole, kein Fehler — deshalb monatelang unbemerkt).
  { label: t('marketing.nav.products.label'), value: 'products', slot: 'products' as const },
  { ...LINK_DEFAULTS, label: t('marketing.nav.pricing'), to: pricingTarget.value },
  { ...LINK_DEFAULTS, label: t('marketing.nav.story'), to: storyTarget.value },
  /**
   * „Ressourcen" (Davids Wunsch 2026-08-18) — der Weg zu allem, was ERKLÄRT
   * statt verkauft: die Hilfe und der Changelog.
   *
   * HIER ALS GEWÖHNLICHE `children`, NICHT über einen Slot wie die Produkte.
   * Der Produkte-Ausklapper braucht seinen Slot nur wegen der
   * Early-Access-Pillen (Begründung unten im Template); ohne Pille rendert
   * `UNavigationMenu` Icon, Titel und Beschreibung selbst — und das ist genau
   * das Bild, das dort stehen soll. Ein zweiter handgebauter Ausklapper wäre
   * dieselbe Optik in Handarbeit und liefe beim nächsten Nuxt-UI-Bump
   * auseinander.
   *
   * Beide Ziele verlassen diese App IMMER: die Hilfe liegt auf
   * help.pukalani.app (locale-bewusst, siehe useMarketingSite), der Changelog
   * auf admin.pukalani.app/changelog. `LINK_DEFAULTS` gilt trotzdem — `active:
   * false` hält den Eintrag frei von der Einfärbung, `locale: false` verbietet
   * `ULink` das Durchreichen einer absoluten URL durch `localePath()`.
   */
  {
    label: t('marketing.nav.resources.label'),
    value: 'resources',
    children: [
      {
        ...LINK_DEFAULTS,
        label: t('marketing.nav.resources.items.help.title'),
        description: t('marketing.nav.resources.items.help.text'),
        icon: 'i-ph-lifebuoy-bold',
        to: site.helpUrl.value,
      },
      {
        ...LINK_DEFAULTS,
        label: t('marketing.nav.resources.items.changelog.title'),
        description: t('marketing.nav.resources.items.changelog.text'),
        icon: 'i-ph-megaphone-bold',
        to: site.changelogUrl,
      },
    ],
  },
])

// Zwei Listen = ein Trenner dazwischen (`UNavigationMenu` rendert ihn
// zwischen Listen selbst) — der Bestand zog dieselbe Linie zwischen den
// Produkten und den Seiten-Ankern.
const mobileItems = computed(() => [
  PRODUCTS.map(product => ({
    ...LINK_DEFAULTS,
    label: t(`marketing.nav.products.items.${product.key}.title`),
    icon: product.icon,
    to: productTo(product.key),
  })),
  [
    { ...LINK_DEFAULTS, label: t('marketing.nav.products.label'), to: blocksTarget.value },
    { ...LINK_DEFAULTS, label: t('marketing.nav.pricing'), to: pricingTarget.value },
    { ...LINK_DEFAULTS, label: t('marketing.nav.story'), to: storyTarget.value },
    // FAQ hat eine EIGENE Seite (mit eigenem JSON-LD/OG) — die gewinnt gegen
    // den Anker auf der Startseite, so wie im Footer.
    //
    // DER SCHLÜSSEL IST EIN LAYER-EIGENER (`marketing.nav.faq`, nicht mehr
    // `marketing.faq.kicker`): dieser Layer rendert auch auf Apps, die den
    // FAQ-Teilbaum der Marketing-App gar nicht haben — vue-i18n gäbe dort den
    // ROHEN SCHLÜSSEL aus (der `legal.imprint`-Vorfall aus CLAUDE.md). Ein
    // Bauteil darf nur Schlüssel rendern, die sein eigener Layer mitbringt.
    { ...LINK_DEFAULTS, label: t('marketing.nav.faq'), to: site.page('faq') },
    // Dieselben zwei Ziele wie der „Ressourcen"-Ausklapper oben — hier flach,
    // weil das Mobil-Menü bewusst kein zweites Menü im Menü öffnet.
    { ...LINK_DEFAULTS, label: t('marketing.nav.resources.items.help.title'), icon: 'i-ph-lifebuoy-bold', to: site.helpUrl.value },
    { ...LINK_DEFAULTS, label: t('marketing.nav.resources.items.changelog.title'), icon: 'i-ph-megaphone-bold', to: site.changelogUrl },
  ],
  // Der Ausgang für Bestandskunden (U3) — eigene Liste, damit `UNavigationMenu`
  // einen Trenner davor zieht: „Anmelden" verlässt diese Seite, alles darüber
  // bleibt auf ihr.
  [
    { ...LINK_DEFAULTS, label: t('marketing.nav.signIn'), icon: 'i-ph-sign-in-bold', to: signIn },
  ],
])

/**
 * Der offene Ausklapper wird GEFÜHRT, nicht nur beobachtet: die Links im
 * `#products-content`-Slot sind gewöhnliche `NuxtLink` und kein
 * `NavigationMenuLink` (Reka ist aus dieser App nicht importierbar — `reka-ui`
 * ist eine Abhängigkeit von @nuxt/ui und liegt nicht im Auflösungspfad der
 * App). Ohne diesen Wert bliebe der Ausklapper nach einem Klick offen stehen,
 * weil Reka den Schluss nur für seine eigenen Links kennt.
 */
const openMenu = ref('')

/**
 * DER SPRACHWECHSLER STEHT NICHT MEHR HIER (Davids Entscheidung 2026-07-31):
 * er ist in den Fuß gewandert, unten rechts als Auswahlmenü mit Flagge
 * (MarketingFooter.vue — dort auch die Begründung des Hash-Strips). Der Kopf
 * trägt nur noch Navigation und den einen CTA: „Kostenlos starten" ist das
 * Ziel dieser Seite, und ein zweiter KNOPF daneben nimmt ihm Aufmerksamkeit
 * für eine Entscheidung, die die meisten Besucher nie treffen.
 *
 * SEIT U3 (2026-08-10) STEHT „ANMELDEN" TROTZDEM DA — und zwar genau deshalb
 * als TEXTLINK und nicht als Knopf. Der Schlüssel `marketing.nav.signIn`
 * existierte in beiden Sprachen und wurde nirgends gerendert (Trichter S2):
 * ein Bestandskunde, der auf pukalani.app landet, fand von hier keinen Weg in
 * seinen Kundenbereich. Ein Link in Menü-Optik ist der billigste mögliche
 * Ausgang — er nimmt dem CTA seine Fläche nicht weg, und wer ihn sucht,
 * sucht ihn genau hier.
 *
 * Auf schmalen Fenstern ist er ausgeblendet (`hidden md:inline-flex`): dort
 * steht neben dem CTA nur noch das Burger-Zeichen, und ein dritter Eintrag
 * bräche die Leiste auf drei Zeilen. Im Mobil-Menü unten steht er dafür als
 * eigener Eintrag.
 */

// Mobil-Menü: `UHeader` schließt es beim Routenwechsel selbst (`autoClose`).
const mobileOpen = ref(false)

const HEADER_UI = {
  // Der Bestand ist eine haltende Leiste, KEINE feste Höhe: auf 375px bricht
  // der CTA auf zwei Zeilen und die Leiste wächst mit (gemessen 69px statt
  // 53px). Die Vorgabe `h-(--ui-header-height)` schnitte ihn ab.
  root: [
    'h-auto min-h-(--ui-header-height)',
    'bg-(--puka-header-surface) border-[color:var(--puka-header-edge)]',
    'backdrop-blur-[10px] backdrop-saturate-[1.4]',
  ].join(' '),
  // KEINE eigene Breite mehr: seit 2026-08-20 (Davids Entscheidung, Original-
  // Tailwind-Maße überall) gilt für Kopf, Fuß und Sektionen dieselbe
  // `--ui-container`-Schranke (90rem, core main.css) — das frühere
  // max-w-[72rem] („breiter als die 71rem-Sektionen") wäre jetzt SCHMALER
  // als der Inhalt und kippte die Hierarchie.
  //
  // DIE SENKRECHTE LUFT WECHSELT DEN BESITZER, sobald das Menü sichtbar wird.
  // Ab 768px steckt sie schon im Menü-Eintrag (`item: py-2`) und gehört auch
  // DORTHIN: der Ausklapper hängt an der Unterkante des MENÜS, nicht an der
  // der Leiste — zöge man sie in den Container, klaffte dazwischen eine Lücke,
  // in der die Maus das Menü verlässt und der Ausklapper zufällt. Darunter
  // gibt es kein Menü, dort muss der Container polstern, sonst klebte der
  // zweizeilige CTA an beiden Kanten.
  // Gemessen: 53px ab 768px, 69px auf 375px — beides exakt der Bestand.
  container: 'h-auto py-3 md:py-1 gap-6',
  // Die Vorgabe teilt Schreibtisch und Handy bei 1024px, der Bestand bei
  // 768px. Ohne diese vier Zeilen bekämen Tablets ab 768px plötzlich das
  // Burger-Menü statt der Navigation.
  left: 'md:flex-1',
  right: 'md:flex-1 gap-3',
  center: 'md:flex',
  toggle: 'md:hidden',
  content: 'md:hidden',
  overlay: 'md:hidden',
  title: 'items-center gap-2 text-[1.1rem] font-extrabold tracking-[-0.01em]',
}

/**
 * Der Umschalt-Knopf darf NICHT `ghost` sein: app.config.ts dreht `neutral` +
 * `ghost` seit Paket 3 auf `text-inverted` (weiß) — das ist der sekundäre CTA
 * auf den DUNKLEN Abschlussblöcken. Auf der hellen Kopfleiste wäre das ein
 * unsichtbares Zeichen. `link` trägt keine Farbe von dort und bekommt die
 * Hover-Fläche des Bestands (hsl(ink / 0.06) ≈ neutral-100) hier.
 *
 * DIE BESCHRIFTUNG MUSS HIER STEHEN, und sie muss BERECHNET sein.
 * `UHeader` setzt sie aus seiner EIGENEN Sprachdatei (`t('header.open')` aus
 * Nuxt UIs `useLocale()`) — auf der deutschen Seite stand deshalb „Open menu",
 * obwohl `marketing.nav.menu` seit jeher „Menü öffnen" sagt. Nuxt UIs Locale
 * hängt am `UApp`/`ui.locale`, nicht an @nuxtjs/i18n, und würde sich nur
 * app-weit umstellen lassen; die Seite hat den Text aber schon.
 * `v-bind` des `toggle`-Objekts steht im Bauteil NACH dem eigenen
 * `:aria-label`, überschreibt es also. Weil das Zeichen im offenen Zustand zum
 * Kreuz wird, wandert die Beschriftung mit: eine feste Zeichenkette hier
 * hieße, der Screenreader sagte am offenen Menü weiterhin „Menü öffnen".
 */
const TOGGLE_PROPS = computed(() => ({
  color: 'neutral' as const,
  variant: 'link' as const,
  'aria-label': mobileOpen.value ? t('marketing.nav.menuClose') : t('marketing.nav.menu'),
  class: 'size-[2.2rem] justify-center rounded-[0.55rem] p-0 text-highlighted hover:bg-elevated/70',
}))

const NAV_UI = {
  list: 'gap-1',
  // `.nav-link`: 0,95rem / 500 / --puka-ink-soft ≈ `text-toned` (in Paket 2
  // als Treffer belegt), Hover auf primary-600 — den Akzent-Ton auf hellem
  // Grund (seit 2026-08-08 puka-800, AA; vorher --puka-sun-deep). `py-0.5`
  // hält die Zeile auf den 27px des Bestands — die Vorgabe `py-1.5` machte die
  // ganze Leiste 23px höher.
  link: 'px-2.5 py-0.5 text-[0.95rem] font-medium text-toned hover:text-primary-600',
  linkTrailingIcon: 'size-[0.8rem]',
  // DIE BREITE DES AUSKLAPPERS STEHT AN DER PLATTE, NICHT AM INHALT.
  // Reka misst den Inhalt und schreibt das Ergebnis nach
  // `--reka-navigation-menu-viewport-width` — der Inhalt sitzt aber ABSOLUT in
  // genau dieser Platte, die Messung ist also zirkulär: gemessen kam 276px
  // heraus (die Breite der Menüleiste), der 23rem breite Inhalt lief unter
  // `overflow-hidden` heraus und die Beschreibungen waren abgeschnitten.
  // Mit dem festen Maß HIER und `w-full` am Inhalt fällt die Messung weg.
  // `min-w` UND NICHT `w`: die Vorgabe setzt die Breite als
  // `sm:w-(--reka-navigation-menu-viewport-width)`, und diese v4-Kurzform
  // erkennt tailwind-merge nicht als Breiten-Utility — beide Klassen blieben
  // stehen und die Reihenfolge in Tailwinds Ausgabe entschiede (live gemessen:
  // die Vorgabe gewann, die Platte blieb 276px schmal). `min-w` liegt in einer
  // anderen Gruppe, kollidiert also gar nicht erst.
  // `mt-4` = die 6px unter dem Menü bis zur Leistenkante plus die 0,65rem
  // Abstand des Bestands. Der Abstand hängt am WRAPPER, nicht am Panel: so
  // bleibt die Maus auf dem Weg nach unten im Menü und der Ausklapper schließt
  // nicht (der Bestand löste das mit `padding-top` an derselben Stelle).
  viewport: [
    'min-w-[23rem] max-w-[calc(100vw-2rem)]',
    'mt-4 rounded-[0.9rem] bg-(--puka-solid-bg)',
    'ring-[color:var(--puka-menu-edge)]',
    'shadow-[0_18px_40px_-20px_var(--puka-menu-shadow)]',
  ].join(' '),
  content: 'w-full',
}

const MOBILE_NAV_UI = {
  link: 'px-3 py-2.5 text-[0.95rem] font-semibold text-highlighted hover:text-primary-600',
  linkLeadingIcon: 'size-[1.05rem] text-primary-600 group-hover:text-primary-600',
  separator: 'my-2 bg-[color:var(--puka-menu-edge)]',
}
</script>

<template>
  <UHeader
    v-model:open="mobileOpen"
    :to="site.home()"
    :toggle="TOGGLE_PROPS"
    :ui="HEADER_UI"
  >
    <template #title>
      <PukaMark :size="26" />
      <span>Pukalani</span>
    </template>

    <!-- Standard-Slot = die MITTE der Leiste (Schreibtisch-Navigation). -->
    <UNavigationMenu
      v-model="openMenu"
      :items="desktopItems"
      :aria-label="t('marketing.nav.aria.main')"
      variant="link"
      content-orientation="vertical"
      trailing-icon="i-ph-caret-down-bold"
      :unmount-on-hide="false"
      :ui="NAV_UI"
    >
      <!--
        DER AUSKLAPPER WIRD VON HAND GEFÜLLT — und zwar wegen der
        Early-Access-Pillen. `UNavigationMenu` kennt eine `badge`-Eigenschaft
        nur für die OBERSTE Ebene; ein Kind rendert genau Icon, Titel und
        Beschreibung und hat dafür auch keinen Label-Slot. Die Pille wäre also
        nicht darstellbar, und sie ist keine Zierde: sie ist das Claim-Gate
        (§2.4) — Feed, Kurse und Events dürfen nicht wie fertige Produkte
        aussehen.
        Die Klassen kommen aus dem Bauteil selbst (`ui.childLink()` & Co.),
        damit Hover, Fokus und Abstände dieselben bleiben wie bei einem
        Nuxt-UI-Kind.
      -->
      <template #products-content="{ ui }">
        <ul :class="ui.childList()">
          <li v-for="product in PRODUCTS" :key="product.key" :class="ui.childItem()">
            <NuxtLink
              :to="productTo(product.key)"
              :class="ui.childLink({ active: false, class: 'gap-3 rounded-[0.6rem]' })"
              @click="openMenu = ''"
            >
              <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary-600">
                <UIcon :name="product.icon" class="size-[1.1rem]" />
              </span>
              <span :class="ui.childLinkWrapper()">
                <span :class="ui.childLinkLabel({ active: false, class: 'flex items-center gap-1.5 whitespace-normal font-bold text-[0.92rem] text-highlighted' })">
                  {{ t(`marketing.nav.products.items.${product.key}.title`) }}
                  <!-- LAYER-EIGENER SCHLÜSSEL (`marketing.nav.earlyAccess`,
                       nicht mehr `marketing.blocks.earlyAccess`): der
                       `blocks`-Teilbaum gehört der Marketing-App, dieser Layer
                       läuft aber auch anderswo. Ein Bauteil darf nur Schlüssel
                       rendern, die sein eigener Layer mitbringt — sonst steht
                       dort der ROHE Schlüssel (CLAUDE.md, `legal.imprint`). -->
                  <UBadge
                    v-if="product.ea"
                    color="primary" variant="subtle" size="sm"
                    class="rounded-[0.35rem] px-1.5 py-0 text-[0.62rem] font-extrabold uppercase tracking-[0.03em]"
                    :label="t('marketing.nav.earlyAccess')"
                  />
                </span>
                <span :class="ui.childLinkDescription({ active: false, class: 'block text-[0.8rem]/[1.4] text-toned' })">
                  {{ t(`marketing.nav.products.items.${product.key}.text`) }}
                </span>
              </span>
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              :to="blocksTarget"
              class="mt-1 flex items-center gap-1.5 border-t border-[color:var(--puka-menu-edge)] px-3 pb-1.5 pt-2.5 text-[0.85rem] font-bold text-primary-600 hover:underline"
              @click="openMenu = ''"
            >
              {{ t('marketing.nav.products.overview') }}
              <UIcon name="i-ph-arrow-right-bold" class="size-[0.85rem]" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
      </template>
    </UNavigationMenu>

    <template #right>
      <!-- „Anmelden" für Bestandskunden (U3) — bewusst `link`, siehe oben.
           `color="neutral"` + `variant="link"` trägt hier den Menü-Ton; der
           `ghost`-Vertrag aus app.config.ts wäre auf der hellen Leiste weiß
           (dieselbe Falle wie beim Umschalt-Knopf). -->
      <UButton
        :to="signIn"
        color="neutral"
        variant="link"
        size="sm"
        class="hidden md:inline-flex px-2.5 text-[0.95rem] font-medium text-toned hover:text-primary-600"
      >
        {{ t('marketing.nav.signIn') }}
      </UButton>
      <!-- Der Weg für Eingeladene, nur solange es ein Tor gibt (U2). Im Ton
           von „Anmelden" daneben: wer schon einen Code hat, sucht ihn, und wer
           keinen hat, soll nicht von zwei gleich lauten Knöpfen abgelenkt
           werden. -->
      <UButton
        v-if="gate.inviteRequired"
        :to="start"
        color="neutral"
        variant="link"
        size="sm"
        class="hidden md:inline-flex px-2.5 text-[0.95rem] font-medium text-toned hover:text-primary-600"
        @click="trackFunnel('funnel_cta_start', { gate: 'on', cta: 'code' })"
      >
        {{ t('marketing.nav.hasCode') }}
      </UButton>
      <!-- Derselbe Trichter-Punkt wie im Hero (U18): gezählt wird der
           EINSTIEG, nicht die Stelle. Die Eigenschaft `gate` hält fest, welche
           Beschriftung dabei gerade stand.
           `text-(--puka-cta-label)` STEHT EXPLIZIT HIER, obwohl der
           primary+solid-CompoundVariant der App (apps/marketing/app/
           app.config.ts) dieselbe Klasse setzt: der Layer darf sich auf den
           APP-Vertrag nicht verlassen — auf help.pukalani.app gibt es ihn
           nicht, und der CTA stünde dort weiß auf der Sonne (1,81:1, unter AA;
           die Kontrast-Rechnung steht bei --puka-cta-label in
           puka-theme.css). Auf pukalani.app ist die Klasse idempotent. -->
      <UButton
        v-if="gate.inviteRequired"
        :to="request"
        color="primary"
        size="sm"
        class="text-(--puka-cta-label)"
        @click="trackFunnel('funnel_cta_start', { gate: 'on', cta: 'request' })"
      >
        {{ t('marketing.nav.request') }}
      </UButton>
      <UButton
        v-else
        :to="start"
        color="primary"
        size="sm"
        class="text-(--puka-cta-label)"
        @click="trackFunnel('funnel_cta_start', { gate: 'off', cta: 'start' })"
      >
        {{ t('marketing.nav.start') }}
      </UButton>
    </template>

    <!-- Mobil: dieselben Ziele wie der <details>-Ausklapper des Bestands, in
         derselben Reihenfolge — sechs Produkte, Trenner, dann die vier
         Seiten-Anker. Ausgeklappt wird bewusst nichts: die Produkte sind hier
         flache Links, kein zweites Menü im Menü. -->
    <template #body>
      <UNavigationMenu
        :items="mobileItems"
        :aria-label="t('marketing.nav.aria.main')"
        orientation="vertical"
        variant="link"
        :ui="MOBILE_NAV_UI"
      />
    </template>
  </UHeader>
</template>
