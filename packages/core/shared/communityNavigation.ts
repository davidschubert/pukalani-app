/**
 * DAS ÖFFENTLICHE MENÜ EINER COMMUNITY (U15 Teil 1, Davids Zuschnitt vom
 * 2026-08-13) — der Vertrag und die EINE Auflösungsregel.
 *
 * Bis hierher war die Haupt-Navigation eine reine Folge des Bauplans: welcher
 * Layer extended ist, steht im Menü (`pukalani.chrome.nav`, Objekt-Map —
 * shared/types/chrome.ts), in der Reihenfolge, die der Layer sich selbst gibt
 * (`order`), mit dem Text, den er mitbringt (`labelKey`). Für den Betreiber
 * einer Instanz ist das richtig. Für den OWNER einer Community war es eine
 * Wand: er konnte weder etwas weglassen, was er nicht anbietet, noch etwas
 * anders nennen, als der Layer es nennt (Dashboard-Audit 2026-08-09 § 5;
 * docs/plans/DASHBOARD-IA.md führt „Navigation" als „existiert nirgends").
 *
 * Davids Zuschnitt, und nur der: **ausblenden · umordnen · umbenennen**, dazu
 * **eigene Links** (auf CMS-Seiten dieser Community und auf externe
 * https-Adressen).
 *
 * ── UNTERPUNKTE, SEIT DEM 2026-09-08 (U15 Teil 3) ─────────────────────────
 * Hier stand bis zu diesem Tag „Bewusst NICHT: Untermenüs". Das war richtig,
 * solange das Menü aus vier Produkt-Einträgen bestand — und wurde falsch, als
 * die ERSTE Site mit einer gewachsenen Seitenwelt dazukam: auf
 * branding.supply gehören „Products", „Discover Brands" und „Brand Insights"
 * nach Davids Aufteilung unter EINEN Punkt, und eine Reihe aus acht
 * gleichrangigen Wörtern ist kein Menü, sondern eine Liste. Davids
 * Entscheidung vom 2026-09-08 (DECISION-LOG „Navigation anpassen"): **GENAU
 * EINE Ebene** — ein Hauptpunkt darf Kinder haben, ein Kind nicht. Alles
 * andere aus der alten Absage gilt weiter: keine Icons je Kind, keine
 * Beschreibungen je Kind, keine Texte je Sprache.
 *
 * Zwei Dinge daran sind bewusst und nicht bequem: (1) das neue Feld heisst
 * `parent` und sitzt am KIND — eine `children`-Liste am Hauptpunkt hätte
 * dieselbe Wahrheit zweimal beschrieben (Reihenfolge im Array UND
 * Verschachtelung) und wäre bei einem gelöschten Hauptpunkt unlesbar geworden.
 * (2) Es gibt eine neue Id-Art `group-<n>` für einen Hauptpunkt OHNE eigenes
 * Ziel, weil sonst jeder Aufklapper eine Seite bräuchte, die es nicht gibt.
 *
 * ── EIGENE LABELS GELTEN FÜR BEIDE SPRACHEN (bewusster Verzicht) ───────────
 * Ein `labelKey` löst je Sprache auf; ein eigener Text tut das nicht. Der
 * Owner schreibt EINEN Text, und der steht in de wie in en. Das ist keine
 * Lücke, die noch zu schließen wäre, sondern die Entscheidung: ein
 * Übersetzungs-Formular mit zwei Feldern je Eintrag verdoppelt die Fläche für
 * einen Fall, den fast niemand hat (die meisten Communities sind einsprachig)
 * — und ein LEERES Feld fällt hier zurück auf die mitgelieferte Übersetzung,
 * die Zweisprachigkeit ist also nur einen Klick entfernt, nicht verbaut.
 *
 * ── WARUM DIE REGEL HIER IN core LIEGT ────────────────────────────────────
 * Sie rechnet über `pukalani.chrome.nav`, und dieser Vertrag gehört core
 * (shared/types/chrome.ts) — dieselbe Begründung, aus der er dort liegt: alle
 * Layer dürfen ihn nutzen, ohne sich gegenseitig zu importieren (A14). Der
 * ANWENDER ist das blueprint-Layout (es rendert das Menü), der SCHREIBER die
 * Owner-Route im pages-Layer (dem die „Website"-Gruppe gehört); beide dürfen
 * nach core greifen, keiner muss den anderen kennen.
 *
 * Vorbild der Form: `themes/shared/themeSelection.ts` — eine pure Funktion mit
 * durchgezählten Fällen, um die herum die Komposition nur noch Cookies, Fetches
 * und Fehlerbehandlung legt.
 */
import type { PukalaniChromeNavEntry } from './types/chrome'

/** Table `community_navigation` (Migration system-033). */
export const COMMUNITY_NAVIGATION_TABLE = 'community_navigation'

/**
 * Präfix der Ids EIGENER Links (`link-1`, `link-2`, …).
 *
 * ES IST EIN NAMENSRAUM, KEINE ZIERDE: die Ids der Produkt-Einträge kommen aus
 * der Registry und sind frei gewählte Wörter (`feed`, `discussions`, `events`).
 * Ohne ein reserviertes Präfix könnte ein eigener Link `events` heißen und
 * damit den Eintrag eines Produkts VERDECKEN — und beim nächsten Deploy, wenn
 * es das Produkt wirklich gibt, unbemerkt die Bedeutung tauschen. Die
 * Auflösungsregel unten entscheidet ausschliesslich an diesem Präfix, ob ein
 * Override-Eintrag ein Produkt MEINT oder selbst einer IST.
 */
export const CUSTOM_NAV_LINK_PREFIX = 'link-'

/**
 * Präfix der Ids von GRUPPEN (`group-1`, `group-2`, … — U15 Teil 3, seit
 * 2026-09-08).
 *
 * Eine Gruppe ist ein Hauptpunkt OHNE eigenes Ziel: ein Wort, das aufklappt.
 * Sie braucht ein EIGENES Präfix und nicht bloss ein Feld an einem eigenen
 * Link, weil sich beide Arten in genau der Frage unterscheiden, die jeder
 * Leser stellt: „darf ich das anklicken?". Ein eigener Link OHNE `to` wäre ein
 * Link ins Nichts — die Regel unten wirft ihn weg (`customLinkItem`), und
 * genau das soll sie auch weiterhin tun. Ein Wort, das aufklappt, ist etwas
 * anderes, und es sagt es über seine Id.
 *
 * Dieselbe Namensraum-Begründung wie oben gilt unverändert: `group-` ist
 * reserviert, ein Produkt kann nie so heissen.
 */
export const GROUP_NAV_PREFIX = 'group-'

/** Obergrenzen — sie stehen hier, damit Schema (schreiben) und Regel (lesen)
 *  dieselbe Zahl lesen; die Spaltengrösse rechnet die Migration daraus. */
export const MAX_NAV_ENTRIES = 40
export const MAX_NAV_LABEL = 64
export const MAX_NAV_TARGET = 512

/**
 * DIE SPALTE IST DIE GRENZE, ALSO STEHT SIE IM SCHEMA (`config`, varchar 8192).
 *
 * NACHGERECHNET, nicht geraten. Ein Menü ist klein — die Anzeige bricht ab 5
 * Einträgen ohnehin in ein „Mehr"-Dropdown um —, aber die EINZELgrenzen oben
 * multiplizieren sich: 40 Einträge × (64 Label + 512 Ziel + ~60 JSON-Gerüst)
 * wären rund 26.000 Zeichen und passten in KEINE varchar-Spalte (MariaDB/
 * utf8mb4 endet bei 16.381). Zwei Wege standen zur Wahl:
 *
 *  - MEDIUMTEXT (off-row, wie `pages.body` seit pages-002) — kein Zeilenbudget,
 *    dafür eine Spalte ausserhalb der Zeile für ein Dokument von typisch 2 KB;
 *  - varchar 8192 MIT einer Grenze auf das SERIALISIERTE Dokument.
 *
 * Gewählt ist das zweite. 8192 Zeichen sind bei utf8mb4 32.768 Bytes in der
 * Zeile — die Hälfte des ~65-KB-Budgets, und `config` ist die EINZIGE Spalte
 * dieser Tabelle, es gibt also nichts, womit sie sich das Budget teilt. Ein
 * realistisches Menü (15 Einträge, zwei externe Links) liegt bei ~1,5 KB.
 *
 * Der Preis dieser Wahl ist eine Absage, die es sonst nicht gäbe: wer 40
 * Einträge mit maximal langen Adressen anlegt, bekommt ein sauberes 400 mit
 * Begründung statt eines 500 aus Appwrite. Genau deshalb steht die Grenze im
 * Zod-Schema und nicht nur im Kommentar — eine Spaltengrösse, die niemand
 * prüft, ist ein Fehler, der erst beim Kunden auftritt.
 */
export const MAX_NAV_CONFIG_CHARS = 8192

/** Passt dieses Dokument in die Spalte? Der EINE Test für Schema und Route. */
export function communityNavConfigFits(override: CommunityNavOverride): boolean {
  return JSON.stringify(override).length <= MAX_NAV_CONFIG_CHARS
}

/**
 * EIN Eintrag der gespeicherten Owner-Wahl.
 *
 * NUR ADDITIV ERWEITERBAR (dieselbe Regel wie das `config`-JSON der Custom
 * Themes, und aus demselben Grund: es gibt kein `version`-Feld und es soll
 * keines geben). Ein neues Feld muss optional sein und einen Default haben,
 * der das Verhalten von vorher beschreibt.
 */
export interface CommunityNavOverrideEntry {
  /** Registry-Id eines Produkt-Eintrags, `page-<slug>` einer CMS-Seite,
   *  `link-<n>` für einen eigenen Link oder `group-<n>` für einen Hauptpunkt
   *  ohne eigenes Ziel. */
  id: string
  /** Aus dem Menü nehmen (der Eintrag bleibt gespeichert und ist wieder
   *  einschaltbar — Verstecken ist kein Löschen). */
  hidden?: boolean
  /** Eigener Text. Leer/fehlend = die mitgelieferte Übersetzung.
   *  Bei GRUPPEN ist er Pflicht: sie haben keinen mitgelieferten. */
  label?: string
  /** NUR für eigene Links: das Ziel. */
  to?: string
  /** NUR für eigene Links: externes Ziel (neuer Tab, rel="noopener"). */
  external?: boolean
  /**
   * NEU (U15 Teil 3, 2026-09-08): die Id des HAUPTPUNKTS, unter dem dieser
   * Eintrag hängt. Fehlend = der Eintrag IST ein Hauptpunkt — und damit
   * beschreibt der Default exakt das Verhalten von vor diesem Tag (additiv,
   * s. Kopf der Schnittstelle).
   *
   * GENAU EINE EBENE: ein Eintrag mit `parent` darf selbst kein `parent`
   * anderer sein. Die Regel unten setzt das fail-soft durch (Zusage 6), das
   * Schema fail-loud beim Schreiben.
   */
  parent?: string
}

/** Die gespeicherte Wahl. Reihenfolge = Array-Reihenfolge. */
export interface CommunityNavOverride {
  entries: CommunityNavOverrideEntry[]
}

/** Der leere Zustand — „keine eigene Wahl", identisch zu „keine Row". */
export function emptyCommunityNavOverride(): CommunityNavOverride {
  return { entries: [] }
}

/**
 * Ein Eintrag, wie ihn das Layout ANBIETET — also NACH allen seinen Gates
 * (Produkt-Schalter, Anmeldung, Tarif) und mit bereits übersetztem Text und
 * fertigem Pfad.
 */
export interface CommunityNavCandidate {
  id: string
  label: string
  to: string
  icon?: string
  /**
   * Die BEREITS ÜBERSETZTE Beschreibung (PS1, 2026-09-09, additiv) — sie kommt
   * aus `PukalaniChromeNavEntry.descriptionKey` und wird dort gebildet, wo auch
   * `label` entsteht (`useCommunityNav()`).
   *
   * SIE IST KEIN LABEL, und deshalb hat der Editor sie nicht: der Owner darf
   * umbenennen (`CommunityNavOverrideEntry.label`), aber es gibt keine eigene
   * Beschreibung — sie beschreibt das PRODUKT, nicht den Menüpunkt, und der
   * Layer, dem das Produkt gehört, ist der einzige, der sie kennt. Eine
   * Umbenennung lässt sie deshalb bewusst stehen.
   */
  description?: string
  planProduct?: string
  order: number
  /**
   * Derselbe Pfad OHNE Locale-Präfix (U15 Teil 3, additiv).
   *
   * WOZU EIN ZWEITER: `to` ist das fertige Ziel eines LINKS und läuft durch
   * `localePath()` — auf `/de` steht dort `/de/feed`. Der EDITOR zeigt aber
   * keine Links, er zeigt einem Menschen ADRESSEN („/feed"), und ein
   * mitwandernder Sprach-Präfix sähe dort wie ein Teil der Adresse aus. Beide
   * Werte am Kandidaten zu führen ist billiger als eine zweite
   * Kandidaten-Rechnung für den Editor — genau die Doppelung, die
   * `useCommunityNav()` beseitigt hat. Fehlend = `to` (Bestands-Aufrufer).
   */
  path?: string
  /**
   * DER STANDARD-HAUPTPUNKT AUS DEM BAUPLAN (Zusage 9, 2026-09-08) — die Id
   * eines anderen Kandidaten, unter dem dieser hängt, solange die gespeicherte
   * Wahl nichts anderes sagt. Er kommt aus `PukalaniChromeNavEntry.parent`
   * (Registry) und wird von `filterChromeNavEntries` durchgereicht.
   *
   * Fehlend = Hauptpunkt, also das Verhalten von vor diesem Tag: für einen
   * Layer OHNE Vorgaben bleibt Zusage 4 („ohne Wahl ändert sich nichts")
   * wörtlich wahr.
   */
  parent?: string
}

/** Ein Eintrag, wie ihn das Layout RENDERT. */
export interface CommunityNavItem {
  id: string
  label: string
  /**
   * Das Ziel. `''` GENAU bei Gruppen (`group-<n>`) — ein Wort, das nur
   * aufklappt, hat keines. Renderer fragen `navItemHasTarget()`, statt den
   * Leerstring an zwanzig Stellen selbst zu prüfen.
   */
  to: string
  icon?: string
  /**
   * Die übersetzte Beschreibung des Eintrags (PS1) — heute gerendert unter dem
   * Titel eines KINDES im Aufklapper (Nuxt-UI-Muster). Fehlend = keine Zeile
   * darunter, also das Verhalten von vor dem 2026-09-09.
   */
  description?: string
  planProduct?: string
  /** Externes Ziel — der Renderer setzt target="_blank" + rel="noopener". */
  external: boolean
  /**
   * Die Unterpunkte (U15 Teil 3) — fehlend/leer heisst „ein gewöhnlicher
   * Eintrag", also das Verhalten von vor dem 2026-09-08. Genau eine Ebene: ein
   * Kind trägt selbst nie `children`.
   */
  children?: CommunityNavItem[]
}

/** Ist das die Id eines EIGENEN Links (und nicht die eines Produkts)? */
export function isCustomNavLinkId(id: string): boolean {
  return id.startsWith(CUSTOM_NAV_LINK_PREFIX) && id.length > CUSTOM_NAV_LINK_PREFIX.length
}

/** Ist das die Id einer GRUPPE (Hauptpunkt ohne eigenes Ziel)? */
export function isGroupNavId(id: string): boolean {
  return id.startsWith(GROUP_NAV_PREFIX) && id.length > GROUP_NAV_PREFIX.length
}

/**
 * Hat dieser Eintrag ein eigenes Ziel? (Alles ausser einer Gruppe.)
 *
 * Als FUNKTION und nicht als Vergleich an der Aufrufstelle, weil die Antwort
 * an vier Stellen gebraucht wird (zwei Renderer, Editor, Vorschau) und ein
 * `item.to !== ''` dort wie ein Zufall aussähe.
 */
export function navItemHasTarget(item: Pick<CommunityNavItem, 'to'>): boolean {
  return typeof item.to === 'string' && item.to !== ''
}

/**
 * WAS EIN RENDERER IM AUFKLAPPER ZEIGT — die EINE Antwort für beide Renderer
 * (blueprint-Layout und BwSiteNav).
 *
 * Hat der Hauptpunkt ein EIGENES Ziel und Kinder, steht er SELBST als erster
 * Eintrag im Aufklapper (eigener Text, eigenes Ziel), danach seine Kinder.
 *
 * WARUM DAS HIER ENTSCHIEDEN WIRD UND NICHT JE RENDERER: sonst wäre das Ziel
 * eines Hauptpunkts mit Kindern auf der einen Site erreichbar und auf der
 * anderen nicht. Und es ist nicht bloss Geschmack — es ist die Deckung für
 * eine Eigenheit der Bauteile: ein Punkt, der aufklappt, verbraucht den Klick
 * fürs Aufklappen (auf einem Touch-Gerät sowieso), sein eigenes Ziel wäre
 * damit für einen Teil der Leute unerreichbar. Als erster Eintrag im
 * Aufklapper ist es für ALLE erreichbar.
 *
 * Ohne Kinder: leere Liste — dann rendert der Renderer einen gewöhnlichen Link
 * und gar keinen Aufklapper.
 */
export function navMenuChildren(item: CommunityNavItem): CommunityNavItem[] {
  const children = item.children ?? []
  if (children.length === 0) return []
  if (!navItemHasTarget(item)) return [...children]
  // Der Hauptpunkt selbst — OHNE `children`, sonst wäre der erste Eintrag des
  // Aufklappers ein zweiter Aufklapper.
  const { children: _children, ...self } = item
  return [self, ...children]
}

// ── DIE CMS-SEITEN ALS MENÜ-QUELLE ────────────────────────────────────────
//
// UMGEZOGEN AM 2026-09-08 (U15 Teil 3) aus `packages/pages/shared/types/page.ts`
// — dort re-exportiert, bestehende Importe bleiben also gültig (und der
// Auto-Import über `shared/types` ebenso; `core/shared/*.ts` wird NICHT
// auto-importiert, es gibt hier also keine zweite Auto-Import-Quelle).
//
// ZWEI GRÜNDE, EINER DAVON HART: (1) der brand-Layer rendert seit heute
// dasselbe Menü und darf den pages-Layer NICHT importieren (A14 — kein Layer
// kennt einen fremden Produkt-Layer). (2) Die Kandidaten-Rechnung soll GENAU
// EINMAL existieren (`useCommunityNav()`), und die stand vorher dreimal da.
// Der pages-Layer bleibt trotzdem der EIGENTÜMER der Seiten: er liefert sie
// aus (`/api/pages/public`) und er verwaltet sie. Was hierher gezogen ist, ist
// ausschliesslich die Frage „wie heisst so eine Seite im MENÜ".

/**
 * Nav-Eintrag einer veröffentlichten Seite — bewusst OHNE body.
 *
 * Er stand seit dem 2026-08-02 in `pages/shared/types/page.ts` (statt an der
 * Route, deren Nitro-Auto-Imports im App-Programm nicht existieren) und ist
 * heute nur eine Etage tiefer gewandert, in dasselbe `shared`-Land.
 */
export interface PublicPageNavItem {
  slug: string
  title: string
  sortOrder: number
}

/**
 * Die Slugs, die eine CMS-Seite zu einer RECHTSSEITE machen — sie gehören in
 * die Fußzeile, nicht in die Hauptnavigation.
 *
 * ZWEI SCHREIBWEISEN JE BEGRIFF, und das ist Absicht: die Slugs im Dashboard
 * sind FREI benennbar, und ein deutschsprachiger Kunde legt „impressum" an,
 * kein „imprint". Die SPRACHE einer Seite steckt dagegen in der ZEILE
 * (`PageRow.locale`), nicht im Slug.
 *
 * Vor der Konstante lebte diese Liste dreimal, unterschiedlich lang — und eine
 * veröffentlichte `terms`-Seite stand in blueprint-Apps in der
 * HAUPTNAVIGATION und in portfolio im Fuß.
 */
export const LEGAL_PAGE_SLUGS = ['imprint', 'impressum', 'privacy', 'datenschutz', 'terms', 'agb'] as const
export type LegalPageSlug = (typeof LEGAL_PAGE_SLUGS)[number]

/** Ist dieser Slug eine Rechtsseite? Der EINE Test für Nav und Fußzeile. */
export function isLegalPageSlug(slug: string): boolean {
  return (LEGAL_PAGE_SLUGS as readonly string[]).includes(slug)
}

/**
 * Die Nav-Id einer CMS-Seite (U15) — der Schlüssel, unter dem der
 * Navigations-Editor sie ausblendet, umbenennt oder verschiebt.
 *
 * Sie wurde früher an ZWEI Orten gebildet (Layout und Editor); heute bildet sie
 * nur noch `useCommunityNav()`. Die Konstante bleibt trotzdem, weil die
 * Zeichenkette in Beweisen und im Bestand der gespeicherten Dokumente steht.
 */
export function cmsPageNavId(slug: string): string {
  return `page-${slug}`
}

/**
 * Wo CMS-Seiten im Menü stehen, wenn niemand etwas anderes gesagt hat: nach
 * den Produkten (Default 50), vor „Pricing" (90).
 */
export const CMS_PAGE_NAV_ORDER = 60

/**
 * WESSEN MENÜ? Die Row-Id-Regel ist seit dem 2026-09-08 GETEILT mit Sucheintrag
 * und Weiterleitungen (`shared/communitySettingsRow.ts` — dort stehen die drei
 * Fälle und die `_instance`-Falle). Hier bleiben nur die alten Namen, damit
 * bestehende Aufrufer und Tests weiterlaufen.
 */
export { INSTANCE_SETTINGS_ROW_ID as INSTANCE_NAV_ROW_ID } from './communitySettingsRow'
export { communitySettingsRowId as communityNavRowId } from './communitySettingsRow'

/**
 * Ein INTERNER Pfad dieser Community — und zwar wirklich ein Pfad.
 *
 * Fail-closed über eine ERLAUBNISLISTE von Zeichen statt einer Sperrliste von
 * Angriffen: `javascript:`, `data:`, `vbscript:` und jedes künftige Schema
 * scheitern hier nicht daran, dass sie namentlich verboten wären, sondern
 * daran, dass ein Doppelpunkt gar nicht erst vorkommen darf. `//host` fällt
 * heraus, weil es der Browser als protokollrelative ABSOLUTE Adresse liest —
 * es sieht aus wie ein Pfad und ist ein fremder Server.
 */
export function isSafeInternalNavTarget(to: string): boolean {
  if (typeof to !== 'string') return false
  if (to.length === 0 || to.length > MAX_NAV_TARGET) return false
  if (!to.startsWith('/') || to.startsWith('//')) return false
  if (to.includes('..')) return false
  return /^\/[A-Za-z0-9\-._~/]*$/.test(to)
}

/**
 * Ein EXTERNES Ziel — https, sonst nichts.
 *
 * Kein http: eine Community, die mit ihrem Menü auf eine ungesicherte Seite
 * zeigt, schickt ihre Leser dorthin, und der Browser meldet es ihnen als
 * Warnung im Namen DIESER Community. `URL` parst statt einer Regex, weil eine
 * Regex über Adressen erfahrungsgemäss die Fälle nicht kennt, die zählen.
 */
export function isSafeExternalNavTarget(to: string): boolean {
  if (typeof to !== 'string') return false
  if (to.length === 0 || to.length > MAX_NAV_TARGET) return false
  let url: URL
  try {
    url = new URL(to)
  }
  catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname.length > 0
}

/** Eigener Text, sonst der mitgelieferte. Leer heisst „zurück zur Übersetzung". */
function labelFor(fallback: string, custom: string | undefined): string {
  if (typeof custom !== 'string') return fallback
  const trimmed = custom.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, MAX_NAV_LABEL)
}

/**
 * DIE EINE STELLE, an der aus einem Kandidaten ein gerenderter Eintrag wird —
 * beide Wege laufen hier durch (ohne gespeicherte Wahl UND mit ihr). Genau
 * deshalb reist die `description` (PS1) auf BEIDEN Wegen mit: läge das
 * Durchreichen im Zweig ohne Override, verlöre ein Eintrag seine Beschreibung
 * in dem Moment, in dem der Owner sein Menü zum ersten Mal speichert.
 */
function toItem(candidate: CommunityNavCandidate, label?: string): CommunityNavItem {
  return {
    id: candidate.id,
    label: label ?? candidate.label,
    to: candidate.to,
    ...(candidate.icon ? { icon: candidate.icon } : {}),
    ...(candidate.description ? { description: candidate.description } : {}),
    ...(candidate.planProduct ? { planProduct: candidate.planProduct } : {}),
    external: false,
  }
}

/**
 * Aus einem Override-Eintrag einen EIGENEN Link machen — oder nichts.
 *
 * DEFENSIV BEIM LESEN, obwohl beim Schreiben schon geprüft wurde. Das ist
 * keine Gürtel-und-Hosenträger-Geste: die Zeile ist JSON in einer Spalte, sie
 * überlebt jede Schema-Änderung, und sie wurde womöglich von einer älteren
 * Fassung dieses Codes geschrieben. Ein Menü ist die Fläche, auf der jeder
 * Besucher klickt — was hier durchkommt, klickt er.
 */
function customLinkItem(entry: CommunityNavOverrideEntry): CommunityNavItem | null {
  if (!isCustomNavLinkId(entry.id)) return null
  if (entry.hidden === true) return null
  const label = typeof entry.label === 'string' ? entry.label.trim() : ''
  if (!label) return null
  const to = typeof entry.to === 'string' ? entry.to.trim() : ''
  const external = entry.external === true
  if (external ? !isSafeExternalNavTarget(to) : !isSafeInternalNavTarget(to)) return null
  return { id: entry.id, label: label.slice(0, MAX_NAV_LABEL), to, external }
}

/**
 * Aus einem Override-Eintrag eine GRUPPE machen — oder nichts (U15 Teil 3).
 *
 * Dieselbe defensive Haltung wie bei `customLinkItem` daneben, und derselbe
 * Grund: das Dokument ist JSON in einer Spalte. Eine Gruppe OHNE Text wäre ein
 * leeres Wort im Kopf der Seite, eine Gruppe MIT `to` wäre eine Umlenkung, die
 * das Schema verbietet — hier fällt beides weg, statt es durchzulassen. Das
 * `to` wird bewusst IGNORIERT und nicht als Fehler behandelt: es soll nichts
 * verschwinden, nur weil ein altes Dokument ein Feld zu viel trägt.
 */
function groupItem(entry: CommunityNavOverrideEntry): CommunityNavItem | null {
  if (!isGroupNavId(entry.id)) return null
  if (entry.hidden === true) return null
  const label = typeof entry.label === 'string' ? entry.label.trim() : ''
  if (!label) return null
  return { id: entry.id, label: label.slice(0, MAX_NAV_LABEL), to: '', external: false }
}

/** Der erklärte Hauptpunkt eines Eintrags — oder `null` („ist selbst einer"). */
function declaredParent(entry: CommunityNavOverrideEntry): string | null {
  const parent = typeof entry.parent === 'string' ? entry.parent.trim() : ''
  if (!parent || parent === entry.id) return null
  return parent
}

/**
 * Derselbe Griff für einen KANDIDATEN (Zusage 9) — der Standard-Hauptpunkt aus
 * dem Bauplan. Bewusst eine zweite kleine Funktion und kein gemeinsamer Helfer
 * über einem `{ id, parent }`-Strukturtyp: die beiden Quellen beantworten
 * verschiedene Fragen (Bauplan vs. gespeicherte Wahl), und wo sie sich
 * widersprechen, gewinnt die Wahl.
 */
function candidateParent(candidate: CommunityNavCandidate): string | null {
  const parent = typeof candidate.parent === 'string' ? candidate.parent.trim() : ''
  if (!parent || parent === candidate.id) return null
  return parent
}

/**
 * DIE REGEL: angebotene Einträge + gespeicherte Wahl ⇒ das fertige Menü.
 *
 * ── VIER ZUSAGEN, DIE MAN NICHT „VEREINFACHEN" DARF ───────────────────────
 *
 * (1) **`candidates` IST AUTORITATIV.** Was das Layout nicht anbietet, kann
 *     kein Override herbeirufen. Der Tarif-Filter (C2, `planAllows`) und die
 *     Produkt-Schalter laufen VORHER; ein gesperrtes Produkt ist hier gar
 *     nicht erst in der Liste und fällt deshalb unten in den Zweig
 *     „unbekannte Id ⇒ ignorieren". Ein Owner kann sich also durch Umbenennen
 *     oder Umsortieren NICHTS freischalten — die Gegenprobe dazu steht im
 *     Test und im Beweis-Skript. (Die Autorität ist ohnehin die Route hinter
 *     dem Produkt; hier geht es darum, dass das MENÜ nicht lügt.)
 *
 * (2) **UNBEKANNTE IDS WERDEN STILL IGNORIERT.** Ein abgeschaltetes,
 *     entferntes oder umbenanntes Produkt darf das Menü nicht zerreissen. Die
 *     gespeicherte Zeile bleibt dabei unangetastet: kommt das Produkt zurück,
 *     steht es wieder an seinem Platz. Deshalb wird hier NICHT aufgeräumt.
 *
 * (3) **NICHT ERWÄHNTE EINTRÄGE HÄNGEN HINTEN AN, statt zu verschwinden.**
 *     Der Owner hat sein Menü gespeichert, als es das neue Produkt noch nicht
 *     gab — würden unerwähnte Einträge wegfallen, wäre jede künftige
 *     Erweiterung für jede Bestands-Community unsichtbar, und niemand hätte je
 *     eine Entscheidung dagegen getroffen. Sichtbar am Ende ist die
 *     ehrlichere Vorgabe als unsichtbar.
 *
 * (4) **OHNE WAHL ÄNDERT SICH NICHTS.** Leeres/fehlendes Override ⇒ exakt die
 *     heutige Sortierung nach `order`. Fail-soft ist hier kein Zusatz,
 *     sondern der Normalfall: die allermeisten Communities haben keine Row.
 *
 * ── VIER WEITERE ZUSAGEN FÜR UNTERPUNKTE (U15 Teil 3, 2026-09-08) ─────────
 *
 * (5) **EIN KIND FOLGT SEINEM HAUPTPUNKT.** Ein Eintrag mit `parent` erscheint
 *     als Kind, wenn dieser Hauptpunkt als SICHTBARER HAUPTPUNKT gerendert
 *     wird. Die Kinder-Reihenfolge ist die Array-Reihenfolge UNTER
 *     GESCHWISTERN — unabhängig davon, wo im Array das Kind steht. Ein Kind,
 *     das vor seinem Hauptpunkt notiert ist, landet trotzdem hinter ihm; sonst
 *     hinge die Anzeige davon ab, in welcher Reihenfolge der Editor gerade
 *     gespeichert hat.
 *
 * (6) **NICHTS VERSCHWINDET DURCH EINEN FEHLENDEN HAUPTPUNKT (fail-soft).**
 *     Ist der Hauptpunkt ausgeblendet, unbekannt, selbst ein Kind oder gar
 *     nicht im Dokument, steht das Kind an SEINER EIGENEN Array-Position als
 *     Hauptpunkt (mit seinem eigenen `hidden`). Eine Wand ist schlimmer als
 *     ein Eintrag zu viel — und ein Owner, der einen Hauptpunkt ausblendet,
 *     hat über dessen Kinder nichts gesagt.
 *
 * (7) **EINE GRUPPE OHNE SICHTBARE KINDER WIRD NICHT GERENDERT.** Ein
 *     Aufklapper ohne Inhalt ist ein toter Klick. (Ein Hauptpunkt MIT Ziel und
 *     ohne Kinder bleibt selbstverständlich ein gewöhnlicher Link.)
 *
 * (8) **DIE ANTWORT ZÄHLT NUR HAUPTPUNKTE.** Kinder hängen in `children` und
 *     nicht in der obersten Liste — die Überlauf-Rechnung der Renderer („ab
 *     dem sechsten Eintrag ins Mehr-Menü") bekommt damit ohne Zutun die
 *     richtige Zahl.
 *
 * ── ZUSAGE 9: DER BAUPLAN DARF GRUPPEN VORGEBEN (2026-09-08) ──────────────
 *
 * (9) Davids Korrektur am Prototyp: das STANDARD-Menü von branding.supply
 *     lautet „Products ▾ (Brand Score) · Discover Brands · About · Team".
 *     Bis dahin konnte NUR die gespeicherte Owner-Wahl Unterpunkte erzeugen —
 *     eine frische Instanz hätte also anders ausgesehen als die beworbene, und
 *     der Owner hätte sein Standard-Menü erst im Editor nachbauen müssen.
 *     Deshalb trägt jetzt auch ein KANDIDAT einen `parent`
 *     (`PukalaniChromeNavEntry.parent` ⇒ `CommunityNavCandidate.parent`).
 *
 *     (a) **OHNE gespeicherte Wahl gilt die Hierarchie der Kandidaten.** Die
 *         Kandidaten laufen durch dieselbe Verschachtelung wie sonst, nur mit
 *         dem `parent` aus dem Bauplan. Für einen Layer OHNE Vorgaben bleibt
 *         Zusage 4 damit WÖRTLICH wahr: kein `parent` ⇒ keine Kinder ⇒ die
 *         Sortierung nach `order` von vorher.
 *
 *     (b) **MIT gespeicherter Wahl ist das Dokument für GENANNTE Einträge die
 *         ganze Wahrheit.** `parent` kommt dort aus dem Override-Eintrag; fehlt
 *         es, ist der Eintrag ein Hauptpunkt — auch wenn der Bauplan ihn unter
 *         eine Gruppe hängen würde. Das ist keine Härte, sondern die einzige
 *         Lesart, die den Editor nicht zur Lüge macht: er schreibt IMMER das
 *         ganze Dokument, ein fehlendes `parent` ist dort also eine
 *         ENTSCHEIDUNG („ausgerückt") und kein Schweigen. Sonst käme eine
 *         Gruppe nach dem Speichern zurück, die der Owner gerade aufgelöst hat.
 *
 *     (c) **NACHZÜGLER BRINGEN IHREN BAUPLAN-PLATZ MIT.** Ein Kandidat, über
 *         den die gespeicherte Wahl nichts sagt (Zusage 3), hängt hinten an —
 *         und zwar unter dem `parent`, den der Bauplan ihm gibt. Ein neues
 *         Produkt, das der Layer als Unterpunkt ausliefert, erscheint bei einer
 *         Bestands-Community also nicht als achtes gleichrangiges Wort.
 *
 *     Wessen Gate die GRUPPE wegnimmt, nimmt ihre Kinder nicht mit: sie stehen
 *     dann nach Zusage 6 oben, und eine Standard-Gruppe, deren einziges Kind
 *     per Gate wegfällt, verschwindet nach Zusage 7 mit ihm.
 */
export function resolveCommunityNav(
  candidates: readonly CommunityNavCandidate[],
  override: CommunityNavOverride | null | undefined,
): CommunityNavItem[] {
  const byOrder = [...candidates].sort((a, b) => a.order - b.order)
  const entries = override?.entries
  // Zusage 9a: dieselbe Verschachtelung, nur mit dem `parent` des BAUPLANS.
  // `mentioned: true` für alle, weil hier jeder Eintrag aus derselben Quelle
  // kommt — die Unterscheidung „genannt/nachgezogen" gibt es nur gegenüber
  // einem gespeicherten Dokument.
  if (!Array.isArray(entries) || entries.length === 0) {
    return nestCommunityNav(byOrder.map(candidate => ({
      item: toItem(candidate),
      parent: candidateParent(candidate),
      mentioned: true,
    })))
  }

  const byId = new Map(byOrder.map(candidate => [candidate.id, candidate]))
  const seen = new Set<string>()
  /**
   * Was rendert, in Array-Reihenfolge — samt erklärtem Hauptpunkt und der
   * Auskunft, ob die gespeicherte Wahl diesen Eintrag ÜBERHAUPT NENNT.
   *
   * `mentioned` trägt Zusage 6 („gar nicht im Dokument"): nur ein AUSDRÜCKLICH
   * genannter Eintrag kann Hauptpunkt einer Gruppe sein. Ein Eintrag, der bloss
   * über den Anhang dazukommt (Zusage 3 — ein Produkt, das es beim Speichern
   * noch nicht gab), zieht keine Kinder an sich: er steht am ENDE der Liste, das
   * Kind sprang dorthin mit, und der Owner hätte eine Umsortierung erlebt, die
   * er nie angefordert hat.
   */
  const rendered: Array<{ item: CommunityNavItem, parent: string | null, mentioned: boolean }> = []

  for (const entry of entries.slice(0, MAX_NAV_ENTRIES)) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) continue
    // Eine doppelt genannte Id ist ein defektes Dokument, kein zweiter
    // Eintrag — das erste Vorkommen gewinnt, der Rest fällt weg.
    if (seen.has(entry.id)) continue
    seen.add(entry.id)

    const parent = declaredParent(entry)
    const candidate = byId.get(entry.id)
    if (candidate) {
      if (entry.hidden === true) continue
      rendered.push({ item: toItem(candidate, labelFor(candidate.label, entry.label)), parent, mentioned: true })
      continue
    }
    const own = customLinkItem(entry) ?? groupItem(entry)
    if (own) rendered.push({ item: own, parent, mentioned: true })
    // sonst: Zusage (2) — unbekannte Id, still ignoriert.
  }

  // Zusage (3): alles, worüber die gespeicherte Wahl nichts sagt — und zwar
  // mit dem Platz, den der Bauplan ihm gibt (Zusage 9c).
  for (const candidate of byOrder) {
    if (!seen.has(candidate.id)) {
      rendered.push({ item: toItem(candidate), parent: candidateParent(candidate), mentioned: false })
    }
  }

  return nestCommunityNav(rendered)
}

/**
 * Die flache, gerenderte Folge in EINE Ebene Verschachtelung bringen
 * (Zusagen 5–8). Getrennt von `resolveCommunityNav`, damit die Rechnung „wer
 * hängt unter wem" für sich lesbar bleibt — sie ist der einzige Teil, der nicht
 * geradeaus ist.
 */
function nestCommunityNav(
  rendered: ReadonlyArray<{ item: CommunityNavItem, parent: string | null, mentioned: boolean }>,
): CommunityNavItem[] {
  const rows = new Map(rendered.map(row => [row.item.id, row]))

  /**
   * Unter welcher Id hängt dieser Eintrag WIRKLICH? `null` = Hauptpunkt.
   *
   * Memoisiert, und mit einem Zyklen-Schutz, den man nicht weglassen darf: ein
   * Dokument, in dem A auf B und B auf A zeigt, ist von Hand oder von einer
   * älteren Fassung schreibbar — ohne `laufend` liefe die Rekursion hier für
   * immer und nähme die Seite mit. Wer im Kreis zeigt, wird zum Hauptpunkt.
   */
  const memo = new Map<string, string | null>()
  const laufend = new Set<string>()
  function attachesTo(id: string): string | null {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    if (laufend.has(id)) return null
    laufend.add(id)
    let result: string | null = null
    const row = rows.get(id)
    const parent = row?.parent ?? null
    const parentRow = parent ? rows.get(parent) : undefined
    /**
     * DIE ANHÄNGE-REGEL, und sie ist ASYMMETRISCH (Zusage 6 + 9c):
     *
     *  - ein GENANNTES Kind hängt nur an einen GENANNTEN Hauptpunkt. Ein
     *    Hauptpunkt, der bloss über den Anhang dazukommt (Zusage 3), steht am
     *    ENDE der Liste — das Kind spränge mit ihm dorthin, und der Owner
     *    erlebte eine Umsortierung, die er nie angefordert hat.
     *  - ein NACHZÜGLER-Kind darf an JEDEN gerenderten Hauptpunkt hängen, auch
     *    an einen nachgezogenen. Es hat selbst keinen Platz, den es verlöre:
     *    beide stehen im Anhang, und der Bauplan sagt, wie sie dort zueinander
     *    stehen (Zusage 9c).
     *
     * Zusätzlich muss der Hauptpunkt selbst einer SEIN (`attachesTo === null`) —
     * genau eine Ebene. Alles andere ⇒ das Kind ist Hauptpunkt.
     */
    const anhaengbar = !!parentRow && (row?.mentioned === true ? parentRow.mentioned : true)
    if (parent && anhaengbar && attachesTo(parent) === null) result = parent
    laufend.delete(id)
    memo.set(id, result)
    return result
  }

  const kinder = new Map<string, CommunityNavItem[]>()
  const haupt: CommunityNavItem[] = []
  for (const { item } of rendered) {
    const parent = attachesTo(item.id)
    if (parent === null) {
      haupt.push(item)
      continue
    }
    // Zusage 5: Array-Reihenfolge UNTER GESCHWISTERN — hier entsteht sie, weil
    // `rendered` in Array-Reihenfolge durchlaufen wird.
    const liste = kinder.get(parent)
    if (liste) liste.push(item)
    else kinder.set(parent, [item])
  }

  const items: CommunityNavItem[] = []
  for (const item of haupt) {
    // Ein Kind, das selbst eine leere Gruppe ist, wäre ein toter Eintrag im
    // Aufklapper — dieselbe Zusage 7, eine Etage tiefer.
    const children = (kinder.get(item.id) ?? []).filter(child => navItemHasTarget(child))
    if (children.length) items.push({ ...item, children })
    else if (navItemHasTarget(item)) items.push(item)
    // sonst: Zusage 7 — Gruppe ohne sichtbare Kinder, sie fällt weg.
  }
  return items
}

/**
 * Die Registry-Einträge, die NACH den Gates des Layouts übrig bleiben — die
 * Vorstufe der `candidates`, noch mit `labelKey` statt Text.
 *
 * STEHT HIER UND NICHT IM LAYOUT, obwohl das Layout der einzige Renderer ist:
 * der EDITOR muss dieselbe Liste zeigen, sonst bietet er dem Owner Einträge
 * an, die auf seiner Seite nie erscheinen (oder verschweigt welche, die es
 * tun). Zwei Stellen, die dieselbe Frage beantworten, laufen auseinander —
 * und zwar erfahrungsgemäss genau dann, wenn ein Gate dazukommt.
 */
export function filterChromeNavEntries(
  nav: Record<string, PukalaniChromeNavEntry | false> | undefined,
  gates: {
    isLoggedIn: boolean
    /** Laufzeit-Produkt-Schalter (F2) — bekommt den womöglich fehlenden Key. */
    productOn: (productKey: string | undefined) => boolean
    /** Tarif-Gate im Pool (C2) — nur bei gesetztem `planProduct` gefragt. */
    planAllows: (planProduct: string) => boolean
  },
): Array<PukalaniChromeNavEntry & { id: string }> {
  return Object.entries(nav ?? {})
    .filter((pair): pair is [string, PukalaniChromeNavEntry] => pair[1] !== false && !!pair[1])
    .filter(([, entry]) => gates.productOn(entry.productKey))
    .filter(([, entry]) => !entry.requiresAuth || gates.isLoggedIn)
    .filter(([, entry]) => !entry.planProduct || gates.planAllows(entry.planProduct))
    .map(([id, entry]) => ({ ...entry, id }))
}

/**
 * Die nächste freie `<präfix><n>`-Id für eine bestehende Wahl.
 *
 * Zählt über das MAXIMUM, nicht über die Anzahl: wer einen Link entfernt und
 * einen neuen anlegt, bekommt sonst die Id des entfernten — und damit dessen
 * Platz in einem Menü, das jemand anderes gerade offen hat.
 *
 * SEIT U15 TEIL 3 MIT PRÄFIX-ARGUMENT (`link-` und `group-` zählen getrennt).
 * Getrennte Zähler und kein gemeinsamer: die beiden Namensräume sind
 * unabhängig, und ein gemeinsamer Zähler liesse Lücken entstehen, die beim
 * Lesen eines Dokuments wie ein Datenverlust aussehen.
 */
export function nextPrefixedNavId(entries: readonly CommunityNavOverrideEntry[], prefix: string): string {
  let max = 0
  for (const entry of entries) {
    if (!entry?.id?.startsWith(prefix) || entry.id.length <= prefix.length) continue
    const n = Number.parseInt(entry.id.slice(prefix.length), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${max + 1}`
}

/** Die nächste freie `link-<n>`-Id (der Name von vor U15 Teil 3). */
export function nextCustomNavLinkId(entries: readonly CommunityNavOverrideEntry[]): string {
  return nextPrefixedNavId(entries, CUSTOM_NAV_LINK_PREFIX)
}

/** Die nächste freie `group-<n>`-Id. */
export function nextGroupNavId(entries: readonly CommunityNavOverrideEntry[]): string {
  return nextPrefixedNavId(entries, GROUP_NAV_PREFIX)
}

/**
 * Was aus der Spalte kommt, in die Form bringen — oder `null`.
 *
 * Der EINE Leser des gespeicherten JSON (Route wie SSR-Leser). Er wirft nie:
 * ein kaputtes Dokument heisst „keine eigene Wahl", und das Menü sieht aus wie
 * vor U15. Ein Fehler an dieser Stelle nähme einer Community ihre Startseite.
 */
export function parseCommunityNavOverride(raw: string | null | undefined): CommunityNavOverride | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const entries = (parsed as { entries?: unknown }).entries
    if (!Array.isArray(entries)) return null
    const clean: CommunityNavOverrideEntry[] = []
    for (const raw of entries.slice(0, MAX_NAV_ENTRIES)) {
      if (!raw || typeof raw !== 'object') continue
      const entry = raw as Record<string, unknown>
      if (typeof entry.id !== 'string' || !entry.id) continue
      clean.push({
        id: entry.id,
        ...(entry.hidden === true ? { hidden: true } : {}),
        ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
        ...(typeof entry.to === 'string' ? { to: entry.to } : {}),
        ...(entry.external === true ? { external: true } : {}),
        // `parent` in derselben defensiven Form wie `to`: nur eine Zeichenkette
        // kommt durch, alles andere ist so, als stünde sie nicht da — und das
        // heisst „Hauptpunkt", also das Verhalten von vor U15 Teil 3.
        ...(typeof entry.parent === 'string' ? { parent: entry.parent } : {}),
      })
    }
    return { entries: clean }
  }
  catch {
    return null
  }
}
