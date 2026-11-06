/**
 * DER VERTRAG ZUM brand-LAYER — die EINZIGE Stelle im market-Layer, die über
 * die Paketgrenze greift (CONCEPT A14, Plan §2.1 + Davids Entscheidung 1 und 7
 * in §6: „eigener Layer mit explizitem Vertrag", „der Abruf-Vertrag bleibt in
 * brand, wird explizit exportiert, market importiert").
 *
 * ── WARUM SIE IN `server/contracts/` LIEGT UND NICHT IN `server/utils/` ───
 * Nitro AUTO-IMPORTIERT `server/utils` — jeder Name daraus steht in jeder
 * Server-Datei der App zur Verfügung. Läge diese Datei dort, wären ihre
 * Re-Exporte (`loadOwnedProfile`, `fetchBrandSite`, …) plötzlich ZWEIMAL im
 * Auto-Import: einmal aus `packages/brand/server/utils`, einmal von hier.
 * Nitro meldet das („Duplicated imports") und entscheidet zugunsten des
 * SPÄTEREN Layers — der brand-Layer riefe seine eigenen Funktionen dann über
 * den Umweg dieses Vertrags auf. Heute zeigen beide Namen auf dasselbe, aber
 * eine Schattierung, die niemand beabsichtigt hat, ist genau die Sorte
 * Kopplung, die dieser Vertrag verhindern soll. `server/contracts` wird nicht
 * gescannt: wer hier etwas will, importiert es ausdrücklich.
 *
 * ── WARUM EINE DATEI UND NICHT ZWANZIG IMPORTE ────────────────────────────
 * Nitros Auto-Import endet an der Layer-Grenze: `fetchBrandSite` ist in
 * market-Code NICHT einfach da. Der technisch mögliche Weg wäre, überall dort
 * relativ zu springen, wo man etwas braucht — und dann ist die Kopplung
 * WIEDER implizit, nur eben verteilt auf zwanzig Dateien, und niemand kann
 * mehr in einem Blick sagen, was market von brand erwartet. Diese Datei IST
 * die Antwort auf diese Frage: was hier nicht steht, benutzt market nicht.
 * Jeder spätere market-Server-Code importiert AUSSCHLIESSLICH von hier.
 *
 * ── RELATIVE PFADE ÜBER DIE PAKETGRENZE FUNKTIONIEREN ─────────────────────
 * Nachgeprüft und im Repo längst üblich: `packages/admin/server/utils/
 * userStatsCache.ts` zieht `createMicrocache` per `../../../core/server/utils/
 * microcache` — Nitro bündelt die Datei mit, weil sie über den Dateipfad
 * aufgelöst wird und nicht über die `node_modules`-Auflösung des Pakets. Die
 * ESLint-Sperre gegen Cross-Layer-Importe (`pukalani/no-cross-layer-relative`)
 * kennt dafür einen benannten Block für `packages/market/**` — eine
 * AUSNAHME MIT NAMEN statt einer stillen Lücke, wie feedback ↔ control.
 *
 * ── DIE ZWEI PUREN AUSNAHMEN IN `shared/` (BS1 R2b, 2026-09-08) ──────────
 * `shared/marketRobots.ts` und der Vorbehalts-Abschnitt von
 * `shared/marketCrawlRules.ts` greifen seit R2b ebenfalls über die Grenze —
 * und das ist kein Loch in der Bündelung oben, sondern ihr Gegenstück. Die
 * Bündelung existiert wegen Nitros AUTO-IMPORT von `server/utils` (s. o.);
 * `shared/` wird nicht gescannt, dort gibt es nichts zu beschatten. Beide
 * Dateien sind reine RE-EXPORTE der Regeln, die seit R2b im brand-Layer leben
 * (`brandRobots.ts`, `brandTdm.ts`) — der Brand-Check achtet `robots.txt` und
 * Nutzungsvorbehalt jetzt auch, und `brand` darf `market` nicht kennen. Der
 * Umweg über DIESE Datei wäre teurer als der Gewinn: er machte aus einer puren
 * Regel eine Server-Abhängigkeit, und `packages/market/scripts/
 * market-library-compute.mjs` lädt sie direkt.
 *
 * ── WAS HIER BEWUSST NICHT STEHT ──────────────────────────────────────────
 * Der Befund-SCHREIBER (`writeBrandFindings`) und die Extraktions-Naht kommen
 * mit M3, wenn es Befunde zu schreiben gibt; ein Re-Export, hinter dem noch
 * kein Aufrufer steht, wäre eine Abhängigkeit ohne Gegenleistung. Ebenso
 * fehlt jeder Zugriff auf `brand_steps`/`brand_messages`: market liest die
 * eigene Foundation über die BESTÄTIGTEN Werte des Profils, nicht über die
 * Gesprächsverläufe — die gehen es nichts an.
 */

// ── Der SSRF-feste Abruf (§2.7, Davids Entscheidung 7) ──────────────────────
// EINE Wahrheit über „welche Adresse darf der Server überhaupt holen".
// Ein zweiter SSRF-Schutz im market-Layer wäre der Fehler, gegen den §4 warnt
// („sonst gibt es zwei SSRF-Schutze, die auseinanderlaufen"). Die
// Mehrseiten-/Sitemap-/llms.txt-Erweiterung aus §7.4 wird deshalb in M2 HIER
// gebaut — im brand-Layer, abgestimmt mit der Brand-Check-Sitzung — und nicht
// daneben.
export { BrandSiteFetchError, fetchBrandSite } from '../../../brand/server/utils/brandSiteFetch'
export type { BrandSiteFetchResult } from '../../../brand/server/utils/brandSiteFetch'

// ── Der geteilte MEHRSEITEN-Abruf (§7.4, gebaut in M2) ─────────────────────
// Er liegt in `packages/brand/server/utils/brandSiteCrawl.ts` — genau dort, wo
// der Absatz darüber ihn hinbestellt hat. Was hier durchgereicht wird, sind
// AUSGEWERTETE Seiten (Titel, Text, interne Adressen, Meta-Anweisungen,
// JSON-LD) und Textressourcen; das rohe HTML bleibt im brand-Layer, und
// `fetchBrandDocument` steht deshalb BEWUSST NICHT in dieser Liste.
//
// Der ABSENDER reist mit (`BRAND_MARKET_USER_AGENT`/`BRAND_MARKET_BOT_TOKEN`):
// er ist Teil desselben Vertrags wie der Abruf — wer eine `robots.txt` gegen
// einen anderen Namen prüft als den, mit dem er anfragt, prüft nichts.
export {
  BRAND_MARKET_BOT_TOKEN,
  BRAND_MARKET_USER_AGENT,
  crawlBrandPage,
  crawlBrandSitemap,
  crawlBrandTextResource,
} from '../../../brand/server/utils/brandSiteCrawl'
export type { BrandCrawledPage, BrandCrawledText } from '../../../brand/server/utils/brandSiteCrawl'
export { sitemapUrlsFromRobots } from '../../../brand/shared/brandSiteCrawlParse'

// ── Besitz: „gehört dieses Branding dem Aufrufer?" ─────────────────────────
// `market` hat KEINE eigene Autorisierung und soll auch keine bekommen: alle
// market_*-Tabellen sind server-only (Permissions `[]`), die einzige Grenze
// zwischen zwei Konten ist dieselbe wie im brand-Layer. `loadOwnedProfile`
// wirft 404 (nicht 403) auf ein fremdes Profil — ein 403 bestätigte dessen
// Existenz. Jede spätere market-Route ruft es, BEVOR sie irgendetwas tut.
// `listOwnedBrandProfileIds` ist die zweite Hälfte davon und für den
// GDPR-Contributor gebaut: keine market_*-Zeile trägt eine `userId`, die Frage
// „was gehört diesem Konto?" läuft deshalb über die Brandings (Begründung in
// `marketUserData.ts`). Sie ist die EINZIGE Ergänzung, die M1 im brand-Layer
// gebraucht hat.
export { listOwnedBrandProfileIds, loadOwnedProfile, requireProfileIdParam } from '../../../brand/server/utils/brandStore'
export type { BrandProfileRow } from '../../../brand/server/utils/brandStore'

// ── Die Kaskade: market hängt sich an das Löschen eines Brandings ──────────
export { registerBrandProfileCascade } from '../../../brand/server/utils/brandProfileCascade'
export type { BrandProfileCascade } from '../../../brand/server/utils/brandProfileCascade'

// ── Die Slot-Registry: die Adressen der EIGENEN Felder ─────────────────────
// PURE Funktionen und Typen, kein Datenzugriff. `slotById` beantwortet die
// eine Frage, die `MARKET_FIELDS` stellt: „gibt es dieses eigene Feld
// überhaupt, und ist es noch aktiv?" (§2.2, geprüft im Test). `BRAND_SLOTS`
// ist der Katalog dahinter — er wird für die Beschriftung und für die
// Gegenprobe im Test gebraucht.
export { BRAND_SLOTS, slotById } from '../../../brand/shared/slotRegistry'
export type { BrandSlot } from '../../../brand/shared/slotRegistry'

/**
 * DIE FREISCHALTUNG DER ABLEITUNG — DIE PURE REGEL DES brand-LAYERS
 * (BK1 K1, docs/plans/BRAND-BOOK-KIT.md §2.8; sie löst BS1 §4.1 (b) ein).
 *
 * `market` bekommt KEINE eigene Rechnung darüber, ob eine Marke „bezahlt" ist.
 * Es ist EIN Feld an `brand_profiles` und EINE Regel darüber, und sie gehören
 * dem Layer, dem die Tabelle gehört — eine zweite Fassung hier wäre die zweite
 * Wahrheit über einen KAUF, und die wäre genau dort falsch, wo sie am meisten
 * kostet.
 *
 * Sie ist PUR (keine Tabelle, kein H3): die Tatsachen kommen von der
 * Aufrufstelle — `betaAccount` aus `requireBrandAccess`, die zwei Spalten aus
 * der ohnehin geladenen Profil-Zeile.
 */
export { resolveDerivationAccess } from '../../../brand/shared/brandDerivation'

// ── Das Zugangs-Gate der Beta (§2.4) ───────────────────────────────────────
// `market` bekommt KEIN eigenes Gate. Der Marktvergleich ist ein Zusatz zum
// Wizard; wer nicht in dessen Beta ist, hat kein Branding, gegen das er
// vergleichen könnte. `requireBrandAccess` wirft 404 (Datentür-Muster) und
// liefert die `userId`, mit der `loadOwnedProfile` weiterarbeitet.
export { requireBrandAccess } from '../../../brand/server/utils/brandAccess'

// ── Die FREISCHALTUNG: „ist Kapitel B abgenommen?" (§2.4) ──────────────────
// Ein Kapitel ist abgenommen, wenn seine `brand_steps`-Zeile auf `done` steht
// (das setzt `…/steps/:stepKey/complete`). `market` liest diese Zeile über den
// Vertrag statt die Tabelle selbst abzufragen — sonst gäbe es eine zweite
// Wahrheit darüber, was „abgenommen" heisst, sobald sich die Regel im
// brand-Layer ändert.
//
// `confirmedSlotValues` ist die zweite Hälfte derselben Sache und wird für die
// Quelle `foundation` gebraucht (§7.2 Nr. 2): das Marktprofil der EIGENEN
// Marke entsteht aus den BESTÄTIGTEN Feldern, ohne Abruf und ohne Beleg.
export { confirmedSlotValues, loadStepRow, loadStepRows } from '../../../brand/server/utils/brandStore'
export type { BrandStepRow } from '../../../brand/server/utils/brandStore'

// ── Der KI-Kill-Switch der Laufzeit (§2.8) ─────────────────────────────────
// `app_config.brandAiEnabled` schaltet die KI der ganzen Instanz ab — auch die
// des Marktvergleichs. EIN Schalter und nicht zwei: der Betreiber, der die
// Rechnung stoppt, will alle Anbieter-Aufrufe stoppen, nicht überlegen, welche
// Produkte er einzeln umlegen muss.
export { readBrandAiEnabled } from '../../../brand/server/utils/brandGenerators'

// ── Die Datenschutz-Bedingungen jedes Anbieter-Aufrufs (§2.7) ──────────────
// ZDR, `dataCollection: 'deny'`, keine Ausweich-Anbieter. Fremder
// Website-Text ist Markeninhalt wie jeder andere und bekommt wörtlich
// dieselben Bedingungen — eine eigene Konstante hier wäre die vierte Kopie
// derselben drei Felder, gegen die `brandProviderRouting.ts` argumentiert.
export { BRAND_PROVIDER_ROUTING } from '../../../brand/server/utils/brandProviderRouting'

// ── MV1 M3: Vergleich, Befunde, Brand-Check ───────────────────────────────

/**
 * DER BEFUND-SPEICHER (Plan §2.7: „Befund-Speicher + Chips — neue Art
 * `market`"). Der Marktvergleich legt seine Befunde in DIESELBE Tabelle wie
 * der Spezialist, weil sie an denselben Feldern erscheinen sollen und dieselbe
 * Entscheidung (annehmen/ablehnen) tragen. Eine eigene Tabelle hätte zwei
 * Chip-Sorten, zwei Entscheidungs-Routen und zwei Antworten auf „was hängt an
 * diesem Feld".
 *
 * `purgeOpenBrandFindingsOfKind` ist der Weg, auf dem ein NEUER Bericht seine
 * Vorgänger ablöst — Begründung an der Funktion.
 */
export {
  listBrandFindings,
  purgeOpenBrandFindingsOfKind,
  toBrandFindingView,
  writeBrandFindings,
} from '../../../brand/server/utils/brandFindingsStore'
export type { BrandFindingRow } from '../../../brand/server/utils/brandFindingsStore'
export type { BrandFindingView } from '../../../brand/shared/types/brand'

/**
 * Die Zuordnung eines Befundes zu einem KAPITEL. Ein Markt-Befund stammt aus
 * keinem Kapitel — er stammt aus einem Bericht —, aber die Spalte `stepKey`
 * ist Pflicht und die Kapitel-Sperre rechnet ohnehin über die SLOTS. Der
 * market-Layer stempelt deshalb das Kapitel des betroffenen FELDES; die
 * Auskunft dazu liefert `slotById(...).stepId` (oben re-exportiert), hier
 * steht nur ihr Typ.
 */
export type { BrandStepKey } from '../../../brand/shared/slotRegistry'

/**
 * DER KANONISCHE HASH-BAUER des brand-Layers (`sourcesHash`, `inputHash` der
 * Generationen). Der Bericht-Schlüssel benutzt ihn, statt eine zweite
 * Hash-Regel zu erfinden — Begründung in `server/utils/marketReport.ts`.
 */
export { brandGenerationHashInput } from '../../../brand/shared/brandGeneration'

/**
 * DER BESTEHENDE BRAND-CHECK ZU EINER ADRESSE (§7.3). Nur LESEN: der
 * Marktvergleich rechnet keinen Score und beeinflusst keinen.
 */
export { findBrandCheckForUrl } from '../../../brand/server/utils/brandCheckLookup'
export type { BrandCheckLookupResult } from '../../../brand/server/utils/brandCheckLookup'

/**
 * DAS ANSTOSSEN EINES FEHLENDEN CHECKS (§7.3, BC1).
 *
 * ── WARUM DAS EIN RE-EXPORT IST UND KEINE ZWEITE MECHANIK ─────────────────
 * §7.3 sagt: „der BESTEHENDE Score, kein zweiter". Genau daran wäre das
 * Anstossen bis heute gescheitert — die ganze Check-Mechanik lag im Handler
 * von `packages/brand/server/api/brand/check.post.ts`, und von hier zu rufen
 * hiesse kopieren. Ein kopierter Check driftet: eine neue Prompt-Fassung, ein
 * geänderter Kriterienkatalog, eine andere Normalisierung der Adresse — und
 * der Marktvergleich zeigte eine Zahl, die zwar „Brand-Check" heisst, aber
 * etwas anderes misst als der Brand-Check. BC1 hat die Mechanik deshalb ZUERST
 * nach `brand/server/utils/brandCheckRun.ts` gezogen; hier steht nur noch der
 * Zeiger darauf.
 *
 * ── WO DER DECKEL LIEGT ───────────────────────────────────────────────────
 * Beim BRAND-Check, nicht beim Marktvergleich: `quota: 'account'` bucht den
 * Konto-Deckel (10/Tag, `BRAND_CHECK_ACCOUNT_DAILY_LIMIT`) des Menschen, der
 * den Lauf ausgelöst hat. `market` bekommt dafür KEINEN eigenen Eimer — ein
 * zweiter Zähler über dieselben Anbieter-Aufrufe wäre eine zweite Buchhaltung
 * und beim ersten Ändern zwei verschiedene Deckel.
 */
export { runBrandCheck } from '../../../brand/server/utils/brandCheckRun'
export type { RunBrandCheckInput, RunBrandCheckResult } from '../../../brand/server/utils/brandCheckRun'

// ── MV1 M4: das Opt-in fremder Marken (§7.2 Nr. 4) ────────────────────────

/**
 * DIE FREIGABE EINER MARKE FÜR DEN MARKTVERGLEICH ANDERER (`brand_profiles.
 * marketVisibility`, Migration brand-019).
 *
 * Sie hängt an einer brand-TABELLE und wird deshalb dort gelesen und
 * geschrieben — `market` fragt an, statt selbst zuzugreifen. Das ist dieselbe
 * Arbeitsteilung wie bei `loadOwnedProfile`: eine zweite Stelle, die über
 * fremde Brandings entscheidet, wäre eine zweite Wahrheit über Zustimmung,
 * und die wäre genau dort falsch, wo sie am meisten kostet.
 *
 * `listSharedMarketProfiles` bekommt das verlangte Kapitel als ARGUMENT
 * (`requiredStepKey`) — `brand` soll nicht wissen müssen, wovon ein fremdes
 * Produkt seine Freischaltung abhängig macht.
 */
export {
  BRAND_MARKET_VISIBILITIES,
  brandMarketVisibilityOf,
  isBrandProfileSharedForMarket,
  listSharedMarketProfiles,
  setBrandProfileMarketVisibility,
} from '../../../brand/server/utils/brandMarketVisibility'
export type {
  BrandMarketVisibility,
  BrandSharedProfileHit,
} from '../../../brand/server/utils/brandMarketVisibility'

/**
 * DIE BRANDINGS DES KONTOS FÜR DEN QUELLEN-WÄHLER (§7.2 Nr. 2).
 *
 * `listOwnedBrandProfileIds` (oben) liefert nur Ids und ist für den
 * GDPR-Contributor gebaut; der Wähler braucht Titel und Branche, um eine
 * Auswahlliste zu beschriften. `listBrandProfilesForOwner` ist dieselbe
 * Abfrage mit den ZWEI zusätzlichen Feldern — und bleibt im brand-Layer, weil
 * die Tabelle ihm gehört.
 */
export { listBrandProfilesForOwner } from '../../../brand/server/utils/brandStore'
export type { BrandOwnedProfileHit } from '../../../brand/server/utils/brandStore'

// ── MV1 M5: Messung ────────────────────────────────────────────────────────

/**
 * DER FUNNEL DES WIZARDS (`brand_events`) — für Ereignisse, die ein MENSCH
 * ausgelöst hat und die man später zählen will.
 *
 * `market` bekommt KEINE eigene Ereignis-Tabelle (Plan §2.10 lässt beides zu:
 * „bestehendes `brand_events`-Muster ODER eigenes `market_events`"). Die
 * bestehende gewinnt aus drei Gründen: die Spalte `type` ist ein varchar und
 * nicht ein Enum (Migration brand-007 sagt es im Kopf: „ein neuer
 * Funnel-Schritt soll keine Migration kosten") — es kostet also keine
 * Prod-Migration; die Aufbewahrung (24 Monate) und die Löschkaskade gelten
 * damit ohne Zutun; und eine zweite Tabelle wäre eine zweite Antwort auf „wie
 * weit kommen die Leute?".
 *
 * `recordBrandProductEvent` ist die Tür für AUFSETZENDE Layer: `brand` kennt
 * dort die FORM `<produkt>.<name>`, nicht das Produkt (CONCEPT A14).
 * Begründung im Kopf der Funktion.
 */
export { recordBrandProductEvent } from '../../../brand/server/utils/brandEvents'
