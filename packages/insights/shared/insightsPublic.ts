import type {
  InsightsBrand,
  InsightsBrandScore,
  InsightsBrandState,
  InsightsFormat,
  InsightsPost,
  InsightsPostHead,
} from './insightsPost'
import { INSIGHTS_FORMATS, insightsDuelSlug, insightsIsPublic } from './insightsPost'

/**
 * WAS ÖFFENTLICH WIRD — der PURE Vertrag der Leseseite (BI1 I3, Plan
 * docs/plans/BRAND-INSIGHTS.md §9.2, §9.5).
 *
 * ── DREI FRAGEN, EINE DATEI ──────────────────────────────────────────────
 *  1. DARF das überhaupt heraus? (der Riegel `publicFormats`, der Zustand,
 *     die redigierte Fassung)
 *  2. WAS geht heraus? (die internen Felder fallen weg, eine unredigierte
 *     Maschinenfassung wird geleert)
 *  3. UNTER WELCHER ADRESSE? (Duell-Kanon, Slug-Historie, 301)
 *
 * Alle drei sind Regeln und keine Abfragen — sie stehen deshalb in `shared/`
 * und werden mit einer Gegenprobe geprüft. Die ABFRAGEN daneben liegen in
 * `server/utils/insightsPublic.ts` und rufen von hier.
 *
 * ── WARUM DER RIEGEL FAIL-CLOSED IST ─────────────────────────────────────
 * `pukalani.insights.publicFormats` ist das Gate der Anwaltsantworten BI1-3
 * und BI1-4 (§6, §11.3): ohne sie geht KEIN Markenprofil live. Eine
 * Konfiguration, die niemand lesen kann (ein String statt einer Liste, ein
 * Tippfehler im Schlüssel), darf deshalb nicht „dann eben alles" heissen,
 * sondern „dann nichts". Der Preis ist bekannt: ein kaputter Eintrag nimmt
 * die Seiten vom Netz statt Rechtsfragen zu eröffnen — das ist die richtige
 * Richtung, und es fällt beim ersten Aufruf auf.
 *
 * ── KEIN IMPORT AUS `brand` ──────────────────────────────────────────────
 * Wie in `insightsPost.ts` (Kopf dort): diese Datei wird auch im
 * Komponenten-Kontext gelesen, wo es keinen brand-Layer gibt. Score und
 * Farbwelt kommen als ANSICHT herein, nie als eigene Rechnung.
 */

// ── 1. Der Riegel ──────────────────────────────────────────────────────────

/**
 * Die erlaubten Formate aus der Config lesen — streng, doppelt-frei, sortiert
 * wie die Eingabe.
 *
 * Alles, was keine LISTE gültiger Format-Schlüssel ist, ergibt `[]`. Ein
 * einzelner String ist bewusst KEIN Sonderfall: `publicFormats: 'article'`
 * sieht aus wie eine Erlaubnis und wäre eine, die niemand geprüft hat.
 */
export function readInsightsPublicFormats(raw: unknown): InsightsFormat[] {
  if (!Array.isArray(raw)) return []
  const allowed: InsightsFormat[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    if (!(INSIGHTS_FORMATS as readonly string[]).includes(entry)) continue
    const format = entry as InsightsFormat
    if (!allowed.includes(format)) allowed.push(format)
  }
  return allowed
}

/** Steht dieses Format öffentlich? */
export function insightsFormatIsPublic(format: InsightsFormat, allowed: readonly InsightsFormat[]): boolean {
  return allowed.includes(format)
}

/**
 * DER ZWEITE RIEGEL: STEHT DER NEWSLETTER OFFEN? (BI1 I5a,
 * `pukalani.insights.newsletter.enabled`, Layer-Default `false`.)
 *
 * Er steht hier neben `readInsightsPublicFormats`, weil er dieselbe Sorte
 * Entscheidung ist und dieselbe Mechanik braucht: EINE pure Regel, an BEIDEN
 * Türen gelesen (das Formular wird nicht gerendert UND jede Route antwortet
 * 404 wie ein unbekannter Slug), und FAIL-CLOSED.
 *
 * ── WARUM ÜBERHAUPT EIN RIEGEL ──────────────────────────────────────────
 * Die Rechtstexte von branding.supply sind Entwurf (BS1 **R2** wartet auf
 * Davids Generator-Texte, **R3** ist der Anwaltstermin). Ohne einen
 * Datenschutz-Abschnitt „Newsletter" darf keine Adresse erhoben werden —
 * dieselbe Regel, die BS1 für `auth.termsUrl` und für Plausible (R2c) fährt:
 * **erst Text, dann Schalter.** Der Code darf also fertig sein; aufgehen tut
 * er mit EINER Zeile in `app/app.config.ts`, kein Deploy von Neuem.
 *
 * ── NUR ECHTES `true` ZÄHLT ─────────────────────────────────────────────
 * Kein `Boolean(raw)` und kein `raw !== false`: ein Tippfehler
 * (`enabled: 'true'`, `enabled: 1`) sieht aus wie eine Erlaubnis und wäre
 * eine, die niemand geprüft hat. Ein kaputter Eintrag nimmt das Formular vom
 * Netz statt eine Rechtsfrage zu eröffnen — das ist die richtige Richtung,
 * und es fällt beim ersten Aufruf auf.
 */
export function insightsNewsletterEnabled(raw: unknown): boolean {
  return raw === true
}

// ── 2. Was hinausgeht ──────────────────────────────────────────────────────

/**
 * DIE FELDER, DIE NIE HINAUSGEHEN.
 *
 * Sechs Stück, drei Sorten: die interne Notiz (`noteInternal`), die
 * Unterschrift der Freigabe (`reviewedBy` — eine Konto-Id) und die vier
 * Betriebsdaten der Modell-Läufe (welches Modell, welche Prompt-Fassung).
 * Keines davon geht einen Leser etwas an, und die letzten vier wären
 * ausserdem eine Landkarte unserer Werkzeuge.
 *
 * Die Liste ist EXPORTIERT, damit der Test sie über `Object.keys` gegen die
 * echte Antwort halten kann — eine Zusage, die nur im Kommentar steht, ist
 * keine.
 */
export const INSIGHTS_POST_INTERNAL_FIELDS = [
  'noteInternal',
  'reviewedBy',
  'draftModel',
  'draftPromptVersion',
  'translationModel',
  'translationPromptVersion',
] as const

/**
 * Ein Beitrag, wie ihn eine Seite ANZEIGT — ohne die interne Hälfte und ohne
 * seine Zeilen-Id.
 *
 * Die Id ist eine Sache der ROUTE (Korrekturziel, Marken-Verknüpfung), nicht
 * der Darstellung. Die `In*`-Komponenten nehmen deshalb diesen Typ und nicht
 * `InsightsPublicPost` — sonst müsste der Prototyp im Playground eine Id
 * erfinden, um eine Karte zu zeigen.
 */
export type InsightsPublicPostView = Omit<InsightsPost, (typeof INSIGHTS_POST_INTERNAL_FIELDS)[number]>

/** Derselbe Beitrag, wie ihn eine ROUTE ausliefert: mit seiner Zeilen-Id. */
export type InsightsPublicPost = InsightsPublicPostView & { id: string }

/**
 * VERTRAG → ÖFFENTLICHE FASSUNG.
 *
 * Zwei Dinge passieren hier, und das zweite ist das wichtigere:
 *
 *  1. Die sechs internen Felder fallen weg. JEDES Feld steht EXPLIZIT da
 *     (CLAUDE.md) — eine neue Spalte soll eine Entscheidung an dieser Stelle
 *     sein und nicht durch ein `...rest` in die Öffentlichkeit rutschen.
 *  2. Ist die zweite Fassung NICHT redigiert (`translationReviewed === false`),
 *     werden ihre Felder GELEERT statt nur nicht angezeigt. §3.2 sagt: „eine
 *     maschinell erzeugte, unredigierte Fassung ist NIE öffentlich" — und was
 *     in einer Antwort steht, steht in jedem Cache und in jeder Browser-
 *     Konsole, auch wenn kein Markup sie rendert. Die ANZEIGE-Regel
 *     (`insightsPublicFassung`, Rückfall auf die Grundfassung mit Hinweis)
 *     bleibt daneben bestehen; sie sagt, WAS der Leser sieht, diese hier sagt,
 *     was die Maschine überhaupt bekommt.
 */
export function toInsightsPublicPost(id: string, post: InsightsPost): InsightsPublicPost {
  const hideDe = !post.translationReviewed && post.baseLocale !== 'de'
  const hideEn = !post.translationReviewed && post.baseLocale !== 'en'
  return {
    id,
    format: post.format,
    slug: post.slug,
    slugHistory: post.slugHistory,
    state: post.state,
    baseLocale: post.baseLocale,
    titleDe: hideDe ? '' : post.titleDe,
    titleEn: hideEn ? '' : post.titleEn,
    dekDe: hideDe ? '' : post.dekDe,
    dekEn: hideEn ? '' : post.dekEn,
    bodyDe: hideDe ? '' : post.bodyDe,
    bodyEn: hideEn ? '' : post.bodyEn,
    translatedAt: post.translatedAt,
    translationReviewed: post.translationReviewed,
    topics: post.topics,
    sources: post.sources,
    brandRefs: post.brandRefs,
    facts: post.facts,
    ranking: post.ranking,
    readingMinutes: post.readingMinutes,
    publishedAt: post.publishedAt,
    reviewedAt: post.reviewedAt,
  }
}

/**
 * EINE ZEILE DER JOURNAL-LISTE — derselbe Beitrag OHNE Fliesstext, mit seiner
 * Adresse und seiner Farbwelt.
 *
 * ── WARUM DER TEXT FEHLT ────────────────────────────────────────────────
 * Die Liste zeigt bis zu zweihundert Zeilen. Jede trüge sonst ZWEI
 * vollständige Artikel-Fassungen über die Leitung, für eine Karte mit Titel
 * und Vorspann. Ein eigener Typ statt zweier leerer Felder, weil ein leeres
 * `bodyDe` von einem Beitrag ohne Text nicht zu unterscheiden wäre.
 *
 * ── WARUM ADRESSE UND FARBWELT VOM SERVER KOMMEN ────────────────────────
 * Beide brauchen etwas, das die Liste nicht hat: der Pfad eines Markenprofils
 * braucht den Slug der MARKE (er steht in `insights_brands`, nicht am
 * Beitrag), und der Verlauf kommt aus dem Farbwelt-Katalog des brand-Layers,
 * den `app/`-Code dieses Layers nicht kennen darf (CONCEPT A14). Der Server
 * schlägt beides gebündelt nach — EINE Abfrage für die ganze Liste.
 *
 * `href` trägt KEINEN Locale-Präfix: den setzt die Seite mit `localePath()`.
 * Ein Pfad mit Präfix aus dem Server wäre die Sprache des Servers, nicht die
 * des Lesers.
 */
export type InsightsPublicPostListItem = Omit<InsightsPublicPost, 'bodyDe' | 'bodyEn'> & {
  href: string
  gradient: readonly [string, string]
}

/**
 * WAS EINE KARTE IN DER LISTE ANZEIGT — der schmalste Typ dieses Layers.
 *
 * Er ist die Schnittmenge, die BEIDE Formen erfüllen: der volle Beitrag (aus
 * der Redaktion und aus dem Prototyp) und das Listen-Item der öffentlichen
 * Route (ohne Fliesstext). `InPostCard` nimmt genau ihn — eine Komponente, die
 * `InsightsPost` verlangt, zwänge die Liste dazu, zwei Artikel-Fassungen je
 * Kachel mitzuschicken.
 */
export type InsightsPostCardView = InsightsPostHead
  & Pick<InsightsPost, 'format' | 'topics' | 'publishedAt' | 'readingMinutes'>

/**
 * Ein Markenprofil, wie es eine Seite ANZEIGT.
 *
 * Drei Felder fallen weg, alle drei aus demselben Grund: sie zeigen auf
 * INTERNE Zeilen. `checkId` und `publicationId` sind Fremdschlüssel in die
 * Tabellen des brand-Layers (der Score kommt schon aufgelöst als
 * `InsightsBrandScore` mit), `claimedBy` ist der Stempel „diese Marke hat
 * sich gemeldet" — eine Konto-Id, und zugleich eine Auskunft über einen
 * Vorgang zwischen uns und einem Dritten.
 */
export type InsightsBrandProfileView = Omit<InsightsBrand, 'claimedBy' | 'checkId' | 'publicationId'>

/** Dasselbe Markenprofil, wie es eine ROUTE ausliefert: mit seiner Zeilen-Id. */
export type InsightsPublicBrand = InsightsBrandProfileView & { id: string }

export function toInsightsPublicBrand(id: string, brand: InsightsBrand): InsightsPublicBrand {
  return {
    id,
    slug: brand.slug,
    slugHistory: brand.slugHistory,
    name: brand.name,
    homepage: brand.homepage,
    libraryKey: brand.libraryKey,
    industry: brand.industry,
    country: brand.country,
    foundedYear: brand.foundedYear,
    archetype: brand.archetype,
    archetypeSecondary: brand.archetypeSecondary,
    paletteId: brand.paletteId,
    marks: brand.marks,
    history: brand.history,
    relations: brand.relations,
    sources: brand.sources,
    state: brand.state,
    removedAt: brand.removedAt,
    removalReason: brand.removalReason,
  }
}

/**
 * EINE ERWÄHNTE MARKE — Name, Adresse, Zustand und (wenn es ihn gibt) die
 * eine Zahl.
 *
 * Sie steht als Chip unter einem Artikel und als Kopf eines Duells. Mehr als
 * das braucht keine der beiden Stellen, und mehr wäre ein zweites, breiteres
 * Markenprofil in jeder Artikel-Antwort.
 *
 * `state` reist mit, weil die SEITE entscheidet, ob sie verlinkt: eine
 * entfernte Marke bekommt keinen Link, und eine Marke ohne freigeschaltetes
 * `profile`-Format auch nicht (dann gäbe es die Zielseite nicht).
 */
export interface InsightsPublicBrandRef {
  id: string
  name: string
  slug: string
  state: InsightsBrandState
  score: InsightsBrandScore | null
}

/**
 * EINE SEITE DES DUELLS — die erwähnte Marke plus ihr Archetyp.
 *
 * Der Archetyp steht im Duell-Kopf unter dem Namen (Prototyp I0, Bildschirm
 * „Duell") und sonst nirgends; er hängt deshalb HIER dran und nicht am
 * allgemeinen Verweis, der in jeder Artikel-Antwort mitreist.
 */
export type InsightsPublicDuelSide = InsightsPublicBrandRef & { archetype: string }

// ── 3. Sichtbarkeit ────────────────────────────────────────────────────────

/**
 * IST DIESER BEITRAG ÖFFENTLICH? Zwei Bedingungen, beide notwendig.
 *
 * Der Zustand allein reicht nicht: ein freigegebenes Markenprofil bleibt
 * unsichtbar, solange `profile` nicht im Riegel steht (§11.3 — das Gate der
 * Anwaltsantwort). Und der Riegel allein reicht nicht: ein Entwurf bleibt ein
 * Entwurf, auch wenn sein Format frei ist.
 */
export function insightsPostIsVisible(
  post: Pick<InsightsPost, 'state' | 'format'>,
  allowed: readonly InsightsFormat[],
): boolean {
  return insightsIsPublic(post) && insightsFormatIsPublic(post.format, allowed)
}

/**
 * IST DIESES MARKENPROFIL ÖFFENTLICH?
 *
 * `draft` ist ein 404 wie ein unbekannter Slug — die Redaktion arbeitet daran,
 * und wer davon erfährt, erfährt etwas über eine fremde Marke, das noch
 * niemand geprüft hat.
 *
 * `removed` ist AUSDRÜCKLICH sichtbar, und das ist der Unterschied zu einer
 * zurückgezogenen Discover-Veröffentlichung: dort gilt „kein 410, kein Rest",
 * weil der Kunde selbst zurückzieht. Hier ist die Entfernung der NOTAUSGANG
 * einer fremden Marke (Entscheidung 11, „ohne Diskussion gewährt"), und die
 * Seite sagt, dass sie auf Wunsch weg ist — ein blankes 404 sähe aus wie ein
 * Fehler und lüde zum Nachfragen ein. Ihr HTTP-Status ist 410 und sie trägt
 * `noindex` (beides setzt die Seite).
 */
export function insightsBrandIsVisible(
  brand: Pick<InsightsBrand, 'state'>,
  allowed: readonly InsightsFormat[],
): boolean {
  if (!insightsFormatIsPublic('profile', allowed)) return false
  return brand.state === 'published' || brand.state === 'removed'
}

// ── 4. Adressen ────────────────────────────────────────────────────────────

/** Was ein Slug sein darf — dieselbe Form, die `brandPublicationSlug` erzeugt. */
const SLUG_RE = /^[a-z0-9-]+$/
const DUEL_SEPARATOR = '-vs-'

/**
 * DIE ZWEI TEILE EINES DUELL-SLUGS — getrennt am ERSTEN `-vs-`.
 *
 * Am ersten und nicht am letzten: ein Markenname, der selbst „vs" enthält
 * („David vs Goliath GmbH" ⇒ `david-vs-goliath-gmbh`), gehört dann in den
 * ZWEITEN Teil. Das ist die seltenere Verwechslung und die harmlosere: aus
 * `a-vs-b-vs-c` wird `{ a: 'a', b: 'b-vs-c' }`, und dieser Slug findet einfach
 * keine Zeile — statt dass ein bestehendes Duell unter einer zweiten Adresse
 * erreichbar wird.
 */
export function insightsDuelParts(slug: string): { a: string, b: string } | null {
  const at = slug.indexOf(DUEL_SEPARATOR)
  if (at <= 0) return null
  const a = slug.slice(0, at)
  const b = slug.slice(at + DUEL_SEPARATOR.length)
  if (!a || !b) return null
  if (!SLUG_RE.test(a) || !SLUG_RE.test(b)) return null
  return { a, b }
}

/**
 * DIE KANONISCHE ADRESSE EINES DUELLS — alphabetisch (§11 Frage 2).
 *
 * `nike-vs-adidas` und `adidas-vs-nike` wären sonst zwei Seiten mit demselben
 * Inhalt. Gültig ist die alphabetische; die Gegenrichtung antwortet 301.
 * `null` heisst „das ist kein Duell-Slug" — dann gibt es auch nichts zu
 * kanonisieren.
 */
export function insightsDuelCanonical(slug: string): string | null {
  const parts = insightsDuelParts(slug)
  return parts ? insightsDuelSlug(parts.a, parts.b) : null
}

/** Was die Auflösung einer Adresse gefunden hat. */
export interface InsightsSlugFindings {
  /** Eine öffentliche Zeile trägt GENAU diesen Slug. */
  direct?: boolean
  /** Eine öffentliche Zeile trägt ihn in ihrer `slugHistory` — ihr heutiger Slug. */
  historyHit?: string
  /** Die kanonische Adresse, sofern es sie GIBT (Duell). */
  canonical?: string
}

export type InsightsSlugResolution =
  | { kind: 'direct' }
  | { kind: 'redirect', slug: string }
  | { kind: 'missing' }

/**
 * WELCHE ADRESSE GILT? — die Entscheidung in EINER Regel, damit alle vier
 * Routen (Artikel, Profil, Duell, Ranking) dieselbe treffen.
 *
 * Die Reihenfolge ist die ganze Aussage:
 *
 *  1. **Direkt schlägt alles.** Wenn es eine Zeile mit genau dieser Adresse
 *     gibt, ist sie gemeint — auch wenn dieselbe Zeichenkette zufällig in der
 *     Historie einer anderen steht. Anders herum entstünde eine
 *     Weiterleitungs-Schleife, sobald jemand einen freigewordenen Slug neu
 *     vergibt.
 *  2. **Der Duell-Kanon vor der Historie.** Eine umgedrehte Duell-Adresse ist
 *     kein alter Name, sondern eine zweite Schreibweise derselben Seite; sie
 *     zu einer Historien-Suche zu führen hiesse, für jede Gegenrichtung eine
 *     Zeile in der Historie zu erwarten, die dort nie stand.
 *  3. **Die Historie zuletzt** — der Fall „Beitrag umbenannt, alter Link
 *     unterwegs" (§9.2).
 *
 * Eine Weiterleitung auf die ANGEFRAGTE Adresse gibt es nie: das wäre eine
 * 301 auf sich selbst und damit eine Endlosschleife im Browser.
 */
export function insightsSlugResolution(requested: string, found: InsightsSlugFindings): InsightsSlugResolution {
  if (found.direct) return { kind: 'direct' }
  if (found.canonical && found.canonical !== requested) return { kind: 'redirect', slug: found.canonical }
  if (found.historyHit && found.historyHit !== requested) return { kind: 'redirect', slug: found.historyHit }
  return { kind: 'missing' }
}

/**
 * DER PFAD EINES BEITRAGS — ohne Locale-Präfix (den setzt `localePath()`).
 *
 * Vier Formate, vier Basen (§9.2). Das Markenprofil ist der Sonderfall: seine
 * Adresse ist die der MARKE, nicht die des Beitrags — deshalb der zweite
 * Parameter. Fehlt er (ein Profil-Beitrag, dessen Marken-Zeile gelöscht
 * wurde), ist der Pfad LEER, und die Liste lässt die Zeile weg: ein Eintrag,
 * der ins Leere führt, ist schlimmer als einer, der fehlt.
 */
export function insightsPublicHref(format: InsightsFormat, slug: string, brandSlug: string): string {
  if (format === 'profile') return brandSlug ? `/brands/${brandSlug}` : ''
  if (format === 'duel') return `/duels/${slug}`
  if (format === 'ranking') return `/rankings/${slug}`
  return `/insights/${slug}`
}

/** Die Adresse eines Themenclusters. */
export function insightsTopicHref(key: string): string {
  return `/topics/${key}`
}

/**
 * DAS VORSCHAUBILD EINES ARTIKELS — `/og/insights/<slug>.png`.
 *
 * Die Funktion steht hier, damit SEITE und ROUTE dieselbe Wahrheit lesen
 * (wörtlich das Muster von `brandDiscoverOgPath`). Ein ungültiger Slug ergibt
 * `''` und damit KEIN og:image — ein Tag auf eine Adresse, die 404 antwortet,
 * wäre eine Lüge im Kopf.
 */
export function insightsOgPath(slug: string): string {
  return SLUG_RE.test(slug) ? `/og/insights/${slug}.png` : ''
}

/**
 * DIE FARBWELT, WENN ES KEINE GIBT — warmes Neutral, kein Katalog-Eintrag.
 *
 * Kein Rückfall auf „die erste Welt des Katalogs": das gäbe einer Marke ohne
 * `paletteId` still das Aussehen einer bestimmten Farbwelt, die ihr niemand
 * zugewiesen hat (dieselbe Entscheidung wie in `discoverOgImage.ts`).
 */
export const INSIGHTS_FALLBACK_GRADIENT: readonly [string, string] = ['#e6e2da', '#8f867a']
