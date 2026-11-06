import { z } from 'zod'
import { EVIDENCE_QUOTE_MAX, evidenceIsGrounded } from '../../core/shared/evidenceGrounding'

/**
 * DER REDAKTIONS-VERTRAG VON BRAND INSIGHTS (Plan §9.3,
 * docs/plans/BRAND-INSIGHTS.md).
 *
 * ── WAS DIESE DATEI IST UND WAS SIE NICHT IST ────────────────────────────
 * Sie ist der PRODUKT-Vertrag: was ein Beitrag IST (vier Formate, eine Zeile),
 * was eine Quelle mindestens mitbringen muss, wie ein Duell-Fakt und ein
 * Ranking-Platz aussehen, und welche Regeln VOR der Redaktions-Freigabe
 * greifen. Sie ist NICHT der Ablage-Vertrag: `insights_posts` & Co. entstehen
 * mit I1, und ihre Zeilen-Typen (`Models.Row & …`) gehören dann in eine
 * eigene Datei daneben — so wie im market-Layer `shared/marketProfile.ts` und
 * `shared/types/market.ts` getrennt sind. Wer das hier mit der Datenbank
 * mischt, holt die Datenbank in den Produktbegriff.
 *
 * ── KEIN IMPORT AUS `brand`, OBWOHL DER LAYER IHN VORAUSSETZT ────────────
 * `requires: ['brand']` steht im Manifest, und I1 baut GENAU EINEN Vertrag
 * dorthin (`server/contracts/`). Diese Datei bleibt trotzdem frei davon: sie
 * wird auch dort gelesen, wo es keinen brand-Layer gibt (Komponenten, Tests,
 * später der Prompt-Bau) — dasselbe Zuschnitt-Argument wie im Kopf von
 * `market/shared/marketProfile.ts`. Score, Band, Farbwelt und Archetyp kommen
 * deshalb als ANSICHT herein (`InsightsBrandScore`), nie als eigene Spalte:
 * „eine Zahl je Marke, dieselbe wie im Produkt" (Entscheidung 7).
 *
 * ── WARUM HIER ZOD UND NICHT NUR TYPEN ──────────────────────────────────
 * Ein Beitrag entsteht zu Teilen aus einem MODELL (Entwurf, Übersetzung) und
 * zu Teilen aus einem Formular. Ein Wert, den ein Modell erzeugt hat und den
 * niemand geprüft hat, ist eine Behauptung — erst das Schema macht Daten
 * daraus. Die Zitatschranke (§ 51 UrhG) und die Belegpflicht stehen deshalb
 * IM SCHEMA und nicht nur im Formular: „eine Regel, die nur im Formular
 * steht, ist keine" (§9.4).
 */

// ── 1. Kataloge ────────────────────────────────────────────────────────────

/** Die vier Formate (§2). Eine Zeile trägt alle vier — `format` unterscheidet. */
export const INSIGHTS_FORMATS = ['profile', 'duel', 'article', 'ranking'] as const
export type InsightsFormat = (typeof INSIGHTS_FORMATS)[number]

/**
 * DIE VIER ZUSTÄNDE (§9.3) — und `übersetzt` ist bewusst KEINER davon.
 *
 * §3.2 nannte fünf (`entwurf → redaktion → freigegeben → übersetzt →
 * aktualisieren`). Das trägt nicht: ein Beitrag kann auf Deutsch freigegeben
 * sein, während die englische Fassung noch redigiert wird — „halb
 * veröffentlicht" kann eine lineare Kette nicht ausdrücken, sie müsste den
 * Beitrag zurücknehmen oder eine unredigierte Übersetzung öffentlich machen.
 * Deshalb ist `übersetzt` eine EIGENSCHAFT der zweiten Fassung
 * (`translationReviewed`), s. `insightsPublicFassung()`.
 */
export const INSIGHTS_STATES = ['draft', 'review', 'published', 'updated'] as const
export type InsightsState = (typeof INSIGHTS_STATES)[number]

/** Die Zustände, die eine ÖFFENTLICHE Route lesen darf — mehr nie (§3.2). */
export const INSIGHTS_PUBLIC_STATES = ['published', 'updated'] as const

/** Die zwei Sprachen der Plattform; `baseLocale` ist die REDIGIERTE (Entscheidung 3). */
export const INSIGHTS_LOCALES = ['de', 'en'] as const
export type InsightsLocale = (typeof INSIGHTS_LOCALES)[number]

/**
 * DIE FÜNF QUELLEN-ARTEN (Entscheidung 6, §4.1).
 *
 * `brand-site` ist die EIGENAUSSAGE einer Marke, alles andere ist FREMDQUELLE
 * — und genau diese Unterscheidung muss die Oberfläche zeigen (§4.1 a: „nie
 * als Eigenaussage der Marke"). `own-data` sind unsere eigenen Zahlen
 * (Brand-Check, Bibliothek, Marktvergleich); sie brauchen keinen fremden
 * Herausgeber, weil der Herausgeber wir sind.
 */
export const INSIGHTS_SOURCE_KINDS = ['brand-site', 'press', 'wikipedia', 'youtube', 'own-data'] as const
export type InsightsSourceKind = (typeof INSIGHTS_SOURCE_KINDS)[number]

/** Fremdquelle oder Eigenaussage? Die eine Frage, die §4.1 (a) stellt. */
export function insightsSourceIsThirdParty(kind: InsightsSourceKind): boolean {
  return kind !== 'brand-site' && kind !== 'own-data'
}

/**
 * DIE ZITATSCHRANKE (§4.1 b, § 51 UrhG). Sie steht im Schema, im
 * Redaktions-Formular und in der Prüfregel vor `review` — dieselbe Zahl, EINE
 * Stelle. Seit BI1 I1a ist diese eine Stelle das FUNDAMENT
 * (`core/shared/evidenceGrounding.ts`): der Marktvergleich leitet sein
 * `MARKET_EVIDENCE_MAX` aus derselben Konstante ab. Zwei verschiedene Zahlen
 * für dieselbe Rechtsfrage wären eine Einladung, die kleinere zu vergessen.
 */
export const INSIGHTS_QUOTE_MAX: number = EVIDENCE_QUOTE_MAX

/** Alte Slugs je Zeile (§9.2) — ≤ 5, damit die 301-Suche eine Grenze hat. */
export const INSIGHTS_SLUG_HISTORY_MAX = 5

/**
 * DIE UMBENENNUNG (§9.2, BI1 I1) — der alte Slug reiht sich VORN ein.
 *
 * Die Regel, die DB1 versprochen und nicht gebaut hat (§9.2, „Abhängigkeit in
 * die andere Richtung"): `brand_publications` trägt heute einen `slug` ohne
 * Historie, und eine Umbenennung bricht dort jeden Link still. BI1 baut sie
 * für die eigenen Tabellen — pur, damit sie EINE Wahrheit hat und eine
 * Gegenprobe bekommen kann.
 *
 * ── VORN, NICHT HINTEN ──────────────────────────────────────────────────
 * Wenn der Deckel greift, fällt der ÄLTESTE Eintrag heraus. Das ist die
 * richtige Richtung: ein Link auf den vorletzten Namen wird häufiger geklickt
 * als einer auf den Namen von vor fünf Umbenennungen, und irgendwo muss die
 * Liste enden (sonst wächst eine varchar-Spalte unbegrenzt).
 *
 * ── DREI FÄLLE, DIE NICHTS TUN ──────────────────────────────────────────
 *  1. Ein LEERER alter Slug (Zeile war noch nie veröffentlicht) — es gibt
 *     nichts umzuleiten.
 *  2. Der alte Slug steht schon vorn — dieselbe Umbenennung zweimal
 *     gespeichert soll die Liste nicht bewegen (Idempotenz).
 *  3. Der alte Slug ist der NEUE (Aufrufer hat nichts geändert) — dafür
 *     müsste der Aufrufer die Gleichheit selbst prüfen; hier fängt es der
 *     Duplikat-Filter mit ab, sobald er ohnehin in der Liste steht.
 *
 * Duplikate werden IMMER entfernt: derselbe Name zweimal in der Historie
 * verbrauchte einen der fünf Plätze für nichts.
 */
export function insightsSlugHistoryPush(history: readonly string[], oldSlug: string): string[] {
  const trimmed = oldSlug.trim()
  if (!trimmed) return [...history]
  if (history[0] === trimmed) return [...history]
  return [trimmed, ...history.filter(entry => entry !== trimmed)].slice(0, INSIGHTS_SLUG_HISTORY_MAX)
}

/** Ein Ranking hat zehn Plätze — eingefroren, mit Stand (§11 Frage 7). */
export const INSIGHTS_RANKING_PLACES = 10

/** Lesezeit: Wörter ÷ 200, aufgerundet; berechnet beim SPEICHERN (§9.3). */
export const INSIGHTS_WORDS_PER_MINUTE = 200
export const INSIGHTS_READING_MINUTES_MAX = 120

/**
 * DIE ACHT THEMENCLUSTER (§2) — ein kuratierter Katalog IM CODE, keine
 * Tabelle: sie ändern sich seltener als ein Deploy (§9.2).
 *
 * ── WARUM DIE LABELS NICHT ÜBER i18n LAUFEN ──────────────────────────────
 * Sie sind Eigennamen und heissen in beiden Sprachen gleich — dieselbe Regel
 * wie bei den Theme-Namen (CLAUDE.md) und wie bei den Hauptpunkten der
 * branding.supply-Navigation (Davids Design: „Discover Brands", „Brand
 * Insights"). Ein übersetztes „Markenpsychologie" neben einem englischen
 * „Brand Psychology" wäre zwei Namen für dieselbe Rubrik — und die
 * `/topics/<slug>`-Adresse hat ohnehin nur einen.
 */
export const INSIGHTS_TOPICS = [
  { key: 'rebranding', label: 'Rebranding' },
  { key: 'brand-psychology', label: 'Brand Psychology' },
  { key: 'brand-analysis', label: 'Brand Analysis' },
  { key: 'brand-strategy', label: 'Brand Strategy' },
  { key: 'brand-language', label: 'Brand Language' },
  { key: 'seo-geo', label: 'SEO & GEO' },
  { key: 'brand-experience', label: 'Brand Experience' },
  { key: 'visual-identity', label: 'Visual Identity' },
] as const

export type InsightsTopicKey = (typeof INSIGHTS_TOPICS)[number]['key']
export const INSIGHTS_TOPIC_KEYS = INSIGHTS_TOPICS.map(topic => topic.key) as readonly InsightsTopicKey[]

export function insightsTopicLabel(key: string): string {
  return INSIGHTS_TOPICS.find(topic => topic.key === key)?.label ?? key
}

/**
 * WIE LANG EIN BRIEF SEIN DARF — ein Auftrag, kein Manuskript.
 *
 * Die Zahl stand bis BI2 K5 in `insightsPrompts.ts`, weil sie nur den Prompt
 * zuschnitt. Seit K5 ist der Brief eine SPALTE (`brief`), und damit gehört
 * ihre Grenze in den Datenvertrag: der Prompt darf nie mehr bestellen, als
 * die Zeile tragen kann.
 */
export const INSIGHTS_BRIEF_MAX = 2000

// ── 2. Quellen ─────────────────────────────────────────────────────────────

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

/**
 * EINE QUELLE (§9.3, „`sources` (JSON, Zitatschranke im Schema)").
 *
 * Drei Pflichten, die das Schema durchsetzt statt sie zu erwähnen:
 *  1. `kind !== 'own-data'` ⇒ `publisher` UND `date`. Ein Beleg ohne Datum ist
 *     kein Beleg — eine Website von 2019 sagt etwas anderes als dieselbe
 *     Adresse heute.
 *  2. `kind === 'wikipedia'` ⇒ `license` (CC-BY-SA-Link, §4.1 c). Ohne
 *     Namensnennung ist die Übernahme eine Lizenzverletzung, und die fällt
 *     nicht auf, solange niemand fragt.
 *  3. `quote` ≤ 200 Zeichen (§4.1 b).
 *
 * WAS DAS SCHEMA NICHT KANN: prüfen, ob das Zitat WÖRTLICH in der Quelle
 * steht. Das ist deterministisch möglich, braucht aber den abgerufenen Text —
 * die Prüfung sitzt deshalb in `insightsReviewIssues()` und ruft dort den
 * Beleg-Riegel des Fundaments (`core/shared/evidenceGrounding.ts`, BI1 I1a).
 */
export const insightsSourceSchema = z.object({
  url: z.url().max(512),
  publisher: z.string().max(160).default(''),
  date: z.union([dateSchema, z.literal('')]).default(''),
  kind: z.enum(INSIGHTS_SOURCE_KINDS),
  quote: z.string().max(INSIGHTS_QUOTE_MAX).default(''),
  /** CC-BY-SA-Link — Pflicht genau bei `wikipedia`. */
  license: z.string().max(200).default(''),
}).superRefine((source, ctx) => {
  if (source.kind !== 'own-data') {
    if (!source.publisher) ctx.addIssue({ code: 'custom', path: ['publisher'], message: 'Fremdquelle ohne Herausgeber' })
    if (!source.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Fremdquelle ohne Datum' })
  }
  if (source.kind === 'wikipedia' && !source.license) {
    ctx.addIssue({ code: 'custom', path: ['license'], message: 'Wikipedia-Quelle ohne Lizenz-Link (CC-BY-SA)' })
  }
})

export type InsightsSource = z.infer<typeof insightsSourceSchema>

// ── 3. Fakten: Duell-Zeile und Ranking-Platz ───────────────────────────────

/**
 * EINE DUELL-ZEILE (§9.3). `sourceIndex` zeigt in `sources` — eine Faktenzeile
 * OHNE Beleg lässt sich nicht speichern. Damit ist §8 Frage 5
 * („Agentur-Beziehung") beantwortet, ohne die Zeile zu streichen: sie ist von
 * Hand gepflegt MIT Belegpflicht, und wo kein Beleg zu finden ist, fehlt die
 * Zeile — nicht das Format.
 *
 * Die Beschriftung steht ZWEISPRACHIG in den Daten und nicht in einem
 * i18n-Schlüssel: „Agentur-Beziehung" ist redaktioneller Inhalt, den die
 * Redaktion je Duell neu wählt — ein Katalog fester Zeilen wäre eine
 * Behauptung darüber, welche Fakten es gibt.
 */
export const insightsDuelFactSchema = z.object({
  key: z.string().min(1).max(40),
  labelDe: z.string().min(1).max(80),
  labelEn: z.string().min(1).max(80),
  left: z.string().max(200),
  right: z.string().max(200),
  winner: z.enum(['left', 'right', 'tie']),
  sourceIndex: z.number().int().min(0, 'Beleg fehlt'),
})

export type InsightsDuelFact = z.infer<typeof insightsDuelFactSchema>

/**
 * EIN RANKING-PLATZ (§11 Frage 7).
 *
 * `removed: true` ist die LÜCKE: ein Entfernen-Wunsch nimmt den Platz heraus
 * und rechnet die Liste NICHT neu — Platz 4 bleibt Platz 4 und trägt „auf
 * Wunsch entfernt". Das ist ehrlicher als eine stille Neunummerierung, und es
 * ist der Grund, warum die Marken-Felder hier optional sind statt eine zweite
 * Zeilen-Form zu bekommen.
 */
export const insightsRankingEntrySchema = z.object({
  rank: z.number().int().min(1).max(INSIGHTS_RANKING_PLACES),
  brandId: z.string().max(64).default(''),
  checkId: z.string().max(64).default(''),
  score: z.number().int().min(0).max(100).default(0),
  reasonDe: z.string().max(300).default(''),
  reasonEn: z.string().max(300).default(''),
  removed: z.boolean().default(false),
}).superRefine((entry, ctx) => {
  if (entry.removed) return
  if (!entry.brandId) ctx.addIssue({ code: 'custom', path: ['brandId'], message: 'Platz ohne Marken-Zeile' })
  if (!entry.reasonDe || !entry.reasonEn) ctx.addIssue({ code: 'custom', path: ['reasonDe'], message: 'Platz ohne Begründung in beiden Sprachen' })
})

export type InsightsRankingEntry = z.infer<typeof insightsRankingEntrySchema>

/**
 * DAS EINGEFRORENE RANKING (§11 Frage 7): zehn Plätze, sichtbarer Stand,
 * nummerierte Ausgabe. Eine Auffrischung ist eine NEUE Ausgabe mit neuem
 * Slug; die alte bleibt mit Hinweis und Link stehen — deshalb trägt die Liste
 * ihren Stand IN den Daten und rechnet ihn nicht aus `$updatedAt`.
 */
export const insightsRankingSchema = z.object({
  issue: z.number().int().min(1),
  asOf: dateSchema,
  entries: z.array(insightsRankingEntrySchema).max(INSIGHTS_RANKING_PLACES),
}).superRefine((ranking, ctx) => {
  const ranks = ranking.entries.map(entry => entry.rank)
  if (new Set(ranks).size !== ranks.length) {
    ctx.addIssue({ code: 'custom', path: ['entries'], message: 'doppelter Platz' })
  }
})

export type InsightsRanking = z.infer<typeof insightsRankingSchema>

/** Der Verweis eines Beitrags auf eine Marken-Zeile (§9.3, `brandRefs`). */
export const insightsBrandRefSchema = z.object({
  brandId: z.string().min(1).max(64),
  checkId: z.string().max(64).default(''),
  libraryKey: z.string().max(64).default(''),
  publicationId: z.string().max(64).default(''),
})

export type InsightsBrandRef = z.infer<typeof insightsBrandRefSchema>

// ── 4. Der Beitrag ─────────────────────────────────────────────────────────

/**
 * EIN BEITRAG — alle vier Formate, eine Form (§9.3 `insights_posts`).
 *
 * Die Zeile trägt beide Sprachfassungen nebeneinander (`titleDe`/`titleEn`
 * …). Das ist NICHT das UGC-Muster: dort ist die Übersetzung ein CACHE für
 * Leser, hier ist sie eine redigierte FASSUNG (§11 Frage 4). Deshalb gibt es
 * `baseLocale` (welche Fassung ist die redigierte?) und
 * `translationReviewed` (ist die zweite es auch?) — ein Cache bräuchte
 * beides nicht.
 */
const insightsPostFields = {
  format: z.enum(INSIGHTS_FORMATS),
  slug: z.string().min(1).max(160),
  slugHistory: z.array(z.string().max(160)).max(INSIGHTS_SLUG_HISTORY_MAX).default([]),
  state: z.enum(INSIGHTS_STATES),
  baseLocale: z.enum(INSIGHTS_LOCALES),
  titleDe: z.string().max(200).default(''),
  titleEn: z.string().max(200).default(''),
  dekDe: z.string().max(400).default(''),
  dekEn: z.string().max(400).default(''),
  bodyDe: z.string().default(''),
  bodyEn: z.string().default(''),
  translatedAt: z.string().max(32).default(''),
  translationModel: z.string().max(120).default(''),
  translationPromptVersion: z.string().max(64).default(''),
  translationReviewed: z.boolean().default(false),
  topics: z.array(z.enum(INSIGHTS_TOPIC_KEYS as [InsightsTopicKey, ...InsightsTopicKey[]])).max(4).default([]),
  sources: z.array(insightsSourceSchema).max(40).default([]),
  brandRefs: z.array(insightsBrandRefSchema).max(20).default([]),
  facts: z.array(insightsDuelFactSchema).max(12).default([]),
  ranking: insightsRankingSchema.nullable().default(null),
  readingMinutes: z.number().int().min(0).max(INSIGHTS_READING_MINUTES_MAX).default(0),
  publishedAt: z.string().max(32).default(''),
  reviewedAt: z.string().max(32).default(''),
  reviewedBy: z.string().max(64).default(''),
  noteInternal: z.string().max(500).default(''),
  /**
   * DER BRIEF — der Auftrag an die Redaktion, aus dem der Entwurf entsteht
   * (BI2 K5).
   *
   * Bis K5 war er FLÜCHTIG: ein Textfeld im Editor, das mit dem Lauf in die
   * Entwurfs-Route reiste und danach weg war. Für einen Brief, den ein Mensch
   * tippt, ging das; für einen, den ein bezahlter Video-Lauf erzeugt, nicht —
   * ein Neuladen hätte fünf Cent und die Vorarbeit gekostet. Er gehört
   * ausserdem zur HERKUNFT des Textes: „warum steht das so im Artikel?" ist
   * nur beantwortbar, wenn der Auftrag noch da ist.
   *
   * Er bleibt EINGABE des Menschen (also im Formular änderbar) — die drei
   * Felder darunter sind es nicht.
   */
  brief: z.string().max(INSIGHTS_BRIEF_MAX).default(''),
  briefModel: z.string().max(120).default(''),
  briefPromptVersion: z.string().max(64).default(''),
  /** Aus WELCHEM Video der Brief kam (elfstellige YouTube-Id) — leer = getippt. */
  briefVideoId: z.string().max(32).default(''),
  draftModel: z.string().max(120).default(''),
  draftPromptVersion: z.string().max(64).default(''),
}

/**
 * WAS DIE FORM-REGELN ÜBERHAUPT ANSEHEN — und warum das ein eigener Typ ist.
 *
 * Seit BI1 I2 gibt es ZWEI Schemas über denselben Feldern: den vollen Vertrag
 * (`insightsPostSchema`, wie eine Zeile aussieht) und die Redaktions-Eingabe
 * (`insightsPostEditSchema`, was ein Formular schicken DARF). Beide müssen
 * dieselben Form-Regeln durchsetzen — ein Duell ohne Faktenzeilen ist in
 * beiden Fällen keines. Zwei abgeschriebene `superRefine`-Blöcke wären zwei
 * Wahrheiten, von denen die im Formular irgendwann milder wird.
 *
 * Der Typ steht deshalb HIER und leitet sich NICHT aus `InsightsPost` ab: der
 * volle Typ entsteht erst aus dem Schema, das diese Funktion benutzt — das
 * wäre ein Ring.
 */
interface InsightsPostRuleInput {
  format: InsightsFormat
  baseLocale: InsightsLocale
  titleDe: string
  titleEn: string
  facts: readonly InsightsDuelFact[]
  ranking: InsightsRanking | null
  sources: readonly InsightsSource[]
}

/**
 * DIE FORM-REGELN als LISTE statt als `ctx.addIssue`-Aufrufe: so sind sie ohne
 * Zod-Kontext prüfbar und werden von beiden Schemas GELESEN, nicht kopiert.
 */
function insightsPostRuleIssues(post: InsightsPostRuleInput): { path: (string | number)[], message: string }[] {
  const issues: { path: (string | number)[], message: string }[] = []
  // Die Grundfassung MUSS da sein — sie ist die redigierte (Entscheidung 3).
  if (!insightsTitleOf(post, post.baseLocale)) {
    issues.push({ path: ['baseLocale'], message: 'Grundfassung ohne Titel' })
  }
  // Zwei Faktenformen, zwei Formate. Ein Duell OHNE Zeilen ist kein Duell,
  // ein Artikel MIT ihnen ist ein Zeichen, dass jemand das Format gewechselt
  // und die alten Daten stehen gelassen hat.
  if (post.format === 'duel' && post.facts.length === 0) {
    issues.push({ path: ['facts'], message: 'Duell ohne Faktenzeilen' })
  }
  if (post.format !== 'duel' && post.facts.length > 0) {
    issues.push({ path: ['facts'], message: 'Faktenzeilen nur im Duell' })
  }
  if (post.format === 'ranking' && !post.ranking) {
    issues.push({ path: ['ranking'], message: 'Ranking ohne Liste' })
  }
  if (post.format !== 'ranking' && post.ranking) {
    issues.push({ path: ['ranking'], message: 'Liste nur im Ranking' })
  }
  // Jeder Beleg-Zeiger muss auf eine Quelle zeigen, die es gibt. Ein Zeiger
  // ins Leere sieht in der Tabelle aus wie ein Beleg.
  for (const [index, fact] of post.facts.entries()) {
    if (fact.sourceIndex >= post.sources.length) {
      issues.push({ path: ['facts', index, 'sourceIndex'], message: 'Beleg zeigt auf keine Quelle' })
    }
  }
  return issues
}

export const insightsPostSchema = z.object(insightsPostFields).superRefine((post, ctx) => {
  for (const issue of insightsPostRuleIssues(post)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  }
})

export type InsightsPost = z.infer<typeof insightsPostSchema>

/**
 * DIE FELDER, DIE DER SERVER SELBST FÜHRT (BI1 I2) — und deshalb aus einer
 * Redaktions-Eingabe VERSCHWINDEN müssen.
 *
 * Sie sind keine Meinung des Formulars, sondern Ergebnis einer Handlung:
 * `state` setzt der Zustands-Umschalter (mit den sechs Prüfregeln davor),
 * `publishedAt`/`reviewedAt`/`reviewedBy` die Freigabe, `translatedAt`/
 * `translationModel`/`translationPromptVersion` der Übersetzen-Lauf,
 * `draftModel`/`draftPromptVersion` der Entwurfs-Lauf, `briefModel`/
 * `briefPromptVersion`/`briefVideoId` der Brief-Lauf (K5 — der BRIEF selbst
 * gehört dem Menschen und bleibt änderbar, seine HERKUNFT nicht),
 * `readingMinutes` das
 * Speichern (§9.3: „beim Speichern, nicht beim Lesen") und `slugHistory` die
 * Umbenennung (`insightsSlugHistoryPush`).
 *
 * Sie WEGZULASSEN reicht nicht — sie müssen ABGELEHNT werden können: ein
 * durchgereichtes `state: 'published'` im PATCH-Body wäre die Freigabe an den
 * sechs Regeln vorbei, und ein durchgereichtes `reviewedBy` eine Unterschrift
 * unter fremdem Namen. `z.object` ist in Zod standardmässig nachsichtig gegen
 * unbekannte Schlüssel (sie fallen still weg) — genau das ist hier richtig:
 * das Formular schickt weg, was es nicht ändern darf, und der Server setzt es
 * selbst.
 *
 * `translationReviewed` ist BEWUSST NICHT dabei: das Häkchen „Übersetzung
 * redigiert" ist die Aussage eines Menschen, nicht das Ergebnis eines Laufs —
 * es ist die EINZIGE Stelle, an der die zweite Fassung öffentlich wird (§3.2),
 * und sie gehört dem Redakteur.
 */
export const INSIGHTS_SERVER_OWNED_FIELDS = [
  'state',
  'publishedAt',
  'reviewedAt',
  'reviewedBy',
  'translatedAt',
  'translationModel',
  'translationPromptVersion',
  'draftModel',
  'draftPromptVersion',
  'briefModel',
  'briefPromptVersion',
  'briefVideoId',
  'slugHistory',
  'readingMinutes',
] as const

/** Was ein Redaktions-Formular schicken darf (s. `INSIGHTS_SERVER_OWNED_FIELDS`). */
export const insightsPostEditSchema = z.object(insightsPostFields).omit({
  state: true,
  publishedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  translatedAt: true,
  translationModel: true,
  translationPromptVersion: true,
  draftModel: true,
  draftPromptVersion: true,
  briefModel: true,
  briefPromptVersion: true,
  briefVideoId: true,
  slugHistory: true,
  readingMinutes: true,
}).superRefine((post, ctx) => {
  for (const issue of insightsPostRuleIssues(post)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  }
})

export type InsightsPostEdit = z.infer<typeof insightsPostEditSchema>

export function insightsTitleOf(post: Pick<InsightsPost, 'titleDe' | 'titleEn'>, locale: InsightsLocale): string {
  return locale === 'de' ? post.titleDe : post.titleEn
}

export function insightsDekOf(post: Pick<InsightsPost, 'dekDe' | 'dekEn'>, locale: InsightsLocale): string {
  return locale === 'de' ? post.dekDe : post.dekEn
}

export function insightsBodyOf(post: Pick<InsightsPost, 'bodyDe' | 'bodyEn'>, locale: InsightsLocale): string {
  return locale === 'de' ? post.bodyDe : post.bodyEn
}

/**
 * WELCHE FASSUNG SIEHT DER LESER? (§9.3, §11 Frage 4)
 *
 * Die Regel in EINER Funktion, damit Route, Seite und `hreflang` dieselbe
 * Antwort geben: die Nicht-Grundsprache erscheint NUR mit
 * `translationReviewed === true`; sonst steht die Grundfassung da, und die
 * Seite sagt, dass diese Sprache noch fehlt. „Eine maschinell erzeugte,
 * unredigierte Fassung ist NIE öffentlich" (§3.2) ist damit wörtlich erfüllt
 * und prüfbar statt vorgenommen.
 *
 * `fallback: true` ist ausserdem das Signal für `hreflang`: eine Adresse, die
 * nur die Grundfassung zeigt, darf sich nicht als eigene Sprachfassung melden.
 */
export interface InsightsPublicKopf {
  locale: InsightsLocale
  title: string
  dek: string
  /** Der Leser wollte die andere Sprache und bekommt die Grundfassung. */
  fallback: boolean
}

export interface InsightsPublicFassung extends InsightsPublicKopf {
  body: string
}

/**
 * WAS EINE LISTEN-ZEILE VON EINEM BEITRAG BRAUCHT (BI1 I3).
 *
 * Der Typ steht hier und nicht in der Karte, weil ZWEI Formen ihn erfüllen
 * müssen: der volle Beitrag (`InsightsPost`) und das Listen-Item der
 * öffentlichen Route (`InsightsPublicPostListItem`, ohne Fliesstext — zwanzig
 * Zeilen mit je zwei Artikel-Fassungen wären ein Megabyte für eine Liste).
 * Eine Komponente, die den vollen Typ verlangt, zwänge die Liste dazu, den
 * Text doch mitzuschicken.
 */
export type InsightsPostHead = Pick<
  InsightsPost,
  'baseLocale' | 'translationReviewed' | 'titleDe' | 'titleEn' | 'dekDe' | 'dekEn'
>

/**
 * WELCHE FASSUNG SIEHT DER LESER — der KOPF (Titel + Vorspann), ohne Text.
 *
 * Die Sprach-ENTSCHEIDUNG steht damit an genau EINER Stelle und wird von
 * `insightsPublicFassung()` unten mitbenutzt. Zwei Stellen mit derselben
 * Rechnung wären zwei Wahrheiten darüber, welche Sprache eine Seite zeigt —
 * und die Liste zeigte dann irgendwann eine andere als der Beitrag dahinter.
 */
export function insightsPublicKopf(post: InsightsPostHead, wanted: InsightsLocale): InsightsPublicKopf {
  const useBase = wanted !== post.baseLocale && !post.translationReviewed
  const locale = useBase ? post.baseLocale : wanted
  return {
    locale,
    title: insightsTitleOf(post, locale),
    dek: insightsDekOf(post, locale),
    fallback: useBase,
  }
}

export function insightsPublicFassung(
  post: InsightsPostHead & Pick<InsightsPost, 'bodyDe' | 'bodyEn'>,
  wanted: InsightsLocale,
): InsightsPublicFassung {
  const kopf = insightsPublicKopf(post, wanted)
  return { ...kopf, body: insightsBodyOf(post, kopf.locale) }
}

/** Ist der Beitrag überhaupt öffentlich? Zwei Zustände, nie mehr (§3.2). */
export function insightsIsPublic(post: Pick<InsightsPost, 'state'>): boolean {
  return (INSIGHTS_PUBLIC_STATES as readonly string[]).includes(post.state)
}

/**
 * DIE ERLAUBTEN ZUSTANDS-ÜBERGÄNGE (BI1 I2, §3.2/§9.4) — eine TABELLE, keine
 * Kette von `if`.
 *
 * Der Zustand ist die Sicherung dieses Produkts („nicht die Disziplin"), und
 * eine Sicherung, die in einer Route steht, gilt nur in dieser Route. Sie
 * steht deshalb hier: pur, mit Gegenprobe, und von Server-Gate wie Oberfläche
 * gelesen (der Editor zeigt genau die Knöpfe, die diese Tabelle erlaubt).
 *
 *  · `draft → review`     — die sechs Prüfregeln laufen davor.
 *  · `review → draft`     — zurück an die Verfassenden; das ist kein Fehler,
 *                           sondern der Normalfall einer Redaktion.
 *  · `review → published` — die Freigabe. Sie setzt `publishedAt`,
 *                           `reviewedAt` und `reviewedBy`.
 *  · `published → updated`— eine Auffrischung eines stehenden Beitrags. Sie
 *                           bleibt öffentlich (beide Zustände sind
 *                           `INSIGHTS_PUBLIC_STATES`) und sagt dem Leser nur,
 *                           dass sich etwas geändert hat.
 *  · `published → draft` und `updated → draft` — ZURÜCKZIEHEN. Der einzige
 *                           Weg aus der Öffentlichkeit heraus, und er führt
 *                           bewusst ganz nach vorn: was zurückgezogen wurde,
 *                           geht durch dieselben sechs Regeln wie beim ersten
 *                           Mal.
 *
 * ZWEI ÜBERGÄNGE FEHLEN ABSICHTLICH. `updated → published` wäre eine
 * Rücknahme der Aussage „hier hat sich etwas geändert" — der Hinweis gehört
 * dem Leser, nicht der Redaktion. Und `updated → updated` hätte nichts zu
 * ändern: ein Beitrag, der schon als aktualisiert dasteht, wird durch eine
 * zweite Auffrischung nicht aktueller. Wer eine solche sichtbar machen will,
 * zieht zurück und gibt neu frei.
 */
export const INSIGHTS_TRANSITIONS: Readonly<Record<InsightsState, readonly InsightsState[]>> = {
  draft: ['review'],
  review: ['draft', 'published'],
  published: ['updated', 'draft'],
  updated: ['draft'],
}

export function insightsTransitionAllowed(from: InsightsState, to: InsightsState): boolean {
  return (INSIGHTS_TRANSITIONS[from] ?? []).includes(to)
}

/**
 * DARF DIESE ZEILE GELÖSCHT WERDEN? (BI1 I2-Rest)
 *
 * Nur `draft` und `review` — also genau das, was nie öffentlich war oder es
 * gerade nicht ist. Ein `published`/`updated`-Beitrag wird ZUERST
 * zurückgezogen (`→ draft`, der Übergang steht in der Tabelle darüber) und
 * erst dann gelöscht.
 *
 * ── WARUM NICHT EINFACH LÖSCHEN, WENN JEMAND `insights.manage` HAT ───────
 * Weil eine öffentliche Adresse mehr ist als eine Zeile: sie steht in
 * Suchmaschinen, in fremden Links und in unserer eigenen `slugHistory`. Ein
 * Löschen aus der Öffentlichkeit heraus wäre ein 404 ohne Vorwarnung und ohne
 * die Spur, aus der eine 301 später wieder einen Weg macht. Der Umweg über
 * das Zurückziehen ist eine SEKUNDE Arbeit und macht aus dem Verschwinden
 * einen sichtbaren Vorgang.
 *
 * Die Regel steht hier und nicht in der Route, weil BEIDE Enden sie brauchen:
 * die Route als Sperre (409 `not_deletable`), die Oberfläche als Grund, den
 * Knopf auszugrauen. Eine Sperre, die nur im Browser steht, ist mit einem
 * `curl` erledigt; ein Knopf, der erst beim Klicken „nein" sagt, ist eine
 * Falle.
 */
export function insightsPostDeletable(state: InsightsState): boolean {
  return state === 'draft' || state === 'review'
}

/**
 * DIE ADRESSE DER METHODIK (Entscheidung 7/11) — EINMAL, weil sie in der
 * Prüfregel 5, im Entwurfs-Prompt und in der Oberfläche dieselbe sein muss.
 */
export const INSIGHTS_METHODOLOGY_PATH = '/brand-check/methodik'

/**
 * VERLINKT DER BEITRAG DIE METHODIK? (Prüfregel 5.)
 *
 * Gefragt wird der FLIESSTEXT beider Sprachen, nicht ein Häkchen: die Regel
 * soll sagen, ob der Leser von der Zahl zur Methode kommt, und dieser Weg ist
 * ein Link im Text. Ein Feld daneben wäre eine Behauptung über den Text.
 *
 * BEIDE Sprachen zählen und nicht nur die Grundfassung: die zweite Fassung
 * entsteht maschinell aus der ersten, und ein Link überlebt eine Übersetzung.
 * Fehlt er in beiden, fehlt er wirklich.
 */
export function insightsMethodologyLinked(post: Pick<InsightsPost, 'bodyDe' | 'bodyEn'>): boolean {
  return post.bodyDe.includes(INSIGHTS_METHODOLOGY_PATH) || post.bodyEn.includes(INSIGHTS_METHODOLOGY_PATH)
}

/**
 * DIE LESEZEIT (§9.3): Wörter ÷ 200, aufgerundet, gerechnet beim SPEICHERN.
 * Nicht beim Lesen — sonst rechnet jede Seitenansicht dieselbe Zahl neu, und
 * die Sortierung „Kürzeste Lesezeit" müsste den ganzen Text laden.
 */
export function insightsReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return 0
  return Math.min(INSIGHTS_READING_MINUTES_MAX, Math.max(1, Math.ceil(words / INSIGHTS_WORDS_PER_MINUTE)))
}

/**
 * DER DUELL-SLUG (§11 Frage 2): die zwei Marken-Slugs in ALPHABETISCHER
 * Reihenfolge, damit `nike-vs-adidas` und `adidas-vs-nike` nicht zwei Seiten
 * mit demselben Inhalt werden; die andere Richtung antwortet 301.
 *
 * Die Funktion nimmt FERTIGE Slugs entgegen und macht selbst keine: die
 * Slug-Regel (Umlaute, Diakritika, Deckel 80) gehört dem brand-Layer
 * (`brandPublicationSlug`) und wird über den Vertrag geteilt — eine zweite
 * Slug-Funktion wäre eine zweite Wahrheit über dieselbe Adresse.
 */
export function insightsDuelSlug(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y, 'en')).join('-vs-')
}

// ── 5. Die Prüfregeln vor `review` ─────────────────────────────────────────

export type InsightsReviewCode =
  | 'quote_too_long'
  | 'quote_not_grounded'
  | 'source_missing_publisher'
  | 'source_missing_date'
  | 'source_missing_license'
  | 'fact_without_source'
  | 'disparagement'
  | 'score_without_methodology'
  | 'brand_without_entity'

export interface InsightsReviewIssue {
  code: InsightsReviewCode
  /** Woran es liegt — Quelle Nr. n, Faktenzeile Nr. n, Marken-Verweis Nr. n. */
  at?: { kind: 'source' | 'fact' | 'brandRef' | 'text', index: number }
  /** Die Stelle im Text bzw. der fehlende Schlüssel — nie eine ganze Fassung. */
  detail?: string
}

/**
 * WAS VON AUSSEN HEREINKOMMT — und was seit BI1 I1a nicht mehr.
 *
 * ── DIE BELEG-PRÜFUNG IST JETZT EINE REGEL, KEINE ÜBERGABE ───────────────
 * Der Prototyp reichte sie als FUNKTION herein: sie existierte nur im
 * market-Layer (`evidenceIsGrounded`), und ein Produkt-Layer importiert keinen
 * anderen (CONCEPT A14, ESLint-Backstop). Die offene Frage aus dem
 * Prototyp-Bericht („core? brand-Vertrag?") ist mit I1a beantwortet — der
 * Riegel liegt im FUNDAMENT (`core/shared/evidenceGrounding.ts`) und wird von
 * hier direkt gerufen. Herein kommen nur noch die DATEN, die er braucht: der
 * Rohtext je Quellen-Adresse.
 *
 * Das ist mehr als eine Aufräum-Arbeit. Eine hereingereichte Prüfung darf
 * jeder Aufrufer anders bauen — der Prototyp tat es case-INSENSITIV, der
 * Riegel des Marktvergleichs case-SENSITIV. Die schwächere Fassung hätte „WIR
 * RÖSTEN SELBST" als Beleg für „wir rösten selbst" durchgelassen, und ab da
 * wäre die Zitatschranke eine Erzählung. Jetzt gibt es nur eine Fassung.
 *
 * ── `flagText` BLEIBT BEWUSST EINE ÜBERGABE ──────────────────────────────
 * Der Namens- und Herabsetzungsfilter liegt seit I1a EBENFALLS im Fundament
 * (`createDisparagementGuard`), aber er braucht etwas, das es im Prototyp noch
 * nicht gibt: die Liste der KANDIDATEN, gegen die gesperrt wird. Sie entsteht
 * mit I1 aus den Marken-Zeilen eines Beitrags. Bis dahin stellt der Aufrufer
 * die Funktion — den Riegel hier schon einzubauen hiesse, ihn mit einer leeren
 * Kandidatenliste zu bauen, und das sähe aus wie eine Prüfung.
 *
 * FEHLEN die Daten bzw. die Funktion, prüft diese Regel sie NICHT — und das
 * ist kein stiller Durchlass, sondern der Grund, warum der Aufrufer sie
 * stellt: eine Prüfung, die ohne Text „grün" sagt, wäre eine Lüge; eine, die
 * sie gar nicht erst behauptet, ist eine Lücke, die man sieht.
 */
export interface InsightsReviewContext {
  /**
   * Der Rohtext je Quellen-Adresse — nur damit ist die Beleg-Prüfung
   * deterministisch. Eine Quelle OHNE Eintrag wird nicht geprüft (s. Kopf).
   */
  sourceTexts?: Readonly<Record<string, string>>
  flagText?: (text: string) => readonly string[]
  /** Die `insights_brands`-Zeilen, die es wirklich gibt (Regel 6). */
  knownBrandIds?: readonly string[]
  /** Verlinkt der Beitrag die Methodik-Seite? (Regel 5, Entscheidung 7/11.) */
  methodologyLinked?: boolean
}

/**
 * DIE SECHS PRÜFREGELN VOR DEM ÜBERGANG NACH `review` (§9.4) — alle
 * blockierend, alle pur, alle mit Gegenprobe im Test.
 *
 * Sie geben eine LISTE zurück und nicht `true`/`false`: der Redakteur muss
 * sehen, WELCHE Stelle klemmt („ein Treffer blockiert nicht stumm, sondern
 * zeigt die Stelle", §9.4 Nr. 4).
 */
export function insightsReviewIssues(post: InsightsPost, context: InsightsReviewContext = {}): InsightsReviewIssue[] {
  const issues: InsightsReviewIssue[] = []

  // 1 — Zitatschranke und Beleg-Riegel.
  for (const [index, source] of post.sources.entries()) {
    if (source.quote.length > INSIGHTS_QUOTE_MAX) {
      issues.push({ code: 'quote_too_long', at: { kind: 'source', index } })
    }
    const pageText = context.sourceTexts?.[source.url]
    if (source.quote && pageText !== undefined && !evidenceIsGrounded({ quote: source.quote, pageText })) {
      issues.push({ code: 'quote_not_grounded', at: { kind: 'source', index } })
    }
    // 2 — Herausgeber, Datum, Lizenz.
    if (source.kind !== 'own-data') {
      if (!source.publisher) issues.push({ code: 'source_missing_publisher', at: { kind: 'source', index } })
      if (!source.date) issues.push({ code: 'source_missing_date', at: { kind: 'source', index } })
    }
    if (source.kind === 'wikipedia' && !source.license) {
      issues.push({ code: 'source_missing_license', at: { kind: 'source', index } })
    }
  }

  // 3 — jede Faktenzeile zeigt auf eine Quelle.
  for (const [index, fact] of post.facts.entries()) {
    if (fact.sourceIndex < 0 || fact.sourceIndex >= post.sources.length) {
      issues.push({ code: 'fact_without_source', at: { kind: 'fact', index } })
    }
  }

  // 4 — Namens- und Herabsetzungsfilter auf Titel, Vorspann und Fliesstext.
  if (context.flagText) {
    const texts = [post.titleDe, post.titleEn, post.dekDe, post.dekEn, post.bodyDe, post.bodyEn]
    for (const [index, text] of texts.entries()) {
      if (!text) continue
      for (const hit of context.flagText(text)) {
        issues.push({ code: 'disparagement', at: { kind: 'text', index }, detail: hit })
      }
    }
  }

  // 5 — jeder gezeigte Score verlinkt die Methodik (Entscheidung 7/11).
  const showsScore = post.format === 'ranking' || post.brandRefs.some(ref => ref.checkId)
  if (showsScore && context.methodologyLinked === false) {
    issues.push({ code: 'score_without_methodology' })
  }

  // 6 — jede genannte Marke hat eine Zeile. Ohne sie gäbe es keinen Ort, an
  //     dem ein Korrekturvorschlag ankommen könnte.
  if (context.knownBrandIds) {
    const known = new Set(context.knownBrandIds)
    for (const [index, ref] of post.brandRefs.entries()) {
      if (!known.has(ref.brandId)) issues.push({ code: 'brand_without_entity', at: { kind: 'brandRef', index }, detail: ref.brandId })
    }
    for (const [index, entry] of (post.ranking?.entries ?? []).entries()) {
      if (!entry.removed && !known.has(entry.brandId)) {
        issues.push({ code: 'brand_without_entity', at: { kind: 'fact', index }, detail: entry.brandId })
      }
    }
  }

  return issues
}

// ── 6. Die Marken-Entität ──────────────────────────────────────────────────

/**
 * DIE DREI ZUSTÄNDE EINER MARKEN-ZEILE (§9.3).
 *
 *  · `draft`     — angelegt, aber keine öffentliche Seite. Der Normalfall
 *                  einer Zeile, die nur als Anker eines Verweises entstanden
 *                  ist (Prüfregel 6).
 *  · `published` — `/brands/<slug>` zeigt sie (I3).
 *  · `removed`   — der Notausgang aus Entscheidung 11, mit Datum und Grund.
 *
 * Seit dem Marken-Formular (BI1 I2-Rest) stehen sie als KATALOG hier statt
 * als Aufzählung im Schema: die Ablage-Abbildung (`shared/insightsRows.ts`)
 * und die Filterzeile der Redaktion lesen dieselbe Liste. Drei Stellen mit
 * derselben Aufzählung sind beim ersten neuen Wert drei verschiedene
 * Wahrheiten.
 */
export const INSIGHTS_BRAND_STATES = ['draft', 'published', 'removed'] as const
export type InsightsBrandState = (typeof INSIGHTS_BRAND_STATES)[number]

/** Ein eigenständiges Markenzeichen mit Beleg (§2.1, §9.3 `marks`). */
export const insightsMarkSchema = z.object({
  kind: z.enum(['symbol', 'claim', 'type', 'color']),
  text: z.string().min(1).max(300),
  sourceIndex: z.number().int().min(0, 'Beleg fehlt'),
})

/** Ein Jahr und ein Satz (§9.3 `history`). */
export const insightsHistoryEntrySchema = z.object({
  year: z.number().int().min(1000).max(2999),
  text: z.string().min(1).max(300),
  sourceIndex: z.number().int().min(0, 'Beleg fehlt'),
})

/**
 * DIE MARKEN-ENTITÄT (§9.3 `insights_brands`) — eine FREMDE Marke.
 *
 * Sie ist bewusst NICHT dieselbe Zeile wie eine Discover-Publikation (§9.3,
 * drei Gründe): entgegengesetzte Rechtsgrundlage (Opt-in gegen Zitatrecht),
 * entgegengesetzter Notausgang (Knopf gegen protokollierten Vorgang),
 * entgegengesetzter Inhalt (Purpose/Werte/Stimme gegen Zeichen/Historie/
 * Beziehungen). Dieselben Kapitel in einer Tabelle zu führen hiesse, die eine
 * Hälfte dauerhaft leer zu lassen.
 *
 * `state: 'removed'` IST der Notausgang aus Entscheidung 11 („ohne Diskussion
 * gewährt") — mit Datum und Grund, weil genau danach Anwaltsfrage 3 fragt.
 */
const insightsBrandFields = {
  slug: z.string().min(1).max(160),
  slugHistory: z.array(z.string().max(160)).max(INSIGHTS_SLUG_HISTORY_MAX).default([]),
  name: z.string().min(1).max(200),
  homepage: z.string().max(512).default(''),
  libraryKey: z.string().max(64).default(''),
  checkId: z.string().max(64).default(''),
  publicationId: z.string().max(64).default(''),
  industry: z.string().max(40).default(''),
  country: z.string().max(2).default(''),
  foundedYear: z.number().int().min(1000).max(2999).nullable().default(null),
  archetype: z.string().max(40).default(''),
  archetypeSecondary: z.string().max(40).default(''),
  paletteId: z.string().max(40).default(''),
  marks: z.array(insightsMarkSchema).max(8).default([]),
  history: z.array(insightsHistoryEntrySchema).max(12).default([]),
  relations: z.array(z.string().max(64)).max(12).default([]),
  sources: z.array(insightsSourceSchema).max(40).default([]),
  state: z.enum(INSIGHTS_BRAND_STATES),
  removedAt: z.string().max(32).default(''),
  removalReason: z.string().max(300).default(''),
  claimedBy: z.string().max(64).default(''),
}

/**
 * WAS DIE MARKEN-REGELN ANSEHEN — wörtlich dieselbe Bauart wie
 * `InsightsPostRuleInput` weiter oben und aus demselben Grund: seit dem
 * Marken-Formular (BI1 I2-Rest) gibt es ZWEI Schemas über denselben Feldern,
 * und zwei abgeschriebene `superRefine`-Blöcke wären zwei Wahrheiten, von
 * denen die im Formular irgendwann milder wird.
 */
interface InsightsBrandRuleInput {
  state: InsightsBrandState
  removalReason: string
  marks: readonly { sourceIndex: number }[]
  history: readonly { sourceIndex: number }[]
  sources: readonly InsightsSource[]
}

function insightsBrandRuleIssues(brand: InsightsBrandRuleInput): { path: (string | number)[], message: string }[] {
  const issues: { path: (string | number)[], message: string }[] = []
  if (brand.state === 'removed' && !brand.removalReason) {
    issues.push({ path: ['removalReason'], message: 'Entfernung ohne dokumentierten Grund' })
  }
  for (const [index, mark] of brand.marks.entries()) {
    if (mark.sourceIndex >= brand.sources.length) {
      issues.push({ path: ['marks', index, 'sourceIndex'], message: 'Zeichen ohne Beleg' })
    }
  }
  for (const [index, entry] of brand.history.entries()) {
    if (entry.sourceIndex >= brand.sources.length) {
      issues.push({ path: ['history', index, 'sourceIndex'], message: 'Historien-Zeile ohne Beleg' })
    }
  }
  return issues
}

export const insightsBrandSchema = z.object(insightsBrandFields).superRefine((brand, ctx) => {
  for (const issue of insightsBrandRuleIssues(brand)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  }
})

export type InsightsBrand = z.infer<typeof insightsBrandSchema>

/**
 * DIE FELDER, DIE DER SERVER AN EINER MARKE SELBST FÜHRT — und deshalb aus
 * einer Redaktions-Eingabe VERSCHWINDEN müssen (BI1 I2-Rest).
 *
 * Drei Stück, jedes das Ergebnis einer HANDLUNG statt einer Meinung des
 * Formulars:
 *
 *  · `slugHistory` führt die Umbenennung (`insightsSlugHistoryPush`) — wer sie
 *    schicken dürfte, könnte eine alte Adresse löschen und damit jede 301
 *    darauf; das bricht fremde Links, und zwar still.
 *  · `removedAt` setzt der Übergang nach `removed`. Ein durchgereichtes Datum
 *    wäre eine Behauptung darüber, WANN eine Zusage eingelöst wurde — und
 *    genau danach fragt Anwaltsfrage 3.
 *  · `claimedBy` ist der Stempel „diese Marke hat sich gemeldet". Er entsteht
 *    auf dem Weg über den Kontakt, nicht in einem Feld neben der Branche.
 *
 * `state` bleibt BEWUSST drin — anders als beim Beitrag. Dort ist der Zustand
 * das Gate mit sechs Prüfregeln davor, hier ist er eine redaktionelle Angabe
 * mit genau EINER Bedingung (`removed` braucht einen Grund), und die steht im
 * Schema. Ein eigener Zustands-Endpunkt für drei Werte ohne Prüfkette wäre
 * eine zweite Route für dasselbe Speichern.
 */
export const INSIGHTS_BRAND_SERVER_OWNED_FIELDS = ['slugHistory', 'removedAt', 'claimedBy'] as const

/** Was ein Marken-Formular schicken darf (s. `INSIGHTS_BRAND_SERVER_OWNED_FIELDS`). */
export const insightsBrandEditSchema = z.object(insightsBrandFields).omit({
  slugHistory: true,
  removedAt: true,
  claimedBy: true,
}).superRefine((brand, ctx) => {
  for (const issue of insightsBrandRuleIssues(brand)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  }
})

export type InsightsBrandEdit = z.infer<typeof insightsBrandEditSchema>

/**
 * DER SCORE ALS ANSICHT, NICHT ALS SPALTE (Entscheidung 7, §9.0).
 *
 * Er kommt über den brand-Vertrag aus `brand_checks` — dieselbe Zahl wie im
 * Produkt, mit Band und den acht Kategorien. Eine eigene Spalte hier wäre die
 * zweite Wahrheit, die Entscheidung 7 ausdrücklich verbietet („keine zweite
 * Skala, kein Insights-Score").
 *
 * DIE ZWEITZEILE ENTFÄLLT: für eine FREMDE Marke gibt es nur den
 * Website-Score; die Fundament-Reife (DB1-Entscheidung 3) hat sie nicht, und
 * sie wird nicht erfunden.
 */
export interface InsightsBrandScore {
  score: number
  band: string
  checkId: string
  /** Die acht Kategorien des Brand-Checks, in der Reihenfolge der Methodik. */
  dimensions: readonly { key: string, label: string, value: number }[]
}

// ── 7. Themenradar (§9.6, Paket I4) ────────────────────────────────────────

/**
 * WAS VOM RADAR GESPEICHERT WERDEN DARF (§9.6 Leitplanke a).
 *
 * Je Video nur die öffentlichen Zahlen der API: Aufrufe, Likes,
 * Kommentar-ZAHL, Veröffentlichungsdatum, Kanal. KEINE Kommentar-Texte, KEINE
 * Nutzernamen (Leitplanke b), KEIN Verdichten über Kanäle hinweg (Policies
 * III.E.2). Aufbewahrung höchstens 30 Kalendertage (III.E.4) — oder täglich
 * neu geholt und überschrieben; welches von beiden, entscheidet I4 an der
 * Lauf-Frequenz.
 *
 * Die Kommentar-ZAHL ist keine Kommentar-Auswertung: sie ist eine öffentliche
 * Kennzahl des Videos.
 */
export const insightsRadarVideoSchema = z.object({
  videoId: z.string().min(1).max(32),
  channelId: z.string().min(1).max(64),
  channelTitle: z.string().min(1).max(160),
  channelSubscribers: z.number().int().min(0),
  title: z.string().min(1).max(300),
  views: z.number().int().min(0),
  likes: z.number().int().min(0),
  commentCount: z.number().int().min(0),
  publishedAt: dateSchema,
  fetchedAt: dateSchema,
  topic: z.enum(INSIGHTS_TOPIC_KEYS as [InsightsTopicKey, ...InsightsTopicKey[]]),
})

export type InsightsRadarVideo = z.infer<typeof insightsRadarVideoSchema>

/** Höchstens 30 Kalendertage (YouTube API Services Developer Policies III.E.4). */
export const INSIGHTS_RADAR_RETENTION_DAYS = 30

/**
 * DIE FÜNF SIGNALE, DIE DER PLAN VORSIEHT (§9.6) — und die drei, die HEUTE
 * eine Datenquelle haben.
 *
 * Beide Listen stehen da, weil die Zahl beide braucht: gerechnet wird aus den
 * VORHANDENEN, ausgewiesen wird „aus n von 5". Eine einzelne Liste könnte das
 * eine oder das andere sagen, nie beides.
 */
export const INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED = [
  'performance',
  'age',
  'relevance',
  'searchDemand',
  'competition',
] as const
export type InsightsOpportunitySignal = (typeof INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED)[number]

/** Was heute rechnen kann — für Ahrefs und Search Console gibt es nichts. */
export const INSIGHTS_OPPORTUNITY_SIGNALS: readonly InsightsOpportunitySignal[] = [
  'performance',
  'age',
  'relevance',
]

/** Je Signal 0–20 (§9.6); die ausgewiesene Zahl ist auf 0–100 normiert. */
export const INSIGHTS_OPPORTUNITY_SIGNAL_MAX = 20
export const INSIGHTS_OPPORTUNITY_MAX = 100

/** Halbwertszeit des Alters-Signals in Tagen (§9.6). */
export const INSIGHTS_OPPORTUNITY_HALF_LIFE_DAYS = 90

/**
 * POPULARITÄT = Aufrufe ÷ Abonnenten (§9.6). Ein Video mit 50k Aufrufen auf
 * einem Kanal mit 20k Abonnenten schlägt eines mit 200k auf einem Kanal mit
 * 5 Mio — das ist der ganze Punkt der Normalisierung.
 */
export function insightsPopularity(views: number, subscribers: number): number {
  if (subscribers <= 0) return 0
  return views / subscribers
}

/**
 * UNSERE ZAHL — auf 0–100 normiert, mit der Zahl ihrer Signale daneben
 * (§9.6, §11.1 Nr. 2; Davids Entscheidung 2026-09-08 GEGEN „44 von 60").
 *
 * ── WARUM NICHT MEHR „44 VON 60" ─────────────────────────────────────────
 * Der Plan nennt fünf Signale; für Suchnachfrage und Konkurrenz gibt es heute
 * keine Datenquelle — kein Ahrefs, keine Search Console auf branding.supply.
 * Der Prototyp löste das mit einem kleineren NENNER: „44 von 60 · 3 Signale".
 * Ehrlich war das, lesbar nicht — eine Skala, die sich mit der Datenlage
 * ändert, macht zwei Läufe unvergleichbar (dasselbe Video hiesse morgen „44
 * von 100", weil ein viertes Signal dazukam, und niemand wüsste, ob es besser
 * geworden ist). Genormt wird deshalb auf 100: der DURCHSCHNITT der
 * vorhandenen Signale, mal fünf. Wie belastbar die Zahl ist, sagt nicht mehr
 * der Nenner, sondern die Fussnote — „aus 3 von 5 Signalen", IMMER, auch wenn
 * eines Tages alle fünf da sind.
 *
 * ── KEINE SIGNALE ⇒ KEINE ZAHL ───────────────────────────────────────────
 * `score` ist dann `null` und nicht `0`. Eine 0 wäre eine Bewertung („das
 * Video taugt nichts"), wo in Wahrheit gar nicht gemessen wurde. Dieselbe
 * Unterscheidung wie bei einem fehlenden Feld im Marktvergleich: leer ist eine
 * Aussage, erfunden wäre ein Fehler. Auch die EINZELNEN Signale sind `number |
 * null` — ein fehlender Wert ist kein Nullpunkt.
 *
 * Die Zahl ist UNSERE (Leitplanke a): sie wird aus API-Werten gerechnet, ist
 * ein eigenes Ergebnis und fällt nicht unter das Aggregations-Verbot für
 * API-Daten. Sie darf bleiben, auch wenn die Zahlen darunter ablaufen — dann
 * steht sie mit ihrem Stand da, wie jede andere Messung.
 */
export interface InsightsOpportunity {
  /** Je 0–20, oder `null` wenn es für dieses Signal keinen Wert gibt. */
  performance: number | null
  age: number | null
  relevance: number | null
  /** 0–100 aus den VORHANDENEN Signalen — `null`, wenn keines vorliegt. */
  score: number | null
  /** Aus wie vielen Signalen die Zahl gerechnet ist. */
  signals: number
  /** Wie viele der Plan vorsieht — der Nenner der Fussnote, immer 5. */
  of: number
}

export function insightsOpportunity(input: {
  /** Aufrufe ÷ Abonnenten. Fehlt sie, fehlt das Signal — kein Ersatzwert. */
  popularity?: number
  ageDays?: number
  /** Nähe zu unseren acht Clustern, 0–1 (Schlagwortliste, §9.6). */
  relevance?: number
}): InsightsOpportunity {
  const max = INSIGHTS_OPPORTUNITY_SIGNAL_MAX
  const clamp = (value: number) => Math.max(0, Math.min(max, Math.round(value)))
  // Popularität 1.0 (so viele Aufrufe wie Abonnenten) = volle 20 Punkte.
  const performance = input.popularity === undefined
    ? null
    : clamp(Math.min(1, Math.max(0, input.popularity)) * max)
  // Halbwertszeit 90 Tage: heute 20, nach 90 Tagen 10, nach 180 Tagen 5.
  const age = input.ageDays === undefined
    ? null
    : clamp(max * 0.5 ** (Math.max(0, input.ageDays) / INSIGHTS_OPPORTUNITY_HALF_LIFE_DAYS))
  const relevance = input.relevance === undefined
    ? null
    : clamp(Math.max(0, Math.min(1, input.relevance)) * max)

  const present = [performance, age, relevance].filter((value): value is number => value !== null)
  const score = present.length === 0
    ? null
    : Math.round(present.reduce((sum, value) => sum + value, 0) / (present.length * max) * INSIGHTS_OPPORTUNITY_MAX)

  return {
    performance,
    age,
    relevance,
    score,
    signals: present.length,
    of: INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED.length,
  }
}

// ── 8. Liste: filtern und sortieren (§9.5) ─────────────────────────────────

/**
 * DIE DREI SORTIERUNGEN DER JOURNAL-LISTE (§9.5) — und die dritte ist heute
 * eine Absichtserklärung.
 *
 * „Meistgelesen" braucht eine Reichweiten-Zahl, und die gibt es auf
 * branding.supply erst mit Plausible (§11 Frage 3, Paket BS1 R2c: „erst Text,
 * dann Schalter"). Die Option steht trotzdem im Vertrag, weil sie in die
 * Werkzeugleiste gehört — sie ist dort SICHTBAR GESPERRT mit dem Grund
 * daneben. Eine unsichtbare Sperre erklärt sich nie, und eine stille
 * Ersatz-Sortierung („dann eben nach Datum") wäre eine Zahl, die niemand
 * gemessen hat.
 */
export const INSIGHTS_SORTS = ['newest', 'shortest', 'mostRead'] as const
export type InsightsSort = (typeof INSIGHTS_SORTS)[number]

/** Die Sortierungen, die HEUTE rechnen können. */
export const INSIGHTS_SORTS_AVAILABLE: readonly InsightsSort[] = ['newest', 'shortest']

export interface InsightsListFilter {
  format?: InsightsFormat | 'all'
  topic?: InsightsTopicKey | 'all'
  /** Sprache der REDIGIERTEN Fassung, nicht die Anzeigesprache des Lesers. */
  locale?: InsightsLocale | 'all'
}

/**
 * WAS DIE FILTER-REGEL ANSIEHT — und warum die Funktion generisch ist (I3).
 *
 * Gefiltert wird sowohl über volle Beiträge (Redaktion, Tests) als auch über
 * die Listen-Items der öffentlichen Route, die keinen Fliesstext tragen. Die
 * Durchreiche über `T` gibt GENAU den Typ zurück, der hereinkam — eine
 * Verengung auf `InsightsPost` zwänge die öffentliche Liste, den Text
 * mitzuschicken, nur damit ein Filter läuft, der ihn nie ansieht.
 */
export interface InsightsFilterablePost {
  format: InsightsFormat
  topics: readonly InsightsTopicKey[]
  baseLocale: InsightsLocale
  translationReviewed: boolean
}

export function insightsFilterPosts<T extends InsightsFilterablePost>(
  posts: readonly T[],
  filter: InsightsListFilter,
): T[] {
  return posts.filter((post) => {
    if (filter.format && filter.format !== 'all' && post.format !== filter.format) return false
    if (filter.topic && filter.topic !== 'all' && !post.topics.includes(filter.topic)) return false
    if (filter.locale && filter.locale !== 'all') {
      // Eine Fassung zählt als vorhanden, wenn sie die Grundfassung IST oder
      // redigiert wurde — die maschinelle Rohfassung ist keine Fassung (§3.2).
      const available = post.baseLocale === filter.locale || post.translationReviewed
      if (!available) return false
    }
    return true
  })
}

/**
 * SORTIEREN OHNE DIE EINGABE ZU VERÄNDERN — `toSorted` gibt es erst ab Node 20
 * überall, `[...posts].sort()` überall. Eine an Ort und Stelle sortierte Liste
 * wäre in Vue eine Reihenfolge, die sich beim Rendern ändert.
 */
export interface InsightsSortablePost {
  readingMinutes: number
  publishedAt: string
}

export function insightsSortPosts<T extends InsightsSortablePost>(
  posts: readonly T[],
  sort: InsightsSort,
): T[] {
  const list = [...posts]
  if (sort === 'shortest') return list.sort((a, b) => a.readingMinutes - b.readingMinutes)
  // `mostRead` fällt bewusst auf `newest` zurück — die Oberfläche lässt es gar
  // nicht erst wählen (INSIGHTS_SORTS_AVAILABLE), und ein stiller Ersatz wäre
  // die Lüge, die §9.5 vermeiden will.
  return list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}
