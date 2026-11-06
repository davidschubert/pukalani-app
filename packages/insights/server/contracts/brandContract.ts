/**
 * DER VERTRAG ZUM brand-LAYER — die EINZIGE Stelle im insights-Layer, die
 * über die Paketgrenze greift (CONCEPT A14; Plan docs/plans/BRAND-INSIGHTS.md
 * §9.1 Nr. 2 und §11 Frage 1: „eigener Layer `insights`, `requires:
 * ['brand']`, genau EIN Vertrag zum brand-Layer").
 *
 * ── WARUM SIE IN `server/contracts/` LIEGT UND NICHT IN `server/utils/` ───
 * Nitro AUTO-IMPORTIERT `server/utils` — jeder Name daraus steht in jeder
 * Server-Datei der App zur Verfügung. Läge diese Datei dort, wären ihre
 * Re-Exporte (`fetchBrandSite`, `loadBrandCheckRow`, …) plötzlich ZWEIMAL im
 * Auto-Import: einmal aus `packages/brand/server/utils`, einmal von hier.
 * Nitro meldet das („Duplicated imports") und entscheidet zugunsten des
 * SPÄTEREN Layers — der brand-Layer riefe seine eigenen Funktionen dann über
 * den Umweg dieses Vertrags auf. Heute zeigen beide Namen auf dasselbe, aber
 * eine Schattierung, die niemand beabsichtigt hat, ist genau die Sorte
 * Kopplung, die dieser Vertrag verhindern soll. `server/contracts` wird nicht
 * gescannt: wer hier etwas will, importiert es ausdrücklich.
 *
 * (Der market-Layer hat dieselbe Datei am selben Ort, aus derselben
 * Begründung. Zwei Verträge zum selben Layer sind kein Widerspruch: jeder
 * beschreibt, was SEIN Layer von brand erwartet — und genau das ist der Sinn
 * der Datei.)
 *
 * ── WARUM EINE DATEI UND NICHT ZWANZIG IMPORTE ───────────────────────────
 * Nitros Auto-Import endet an der Layer-Grenze: `fetchBrandSite` ist in
 * insights-Code NICHT einfach da. Der technisch mögliche Weg wäre, überall
 * dort relativ zu springen, wo man etwas braucht — und dann ist die Kopplung
 * WIEDER implizit, nur eben verteilt auf zwanzig Dateien, und niemand kann
 * mehr in einem Blick sagen, was insights von brand erwartet. Diese Datei IST
 * die Antwort auf diese Frage: was hier nicht steht, benutzt insights nicht.
 * Jeder spätere insights-Server-Code importiert AUSSCHLIESSLICH von hier.
 *
 * ── DIE RICHTUNG IST EINSEITIG, UND `market` KOMMT NICHT VOR ─────────────
 * `brand` kennt `insights` nicht und darf es nicht (der PRODUCTS-Block in
 * eslint.config.mjs gilt für `packages/brand/**` unverändert). Und `insights`
 * kennt `market` nicht: zwei Produkt-Layer nebeneinander importieren einander
 * nie (CONCEPT A14). Genau deshalb sind `evidenceIsGrounded` und der
 * Herabsetzungs-/Namensfilter mit Paket I1a nach `packages/core/shared`
 * gezogen — `insights` liest sie dort, nicht bei `market` (§11.2 Frage 1).
 *
 * ── RELATIVE PFADE ÜBER DIE PAKETGRENZE FUNKTIONIEREN ────────────────────
 * Im Repo längst üblich (`packages/admin/server/utils/userStatsCache.ts` zieht
 * `createMicrocache` aus core): Nitro bündelt die Datei mit, weil sie über den
 * DATEIPFAD aufgelöst wird und nicht über die `node_modules`-Auflösung des
 * Pakets. Die ESLint-Sperre gegen Cross-Layer-Importe
 * (`pukalani/no-cross-layer-relative`) kennt dafür seit I1 einen benannten
 * Block für `packages/insights/**` — eine AUSNAHME MIT NAMEN statt einer
 * stillen Lücke.
 *
 * ── WAS HIER BEWUSST NICHT STEHT ─────────────────────────────────────────
 * Alles Schreibende. `insights` LIEST den brand-Layer: es rechnet keinen
 * Score, stösst keinen Check an (anders als `market`, wo §7.3 es ausdrücklich
 * verlangt), schreibt keinen Befund und legt keine Veröffentlichung an. Ein
 * Re-Export, hinter dem kein Aufrufer steht, wäre eine Abhängigkeit ohne
 * Gegenleistung — und ein schreibender Zugriff auf eine KUNDEN-Tabelle aus
 * einer Redaktion über FREMDE Marken wäre die Vermischung, wegen der dieser
 * Layer überhaupt eigenständig ist (§9.1 Nr. 1).
 * Ebenso fehlt `brand_profiles`: die Redaktion hat keinen Eigentümer, dessen
 * Branding sie prüfen müsste, und `loadOwnedProfile` hätte hier niemanden zu
 * fragen. Die Verknüpfung zu einer KUNDEN-Marke läuft über die Spalte
 * `insights_brands.publicationId` (§9.3) und wird in I3 über die öffentliche
 * Veröffentlichung aufgelöst — nicht über das private Branding.
 */

// ── 1. Der Brand-Check: Score, Band, acht Kategorien (§9.1 Nr. 2 a) ────────
/**
 * Ein Markenprofil zeigt den Score der Marke — den BESTEHENDEN aus
 * `brand_checks`, keine zweite Zahl (Entscheidung 7: „keine zweite Skala,
 * kein Insights-Score"). Gebraucht werden drei Dinge und nicht mehr:
 *
 *  · `loadBrandCheckRow` — eine Check-Zeile über ihre Id. Die Spalte
 *    `insights_brands.checkId` (§9.3) zeigt genau darauf.
 *  · `findBrandCheckForUrl` — der Weg von der HOMEPAGE einer fremden Marke
 *    zum jüngsten Check, wenn noch keine `checkId` gesetzt ist.
 *  · `BRAND_CHECK_CATEGORIES` — die acht Kategorien in der Reihenfolge der
 *    Methodik, für die Beschriftung des Steckbriefs.
 *
 * `BRAND_CHECKS_TABLE` reist mit, weil `verify-schema-parity` und spätere
 * Lese-Abfragen denselben Namen meinen müssen wie der brand-Layer.
 *
 * `brandCheckCategoryScores` kam mit I3 dazu: die Spalte `brand_checks.categories`
 * trägt ROHWERTE (`raw` von `assessable` Kriterien), nicht Prozente — die
 * Umrechnung auf 0–100 ist eine Regel des Brand-Checks und keine Division, die
 * ein zweiter Layer nachbaut. Genau dieselbe Funktion liest schon
 * `toDiscoverCategories` im brand-Layer; zwei Rechnungen ergäben für dieselbe
 * Marke zwei Balken unterschiedlicher Länge auf `/discover/<slug>` und
 * `/brands/<slug>`. `score: null` heisst dort „nicht bewertbar" (die Kategorie
 * war gesperrt) und NICHT „null Punkte" — der Aufrufer lässt sie weg.
 */
export { loadBrandCheckRow } from '../../../brand/server/utils/brandCheckAdmin'
export { BRAND_CHECKS_TABLE } from '../../../brand/server/utils/brandStore'
export type { BrandCheckRow } from '../../../brand/server/utils/brandStore'
export { findBrandCheckForUrl } from '../../../brand/server/utils/brandCheckLookup'
export type { BrandCheckLookupResult } from '../../../brand/server/utils/brandCheckLookup'
export { BRAND_CHECK_CATEGORIES, brandCheckCategoryScores } from '../../../brand/shared/brandCheck'
export type { BrandCheckCategory, BrandCheckCategoryKey, BrandCheckCategoryScore } from '../../../brand/shared/brandCheck'

// ── 2. Die Farbwelt (§9.1 Nr. 2 b) ─────────────────────────────────────────
/**
 * Der Farbwelt-Hero eines Markenprofils (§9.10, Bildschirm „Profil") nimmt
 * denselben Verlauf, den der Wizard einer Marke gibt: `brandGradientFor(seed)`
 * rechnet ihn aus einem Startwert, `brandPaletteId`/`brandPaletteName`
 * benennen ihn, `BRAND_PALETTES` ist der Katalog dahinter.
 *
 * Eine eigene Palette im insights-Layer wäre die zweite Wahrheit über
 * dieselbe Farbe: dieselbe Marke sähe im Kunden-Wizard anders aus als im
 * redaktionellen Profil — und der Leser hätte keine Möglichkeit zu erkennen,
 * welche der beiden gemeint ist.
 */
export { BRAND_PALETTES, brandGradientFor, brandPaletteId, brandPaletteName } from '../../../brand/shared/brandPalette'
export type { BrandGradient, BrandPalette } from '../../../brand/shared/brandPalette'

// ── 3. Der Archetyp-Katalog (§9.1 Nr. 2 c) ─────────────────────────────────
/**
 * `insights_brands.archetype` und `archetypeSecondary` (§9.3) tragen
 * SCHLÜSSEL aus demselben Katalog, den der Wizard benutzt — nicht freien Text.
 * Der Grund ist derselbe wie bei der Farbwelt: „Der Held" muss im Profil
 * dasselbe heissen wie im Wizard, sonst sind es zwei Begriffe. Der Katalog
 * gehört dem brand-Layer, weil dort die Gesprächsregeln daran hängen.
 */
export { BRAND_ARCHETYPES } from '../../../brand/shared/brandChoiceOptions'
export type { BrandChoiceOption } from '../../../brand/shared/brandChoiceOptions'

// ── 4. Der Branchen-Katalog (§9.1 Nr. 2, §9.3 „industry") ──────────────────
/**
 * `insights_brands.industry` kommt „aus dem 16er-Katalog des Brand-Checks"
 * (§9.3) — wörtlich derselbe, gegen den der Check seine Zuordnung prüft und
 * über den das öffentliche Ranking filtert. `BRAND_INDUSTRIES` ist der
 * Katalog mit Beschriftung, `BRAND_INDUSTRY_VALUES` die reine Werteliste für
 * eine Prüfung.
 *
 * Ein eigener Branchen-Katalog hier hiesse, dass eine Marke im Ranking unter
 * „Gastronomie" und im Profil unter „Food & Beverage" stünde — und dass ein
 * Filter, der beide Listen verbindet, still die Hälfte verlöre.
 */
export { BRAND_INDUSTRIES, BRAND_INDUSTRY_VALUES } from '../../../brand/shared/brandIndustries'
export type { BrandIndustry } from '../../../brand/shared/brandIndustries'

// ── 5. Die Slug-Regel (§9.1 Nr. 2 e, §9.2) ─────────────────────────────────
/**
 * `brandPublicationSlug` macht aus einem Titel eine Adresse (Umlaute,
 * Diakritika, Deckel 80), `brandPublicationSlugCandidate` den nächsten
 * Versuch bei einer Kollision. BEIDE Marken-Namensräume benutzen dieselbe
 * Funktion — `/discover/<slug>` (Kunde) und `/brands/<slug>` (Redaktion) —,
 * und das ist der ganze Punkt von §9.2: „Geteilt wird nur die FUNKTION
 * `brandPublicationSlug` über den Vertrag — nie der Index."
 *
 * Zwei Slug-Funktionen wären zwei Wahrheiten über dieselbe Adresse: dieselbe
 * Marke bekäme unter `/discover/` und unter `/brands/` verschiedene Slugs,
 * sobald sich eine der beiden Regeln ändert.
 *
 * NICHT geteilt wird der Deckel `BRAND_PUBLICATION_SLUG_MAX` (80) gegen die
 * Spaltengrösse 160 aus §9.3: die Spalte ist bewusst grosszügiger als die
 * Funktion, damit ein von Hand gesetzter Slug Platz hat.
 */
export { brandPublicationSlug, brandPublicationSlugCandidate } from '../../../brand/shared/brandPublication'

// ── 6. Der SSRF-feste Abruf samt robots.txt und Nutzungsvorbehalt (§9.1 f) ─
/**
 * EINE Wahrheit über „welche Adresse darf der Server überhaupt holen".
 *
 * Die Recherche für ein Markenprofil liest die Website der fremden Marke —
 * dieselbe Bewegung, die der Brand-Check und der Marktvergleich machen, und
 * damit dieselbe Gefahr (SSRF, interne Adressen, Umleitungsketten). Ein
 * zweiter SSRF-Schutz im insights-Layer wäre genau der Fehler, gegen den der
 * market-Vertrag warnt: „sonst gibt es zwei SSRF-Schutze, die auseinander
 * laufen". `fetchBrandSite` holt eine Seite, `crawlBrandPage`/
 * `crawlBrandSitemap`/`crawlBrandTextResource` die ausgewerteten Mehrseiten;
 * das rohe HTML bleibt im brand-Layer (`fetchBrandDocument` steht deshalb
 * BEWUSST nicht in dieser Liste).
 *
 * DER ABSENDER REIST MIT. Wer eine `robots.txt` gegen einen anderen Namen
 * prüft als den, mit dem er anfragt, prüft nichts — Absender und Prüfung
 * gehören deshalb in denselben Vertrag. Heute sind das
 * `BRAND_MARKET_USER_AGENT`/`BRAND_MARKET_BOT_TOKEN`; sie tragen den Namen
 * ihres ersten Nutzers, nicht den einer Regel. OB die Redaktion einen EIGENEN
 * Absender bekommt (`PukalaniInsightsBot`), entscheidet I2 zusammen mit dem
 * ersten echten Abruf — es ist eine Änderung im brand-Layer (eine Konstante
 * und ein Eintrag in die Absenderliste) und gehört an die Stelle, an der man
 * sie auch benutzt. Bis dahin steht hier der Absender, der GEPRÜFT wird.
 *
 * ROBOTS UND TDM (BS1 R2b) sind pure Regeln in `brand/shared/` und kommen
 * mit: `parseBrandRobots` liest die Datei, `brandRobotsAllows` beantwortet
 * „dürfen WIR diesen Pfad", `BRAND_ROBOTS_ABSENT` ist der Fall „es gibt
 * keine", `brandTdmReserved` liest den Nutzungsvorbehalt. Eine Redaktion, die
 * fremde Websites liest, ohne beides zu achten, wäre ein Rechtsproblem des
 * Betreibers und kein Feature.
 */
export { BrandSiteFetchError, fetchBrandSite } from '../../../brand/server/utils/brandSiteFetch'
export type { BrandSiteFetchResult } from '../../../brand/server/utils/brandSiteFetch'
export {
  BRAND_MARKET_BOT_TOKEN,
  BRAND_MARKET_USER_AGENT,
  crawlBrandPage,
  crawlBrandSitemap,
  crawlBrandTextResource,
} from '../../../brand/server/utils/brandSiteCrawl'
export type { BrandCrawledPage, BrandCrawledText } from '../../../brand/server/utils/brandSiteCrawl'
export { BRAND_ROBOTS_ABSENT, brandRobotsAllows, parseBrandRobots } from '../../../brand/shared/brandRobots'
export type { BrandRobots } from '../../../brand/shared/brandRobots'
export { brandTdmReserved } from '../../../brand/shared/brandTdm'
export type { BrandTdmSignals } from '../../../brand/shared/brandTdm'

/**
 * DER ABRUF MIT ERLAUBNIS — und warum I2 nicht `fetchBrandSite` nimmt.
 *
 * §9.4 verlangt für die Beleg-Prüfung „den SSRF-festen Abruf des brand-Layers
 * (inkl. `robots.txt` und TDM-Vorbehalt seit BS1 R2b)". `fetchBrandSite`
 * leistet die erste Hälfte davon und die zweite ausdrücklich NICHT: es ist der
 * Weg des WIZARDS, der die Website liest, die ihr eigener Betreiber selbst
 * eingetragen hat — dort trägt die Begründung, `robots.txt` nicht zu fragen
 * (Kopf von `brandCheckFetch.ts`).
 *
 * Die Redaktion ist der andere Fall, wörtlich der des Brand-Checks: sie liest
 * eine BELIEBIGE fremde Adresse, die niemand ihr angeboten hat. Also gilt
 * dieselbe Reihenfolge — erst fragen, dann lesen. `fetchBrandSiteForCheck`
 * holt `robots.txt` und `.well-known/tdmrep.json` VOR der Seite und wirft
 * `BrandSiteBlockedError` mit `reason: 'robots' | 'tdm'`; der Aufrufer fängt
 * sie ZUERST (vor `BrandSiteFetchError`).
 *
 * ── DER ABSENDER BLEIBT DER DES CHECKS, UND ZWAR MIT GRUND ───────────────
 * Abschnitt 6 stellte I2 die Frage, ob die Redaktion einen EIGENEN Absender
 * bekommt (`PukalaniInsightsBot`). Antwort für I2: NEIN. Ein neuer Absender
 * wäre eine Änderung im brand-Layer (Konstante, Bot-Token, Absenderliste,
 * Prüfpfad) — und der Gewinn wäre nur ein Name im Log. Was ZÄHLT, ist die
 * Zusage „wer eine `robots.txt` gegen einen anderen Namen prüft als den, mit
 * dem er anfragt, prüft nichts", und die hält `fetchBrandSiteForCheck` von
 * sich aus: es fragt und prüft mit demselben Token. Sobald ein Betreiber
 * `PukalaniInsightsBot` in seiner `robots.txt` getrennt behandeln können soll,
 * gehört der Absender dazu — dann aber im brand-Layer, wo die Liste lebt.
 */
export { BrandSiteBlockedError } from '../../../brand/server/utils/brandCheckFetch'
export type { BrandCheckBlockedReason } from '../../../brand/server/utils/brandCheckFetch'
export { fetchBrandSiteForCheck } from '../../../brand/server/utils/brandCheckFetch'

// ── 7. Die KI-Klinke und das ZDR-Routing (§9.4, BI1 I2) ────────────────────
/**
 * ZWEI DINGE, OHNE DIE IM insights-LAYER KEIN MODELL GERUFEN WIRD.
 *
 * ── `readBrandAiEnabled` — DIE KLINKE, FAIL-CLOSED ───────────────────────
 * `app_config.global.brandAiEnabled` ist die Not-Abschaltung ALLER Modell-
 * Läufe dieser Instanz. Die Redaktion hängt bewusst an DERSELBEN Klinke und
 * bekommt keine zweite: wer die KI auf `branding.supply` abschaltet, will sie
 * abgeschaltet haben — ein Schalter, der die Hälfte der Läufe stehen lässt,
 * ist keiner. Sie ist fail-closed (jeder Lesefehler heisst „aus"), und das ist
 * die richtige Richtung: eine unlesbare Konfiguration darf keinen Anbieter-
 * Aufruf auslösen.
 *
 * Der NAME bleibt `brandAiEnabled`, obwohl er jetzt zwei Layer bedient. Ihn
 * umzubenennen hiesse, eine Spalte auf einer laufenden Instanz zu wandern —
 * für ein Wort. Was er bedeutet, steht hier.
 *
 * ── `BRAND_PROVIDER_ROUTING` — DIE DATENSCHUTZ-BEDINGUNGEN ───────────────
 * `zdr: true`, `dataCollection: 'deny'`, `allowFallbacks: false`. Ohne
 * `allowFallbacks: false` weicht OpenRouter bei Last auf einen Anbieter
 * AUSSERHALB dieser Bedingungen aus, und der Lauf gelänge — mit genau dem
 * Ergebnis, das die zwei anderen Felder verhindern sollen. Der insights-Layer
 * bekommt hier KEINE eigene Fassung: „wer auch immer ein Modell ruft, ruft es
 * unter diesen Bedingungen" (Kopf von `brandProviderRouting.ts`).
 *
 * ── `BRAND_PROVIDER_ROUTING_EU` — DIESELBEN BEDINGUNGEN, PLUS DER ORT ────
 * Dieselbe Klemme mit `only: ['google-vertex/eu']`, für die Läufe, die
 * fremdes MATERIAL hinreichen statt einer Fragestellung: die
 * Inspirationslesung im brand-Layer (Kundenbilder) und, seit BI2 K5, das
 * VIDEOLESEN der Redaktion. Davids Entscheidung vom 2026-10-27 („nur für
 * Bild und Video pinnen") — Hergang und Messwerte in Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §13.
 *
 * Auch hier KEINE eigene Fassung für insights: der Ort ist eine Zusage des
 * Hauses, nicht eine Vorliebe eines Layers.
 *
 * ── WAS NICHT MITKOMMT: die Modell-WAHL ──────────────────────────────────
 * Der Brand-Check nimmt sie aus `getEffectiveAiConfig(event)` — und die liegt
 * im CORE (`core/server/utils/aiComplete.ts`, Auto-Import in jedem Layer).
 * Ein Re-Export hier wäre ein Umweg über den brand-Layer für etwas, das das
 * Fundament ohnehin allen gibt.
 */
export { readBrandAiEnabled } from '../../../brand/server/utils/brandGenerators'
export { BRAND_PROVIDER_ROUTING, BRAND_PROVIDER_ROUTING_EU } from '../../../brand/server/utils/brandProviderRouting'
