/**
 * Die Kataloge der Marketing-Site: Slug-Listen und Zählwerte, die der SERVER
 * (sitemap.xml, robots.txt) und die APP (Seiten, Sektionen) gleichermaßen
 * kennen müssen.
 *
 * WARUM shared/ UND NICHT JE SEITE: bis 2026-07-30 stand dieselbe Wahrheit an
 * bis zu drei Stellen — die Slug-Listen in `server/utils/marketingRoutes.ts`
 * UND in den [slug]-Seiten, die FAQ-Anzahl in `FaqSection.vue`, in `/faq` und
 * auf der Startseite. Wer eine Seite oder eine Frage ergänzt, ohne die
 * Zwillinge zu kennen, liefert eine Sitemap ohne die neue Seite oder ein
 * JSON-LD ohne die neue Antwort. Beides fällt niemandem auf, weil nichts
 * kaputtgeht — es fehlt nur. `shared/` sieht der Server UND die App
 * (CLAUDE.md: Domain-Wahrheit gehört dorthin), also gibt es die Liste einmal.
 *
 * Reihenfolge ist Inhalt: sie bestimmt die Reihenfolge in Navigation und
 * Sitemap. Neue Seite ⇒ Slug hier eintragen UND die Route in
 * `server/utils/marketingRoutes.ts` ergänzen (dort steht die Priorität).
 */

/** Die zwei Sprachen dieser Site (i18n-Strategie `prefix_except_default`, EN Default). */
export type MarketingLocale = 'de' | 'en'

/**
 * KANONISCHE Produkt-Schlüssel — die Identität eines Produkts, NICHT seine URL.
 * Reihenfolge = Reihenfolge in Navigation, Fuß und Sitemap.
 *
 * Der Schlüssel ist zufällig auch der deutsche Slug, und das ist Geschichte,
 * kein Prinzip: die Seiten wurden auf Deutsch gebaut. Alles, was an einem
 * Produkt hängt, hängt am SCHLÜSSEL und wird nie mit umbenannt —
 * i18n-Texte (`marketing.products.items.<key>`, `marketing.nav.products.items.
 * <key>`), die OG-Bilder (`public/og/products-<key>-<locale>.jpg`) und die
 * Early-Access-Liste unten. Nur die URL ist übersetzt.
 */
export const PRODUCT_KEYS = ['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events', 'analytics'] as const

export type ProductKey = (typeof PRODUCT_KEYS)[number]

/**
 * Produkt-Seiten, LOKALISIERTE Slugs (Davids Entscheidung 2026-07-31):
 * EN `/products/<en>` · DE `/de/produkte/<de>`.
 *
 * Bis dahin war nur das SEGMENT übersetzt (`/products` ↔ `/produkte`) und der
 * Slug blieb in beiden Sprachen deutsch — ein englischer Besucher bekam
 * `/products/beitraege` und `/products/kurse`. Das ist keine Kosmetik: der
 * Slug ist der Teil der Adresse, den ein Mensch liest und den eine Suchmaschine
 * als Wort wertet.
 *
 * Drei Produkte heißen in beiden Sprachen gleich (moderation, branding,
 * events) — sie stehen trotzdem ausgeschrieben da, weil ein Eintrag mit nur
 * einer Sprache stillschweigend die andere erfände.
 *
 * `SlugTable<ProductKey>` (ein `Record`) statt `as const`: so ERZWINGT der Typ
 * einen Eintrag je Schlüssel — ein neues Produkt ohne Übersetzung ist ein
 * Typfehler und keine 404-Überraschung.
 */
export const PRODUCT_SLUGS: SlugTable<ProductKey> = {
  // Umzug 2026-08-04 (Davids Entscheidung): das Produkt heißt „Kommentare",
  // die URLs folgen dem Namen. Der KEY bleibt 'diskussionen' — Label ≠ Key
  // (dieselbe Regel wie beim Theme 'default'/„Aloha"): am Key hängen i18n-
  // Einträge und Early-Access-Zuordnungen, eine Key-Umbenennung zöge Pfade
  // nach sich, die erfahrungsgemäß liegen bleiben.
  diskussionen: { de: 'kommentare', en: 'comments' },
  moderation: { de: 'moderation', en: 'moderation' },
  branding: { de: 'branding', en: 'branding' },
  beitraege: { de: 'beitraege', en: 'posts' },
  kurse: { de: 'kurse', en: 'courses' },
  events: { de: 'events', en: 'events' },
  // Vierter Eintrag, der in beiden Sprachen gleich heißt: „Analytics" ist auch
  // im Deutschen das gebräuchliche Wort (so steht es im Produkt-Manifest und
  // im Dashboard). Keine routeRules-Weiterleitung nötig — die Seite ist neu,
  // es gab nie eine andere Adresse dafür.
  analytics: { de: 'analytics', en: 'analytics' },
}

/**
 * KANONISCHE Anwendungsfall-Schlüssel — dieselbe Bauart wie die Produkte:
 * Identität, nicht URL. Reihenfolge = Reihenfolge im Abschnitt „Für wen"
 * (AudienceSection), im Fuß und in der Sitemap.
 *
 * Auch hier ist der Schlüssel zufällig der deutsche Slug (die Seiten wurden auf
 * Deutsch gebaut) und bleibt es: an ihm hängen die i18n-Texte
 * (`marketing.audiencePages.items.<key>`) und die OG-Bilder
 * (`public/og/use-cases-<key>-<locale>.jpg`).
 */
export const AUDIENCE_KEYS = ['coaches', 'kurse', 'creator', 'vereine'] as const

export type AudienceKey = (typeof AUDIENCE_KEYS)[number]

/**
 * Anwendungsfall-Seiten, LOKALISIERTE Slugs (Davids Entscheidung 2026-07-31):
 * EN `/use-cases/<en>` · DE `/de/use-cases/<de>`.
 *
 * Das SEGMENT ist hier bewusst für beide Sprachen dasselbe (`/use-cases`,
 * Entscheidung 2026-07-30 — „use case" ist auch im Deutschen geläufig); nur der
 * Slug ist jetzt übersetzt. Ein englischer Besucher bekam bis dahin
 * `/use-cases/kurse` und `/use-cases/vereine` — deutsche Wörter im Teil der
 * Adresse, den ein Mensch liest und eine Suchmaschine als Wort wertet.
 *
 * `coaches` heißt in beiden Sprachen gleich und steht trotzdem ausgeschrieben
 * da: ein Eintrag mit nur einer Sprache erfände stillschweigend die andere.
 */
export const AUDIENCE_SLUGS: SlugTable<AudienceKey> = {
  coaches: { de: 'coaches', en: 'coaches' },
  kurse: { de: 'kurse', en: 'course-creators' },
  creator: { de: 'creator', en: 'creators' },
  vereine: { de: 'vereine', en: 'clubs' },
}

/**
 * Die Locale von @nuxtjs/i18n kommt als `string` (der Typ kennt beliebige
 * Codes). Diese Site hat genau zwei, und EN ist die Default-Locale — alles,
 * was nicht 'de' ist, ist hier also 'en'.
 */
export function marketingLocale(locale: string): MarketingLocale {
  return locale === 'de' ? 'de' : 'en'
}

/**
 * DIE ÜBERSETZUNG STEHT EINMAL, die Kataloge sind austauschbar: Produkte und
 * Anwendungsfälle rechnen identisch (Schlüssel ⇄ Slug je Sprache), sie
 * unterscheiden sich nur in der Tabelle. Die beiden Helfer darunter sind
 * deshalb generisch, und was je Katalog exportiert wird, sind nur benannte
 * Einstiege mit dem richtigen Schlüssel-TYP — eine zweite Kopie der Logik hätte
 * sonst irgendwann eine dritte, die sich anders verhält.
 */
type SlugTable<Key extends string> = Readonly<Record<Key, Readonly<Record<MarketingLocale, string>>>>

function localizedSlug<Key extends string>(table: SlugTable<Key>, key: Key, locale: string): string {
  return table[key][marketingLocale(locale)]
}

/**
 * Slug DIESER Sprache → Schlüssel; `undefined` heißt 404.
 *
 * Bewusst streng je Sprache: `/products/kurse` (deutscher Slug auf der
 * englischen Seite) ist KEIN Treffer — die Seite leitet von dort auf
 * `/products/courses` weiter (`matchSlug` unten). Würde hier beides gelten,
 * gäbe es dieselbe Seite unter zwei URLs (Duplicate Content).
 *
 * Die Schlüssel-Liste kommt als Argument dazu (statt `Object.keys(table)`):
 * so bleibt die deklarierte Reihenfolge der Katalog-Wahrheit erhalten und der
 * Rückgabetyp ist der Schlüssel-Typ, nicht `string`.
 */
function keyForSlug<Key extends string>(
  table: SlugTable<Key>,
  keys: readonly Key[],
  slug: string,
  locale: string,
): Key | undefined {
  const wanted = marketingLocale(locale)
  return keys.find(key => table[key][wanted] === slug)
}

/**
 * Wohin gehört der Name aus der Adresse? (Q03, 2026-11-20)
 *
 * Drei Antworten:
 *  - der Name gehört zur Sprache der Seite ⇒ `redirect: false`, die Seite
 *    zeigt sich,
 *  - der Name gehört zur ANDEREN Sprache ⇒ `redirect: true` und `slug` nennt
 *    den Namen der Sprache der Seite; die Seite leitet dorthin weiter,
 *  - der Name ist unbekannt ⇒ `undefined`, also 404.
 *
 * WARUM: die Sprach-Erkennung (`redirectOn: 'all'`) schickt einen deutschen
 * Browser von `/products/posts` auf `/de/produkte/posts`. Sie übersetzt nur
 * den festen Teil der Adresse, weil sie läuft, bevor die Seite geladen ist und
 * den Namen übersetzen könnte. Bis dahin endete jeder so geöffnete Link auf
 * einer Fehlerseite. Die Seite bleibt dabei unter GENAU EINER Adresse je
 * Sprache erreichbar: der fremde Name zeigt nichts, er leitet nur weiter.
 */
export interface SlugMatch<Key extends string> {
  key: Key
  /** Der Name in der Sprache der Seite. */
  slug: string
  /** Die Adresse trug den Namen der anderen Sprache. */
  redirect: boolean
}

function matchSlug<Key extends string>(
  table: SlugTable<Key>,
  keys: readonly Key[],
  slug: string,
  locale: string,
): SlugMatch<Key> | undefined {
  const own = keyForSlug(table, keys, slug, locale)
  if (own) return { key: own, slug, redirect: false }
  const other: MarketingLocale = marketingLocale(locale) === 'de' ? 'en' : 'de'
  const foreign = keyForSlug(table, keys, slug, other)
  if (!foreign) return undefined
  return { key: foreign, slug: localizedSlug(table, foreign, locale), redirect: true }
}

/** Produkt-Seite: Name aus der Adresse → Treffer, Weiterleitung oder 404. */
export function matchProductSlug(slug: string, locale: string): SlugMatch<ProductKey> | undefined {
  return matchSlug(PRODUCT_SLUGS, PRODUCT_KEYS, slug, locale)
}

/** Anwendungsfall-Seite: Name aus der Adresse → Treffer, Weiterleitung oder 404. */
export function matchAudienceSlug(slug: string, locale: string): SlugMatch<AudienceKey> | undefined {
  return matchSlug(AUDIENCE_SLUGS, AUDIENCE_KEYS, slug, locale)
}

/** Produkt-Schlüssel → Slug DIESER Sprache (Link-Ziele, Sitemap). */
export function slugForLocale(key: ProductKey, locale: string): string {
  return localizedSlug(PRODUCT_SLUGS, key, locale)
}

/** Produkt-Slug DIESER Sprache → Schlüssel; `undefined` heißt 404. */
export function keyFromSlug(slug: string, locale: string): ProductKey | undefined {
  return keyForSlug(PRODUCT_SLUGS, PRODUCT_KEYS, slug, locale)
}

/** Anwendungsfall-Schlüssel → Slug DIESER Sprache (Link-Ziele, Sitemap). */
export function audienceSlugForLocale(key: AudienceKey, locale: string): string {
  return localizedSlug(AUDIENCE_SLUGS, key, locale)
}

/** Anwendungsfall-Slug DIESER Sprache → Schlüssel; `undefined` heißt 404. */
export function audienceKeyFromSlug(slug: string, locale: string): AudienceKey | undefined {
  return keyForSlug(AUDIENCE_SLUGS, AUDIENCE_KEYS, slug, locale)
}

/**
 * DIE FESTEN SEITEN DER MARKETING-SITE, je Sprache als FERTIGER Pfad.
 *
 * WARUM ES DIESE TABELLE ÜBERHAUPT GIBT: auf pukalani.app löst der Chrome
 * seine Ziele über Route-NAMEN auf (`localePath({ name: 'faq' })`) — das ist
 * die genauere Rechnung und bleibt dort auch so. Auf JEDER ANDEREN App
 * (help.pukalani.app) gibt es diese Routen nicht; der Kopf braucht dort eine
 * absolute URL, und für die muss der Pfad je Sprache irgendwo stehen.
 *
 * DIE WERTE SIND ABGESCHRIEBEN, NICHT ERFUNDEN: jeder Eintrag stammt aus dem
 * `defineI18nRoute`-Block der jeweiligen Seite in `app/pages/` (dort ohne
 * `/de`-Präfix notiert — das setzt @nuxtjs/i18n selbst, hier steht es
 * ausgeschrieben, weil eine absolute URL fertig sein muss). Weil eine
 * abgeschriebene Wahrheit auseinanderläuft, hält ein Wächter sie zusammen:
 * `apps/marketing/tests/marketingPagePaths.test.ts` liest die Seiten und
 * vergleicht — und prüft zusätzlich gegen die Sitemap-Liste
 * (`server/utils/marketingRoutes.ts`), wo dieselben Pfade ein zweites Mal
 * stehen müssen.
 *
 * NEUE SEITE IM CHROME ⇒ Eintrag hier UND `defineI18nRoute` in der Seite.
 */
export const MARKETING_PAGE_PATHS = {
  faq: { en: '/faq', de: '/de/faq' },
  glossar: { en: '/glossary', de: '/de/glossar' },
  wechseln: { en: '/switch', de: '/de/wechseln' },
  dsgvo: { en: '/gdpr', de: '/de/dsgvo' },
  datenschutz: { en: '/privacy', de: '/de/datenschutz' },
  impressum: { en: '/imprint', de: '/de/impressum' },
  agb: { en: '/terms', de: '/de/agb' },
  'betreiber-bedingungen': { en: '/community-operator-terms', de: '/de/betreiber-bedingungen' },
} as const satisfies Readonly<Record<string, Readonly<Record<MarketingLocale, string>>>>

/**
 * Der Schlüssel IST der Dateiname der Seite unter `app/pages/` — daran hängt
 * auch der Route-Name, über den der interne Modus auflöst. Beide Modi lesen
 * damit dieselbe Liste, und ein Tippfehler ist ein Typfehler.
 */
export type MarketingPageName = keyof typeof MARKETING_PAGE_PATHS

/**
 * Bausteine, die noch NICHT im offenen Angebot sind (§2.4). Ihre Seiten
 * tragen den Early-Access-Banner und KEINEN Kauf-CTA.
 *
 * Am kanonischen SCHLÜSSEL, nicht am Slug: ein Claim-Gate darf nicht davon
 * abhängen, in welcher Sprache die Seite gerade aufgerufen wurde.
 */
export const EARLY_ACCESS_KEYS: readonly ProductKey[] = ['beitraege', 'kurse', 'events']

/** Vergleichsseiten: /vs/<slug> · /de/vs/<slug>. */
export const VS_SLUGS = ['circle', 'skool', 'mighty-networks'] as const

/**
 * Anzahl der FAQ-Einträge (`marketing.faq.items.0…n-1` in beiden Locales).
 * Gelesen von `FaqSection.vue` (sichtbare Liste) und `/faq` (JSON-LD — seit
 * SEO-008 nur noch dort): das sichtbare Element und seine strukturierten Daten
 * MÜSSEN deckungsgleich sein — Google verlangt, dass eine ausgezeichnete
 * Antwort auch im Seiteninhalt steht.
 */
export const FAQ_COUNT = 7

export type VsSlug = (typeof VS_SLUGS)[number]

/**
 * Die Gebühren-Rechnung (U17/E9) — der Datensatz hinter `FeeCalculator.vue`.
 *
 * JEDE ZAHL STAMMT AUS `docs/archiv/audits/2026-08-09-wettbewerb-benchmark.md`
 * (Abschnitt 1 Kurzprofile + Tabelle 2.1, Erhebungstag 2026-08-10) und trägt
 * ihre Quelle mit. Nichts hier ist geschätzt, umgerechnet oder aus dem
 * Gedächtnis ergänzt — wer eine Zahl ändert, ändert zuerst den Beleg.
 *
 * WARUM `shared/` UND NICHT IN DER KOMPONENTE: dieselbe Regel wie bei
 * VS_SLUGS und FAQ_COUNT — die Sätze sind Domänen-Wahrheit, sie werden von
 * einem Unit-Test gelesen (tests/feeBenchmark.test.ts) und sollen nicht in
 * einem Template versauern. Die NAMEN der Anbieter stehen bewusst hier und
 * nicht in i18n: Eigennamen werden nicht übersetzt (dieselbe Regel wie bei
 * den Theme-Namen).
 *
 * WARUM DER GRUNDPREIS NICHT MITGERECHNET WIRD: er steht in vier Währungs-
 * und Steuer-Welten (89 $ netto, 99 $ netto, 19 € netto, 149 € brutto). Eine
 * Summe daraus bräuchte einen Wechselkurs und einen Steuersatz, die der
 * Benchmark nicht hergibt — sie wäre erfunden. Der Rechner zeigt deshalb
 * GENAU die Größe, die mit der Community wächst: die Plattform-Gebühr. Die
 * Grundpreise stehen daneben als Angabe, nicht als Summand.
 */
export interface FeeProvider {
  /** Stabiler Schlüssel; bei den drei Vergleichsseiten identisch mit dem VS_SLUG. */
  key: string
  /** Eigenname des Anbieters — nicht übersetzt. */
  name: string
  /** Plattform-Gebühr als Anteil am Mitglieder-Umsatz (0.02 = 2 %). */
  rate: number
  /** Der Plan, für den dieser Satz gilt — sonst wäre die Zahl ohne Bezug. */
  plan: string
  /** Grundpreis dieses Plans, WÖRTLICH wie erhoben (inkl. Währung). */
  base: string
  /** Beleg-URL aus dem Benchmark. */
  source: string
}

/**
 * Reihenfolge = aufsteigender Satz. Die drei Anbieter mit eigener
 * Vergleichsseite stehen zwingend drin (sonst zeigte `/vs/skool` einen
 * Rechner ohne Skool); Heartbeat und coapp kommen aus E9 dazu — coapp, weil
 * es der deutsche Nachbar und mit 15 % der Ausreisser nach oben ist.
 */
export const FEE_PROVIDERS: readonly FeeProvider[] = [
  { key: 'circle', name: 'Circle', rate: 0.02, plan: 'Professional', base: '89 $', source: 'https://circle.so/pricing' },
  { key: 'mighty-networks', name: 'Mighty Networks', rate: 0.02, plan: 'Launch', base: '95 $', source: 'https://www.mightynetworks.com/pricing' },
  { key: 'skool', name: 'Skool', rate: 0.029, plan: 'Pro', base: '99 $', source: 'https://www.skool.com/pricing' },
  { key: 'heartbeat', name: 'Heartbeat', rate: 0.05, plan: 'Build', base: '49 $', source: 'https://www.heartbeat.chat/pricing' },
  { key: 'coapp', name: 'coapp', rate: 0.15, plan: 'Starter', base: '19 €', source: 'https://www.coapp.io/preise' },
] as const

/**
 * Beleg für den kumulierten Satz („8 bis 14 Prozent", Benchmark K3). Er steht
 * NEBEN den Anbieter-Quellen, weil er etwas anderes misst: nicht die Gebühr
 * EINES Anbieters, sondern Plattform-Gebühr plus Zahlungsabwicklung zusammen.
 * Ohne eigene Quellenangabe wäre es die einzige Zahl des Abschnitts ohne Beleg.
 */
export const FEE_CUMULATIVE_SOURCE = {
  name: 'wbcomdesigns',
  href: 'https://wbcomdesigns.com/mighty-networks-circle-skool-wordpress-cost/',
} as const

/** Vorbelegung des Rechners (U17): 300 Mitglieder à 20 € im Monat. */
export const FEE_DEFAULT_MEMBERS = 300
export const FEE_DEFAULT_CONTRIBUTION = 20

/**
 * Grenzen der beiden Eingabefelder. Ganzzahlig, damit SSR und Client dasselbe
 * rechnen.
 *
 * SCHRITTWEITE 1, OBWOHL DIE PFEILE DAMIT LANGSAM SIND: `UInputNumber` rastet
 * eine GETIPPTE Zahl auf `min + n × step` ein — mit Schritt 10 wurde aus „437
 * Mitglieder" beim Verlassen des Feldes stillschweigend 440 (am 2026-08-12 im
 * Browser nachgemessen). Das Feld steht hier aber genau dafür, dass jemand
 * seine EIGENE Zahl einträgt; ein Raster, das sie heimlich verschiebt, nimmt
 * dem Rechner seinen Zweck.
 */
export const FEE_MEMBERS_MIN = 10
export const FEE_MEMBERS_MAX = 2000
export const FEE_MEMBERS_STEP = 1
export const FEE_CONTRIBUTION_MIN = 1
export const FEE_CONTRIBUTION_MAX = 100
export const FEE_CONTRIBUTION_STEP = 1

/** Der feste Pro-Preis, gegen den gerechnet wird (Stripe-Katalog, brutto). */
export const FEE_PUKALANI_MONTHLY = 149

/**
 * Die EINE Rechnung. Pur und ohne Rundung im Zwischenschritt — gerundet wird
 * erst bei der Anzeige durch `n()`, sonst weicht die Jahressumme von zwölf
 * Monatswerten ab.
 */
export function monthlyFee(revenue: number, rate: number): number {
  return revenue * rate
}
